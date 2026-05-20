// Main page for an in-progress game.
//
// Layout: a thin header on top, judge action panel (only when the viewer IS the judge),
// and a 12-tile video grid that fills the rest of the viewport. The grid contains the
// 10 player seats, the judge tile, and an info tile with current-phase context.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import { CLIENT_EVENT } from '@mafia/shared';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { InfoTile } from '@/features/game/components/InfoTile.js';
import { JudgePanel, JudgeSeatControls } from '@/features/game/components/JudgePanel.js';
import { JudgeTile } from '@/features/game/components/JudgeTile.js';
import { MediaRoom } from '@/features/game/components/MediaRoom.js';
import { PhaseHeader } from '@/features/game/components/PhaseHeader.js';
import { actionForSeatInCurrentPhase } from '@/features/game/components/PhasePanel.js';
import { PlayerTable } from '@/features/game/components/PlayerTable.js';
import { useGameConnection } from '@/features/game/hooks/useGameConnection.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import { GAME_MESSAGES, gameErrorMessage } from '@/features/game/messages.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useGameConnection(gameId);
  const state = useGameStore((s) => s.state);
  const isConnected = useGameStore((s) => s.isConnected);
  const lastError = useGameStore((s) => s.lastError);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const queryClient = useQueryClient();

  // Reset the active-game query so the home page does not bounce us back in.
  // Cached data could still hold our gameId for up to the refetch interval.
  function goHome() {
    queryClient.setQueryData(['game', 'active'], { gameId: null });
    navigate(ROUTE_PATH.HOME);
  }

  function handleConfirmLeave() {
    void emitGameAction(CLIENT_EVENT.LEAVE_GAME).finally(() => {
      setShowLeaveConfirm(false);
      goHome();
    });
  }

  if (!user || !gameId) return null;

  if (lastError) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-danger">{gameErrorMessage(lastError)}</p>
          <button type="button" onClick={goHome} className="text-accent hover:underline text-sm">
            {GAME_MESSAGES.ui.back}
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center text-muted">
        {isConnected ? 'Загрузка...' : 'Подключение...'}
      </main>
    );
  }

  const viewer = state.participants.find((p) => p.userId === user.id);
  const viewerRole = viewer?.role ?? null;
  const viewerSeat = viewer?.seat ?? null;
  const viewerIsAlive = viewer?.isAlive ?? false;
  const viewerIsJudge = viewer?.isJudge ?? false;

  return (
    <MediaRoom gameId={gameId}>
      <main className="h-screen flex flex-col bg-bg">
        <div className="flex-none px-4 sm:px-6 pt-3 pb-2 space-y-2">
          <PhaseHeader
            state={state}
            viewerRole={viewerRole}
            viewerIsJudge={viewerIsJudge}
            canLeaveGame={!!viewer && !viewer.isRemoved}
            onLeaveGame={() => setShowLeaveConfirm(true)}
          />

          {viewerIsJudge && <JudgePanel state={state} />}
        </div>

        {/* 12-tile video grid takes all remaining space. */}
        <div className="flex-1 min-h-0 px-4 sm:px-6 pb-3">
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
              />
            }
            actionFor={(participant) =>
              actionForSeatInCurrentPhase({
                state,
                viewerRole,
                viewerSeat,
                viewerUserId: user.id,
                viewerIsAlive,
                participantSeat: participant.seat!,
                participantIsAlive: participant.isAlive,
                participantUserId: participant.userId,
              })
            }
            judgeControlsFor={(participant) =>
              viewerIsJudge && !participant.isJudge ? (
                <JudgeSeatControls targetUserId={participant.userId} />
              ) : null
            }
          />
        </div>

        {viewer && !viewer.isAlive && !viewer.isJudge && (
          <p className="flex-none text-center text-sm text-muted py-1">
            {viewer.isRemoved ? GAME_MESSAGES.ui.youAreRemoved : GAME_MESSAGES.ui.youDied}
          </p>
        )}
      </main>
      <ConfirmDialog
        open={showLeaveConfirm}
        title={GAME_MESSAGES.ui.leaveGameConfirmTitle}
        message={GAME_MESSAGES.ui.leaveGameConfirmMessage}
        confirmLabel={GAME_MESSAGES.ui.leaveGameConfirm}
        destructive
        onConfirm={handleConfirmLeave}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </MediaRoom>
  );
}
