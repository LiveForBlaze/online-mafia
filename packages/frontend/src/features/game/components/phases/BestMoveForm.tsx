// «Лучший Ход» (ФИИМ).
//
// Жертва первой ночи во время своей утренней прощальной речи называет 1–3
// игрока, которых она считает чёрной командой. Форма показывается только
// этому конкретному игроку (engine отказывает в любых других кейсах). У
// каждого игрока ровно одна попытка — после отправки UI блокируется.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface BestMoveFormProps {
  state: GameStateProjected;
  /** Seat игрока, заполняющего форму. Должен совпадать с state.farewellSeat. */
  viewerSeat: number;
  size?: 'desktop' | 'mobile';
}

const MAX_PICKS = 3;

export function BestMoveForm({ state, viewerSeat, size = 'desktop' }: BestMoveFormProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number[]>([]);
  const [pending, setPending] = useState(false);

  const me = state.participants.find((p) => p.seat === viewerSeat);
  const alreadySubmitted = state.bestMoveGuesses.some((g) => g.byUserId === me?.userId);

  function togglePick(seat: number) {
    setPicked((prev) =>
      prev.includes(seat)
        ? prev.filter((s) => s !== seat)
        : prev.length < MAX_PICKS
          ? [...prev, seat]
          : prev,
    );
  }

  async function submit() {
    if (picked.length === 0 || picked.length > MAX_PICKS || pending) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.BEST_MOVE_GUESS, { guessedSeats: picked });
    } finally {
      setPending(false);
    }
  }

  if (alreadySubmitted) {
    return (
      <p className={size === 'mobile' ? 'text-xs text-success' : 'text-sm text-success mt-2'}>
        {t('game.ui.lhSubmitted')}
      </p>
    );
  }

  const candidates = state.participants
    .filter((p) => !p.isJudge && p.isAlive && !p.isRemoved && p.seat !== viewerSeat)
    .map((p) => p.seat!)
    .sort((a, b) => a - b);

  const container =
    size === 'mobile'
      ? 'space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2'
      : 'mt-3 space-y-2 rounded-md border border-warning/40 bg-warning/5 p-2';
  const titleClass =
    size === 'mobile'
      ? 'text-[10px] uppercase tracking-wider text-warning font-semibold'
      : 'text-xs uppercase tracking-wider text-warning font-semibold';

  return (
    <div className={container}>
      <p className={titleClass}>{t('game.ui.lhTitle')}</p>
      {size === 'desktop' && <p className="text-xs text-muted">{t('game.ui.lhHint')}</p>}
      <div className="flex flex-wrap gap-1">
        {candidates.map((seat) => (
          <button
            key={seat}
            type="button"
            onClick={() => togglePick(seat)}
            className={cn(
              'h-7 min-w-7 px-2 rounded text-xs font-mono font-semibold border',
              picked.includes(seat)
                ? 'bg-warning text-bg border-warning'
                : 'bg-bg text-fg border-border',
            )}
          >
            №{seat}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        onClick={submit}
        disabled={pending || picked.length === 0}
        className="w-full"
      >
        {t('game.ui.lhSubmit')}
      </Button>
    </div>
  );
}
