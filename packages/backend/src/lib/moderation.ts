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
const TIMEOUT_MS = 3000;

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

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
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
            content: `Kind: ${kind}\nCandidate: ${JSON.stringify(trimmed)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        { kind, status: response.status },
        'moderation: API returned non-2xx; allowing by default',
      );
      return { allowed: true };
    }

    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = (body.content?.find((c) => c.type === 'text')?.text ?? '').trim();
    if (!text) {
      logger.warn({ kind }, 'moderation: empty response; allowing by default');
      return { allowed: true };
    }

    const upper = text.toUpperCase();
    if (upper.startsWith('ALLOW')) return { allowed: true };
    if (upper.startsWith('BLOCK')) {
      const reason =
        text
          .slice(5)
          .replace(/^[: ]+/, '')
          .trim() || 'inappropriate';
      return { allowed: false, reason };
    }

    logger.warn({ kind, text }, 'moderation: unexpected response shape; allowing by default');
    return { allowed: true };
  } catch (error) {
    logger.warn({ kind, error }, 'moderation: request failed; allowing by default');
    return { allowed: true };
  }
}
