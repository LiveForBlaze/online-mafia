import { describe, expect, it } from 'vitest';

import { extractInitial } from './extractInitial.js';

describe('extractInitial', () => {
  it('returns the first letter, uppercased', () => {
    expect(extractInitial('alice')).toBe('A');
  });

  it('uppercases an already-uppercase letter unchanged', () => {
    expect(extractInitial('Bob')).toBe('B');
  });

  it('returns the first digit when the nickname starts with a number', () => {
    expect(extractInitial('7even')).toBe('7');
  });

  it('skips leading non-alphanumeric characters', () => {
    expect(extractInitial('  _#mafia')).toBe('M');
  });

  it('handles Cyrillic and uppercases it', () => {
    expect(extractInitial('игрок')).toBe('И');
  });

  it('falls back to "?" for a nickname with no letters or digits', () => {
    expect(extractInitial('!!!')).toBe('?');
  });

  it('falls back to "?" for an empty string', () => {
    expect(extractInitial('')).toBe('?');
  });

  it('treats a leading emoji as non-alphanumeric and moves on to the next letter', () => {
    expect(extractInitial('🎭star')).toBe('S');
  });
});
