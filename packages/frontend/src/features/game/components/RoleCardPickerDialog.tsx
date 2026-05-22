// Card-pick modal shown during ROLE_DISTRIBUTION.
//
// 10 face-down cards laid out on a wall. Seats pick one-by-one in numeric
// order (1 → 10). When the viewer is the current picker, the cards are
// clickable; otherwise the wall is read-only and a caption shows whose
// turn it is. Already-picked cards disappear from the wall. Once the
// viewer's card has been picked it stays face-up so they can read their
// role. The actual role assignment happens server-side at game creation —
// the click is purely a timing / animation hook.

import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, type GameStateProjected, type Role } from '@mafia/shared';

import { Dialog } from '@/components/ui/Dialog.js';
import { cn } from '@/lib/cn.js';
import { useCountdown, formatCountdown } from '@/features/game/hooks/useCountdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface RoleCardPickerDialogProps {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerRole: Role | null;
  viewerIsJudge: boolean;
}

export function RoleCardPickerDialog({
  state,
  viewerSeat,
  viewerRole,
  viewerIsJudge,
}: RoleCardPickerDialogProps) {
  const { t } = useTranslation();
  const { secondsLeft, hasTimer } = useCountdown(state.phaseDeadline);

  if (state.phase !== GAME_PHASE.ROLE_DISTRIBUTION) return null;
  // Judges don't pick cards. They watch the table progress and advance the
  // phase once the wall is empty.
  if (viewerIsJudge) return null;

  const myTurn = viewerSeat !== null && state.roleCardPickerSeat === viewerSeat;
  const myPickIndex = state.myRoleCardIndex;
  const taken = new Set(state.roleCardsPicked);

  function pickCard(cardIndex: number) {
    if (!myTurn) return;
    if (taken.has(cardIndex)) return;
    void emitGameAction(CLIENT_EVENT.ROLE_CARD_PICK, { cardIndex });
  }

  const headerText = myTurn
    ? t('game.cardPicker.yourTurn')
    : state.roleCardPickerSeat !== null
      ? t('game.cardPicker.waitingFor', { seat: state.roleCardPickerSeat })
      : t('game.cardPicker.finishedWaitJudge');

  return (
    <Dialog
      open={true}
      onClose={() => undefined}
      title={t('game.cardPicker.title')}
      className="max-w-xl"
    >
      <div className="space-y-1 text-center">
        <p className="text-sm text-fg">{headerText}</p>
        {hasTimer && myTurn && (
          <p
            className={cn(
              'text-3xl font-bold tabular-nums leading-none',
              secondsLeft <= 3 ? 'text-danger' : 'text-fg',
            )}
          >
            {formatCountdown(secondsLeft)}
          </p>
        )}
      </div>

      {/* Wall of 10 cards. Picked cards visually collapse to a faded slot so
          the wall geometry stays stable while indices remain meaningful. */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: 10 }, (_, idx) => {
          const isPicked = taken.has(idx);
          const isMine = myPickIndex === idx;
          // Once it's your card and your role is revealed, show it face-up.
          if (isMine && viewerRole) {
            return (
              <div
                key={idx}
                className="flex aspect-[3/4] flex-col items-center justify-center rounded-md border-2 border-accent bg-card p-2 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  {t('game.cardPicker.yourRoleLabel')}
                </p>
                <p className="mt-1 text-base font-bold text-fg leading-tight">
                  {t(`game.role.${viewerRole}`)}
                </p>
              </div>
            );
          }
          if (isPicked) {
            // Picked cards leave a literal empty slot — no border, no glyph.
            // The visual reads "the card was taken away" instead of "this
            // is a special placeholder cell".
            return <div key={idx} className="aspect-[3/4]" aria-hidden="true" />;
          }
          const clickable = myTurn;
          return (
            <button
              key={idx}
              type="button"
              disabled={!clickable}
              onClick={() => pickCard(idx)}
              aria-label={t('game.cardPicker.cardLabel', { n: idx + 1 })}
              className={cn(
                'flex aspect-[3/4] items-center justify-center rounded-md border bg-gradient-to-br from-card to-card-deep text-2xl font-bold transition',
                clickable
                  ? 'border-accent text-accent cursor-pointer hover:scale-105 hover:shadow-lg'
                  : 'border-border text-muted/40 cursor-not-allowed',
              )}
            >
              ?
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted">{t('game.cardPicker.hint')}</p>
    </Dialog>
  );
}
