// Main page for an in-progress game.
//
// Layout: a thin header on top, judge action panel (only when the viewer IS the judge),
// and a 12-tile video grid that fills the rest of the viewport. The grid contains the
// 10 player seats, the judge tile, and an info tile with current-phase context.

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import { CLIENT_EVENT } from '@mafia/shared';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { GameLogDialog } from '@/features/game/components/GameLogDialog.js';
import { InfoTile } from '@/features/game/components/InfoTile.js';
import { JudgeSeatControls } from '@/features/game/components/JudgePanel.js';
import { JudgeTile } from '@/features/game/components/JudgeTile.js';
import { MediaRoom } from '@/features/game/components/MediaRoom.js';
import { MobileSeatZoom } from '@/features/game/components/MobileSeatZoom.js';
import { MobileStage } from '@/features/game/components/MobileStage.js';
import { PhaseHeader } from '@/features/game/components/PhaseHeader.js';
import { RoleCardPickerDialog } from '@/features/game/components/RoleCardPickerDialog.js';
import { RotateDeviceOverlay } from '@/features/game/components/RotateDeviceOverlay.js';
import { AchievementUnlockDialog } from '@/features/users/components/AchievementUnlockDialog.js';
import { actionForSeatInCurrentPhase } from '@/features/game/lib/actionForSeat.js';
import { PlayerTable } from '@/features/game/components/PlayerTable.js';
import { useGameConnection } from '@/features/game/hooks/useGameConnection.js';
import { useVoteHotkey } from '@/features/game/hooks/useVoteHotkey.js';
import { useJudgeStepHotkey } from '@/features/game/hooks/useJudgeStepHotkey.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { ROUTE_PATH } from '@/routes/paths.js';

const GAME_ERROR_KEYS = new Set([
  'not_participant',
  'game_not_found',
  'wrong_phase',
  'not_your_turn',
  'not_authorized_role',
  'target_not_found',
  'target_not_live',
  'already_voted',
  'already_nominated',
  'cannot_target_self',
  'unknown',
]);

