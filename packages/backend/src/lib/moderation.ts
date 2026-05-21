// AI moderation of user-generated names (lobbies, nicknames, clubs).
//
// We call Anthropic's Claude Haiku because it covers all six of our locales
// (ru, uk, be, en, ka, kk) with comparable quality — OpenAI's moderation API
// is heavily English-biased and barely works on Georgian or Kazakh.
//
// Failure mode is fail-OPEN: when the moderation API is unreachable, times
// out, or returns an unexpected shape, we let the candidate through and log
// a warning. The alternative (fail-closed) would mean Anthropic outages take
// down lobby creation and registration, which is worse than the occasional
// offensive name slipping past until a human deletes it.
//
// Cost: each call is ~150 input tokens + ~15 output tokens on Haiku, which
// at current pricing is around $0.0003. At the scale this product targets
// (≤100 tables, maybe 200 new lobbies/day) the bill is pocket change.

import { env } from '../config/env.js';

import { logger } from './logger.js';

export type ModerationKind = 'lobby' | 'nickname' | 'club';

export type ModerationResult = { allowed: true } | { allowed: false; reason: string };

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
// 5s is long enough for a healthy Haiku call from EU → US Anthropic backend
// while still bounding worst case for the user (lobby create / register
// blocks on this round-trip).
const TIMEOUT_MS = 5000;
// Single retry covers transient TCP/TLS glitches and brief Anthropic 5xx
// blips. We deliberately do NOT retry indefinitely — at some point we'd
// rather fail open than make the user wait forever.
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You moderate short user-generated names for an online sport-mafia game platform. Players come from Russia, Ukraine, Belarus, Georgia, Kazakhstan, and elsewhere — names may be in any language or script.

Block names that contain:
- profanity, obscenities, slurs (any language, including transliterations and leetspeak)
- discriminatory or hateful content (ethnic, religious, gender, sexual orientation)
- sexually explicit content
- direct threats or incitement to violence against real people
- attempts to impersonate the platform itself ("admin", "moderator", "online-mafia staff", etc.)
- spam or advertising

Be permissive of:
- edgy or dark themes (it's a MAFIA game — names like "Кровавая ночь", "Death Row", "Бойня" are fine)
- rough humor that isn't targeting a protected group
- nicknames that look unusual but aren't slurs
- real-sounding nonsense ("xX_Dragon_Xx", "kek228")

Output EXACTLY one of:
  ALLOW
  BLOCK: <one short clause describing the category, e.g. "profanity" or "ethnic slur">

Nothing else. No greetings, no markdown, no quotes around your answer.`;

export async function moderateName(
  candidate: string,
  kind: ModerationKind,
): Promise<ModerationResult> {
  const trimmed = candidate.trim();
  if (!trimmed) return { allowed: true };

  if (!env.ANTHROPIC_API_KEY) {
    // Don't spam logs in development if the key is intentionally unset.
    if (env.NODE_ENV === 'production') {
      logger.warn({ kind }, 'moderation: ANTHROPIC_API_KEY unset; allowing without check');
    }
    return { allowed: true };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outcome = await tryModerate(trimmed, kind, attempt);
    if (outcome.kind === 'decided') return outcome.verdict;
    // Transient failure — the original error was logged inside tryModerate.
    // Retry once, then give up and fail open.
  }
  return { allowed: true };
}

type AttemptOutcome = { kind: 'decided'; verdict: ModerationResult } | { kind: 'transient' };

async function tryModerate(
  candidate: string,
  kind: ModerationKind,
  attempt: number,
): Promise<AttemptOutcome> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 64,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Kind: ${kind}\nCandidate: ${JSON.stringify(candidate)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Retry 5xx (transient upstream), give up on 4xx (our bug — auth, bad
      // request — retrying just wastes the budget).
      const isTransient = response.status >= 500;
      logger.warn(
        { kind, attempt, status: response.status, transient: isTransient },
        'moderation: API returned non-2xx',
      );
      if (isTransient && attempt < MAX_ATTEMPTS) return { kind: 'transient' };
      return { kind: 'decided', verdict: { allowed: true } };
    }

    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (body.content?.find((c) => c.type === 'text')?.text ?? '').trim();
    if (!text) {
      logger.warn({ kind, attempt }, 'moderation: empty response; allowing by default');
      return { kind: 'decided', verdict: { allowed: true } };
    }

    const upper = text.toUpperCase();
    if (upper.startsWith('ALLOW')) return { kind: 'decided', verdict: { allowed: true } };
    if (upper.startsWith('BLOCK')) {
      const reason =
        text
          .slice(5)
          .replace(/^[: ]+/, '')
          .trim() || 'inappropriate';
      return { kind: 'decided', verdict: { allowed: false, reason } };
    }

    logger.warn({ kind, attempt, text }, 'moderation: unexpected response shape');
    return { kind: 'decided', verdict: { allowed: true } };
  } catch (error) {
    // pino renders bare Error instances as `{}` because Error fields are
    // non-enumerable. Project name/message/stack onto a plain object so log
    // search isn't blind when something fails.
    const errInfo =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { value: String(error) };
    logger.warn({ kind, attempt, err: errInfo }, 'moderation: request failed');
    if (attempt < MAX_ATTEMPTS) return { kind: 'transient' };
    return { kind: 'decided', verdict: { allowed: true } };
  }
}
