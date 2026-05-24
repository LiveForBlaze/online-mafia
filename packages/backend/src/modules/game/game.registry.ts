// In-memory registry of active games. One entry per running game.
//
// On backend restart the registry is empty; rebuilding state from the event log is
// out of scope for V0 — we simply mark interrupted games as abandoned manually.

import type { GameState } from './game.state.js';

const registry = new Map<string, GameState>();

// История последних N состояний на игру — стек для функционала «Revert»
// (откатить случайный судейский шаг). Хранится отдельно от самой GameState,
// чтобы не утекать в проекцию для клиента и не раздувать сериализацию.
// Ограничение: 10 последних шагов на игру — этого хватает для отмены
// «промахнулся-нажал-дальше-два-раза», а память на «осиротевшей» игре
// получает верхнюю границу.
const HISTORY_LIMIT = 10;
const historyStacks = new Map<string, GameState[]>();

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
  historyStacks.delete(gameId);
}

export function activeGameIds(): string[] {
  return Array.from(registry.keys());
}

/** Снимок текущего стейта в стек истории — для последующего revert. */
export function pushHistorySnapshot(state: GameState): void {
  const stack = historyStacks.get(state.id) ?? [];
  stack.push(state);
  while (stack.length > HISTORY_LIMIT) stack.shift();
  historyStacks.set(state.id, stack);
}

/** Достаёт и удаляет последний снимок. null если истории нет. */
export function popHistorySnapshot(gameId: string): GameState | null {
  const stack = historyStacks.get(gameId);
  if (!stack || stack.length === 0) return null;
  const prev = stack.pop()!;
  return prev;
}

export function historyDepth(gameId: string): number {
  return historyStacks.get(gameId)?.length ?? 0;
}
