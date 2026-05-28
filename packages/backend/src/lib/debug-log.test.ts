import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendDebugLog, configureDebugLogDirForTests } from './debug-log.js';

describe('appendDebugLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'debug-log-test-'));
    configureDebugLogDirForTests(dir);
  });

  afterEach(() => {
    configureDebugLogDirForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes one JSONL line per call to the per-game file', async () => {
    await appendDebugLog('game-1', {
      cat: 'game',
      type: 'phase_changed',
      actor: 'alice',
      userId: 'uuid-1',
      data: { from: 'a', to: 'b' },
    });
    await appendDebugLog('game-1', {
      cat: 'media',
      type: 'snapshot',
      data: { phase: 'day_speech', participants: [] },
    });
    const file = join(dir, 'game-1.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!);
    expect(first.cat).toBe('game');
    expect(first.type).toBe('phase_changed');
    expect(first.actor).toBe('alice');
    expect(first.data).toEqual({ from: 'a', to: 'b' });
    expect(typeof first.t).toBe('string');
    expect(first.t).toMatch(/Z$/);
    // Канонический порядок ключей — спека фиксирует t→cat→type→actor→userId→data.
    // На диске порядок важен: tools могут tail/grep с regex'ом, и нам нужна
    // стабильность.
    expect(lines[0]).toMatch(
      /^\{"t":"[^"]+","cat":"game","type":"phase_changed","actor":"alice","userId":"uuid-1","data":/,
    );
  });

  it('serialises concurrent appends so lines never interleave', async () => {
    // Fire all 50 appends synchronously so the per-game queue actually
    // has work pending. Big payload so a partial write would obviously
    // break JSON.parse on at least one line.
    const big = 'x'.repeat(1024);
    const promises = Array.from({ length: 50 }, (_, i) =>
      appendDebugLog('game-2', { cat: 'game', type: 'tick', data: { i, big } }),
    );
    await Promise.all(promises);
    const lines = readFileSync(join(dir, 'game-2.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(50);
    for (let i = 0; i < lines.length; i += 1) {
      const parsed = JSON.parse(lines[i]!);
      expect(parsed.cat).toBe('game');
      expect(parsed.data.i).toBe(i);
      expect(parsed.data.big).toBe(big);
    }
  });

  it('routes to _orphan.jsonl when gameId is null', async () => {
    await appendDebugLog(null, { cat: 'socket', type: 'conn.up', data: {} });
    const file = join(dir, '_orphan.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('does not throw when the write fails', async () => {
    // Point the writer at a path that exists as a file. mkdir(..., {
    // recursive: true }) on a non-directory path fails with ENOTDIR,
    // which exercises the writer's error-swallowing branch reliably
    // (the previous "/nonexistent/path" approach was OS-permission-dependent).
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, '');
    configureDebugLogDirForTests(blocker);
    await expect(
      appendDebugLog('game-3', { cat: 'game', type: 'x', data: {} }),
    ).resolves.toBeUndefined();
  });
});
