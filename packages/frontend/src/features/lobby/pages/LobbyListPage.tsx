// Page that shows the public lobby list and lets the user create or join one.
// All real logic lives in hooks/components; this page is mostly composition.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { LobbySummary } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { Button } from '@/components/ui/Button.js';
import { gameApi } from '@/features/game/api/game.api.js';
import { useActiveGame } from '@/features/game/hooks/useActiveGame.js';
import { Input } from '@/components/ui/Input.js';
import { cn } from '@/lib/cn.js';
import { CreateLobbyDialog } from '@/features/lobby/components/CreateLobbyDialog.js';
import { EmptyLobbyState } from '@/features/lobby/components/EmptyLobbyState.js';
import { HomeFeatures } from '@/features/lobby/components/HomeFeatures.js';
import { HomeHero } from '@/features/lobby/components/HomeHero.js';
import { HowItWorksSection } from '@/features/lobby/components/HowItWorksSection.js';
import { JoinPrivateLobbyDialog } from '@/features/lobby/components/JoinPrivateLobbyDialog.js';
import { LobbyListTable } from '@/features/lobby/components/LobbyListTable.js';
import { RewardAvatarPromo } from '@/features/lobby/components/RewardAvatarPromo.js';
import { useHomeStats } from '@/features/lobby/hooks/useHomeStats.js';
import { useLiveLobbies, useLobbies } from '@/features/lobby/hooks/useLobbies.js';
import {
  useExtractLobbyErrorMessage,
  useJoinLobby,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { gameRoomPath, lobbyRoomPath } from '@/routes/paths.js';

export function LobbyListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lobbiesQuery = useLobbies();
  const liveLobbiesQuery = useLiveLobbies();
  const activeGameQuery = useActiveGame();
  const statsQuery = useHomeStats();
  const join = useJoinLobby();
  const extractLobbyErrorMessage = useExtractLobbyErrorMessage();

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
  const [search, setSearch] = useState('');
  // 'all' shows every lobby, 'public' only open ones, 'private' only password-locked ones.
  const [privacyFilter, setPrivacyFilter] = useState<'all' | 'public' | 'private'>('all');

  function handleJoinPublic(lobby: LobbySummary) {
    setInlineError(null);
    join.mutate(
      { lobbyId: lobby.id, input: {} },
      {
        onSuccess: (response) => navigate(lobbyRoomPath(response.lobby.id)),
        onError: (error) => {
          if (error instanceof ApiError && error.body.error === 'already_member') {
            navigate(lobbyRoomPath(lobby.id));
            return;
          }
          setInlineError(extractLobbyErrorMessage(error));
        },
      },
    );
  }

  function handleRowAction(lobby: LobbySummary) {
    // IN_GAME строки: либо «Вернуться в игру» (если viewer — участник и
    // у лобби есть прикреплённый gameId), либо ничего (зрительский режим
    // ещё не реализован — кнопка disabled в таблице, сюда мы не должны
    // попадать, но проверяем defensively).
    if (lobby.status === 'in_game') {
      if (lobby.isViewerMember && lobby.gameId) {
        navigate(gameRoomPath(lobby.gameId));
      }
      return;
    }
    // WAITING — старый join-flow.
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

  // Объединяем WAITING- и IN_GAME-лобби в один список. Сортируем так, чтобы
  // открытые столы шли первыми (актуальнее для нового игрока), а идущие
  // партии — после них. Внутри каждой группы — самые новые сверху (API
  // уже возвращает desc по createdAt).
  const allLobbies = [
    ...(lobbiesQuery.data?.lobbies ?? []),
    ...(liveLobbiesQuery.data?.lobbies ?? []),
  ];
  const searchTrim = search.trim().toLowerCase();
  const lobbies = allLobbies.filter((lobby) => {
    if (privacyFilter === 'public' && lobby.isPrivate) return false;
    if (privacyFilter === 'private' && !lobby.isPrivate) return false;
    if (searchTrim && !lobby.name.toLowerCase().includes(searchTrim)) return false;
    return true;
  });
  const hasAnyLobbies = allLobbies.length > 0;

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-10">
        <HomeHero onCreateLobby={() => setIsCreateOpen(true)} stats={statsQuery.data} />

        {activeGameId && (
          <section className="rounded-lg border border-accent/40 bg-accent/10 p-4 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-fg">{t('lobby.list.resumeGameTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('lobby.list.resumeGameDescription')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(gameRoomPath(activeGameId))}>
                {t('lobby.list.resumeGameButton')}
              </Button>
              <button
                type="button"
                onClick={() => leaveGame.mutate(activeGameId)}
                disabled={leaveGame.isPending}
                className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
              >
                {leaveGame.isPending
                  ? t('lobby.list.resumeGameLeaving')
                  : t('lobby.list.resumeGameLeaveButton')}
              </button>
            </div>
          </section>
        )}

        {inlineError && (
          <p role="alert" className="text-sm text-danger">
            {inlineError}
          </p>
        )}

        {/* Search + privacy filter. Only rendered when at least one lobby
            exists — an empty board doesn't need filtering. */}
        {hasAnyLobbies && (
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <Input
              type="search"
              placeholder={t('lobby.list.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="flex-1"
            />
            <div className="inline-flex rounded-md border border-border bg-card overflow-hidden shrink-0">
              {(['all', 'public', 'private'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPrivacyFilter(value)}
                  className={cn(
                    'px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap transition',
                    privacyFilter === value
                      ? 'bg-bg text-fg font-semibold'
                      : 'text-muted hover:text-fg hover:bg-bg',
                  )}
                >
                  {t(`lobby.list.filter_${value}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {lobbies.length === 0 ? (
          hasAnyLobbies ? (
            <p className="text-center text-sm text-muted py-8">{t('lobby.list.noMatches')}</p>
          ) : (
            <EmptyLobbyState onCreate={() => setIsCreateOpen(true)} />
          )
        ) : (
          <LobbyListTable
            lobbies={lobbies}
            onAction={handleRowAction}
            joiningId={join.isPending ? (join.variables?.lobbyId ?? null) : null}
          />
        )}

        <RewardAvatarPromo />

        <HowItWorksSection />

        <HomeFeatures />

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
    </div>
  );
}
