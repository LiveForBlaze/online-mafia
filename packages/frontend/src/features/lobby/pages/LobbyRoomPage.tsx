// Page wrapper for a single lobby. Owns routing, fetching, and mutation orchestration.
// Rendering lives in LobbyRoom — keeping the page slim makes it easier to swap in
// a WebSocket-driven version later.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ApiError } from '@/lib/api-client.js';
import { env } from '@/lib/env.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { LobbyRoom } from '@/features/lobby/components/LobbyRoom.js';
import { useLobby } from '@/features/lobby/hooks/useLobby.js';
import { useLobbyConnection } from '@/features/lobby/hooks/useLobbyConnection.js';
import {
  extractLobbyErrorMessage,
  useClaimJudge,
  useCloseLobby,
  useFillBots,
  useKickMember,
  useLeaveLobby,
  useStartGame,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { LOBBY_MESSAGES, lobbyErrorMessage } from '@/features/lobby/messages.js';
import { ROUTE_PATH, gameRoomPath } from '@/routes/paths.js';

// Identifier for the destructive intent the user is about to confirm. Holding the
// pending intent in one place lets a single <ConfirmDialog> serve every action.
type PendingConfirm = { kind: 'close' } | { kind: 'kick'; userId: string; nickname: string } | null;

export function LobbyRoomPage() {
  const params = useParams<{ id: string }>();
  const lobbyId = params.id;
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  useLobbyConnection(lobbyId);
  const lobbyQuery = useLobby(lobbyId);
  const leave = useLeaveLobby();
  const close = useCloseLobby();
  const kick = useKickMember();
  const start = useStartGame();
  const fillBots = useFillBots();
  const claimJudge = useClaimJudge();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  // Whenever the lobby becomes attached to a started game, redirect everyone in the room.
  const gameId = lobbyQuery.data?.lobby.gameId ?? null;
  useEffect(() => {
    if (gameId) navigate(gameRoomPath(gameId));
  }, [gameId, navigate]);

  // Best-effort cleanup: when the user closes the tab, beacon /leave.
  useEffect(() => {
    if (!lobbyId || gameId) return;
    function leaveOnUnload() {
      const url = `${env.VITE_BACKEND_URL}/api/v1/lobby/${lobbyId}/leave`;
      navigator.sendBeacon(url);
    }
    window.addEventListener('beforeunload', leaveOnUnload);
    return () => window.removeEventListener('beforeunload', leaveOnUnload);
  }, [lobbyId, gameId]);

  // SPA navigation back to the list also leaves so ghost members don't pile up.
  function handleBack() {
    if (!lobbyId) {
      navigate(ROUTE_PATH.HOME);
      return;
    }
    leave.mutate(lobbyId, { onSettled: () => navigate(ROUTE_PATH.HOME) });
  }

  function handleLeave() {
    if (!lobbyId) return;
    leave.mutate(lobbyId, {
      onSuccess: () => navigate(ROUTE_PATH.HOME),
      onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
    });
  }

  function handleClose() {
    setPendingConfirm({ kind: 'close' });
  }

  function handleKick(userId: string) {
    if (!lobbyId) return;
    const target = lobbyQuery.data?.lobby.members.find((m) => m.userId === userId);
    setPendingConfirm({ kind: 'kick', userId, nickname: target?.nickname ?? '' });
  }

  function commitConfirm() {
    if (!lobbyId || !pendingConfirm) return;
    if (pendingConfirm.kind === 'close') {
      close.mutate(lobbyId, {
        onSuccess: () => navigate(ROUTE_PATH.HOME),
        onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
        onSettled: () => setPendingConfirm(null),
      });
    } else {
      const { userId } = pendingConfirm;
      kick.mutate(
        { lobbyId, userId },
        {
          onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
          onSettled: () => setPendingConfirm(null),
        },
      );
    }
  }

  function handleStart() {
    if (!lobbyId) return;
    start.mutate(lobbyId, {
      onSuccess: (response) => navigate(gameRoomPath(response.gameId)),
      onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
    });
  }

  function handleFillBots() {
    if (!lobbyId) return;
    fillBots.mutate(lobbyId, {
      onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
    });
  }

  function handleClaimJudge() {
    if (!lobbyId) return;
    claimJudge.mutate(lobbyId, {
      onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
    });
  }

  if (!user || !lobbyId) {
    return null;
  }

  if (lobbyQuery.isLoading) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center text-muted">
        Загрузка лобби...
      </main>
    );
  }

  if (lobbyQuery.isError) {
    const code = lobbyQuery.error instanceof ApiError ? lobbyQuery.error.body.error : undefined;
    return (
      <main className="min-h-screen p-6">
        <div className="mx-auto max-w-md text-center space-y-4">
          <p className="text-danger">{lobbyErrorMessage(code)}</p>
          <button
            type="button"
            onClick={handleBack}
            className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg rounded"
          >
            {LOBBY_MESSAGES.room.back}
          </button>
        </div>
      </main>
    );
  }

  const lobby = lobbyQuery.data?.lobby;
  if (!lobby) return null;

  return (
    <>
      <LobbyRoom
        lobby={lobby}
        currentUserId={user.id}
        onBack={handleBack}
        onLeave={handleLeave}
        onClose={handleClose}
        onKick={handleKick}
        onStart={handleStart}
        onFillBots={handleFillBots}
        onClaimJudge={handleClaimJudge}
        isLeavePending={leave.isPending}
        isClosePending={close.isPending}
        isKickPending={kick.isPending}
        isStartPending={start.isPending}
        isFillBotsPending={fillBots.isPending}
        isClaimJudgePending={claimJudge.isPending}
        errorMessage={inlineError}
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.kind === 'close' ? 'Закрыть лобби?' : 'Удалить игрока?'}
        message={
          pendingConfirm?.kind === 'close'
            ? 'Лобби закроется для всех его участников. Действие необратимо.'
            : pendingConfirm?.kind === 'kick'
              ? `Игрок ${pendingConfirm.nickname} будет удалён из лобби.`
              : ''
        }
        confirmLabel={pendingConfirm?.kind === 'close' ? 'Закрыть' : 'Удалить'}
        destructive
        pending={close.isPending || kick.isPending}
        onConfirm={commitConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}
