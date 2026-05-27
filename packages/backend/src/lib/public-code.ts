// Short human-friendly 6-character uppercase alphanumeric codes used by
// User.publicCode, Club.publicCode, and any future "share me by code"
// concept. Allocator retries on collision a few times then throws —
// collisions are astronomically rare at our scale.

import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LENGTH = 6;
const MAX_ATTEMPTS = 10;

export function randomPublicCode(): string {
  const bytes = randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

// Allocate a code that doesn't collide with `taken`. The caller supplies a
// "is this code taken?" probe so this stays model-agnostic (User, Club, …).
export async function allocatePublicCode(
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomPublicCode();
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a unique publicCode after ${MAX_ATTEMPTS} attempts`);
}
