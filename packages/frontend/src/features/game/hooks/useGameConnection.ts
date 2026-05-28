// Manages the Socket.IO connection for the game page.
//
// Connects on mount, joins the game room, listens for state updates. The socket
// is kept alive across page transitions (lobby ↔ game) so we don't churn
// connections; cleanup only removes this hook's listeners.

import { useEffect } from 'react';

import {
  CLIENT_EVENT,
  SERVER_EVENT,
  type EarnedAchievementPayload,
  type GameStateProjected,
} from '@mafia/shared';

import { pushDiag } from '@/features/game/socket/diag-log.js';
import { connectGameSocket, emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useAchievementUnlockStore } from '@/features/users/store/achievement-unlocks.store.js';

interface JoinAck {
  ok: boolean;
  error?: string;
}

interface AchievementsUnlockedPayload {
  achievements: EarnedAchievementPayload[];
}

export function useGameConnection(gameId: string | undefined): void {
  const setState = useGameStore((s) => s.setState);
  const setConnected = useGameStore((s) => s.setConnected);
  const setError = useGameStore((s) => s.setError);
  const reset = useGameStore((s) => s.reset);

  useEffect(() => {
    if (!gameId) return;

    const socket = connectGameSocket();

    function handleConnect() {
      setConnected(true);
      setError(null);
      void emitGameAction<JoinAck>(CLIENT_EVENT.GAME_JOIN, { gameId }).then((ack) => {
        if (!ack.ok) setError(ack.error ?? 'unknown');
      });
    }
    function handleDisconnect() {
      setConnected(false);
    }
    function handleState(payload: GameStateProjected) {
      setState(payload);
      const viewerId = useAuthStore.getState().user?.id;
      const viewer = viewerId ? payload.participants.find((p) => p.userId === viewerId) : undefined;
      console.info('[diag][ws.game.delta]', {
        gameId: payload.id,
        phase: payload.phase,
        dayNumber: payload.dayNumber,
        status: payload.status,
        currentSpeakerSeat: payload.currentSpeakerSeat,
        farewellSeat: payload.farewellSeat,
        lastWordSeat: payload.lastWordSeat,
        viewer: viewer
          ? {
              seat: viewer.seat,
              isJudge: viewer.isJudge,
              isAlive: viewer.isAlive,
              role: viewer.role,
            }
          : null,
      });
      pushDiag('game.delta', {
        gameId: payload.id,
        phase: payload.phase,
        dayNumber: payload.dayNumber,
        status: payload.status,
        viewerSeat: viewer?.seat ?? null,
        viewerIsAlive: viewer?.isAlive ?? false,
        viewerIsJudge: viewer?.isJudge ?? false,
      });
    }
    function handleConnectError(err: Error) {
      setError(err.message);
    }
    // Сервер шлёт это event'ом ПОСЛЕ commit'а транзакции finalizeGameStats,
    // адресно тому socket'у, чьи ачивки реально прибавились. Мы кладём в
    // очередь (модалка показывает по одной) и оптимистично обновляем
    // user.achievements в auth-store — чтобы библиотека аватарок мгновенно
    // отразила разблокированные слоты без перелогина.
    function handleAchievementsUnlocked(payload: AchievementsUnlockedPayload) {
      if (!payload?.achievements?.length) return;
      useAchievementUnlockStore.getState().enqueue(payload.achievements);
      const current = useAuthStore.getState().user;
      if (current) {
        const existingIds = new Set(current.achievements.map((a) => a.id));
        const merged = [
          ...current.achievements,
          ...payload.achievements.filter((a) => !existingIds.has(a.id)),
        ];
        useAuthStore.getState().setUser({ ...current, achievements: merged });
      }
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SERVER_EVENT.GAME_STATE_DELTA, handleState);
    socket.on(SERVER_EVENT.ACHIEVEMENTS_UNLOCKED, handleAchievementsUnlocked);

    // If the socket is already connected (e.g. quick navigation), trigger the join manually.
    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SERVER_EVENT.GAME_STATE_DELTA, handleState);
      socket.off(SERVER_EVENT.ACHIEVEMENTS_UNLOCKED, handleAchievementsUnlocked);
      // Don't disconnect the socket — other pages (lobby) reuse it.
      reset();
    };
  }, [gameId, reset, setConnected, setError, setState]);
}
