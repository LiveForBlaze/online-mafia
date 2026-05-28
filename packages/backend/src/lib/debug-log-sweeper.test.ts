import { mkdtempSync, writeFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sweepDebugLogsOnce } from './debug-log-sweeper.js';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

describe('sweepDebugLogsOnce', () => {
  it('deletes files older than 30 days and keeps fresh ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweeper-test-'));
    try {
      const oldFile = join(dir, 'old.jsonl');
      const freshFile = join(dir, 'fresh.jsonl');
      writeFileSync(oldFile, 'x\n');
      writeFileSync(freshFile, 'y\n');
      const oldEpoch = Date.now() / 1000 - (RETENTION_MS / 1000 + 86_400);
      utimesSync(oldFile, oldEpoch, oldEpoch);

      await sweepDebugLogsOnce(dir, RETENTION_MS);

      expect(existsSync(oldFile)).toBe(false);
      expect(existsSync(freshFile)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('silently tolerates a missing directory', async () => {
    await expect(
      sweepDebugLogsOnce('/tmp/nonexistent/sweeper/path', RETENTION_MS),
    ).resolves.toBeUndefined();
  });

  it('ignores non-.jsonl files in the directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweeper-test-'));
    try {
      const oldJsonl = join(dir, 'old.jsonl');
      const oldOther = join(dir, 'old.txt');
      writeFileSync(oldJsonl, 'x\n');
      writeFileSync(oldOther, 'y\n');
      const oldEpoch = Date.now() / 1000 - (RETENTION_MS / 1000 + 86_400);
      utimesSync(oldJsonl, oldEpoch, oldEpoch);
      utimesSync(oldOther, oldEpoch, oldEpoch);

      await sweepDebugLogsOnce(dir, RETENTION_MS);

      expect(existsSync(oldJsonl)).toBe(false);
      expect(existsSync(oldOther)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
