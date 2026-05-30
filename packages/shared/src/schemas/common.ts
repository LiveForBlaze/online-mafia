import { z } from 'zod';

// Schemas that are reused across many other schemas live here.
// Domain-specific schemas (auth, lobby, game) will be added next to their respective modules
// once those modules exist.

export const nicknameSchema = z
  .string()
  .min(2, 'Nickname must be at least 2 characters long')
  .max(24, 'Nickname must be at most 24 characters long')
  .regex(/^[\p{L}\p{N}_\-. ]+$/u, 'Nickname contains forbidden characters');

// Max length per RFC 5321 (254 chars). Bounding the input prevents a client
// from forcing the server to process arbitrarily large strings on every
// login/register request (cheap DoS-hardening, not a correctness requirement).
export const emailSchema = z
  .string()
  .max(254, 'Invalid email address')
  .email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password is too long');
