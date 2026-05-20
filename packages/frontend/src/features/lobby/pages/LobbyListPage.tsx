// Page that shows the public lobby list and lets the user create or join one.
// All real logic lives in hooks/components; this page is mostly composition.

import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { LobbySummary } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { Button } from '@/components/ui/Button.js';
import { ThemeToggle } from '@/components/ui/ThemeToggle.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useLogout } from '@/features/auth/hooks/useAuth.js';
import { CreateLobbyDialog } from '@/features/lobby/components/CreateLobbyDialog.js';
import { JoinPrivateLobbyDialog } from '@/features/lobby/components/JoinPrivateLobbyDialog.js';
import { LobbyCard } from '@/features/lobby/components/LobbyCard.js';
import { useLobbies } from '@/features/lobby/hooks/useLobbies.js';
import {
  extractLobbyErrorMessage,
  useJoinLobby,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';
import { lobbyRoomPath } from '@/routes/paths.js';

export function LobbyListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const lobbiesQuery = useLobbies();
  const join = useJoinLobby();

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
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg">{LOBBY_MESSAGES.list.title}</h1>
            {user && <p className="mt-1 text-sm text-muted">{user.nickname}</p>}
          </div>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button onClick={() => setIsCreateOpen(true)}>
              {LOBBY_MESSAGES.list.createButton}
            </Button>
            <Button variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Выйти
            </Button>
          </div>
        </header>

        <div
          role="note"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          {LOBBY_MESSAGES.list.betaNotice}
        </div>

        {inlineError && (
          <p role="alert" className="text-sm text-danger">
            {inlineError}
          </p>
        )}

        {lobbies.length === 0 ? (
          <p className="text-center text-muted py-10">{LOBBY_MESSAGES.list.empty}</p>
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
      </div>
    </main>
  );
}
