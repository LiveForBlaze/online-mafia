// In-memory registry of active games. One entry per running game.
//
// On backend restart the registry is empty; rebuilding state from the event log is
// out of scope for V0 — we simply mark interrupted games as abandoned manually.

import type { GameState } from './game.state.js';

const registry = new Map<string, GameState>();

export function registerGame(state: GameState): void {
  registry.set(state.id, state);
}

export function getGame(gameId: string): GameState | undefined {
  return registry.get(gameId);
}

export function setGame(state: GameState): void {
  registry.set(state.id, state);
}

export function unregisterGame(gameId: string): void {
  registry.delete(gameId);
}

export function activeGameIds(): string[] {
  return Array.from(registry.keys());
}
