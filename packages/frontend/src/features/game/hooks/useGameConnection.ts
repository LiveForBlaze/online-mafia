// Manages the Socket.IO connection for the game page.
//
// Connects on mount, joins the game room, listens for state updates. The socket
// is kept alive across page transitions (lobby ↔ game) so we don't churn
// connections; cleanup only removes this hook's listeners.

import { useEffect } from 'react';

import { SERVER_EVENT, type GameStateProjected } from '@mafia/shared';

import { connectGameSocket, emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';

const CLIENT_GAME_JOIN = 'client:game_join';

interface JoinAck {
  ok: boolean;
  error?: string;
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
      void emitGameAction<JoinAck>(CLIENT_GAME_JOIN, { gameId }).then((ack) => {
        if (!ack.ok) setError(ack.error ?? 'unknown');
      });
    }
    function handleDisconnect() {
      setConnected(false);
    }
    function handleState(payload: GameStateProjected) {
      setState(payload);
    }
    function handleConnectError(err: Error) {
      setError(err.message);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SERVER_EVENT.GAME_STATE_DELTA, handleState);

    // If the socket is already connected (e.g. quick navigation), trigger the join manually.
    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SERVER_EVENT.GAME_STATE_DELTA, handleState);
      // Don't disconnect the socket — other pages (lobby) reuse it.
      reset();
    };
  }, [gameId, reset, setConnected, setError, setState]);
}
