// Page wrapper for a single lobby. Owns routing, fetching, and mutation orchestration.
// Rendering lives in LobbyRoom — keeping the page slim makes it easier to swap in
// a WebSocket-driven version later.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import type { Role } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { Spinner } from '@/components/ui/Spinner.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { LobbyRoom } from '@/features/lobby/components/LobbyRoom.js';
import { useLobby } from '@/features/lobby/hooks/useLobby.js';
import { useLobbyConnection } from '@/features/lobby/hooks/useLobbyConnection.js';
import {
  useCloseLobby,
  useExtractLobbyErrorMessage,
  useFillBots,
  useJoinLobby,
  useKickMember,
  useLeaveLobby,
  useLobbyErrorMessage,
  usePreassignRole,
  useSetReady,
  useStartGame,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { JoinPrivateLobbyDialog } from '@/features/lobby/components/JoinPrivateLobbyDialog.js';
import { ROUTE_PATH, gameRoomPath } from '@/routes/paths.js';

// Identifier for the destructive intent the user is about to confirm. Holding the
// pending intent in one place lets a single <ConfirmDialog> serve every action.
type PendingConfirm = { kind: 'close' } | { kind: 'kick'; userId: string; nickname: string } | null;

export function LobbyRoomPage() {
  const { t } = useTranslation();
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
  const preassign = usePreassignRole();
  const setReady = useSetReady();
  const join = useJoinLobby();
  const extractLobbyErrorMessage = useExtractLobbyErrorMessage();
  const lobbyErrorMessage = useLobbyErrorMessage();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [showPrivatePrompt, setShowPrivatePrompt] = useState(false);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  const lobbyData = lobbyQuery.data?.lobby;
  // Auto-join: someone followed a share link and landed here without being a
  // lobby member. Public lobbies → join immediately. Private → password dialog.
  // Run once per page mount so an explicit Leave doesn't trigger a re-join loop.
  useEffect(() => {
    if (!lobbyId || !lobbyData || autoJoinAttempted) return;
    if (lobbyData.isViewerMember) return;
    if (lobbyData.status !== 'waiting') return;
    setAutoJoinAttempted(true);
    if (lobbyData.isPrivate) {
      setShowPrivatePrompt(true);
      return;
    }
    join.mutate(
      { lobbyId, input: {} },
      {
        onError: (error) => setInlineError(extractLobbyErrorMessage(error)),
      },
    );
    // join's identity is stable enough for this effect; we explicitly want it
    // to run once per gating boundary, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, lobbyData, autoJoinAttempted]);

  // Whenever the lobby becomes attached to a started game, redirect everyone in the room.
  const gameId = lobbyData?.gameId ?? null;
  useEffect(() => {
    if (gameId) navigate(gameRoomPath(gameId));
  }, [gameId, navigate]);

  // Хост ушёл → лобби CLOSED. Гости должны автоматически уйти на главную;
  // иначе они продолжают смотреть на «фантомное» лобби. Сервер уже
  // прислал broadcast c lobby.status='closed', осталось среагировать.
  const lobbyStatus = lobbyData?.status ?? null;
  useEffect(() => {
    if (lobbyStatus === 'closed') navigate(ROUTE_PATH.HOME);
  }, [lobbyStatus, navigate]);

  // Раньше тут висел beforeunload → sendBeacon('/leave'). Это ломало F5:
  // unload-handler срабатывал при простом обновлении страницы, leaveLobby
  // на сервере для хоста закрывал лобби, гости летели на главную.
  // Полный leave теперь только через явный клик «Выйти». F5/close-tab
  // ловится сокетом (см. lobby.gateway.ts disconnecting): сбрасывается
  // isReady, membership остаётся — игрок может вернуться.

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

  function handlePreassignRole(userId: string, role: Role | null) {
    if (!lobbyId) return;
    preassign.mutate(
      { lobbyId, input: { userId, role } },
      { onError: (error) => setInlineError(extractLobbyErrorMessage(error)) },
    );
  }

  if (!user || !lobbyId) {
    return null;
  }

  if (lobbyQuery.isLoading) {
    return (
      <div className="page-depth min-h-full p-4 sm:p-6">
        <div className="mx-auto max-w-3xl flex items-center justify-center gap-2 py-16 text-muted">
          <Spinner size="sm" />
          <span>{t('common.lobby_loading')}</span>
        </div>
      </div>
    );
  }

  if (lobbyQuery.isError) {
    const code = lobbyQuery.error instanceof ApiError ? lobbyQuery.error.body.error : undefined;
    return (
      <div className="page-depth min-h-full p-6">
        <div className="mx-auto max-w-md text-center space-y-4">
          <p className="text-danger">{lobbyErrorMessage(code)}</p>
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATH.HOME)}
            className="text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg rounded"
          >
            {t('lobby.room.back')}
          </button>
        </div>
      </div>
    );
  }

  const lobby = lobbyQuery.data?.lobby;
  if (!lobby) return null;

  const confirmTitle =
    pendingConfirm?.kind === 'close'
      ? t('confirm.closeLobbyTitle')
      : pendingConfirm?.kind === 'kick'
        ? t('confirm.kickPlayerTitle')
        : '';
  const confirmMessage =
    pendingConfirm?.kind === 'close'
      ? t('confirm.closeLobbyMessage')
      : pendingConfirm?.kind === 'kick'
        ? t('confirm.kickPlayerMessage', { nickname: pendingConfirm.nickname })
        : '';
  const confirmLabel =
    pendingConfirm?.kind === 'close'
      ? t('confirm.closeLobbyConfirm')
      : pendingConfirm?.kind === 'kick'
        ? t('confirm.kickPlayerConfirm')
        : '';

  return (
    <>
      <LobbyRoom
        lobby={lobby}
        currentUserId={user.id}
        onLeave={handleLeave}
        onClose={handleClose}
        onKick={handleKick}
        onStart={handleStart}
        onFillBots={handleFillBots}
        onPreassignRole={handlePreassignRole}
        onToggleReady={(ready) => {
          if (!lobbyId) return;
          setReady.mutate({ lobbyId, ready });
        }}
        isLeavePending={leave.isPending}
        isClosePending={close.isPending}
        isKickPending={kick.isPending}
        isStartPending={start.isPending}
        isFillBotsPending={fillBots.isPending}
        isPreassignPending={preassign.isPending}
        isReadyPending={setReady.isPending}
        errorMessage={inlineError}
      />
      <JoinPrivateLobbyDialog
        open={showPrivatePrompt}
        lobbyId={lobbyId}
        onClose={() => setShowPrivatePrompt(false)}
        onJoined={() => setShowPrivatePrompt(false)}
      />
      <ConfirmDialog
        open={pendingConfirm !== null}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        destructive
        pending={close.isPending || kick.isPending}
        onConfirm={commitConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}
