// Append-only JSONL writer for per-game debug logs.
//
// Each game (or `_orphan` for messages with no associated game) gets its own
// file under DEBUG_LOG_DIR. Writes are serialised per file via a chained
// promise queue so concurrent appends never interleave bytes. Errors are
// swallowed (logged via pino at warn level) because logging is never on a
// player action's critical path.

import { appendFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from './logger.js';

export interface DebugLogEntry {
  cat: 'game' | 'media' | 'socket' | 'client';
  type: string;
  actor?: string | null;
  userId?: string | null;
  data: unknown;
}

const DEFAULT_DIR = '/data/debug-logs';

// Per-file hard cap. Once a .jsonl exceeds this, further appends are dropped so
// a diagnostic flood can't fill the disk. Simple guard, not full rotation.
const MAX_FILE_BYTES = 16 * 1024 * 1024;

let currentDir: string = process.env.DEBUG_LOG_DIR ?? DEFAULT_DIR;
let dirReady = false;
const queues = new Map<string, Promise<void>>();
// Files we've already warned about hitting the cap — warn once each, not per write.
const cappedWarned = new Set<string>();

/**
 * Test-only override for the log directory. Passing `null` resets to the
 * default (env-driven) value. Also clears the per-file write queue and the
 * `dirReady` flag so the next write re-creates the directory.
 */
export function configureDebugLogDirForTests(dir: string | null): void {
  currentDir = dir ?? process.env.DEBUG_LOG_DIR ?? DEFAULT_DIR;
  dirReady = false;
  queues.clear();
}

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(currentDir, { recursive: true });
  dirReady = true;
}

function formatLine(entry: DebugLogEntry): string {
  // Order matters — tests parse this back to JSON, but the on-disk shape is
  // also human-tailed, so keep the key order stable: t, cat, type, actor,
  // userId, data.
  const obj = {
    t: new Date().toISOString(),
    cat: entry.cat,
    type: entry.type,
    actor: entry.actor ?? null,
    userId: entry.userId ?? null,
    data: entry.data,
  };
  return JSON.stringify(obj) + '\n';
}

/**
 * Append one JSONL entry for a game. `gameId === null` routes to
 * `_orphan.jsonl`. Never throws — write failures are logged at warn level.
 */
export async function appendDebugLog(gameId: string | null, entry: DebugLogEntry): Promise<void> {
  const key = gameId ?? '_orphan';
  const line = formatLine(entry);

  // Capture dir at enqueue time so a mid-flight configureDebugLogDirForTests
  // can't redirect this write to a different file.
  const dir = currentDir;
  const filePath = join(dir, `${key}.jsonl`);

  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined) // never cascade prior failures into this write
    .then(async () => {
      try {
        await ensureDir();
        // Disk-fill guard: skip the write if the file already exceeds the cap.
        // Tolerate ENOENT (file not created yet) — that means size 0.
        try {
          const { size } = await stat(filePath);
          if (size >= MAX_FILE_BYTES) {
            if (!cappedWarned.has(key)) {
              cappedWarned.add(key);
              logger.warn(
                { gameId: key, size },
                'debug-log: file size cap reached, dropping writes',
              );
            }
            return;
          }
        } catch (statErr) {
          if ((statErr as NodeJS.ErrnoException).code !== 'ENOENT') throw statErr;
        }
        await appendFile(filePath, line, 'utf8');
      } catch (err) {
        logger.warn({ err, gameId: key }, 'debug-log: write failed');
      }
    });
  queues.set(key, next);

  try {
    await next;
  } finally {
    // Drop the queue entry once it drains so the map doesn't grow unbounded.
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  }
}
