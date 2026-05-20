// LiveKit room wrapper for the game page.
//
// On mount, fetches a fresh LiveKit token from the backend and connects to the room
// named game:<gameId>. Children render inside the LiveKitRoom context and can use any
// hook from @livekit/components-react (useTracks, useLocalParticipant, etc.).
//
// We deliberately do NOT auto-enable camera/microphone — users opt in through the
// SelfMediaButtons so we don't surprise people with permission prompts.
//
// IMPORTANT: even when the LiveKit token fetch fails, we still render the children
// (the game page UI — table, votes, judge panel). Losing video must not lock players
// out of the game itself.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LiveKitRoom, RoomContext } from '@livekit/components-react';
import { Room } from 'livekit-client';
import '@livekit/components-styles';

import { gameApi } from '@/features/game/api/game.api.js';
import { MediaAudioRouter } from './MediaAudioRouter.js';

interface MediaRoomProps {
  gameId: string;
  children: React.ReactNode;
}

export function MediaRoom({ gameId, children }: MediaRoomProps) {
  const tokenQuery = useQuery({
    queryKey: ['game', gameId, 'livekit-token'],
    queryFn: () => gameApi.liveKitToken(gameId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  // A disconnected Room instance used as a fallback context while the token is
  // loading or unavailable. Keeps LiveKit hooks (useParticipants, etc.) from
  // throwing "No room provided" — they simply return empty collections instead.
  const idleRoom = useMemo(() => new Room(), []);

  if (tokenQuery.isLoading) {
    return (
      <RoomContext.Provider value={idleRoom}>
        <MediaBanner tone="info">Подключение к голосовой комнате...</MediaBanner>
        {children}
      </RoomContext.Provider>
    );
  }
  if (tokenQuery.isError || !tokenQuery.data) {
    return (
      <RoomContext.Provider value={idleRoom}>
        <MediaBanner tone="danger">
          Не удалось подключиться к голосовой комнате. Игра продолжается без видео.
        </MediaBanner>
        {children}
      </RoomContext.Provider>
    );
  }

  return (
    <LiveKitRoom
      token={tokenQuery.data.token}
      serverUrl={tokenQuery.data.url}
      connect
      video={false}
      audio={false}
      data-lk-theme="default"
    >
      {children}
      {/* Audio is rendered per-participant subject to phase/role visibility rules,
          not by RoomAudioRenderer — otherwise civilians would hear the mafia at night. */}
      <MediaAudioRouter />
    </LiveKitRoom>
  );
}

function MediaBanner({ tone, children }: { tone: 'info' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === 'danger'
          ? 'fixed top-2 left-1/2 -translate-x-1/2 z-40 rounded-md border border-danger/40 bg-card px-3 py-1.5 text-xs text-danger shadow-lg'
          : 'fixed top-2 left-1/2 -translate-x-1/2 z-40 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted shadow-lg'
      }
    >
      {children}
    </div>
  );
}
