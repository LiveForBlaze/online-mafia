// End-of-game review.
//
// Rendered inside InfoTile (desktop) and MobileControlPanel (mobile) once
// state.status flips to 'finished'. Everyone's role is unmasked in the
// projection at that point, so we can finally show the full table and the
// Лучший Ход submissions with correctness shading.

import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ROLE, ROLE_TO_TEAM, TEAM, type GameStateProjected } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { teamBadgeTone } from '@/features/game/lib/teamColors.js';

export function GameOverReview({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();

  // Roles are revealed for everyone now. Sort by seat so the table reads
  // top-to-bottom in seat order; the judge floats above.
  const players = state.participants
    .filter((p) => !p.isJudge)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  // Identify the black team (set of seats) for highlighting LH hits.
  const blackSeats = new Set<number>();
  for (const p of players) {
    if (p.seat !== null && p.role && ROLE_TO_TEAM[p.role] === TEAM.BLACK) {
      blackSeats.add(p.seat);
    }
  }

  // Map userId → nickname / seat for naming LH guessers in the list below.
  const byUserId = new Map(state.participants.map((p) => [p.userId, p]));

  return (
    <div className="space-y-3">
      {state.winner && (
        <p className="text-xl sm:text-2xl font-bold text-fg leading-tight">
          {t('game.ui.winner', { team: t(`game.team.${state.winner}`).toLowerCase() })}
        </p>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted mb-1.5">
          {t('game.ui.rolesReveal')}
        </h3>
        <ul className="space-y-1 text-sm">
          {players.map((p) => {
            const isBlack = p.role && ROLE_TO_TEAM[p.role] === TEAM.BLACK;
            return (
              <li key={p.userId} className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted w-5 shrink-0">№{p.seat}</span>
                <span className="text-fg truncate flex-1">{p.nickname}</span>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider',
                    teamBadgeTone(!!isBlack),
                  )}
                >
                  {p.role ? t(`game.role.${p.role}`) : '—'}
                </span>
                {!p.isAlive && (
                  <span aria-label={t('game.ui.playerLeftIcon')} className="text-muted shrink-0">
                    ✗
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {state.bestMoveGuesses.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-1.5">
            {t('game.ui.lhTitle')}
          </h3>
          <ul className="space-y-1.5 text-sm">
            {state.bestMoveGuesses.map((guess, idx) => {
              const guesser = byUserId.get(guess.byUserId);
              const hits = guess.guessedSeats.filter((s) => blackSeats.has(s)).length;
              const perfect = hits === 3 && guess.guessedSeats.length === 3;
              return (
                <li key={idx} className="flex items-center flex-wrap gap-2">
                  {guesser && (
                    <span className="text-xs font-mono text-muted w-5 shrink-0">
                      №{guesser.seat}
                    </span>
                  )}
                  <span className="text-fg shrink-0">{guesser?.nickname ?? '—'}:</span>
                  <span className="inline-flex gap-1">
                    {guess.guessedSeats.map((seat) => {
                      const hit = blackSeats.has(seat);
                      return (
                        <span
                          key={seat}
                          className={cn(
                            // Redundant glyph (✓ hit / ✗ miss) so the result is
                            // readable without relying on green-vs-red alone.
                            'relative inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold',
                            hit ? 'bg-success/30 text-success' : 'bg-danger/30 text-danger-text',
                          )}
                          aria-label={`№${seat}`}
                        >
                          {seat}
                          <span className="absolute -top-1 -right-1 rounded-full bg-bg p-px">
                            {hit ? (
                              <Check size={10} strokeWidth={3} aria-hidden="true" />
                            ) : (
                              <X size={10} strokeWidth={3} aria-hidden="true" />
                            )}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                  <span
                    className={cn(
                      'ml-auto text-xs font-semibold',
                      perfect ? 'text-warning' : 'text-muted',
                    )}
                  >
                    {perfect ? t('game.ui.lhPerfect') : `${hits}/${guess.guessedSeats.length}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

void ROLE;
