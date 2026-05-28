// Periodic sweeper that enforces 30-day retention on the per-game JSONL debug
// logs written by ./debug-log.ts.
//
// Run once at boot and then every SWEEP_INTERVAL_MS. Stats every `*.jsonl`
// file in DEBUG_LOG_DIR and unlinks the ones whose mtime is older than the
// retention cutoff. Missing directory is a silent no-op — the writer creates
// it lazily on first append, so an empty disk before any game has finished
// is normal. Per-file errors are warn-logged but never bubble: sweeper must
// not crash the process.

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from './logger.js';

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const DEFAULT_DIR = '/data/debug-logs';

function resolveDir(dir?: string): string {
  return dir ?? process.env.DEBUG_LOG_DIR ?? DEFAULT_DIR;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * One-shot sweep pass. Reads `dir`, stats each `*.jsonl`, unlinks the ones
 * whose mtime is older than `Date.now() - retentionMs`. Never throws.
 */
export async function sweepDebugLogsOnce(dir?: string, retentionMs?: number): Promise<void> {
  const targetDir = resolveDir(dir);
  const cutoff = Date.now() - (retentionMs ?? RETENTION_MS);

  let entries: string[];
  try {
    entries = await readdir(targetDir);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      // Writer hasn't created the directory yet — nothing to sweep.
      return;
    }
    logger.warn({ err, dir: targetDir }, 'debug-log sweeper: readdir failed');
    return;
  }

  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const filePath = join(targetDir, name);
    try {
      const st = await stat(filePath);
      if (st.mtimeMs < cutoff) {
        await unlink(filePath);
        logger.info({ file: filePath, mtimeMs: st.mtimeMs }, 'debug-log sweeper: deleted');
      }
    } catch (err) {
      // Per-file failures (race with another sweep, permission flap, etc.)
      // must not stop the rest of the pass.
      logger.warn({ err, file: filePath }, 'debug-log sweeper: file op failed');
    }
  }
}

/**
 * Kicks off the sweeper: fires once immediately (un-awaited — Node's timer
 * keeps it alive) and then on a 6-hour interval. Returns the timer handle so
 * the caller can pass it to `stopDebugLogSweeper` from an `onClose` hook.
 */
export function startDebugLogSweeper(): NodeJS.Timeout {
  // Fire-and-forget — the boot sweep runs in the background and must not
  // block server start. Errors are already swallowed inside sweepDebugLogsOnce.
  void sweepDebugLogsOnce();

  const handle = setInterval(() => {
    void sweepDebugLogsOnce();
  }, SWEEP_INTERVAL_MS);
  handle.unref();
  return handle;
}

export function stopDebugLogSweeper(handle: NodeJS.Timeout): void {
  clearInterval(handle);
}
