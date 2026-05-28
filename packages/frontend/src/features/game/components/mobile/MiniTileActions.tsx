// Action modal for a tapped mini-tile. Contents depend on the viewer's
// role and the current game phase. Every action maps onto an existing
// CLIENT_EVENT; nothing new is wired on the backend.
//
// Reuses the project's <Dialog> primitive (which already provides backdrop,
// Escape-to-close, focus management and aria attributes) so the modal stays
// consistent with ConfirmDialog and friends.

import { useTranslation } from 'react-i18next';

import {
  CLIENT_EVENT,
  DAY_PHASES,
  GAME_PHASE,
  ROLE,
  type GameStateProjected,
  type Role,
} from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { cn } from '@/lib/cn.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';

interface MiniTileActionsProps {
  state: GameStateProjected;
  seat: number;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsJudge: boolean;
  onClose: () => void;
}

export function MiniTileActions({
  state,
  seat,
  viewerRole,
  viewerSeat,
  viewerIsJudge,
  onClose,
}: MiniTileActionsProps) {
  const { t } = useTranslation();
  const pinSeat = useGameStore((s) => s.pinSeat);

  const participant = state.participants.find((p) => p.seat === seat);
  if (!participant) return null;

  function dispatch(action: () => void) {
    action();
    onClose();
  }

  const isNominated = state.nominationSeats.includes(seat);
  const phase = state.phase;
  const isSelf = viewerSeat === seat;

  type Action = {
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'danger';
  };
  const actions: Action[] = [];

  if (viewerIsJudge) {
    if (DAY_PHASES.includes(phase)) {
      actions.push({
        key: 'foul',
        label: t('game.ui.issueFoul'),
        disabled: participant.foulsCount >= 4,
        onClick: () =>
          emitGameAction(CLIENT_EVENT.JUDGE_ISSUE_FOUL, { targetUserId: participant.userId }),
      });
      actions.push({
        key: 'unfoul',
        label: t('game.ui.removeFoul'),
        disabled: participant.foulsCount <= 0,
        onClick: () =>
          emitGameAction(CLIENT_EVENT.JUDGE_REVOKE_FOUL, { targetUserId: participant.userId }),
      });
    }
    if (phase === GAME_PHASE.DAY_SPEECH && !isNominated) {
      actions.push({
        key: 'nominate',
        label: t('game.ui.nominateButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: seat }),
      });
    }
    if ((phase === GAME_PHASE.DAY_SPEECH || phase === GAME_PHASE.DAY_VOTE_INTRO) && isNominated) {
      actions.push({
        key: 'unnominate',
        label: t('game.ui.unnominate'),
        onClick: () => emitGameAction(CLIENT_EVENT.UNNOMINATE_PLAYER, { targetSeat: seat }),
      });
    }
    actions.push({
      key: 'remove',
      label: t('game.ui.removePlayer'),
      variant: 'danger',
      onClick: () =>
        emitGameAction(CLIENT_EVENT.JUDGE_REMOVE_PLAYER, { targetUserId: participant.userId }),
    });
  } else {
    if (
      phase === GAME_PHASE.NIGHT_MAFIA &&
      (viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) &&
      !isSelf
    ) {
      actions.push({
        key: 'shoot',
        label: t('game.ui.shootButton'),
        disabled: state.myMafiaVote !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.MAFIA_TARGET, { targetSeat: seat }),
      });
    }
    if (phase === GAME_PHASE.NIGHT_DON && viewerRole === ROLE.DON && !isSelf) {
      actions.push({
        key: 'don',
        label: t('game.ui.checkButton'),
        disabled: state.myCheckResult !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.DON_CHECK, { targetSeat: seat }),
      });
    }
    if (phase === GAME_PHASE.NIGHT_SHERIFF && viewerRole === ROLE.SHERIFF && !isSelf) {
      actions.push({
        key: 'sheriff',
        label: t('game.ui.checkButton'),
        disabled: state.myCheckResult !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.SHERIFF_CHECK, { targetSeat: seat }),
      });
    }
  }

  if (!isSelf) {
    actions.push({
      key: 'pin',
      label: t('game.ui.mobile.makeActive'),
      onClick: () => pinSeat(seat),
    });
  }

  return (
    <Dialog open onClose={onClose} title={t('game.ui.seatLabel', { n: seat })} className="max-w-sm">
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={48} />
        <div className="min-w-0">
          <p className="text-base font-semibold text-fg truncate">{participant.nickname}</p>
          {participant.role && (
            <p className="text-xs text-muted">{t(`game.role.${participant.role}`)}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {actions.length === 0 ? (
          <p className="text-sm text-muted text-center py-2">
            {t('game.ui.mobile.noActionsAvailable')}
          </p>
        ) : (
          actions.map((a) => (
            <Button
              key={a.key}
              onClick={() => dispatch(a.onClick)}
              disabled={a.disabled}
              variant={
                a.variant === 'danger'
                  ? 'danger'
                  : a.variant === 'primary'
                    ? 'primary'
                    : 'secondary'
              }
              className={cn('w-full justify-center')}
            >
              {a.label}
            </Button>
          ))
        )}
      </div>
    </Dialog>
  );
}