export function GamePage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useGameConnection(gameId);
  const state = useGameStore((s) => s.state);
  const isConnected = useGameStore((s) => s.isConnected);
  const lastError = useGameStore((s) => s.lastError);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [zoomedSeat, setZoomedSeat] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Reset the active-game query so the home page does not bounce us back in.
  // Cached data could still hold our gameId for up to the refetch interval.
  const goHome = useCallback(() => {
    queryClient.setQueryData(['game', 'active'], { gameId: null });
    navigate(ROUTE_PATH.HOME);
  }, [navigate, queryClient]);

  function handleConfirmLeave() {
    void emitGameAction(CLIENT_EVENT.LEAVE_GAME).finally(() => {
      setShowLeaveConfirm(false);
      goHome();
    });
  }

  // После победы остаёмся на странице игры — там открыты все микрофоны и
  // камеры (см. media-visibility.ts: status==='finished' / GAME_OVER → всё
  // видно/слышно). Игроки сами кликают «Выйти» когда наговорятся. Раньше
  // авто-редирект через 1500ms прерывал обсуждение и был для пользователя
  // как «бросили под открытым небом».

  // Spacebar = "ЗА" during the sequential vote. Mounted unconditionally
  // (state may still be null while we wait for the first delta); the hook
  // no-ops when state isn't ready or the viewer isn't eligible to vote.
  const viewerForHotkey = state?.participants.find((p) => p.userId === user?.id);
  useVoteHotkey(state, viewerForHotkey?.seat ?? null, viewerForHotkey?.isAlive ?? false);
  // Судья нажимает пробел → один шаг партии (next speaker / round / phase).
  // Хоткей и кнопка работают только когда viewer судья — игроки и судьи
  // никогда не пересекаются в одной партии, конфликта с useVoteHotkey нет.
  useJudgeStepHotkey(state, viewerForHotkey?.isJudge ?? false);

  if (!user || !gameId) return null;

  if (lastError) {
    const errorKey = GAME_ERROR_KEYS.has(lastError) ? lastError : 'unknown';
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-danger">{t(`game.errors.${errorKey}`)}</p>
          <button type="button" onClick={goHome} className="text-accent hover:underline text-sm">
            {t('game.ui.back')}
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center text-muted">
        {isConnected ? t('common.loading') : t('common.connecting')}
      </main>
    );
  }

  const viewer = state.participants.find((p) => p.userId === user.id);
  const viewerRole = viewer?.role ?? null;
  const viewerSeat = viewer?.seat ?? null;
  const viewerIsAlive = viewer?.isAlive ?? false;
  const viewerIsJudge = viewer?.isJudge ?? false;

  const actionFor = (participant: (typeof state.participants)[number]) => {
    if (participant.isJudge || participant.seat === null) return null;
    return actionForSeatInCurrentPhase({
      t,
      state,
      viewerRole,
      viewerSeat,
      viewerUserId: user.id,
      viewerIsAlive,
      viewerIsJudge,
      participantSeat: participant.seat,
      participantIsAlive: participant.isAlive,
      participantUserId: participant.userId,
    });
  };

  const zoomedParticipant =
    zoomedSeat !== null
      ? state.participants.find((p) => !p.isJudge && p.seat === zoomedSeat)
      : null;

  const votesAgainst = new Map<number, number>();
  for (const candidate of Object.values(state.votes)) {
    votesAgainst.set(candidate, (votesAgainst.get(candidate) ?? 0) + 1);
  }

  return (
    <MediaRoom gameId={gameId}>
      {/*
        Locked to the viewport at every breakpoint — game screen never scrolls.
        Mobile uses 100dvh so collapsing browser chrome doesn't crop the
        layout. Desktop falls back to h-screen.
      */}
      <main className="h-screen [height:100dvh] flex flex-col bg-bg overflow-hidden">
        <div className="flex-none px-3 sm:px-6 pt-2 sm:pt-3 pb-2 space-y-2">
          <PhaseHeader
            state={state}
            viewerRole={viewerRole}
            viewerIsJudge={viewerIsJudge}
            canLeaveGame={!!viewer && !viewer.isRemoved}
            onLeaveGame={() => setShowLeaveConfirm(true)}
            onOpenLog={() => setShowLog(true)}
          />

          {/* Mobile-only stage strip (phone portrait + phone landscape).
              Disappears at lg+ where the InfoTile inside the ring takes over. */}
          <div className="lg:hidden">
            <MobileStage
              state={state}
              viewerRole={viewerRole}
              viewerSeat={viewerSeat}
              viewerIsAlive={viewerIsAlive}
              viewerIsJudge={viewerIsJudge}
            />
          </div>

          {/* JudgePanel убран из header — кнопка «Дальше» теперь живёт
              внутри InfoTile / MobileStage рядом с кнопками голосования,
              а пробел двигает партию (useJudgeStepHotkey). */}
        </div>

        <div className="flex-1 min-h-0 px-3 sm:px-6 pb-3 overflow-hidden">
          <PlayerTable
            state={state}
            viewerUserId={user.id}
            judgeTile={<JudgeTile state={state} viewerUserId={user.id} />}
            infoTile={
              <InfoTile
                state={state}
                viewerRole={viewerRole}
                viewerSeat={viewerSeat}
                viewerIsAlive={viewerIsAlive}
                viewerIsJudge={viewerIsJudge}
              />
            }
            actionFor={actionFor}
            judgeControlsFor={(participant) =>
              viewerIsJudge && !participant.isJudge ? (
                <JudgeSeatControls
                  targetUserId={participant.userId}
                  foulsCount={participant.foulsCount}
                />
              ) : null
            }
            onZoomSeat={(seat) => setZoomedSeat(seat)}
          />
        </div>

        {viewer && !viewer.isAlive && !viewer.isJudge && (
          <p className="flex-none text-center text-sm text-muted py-1">
            {viewer.isRemoved ? t('game.ui.youAreRemoved') : t('game.ui.youDied')}
          </p>
        )}
      </main>
      {zoomedParticipant && (
        <MobileSeatZoom
          participant={zoomedParticipant}
          voteCountAgainst={
            zoomedParticipant.seat !== null ? votesAgainst.get(zoomedParticipant.seat) : undefined
          }
          action={actionFor(zoomedParticipant)}
          judgeControls={
            viewerIsJudge && !zoomedParticipant.isJudge ? (
              <JudgeSeatControls
                targetUserId={zoomedParticipant.userId}
                foulsCount={zoomedParticipant.foulsCount}
              />
            ) : null
          }
          onClose={() => setZoomedSeat(null)}
        />
      )}
      <ConfirmDialog
        open={showLeaveConfirm}
        title={t('game.ui.leaveGameConfirmTitle')}
        message={t('game.ui.leaveGameConfirmMessage')}
        confirmLabel={t('game.ui.leaveGameConfirm')}
        destructive
        onConfirm={handleConfirmLeave}
        onCancel={() => setShowLeaveConfirm(false)}
      />
      {viewerIsJudge && (
        <GameLogDialog gameId={gameId} open={showLog} onClose={() => setShowLog(false)} />
      )}
      <RoleCardPickerDialog
        state={state}
        viewerSeat={viewerSeat}
        viewerRole={viewerRole}
        viewerIsJudge={viewerIsJudge}
      />
      <RotateDeviceOverlay />
      {/* Unlock-уведомление по итогам партии. Слушает очередь из
          useAchievementUnlockStore — её наполняет useGameConnection
          по SERVER_EVENT.ACHIEVEMENTS_UNLOCKED. */}
      <AchievementUnlockDialog />
    </MediaRoom>
  );
}
