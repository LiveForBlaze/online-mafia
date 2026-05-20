// Password hashing using argon2id.
// Parameters follow the OWASP Password Storage Cheat Sheet (memoryCost ≥ 19 MB).
// Do not lower these without a strong reason — they protect against offline GPU attacks.

import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // KiB → ~19 MB per hash
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Verification can throw on malformed hashes; treat it as a failed match, never as a 500.
    return false;
  }
}
