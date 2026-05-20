// Page that shows the public lobby list and lets the user create or join one.
// All real logic lives in hooks/components; this page is mostly composition.

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { LobbySummary } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { Button } from '@/components/ui/Button.js';
import { gameApi } from '@/features/game/api/game.api.js';
import { useActiveGame } from '@/features/game/hooks/useActiveGame.js';
import { CreateLobbyDialog } from '@/features/lobby/components/CreateLobbyDialog.js';
import { EmptyLobbyState } from '@/features/lobby/components/EmptyLobbyState.js';
import { JoinPrivateLobbyDialog } from '@/features/lobby/components/JoinPrivateLobbyDialog.js';
import { LobbyCard } from '@/features/lobby/components/LobbyCard.js';
import { LobbyStats } from '@/features/lobby/components/LobbyStats.js';
import { useLobbies } from '@/features/lobby/hooks/useLobbies.js';
import {
  extractLobbyErrorMessage,
  useJoinLobby,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';
import { gameRoomPath, lobbyRoomPath } from '@/routes/paths.js';

export function LobbyListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lobbiesQuery = useLobbies();
  const activeGameQuery = useActiveGame();
  const join = useJoinLobby();

  // Active game banner: explicit choice between resuming and leaving. We
  // deliberately do NOT auto-redirect — the user might have dropped on purpose
  // or want a moment to decide.
  const activeGameId = activeGameQuery.data?.gameId ?? null;
  const leaveGame = useMutation({
    mutationFn: (gameId: string) => gameApi.leave(gameId),
    onSuccess: () => {
      queryClient.setQueryData(['game', 'active'], { gameId: null });
    },
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [privateLobbyId, setPrivateLobbyId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  function handleJoinPublic(lobby: LobbySummary) {
    setInlineError(null);
    join.mutate(
      { lobbyId: lobby.id, input: {} },
      {
        onSuccess: (response) => navigate(lobbyRoomPath(response.lobby.id)),
        onError: (error) => {
          // Safety net: if backend says "you're already in this lobby" (state drift),
          // just navigate them into it instead of showing an error.
          if (error instanceof ApiError && error.body.error === 'already_member') {
            navigate(lobbyRoomPath(lobby.id));
            return;
          }
          setInlineError(extractLobbyErrorMessage(error));
        },
      },
    );
  }

  function handleJoinClick(lobby: LobbySummary) {
    // Already a member → no API call needed, just navigate.
    if (lobby.isViewerMember) {
      navigate(lobbyRoomPath(lobby.id));
      return;
    }
    if (lobby.isPrivate) {
      setPrivateLobbyId(lobby.id);
    } else {
      handleJoinPublic(lobby);
    }
  }

  const lobbies = lobbiesQuery.data?.lobbies ?? [];

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {LOBBY_MESSAGES.list.title}
            </h1>
            <p className="mt-0.5 text-sm text-muted">{LOBBY_MESSAGES.list.tagline}</p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="shrink-0 self-start sm:self-auto"
          >
            {LOBBY_MESSAGES.list.createButton}
          </Button>
        </header>

        <LobbyStats lobbies={lobbies} />

        <div
          role="note"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {LOBBY_MESSAGES.list.betaNotice}
        </div>

        {activeGameId && (
          <section className="rounded-lg border border-accent/40 bg-accent/10 p-4 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-fg">
                {LOBBY_MESSAGES.list.resumeGameTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">{LOBBY_MESSAGES.list.resumeGameDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(gameRoomPath(activeGameId))}>
                {LOBBY_MESSAGES.list.resumeGameButton}
              </Button>
              <button
                type="button"
                onClick={() => leaveGame.mutate(activeGameId)}
                disabled={leaveGame.isPending}
                className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
              >
                {leaveGame.isPending
                  ? LOBBY_MESSAGES.list.resumeGameLeaving
                  : LOBBY_MESSAGES.list.resumeGameLeaveButton}
              </button>
            </div>
          </section>
        )}

        {inlineError && (
          <p role="alert" className="text-sm text-danger">
            {inlineError}
          </p>
        )}

        {lobbies.length === 0 ? (
          <EmptyLobbyState onCreate={() => setIsCreateOpen(true)} />
        ) : (
          <div className="space-y-3">
            {lobbies.map((lobby) => (
              <LobbyCard
                key={lobby.id}
                lobby={lobby}
                onJoin={() => handleJoinClick(lobby)}
                isJoining={join.isPending && join.variables?.lobbyId === lobby.id}
              />
            ))}
          </div>
        )}

        <CreateLobbyDialog
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(lobby) => navigate(lobbyRoomPath(lobby.id))}
        />

        <JoinPrivateLobbyDialog
          open={privateLobbyId !== null}
          lobbyId={privateLobbyId}
          onClose={() => setPrivateLobbyId(null)}
          onJoined={(lobby) => navigate(lobbyRoomPath(lobby.id))}
        />

        <footer className="pt-4 text-center text-xs text-muted">
          {LOBBY_MESSAGES.list.footer}
        </footer>
      </div>
    </div>
  );
}
