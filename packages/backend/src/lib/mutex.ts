// Lightweight async mutex keyed by string (e.g. gameId).
//
// Two players voting in the same millisecond would otherwise both read the
// pre-vote state, both build a new votes Map, and the second write would
// silently overwrite the first. Wrapping every game-mutating service call in
// `withLock(gameId, fn)` serialises actions per game while still letting
// different games run in parallel.

type Task<T> = () => Promise<T>;

const queues = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, task: Task<T>): Promise<T> {
  // Each key holds a chain of pending promises. Append our task to the chain.
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.then(task, task);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    // If we are still the tail of the chain, drop the map entry to avoid leaking.
    if (queues.get(key) === current) {
      queues.delete(key);
    }
  }
}
