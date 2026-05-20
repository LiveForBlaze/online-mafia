// Environment variables are validated at startup with zod.
// If anything required is missing or malformed, the process exits immediately
// with a clear error — better than discovering it later at a 500 error.

import { z } from 'zod';

// Placeholder values shipped in .env.example. If any of these reach production,
// the server refuses to boot — better an obvious crash than a silently insecure deploy.
const INSECURE_PLACEHOLDERS = new Set<string>([
  'CHANGE_ME_JWT_SECRET_GENERATE_WITH_openssl_rand_base64_48',
  'CHANGE_ME_LIVEKIT_API_SECRET_AT_LEAST_32_CHARS_LONG',
  'change-me-to-a-long-random-string',
  'change-me-to-a-long-random-string-at-least-32-chars',
  'devsecretdevsecretdevsecretdevsecret',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  BACKEND_HOST: z.string().default('0.0.0.0'),
  PUBLIC_BACKEND_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(32, 'LIVEKIT_API_SECRET must be at least 32 characters'),
  LIVEKIT_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  // Google OAuth credentials. Optional — if not provided, Google sign-in is disabled
  // and the corresponding routes return 501 Not Implemented.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().optional(),

  // URL of the frontend, used to redirect users after OAuth flow.
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Guard against shipping with placeholder secrets in production.
if (parsed.data.NODE_ENV === 'production') {
  const insecureKeys: string[] = [];
  if (INSECURE_PLACEHOLDERS.has(parsed.data.JWT_SECRET)) insecureKeys.push('JWT_SECRET');
  if (INSECURE_PLACEHOLDERS.has(parsed.data.LIVEKIT_API_SECRET))
    insecureKeys.push('LIVEKIT_API_SECRET');
  if (insecureKeys.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `Refusing to start in production with placeholder secrets: ${insecureKeys.join(', ')}. ` +
        'Generate real values, e.g. `openssl rand -base64 48`.',
    );
    process.exit(1);
  }
  // In production HTTPS must be live (cookies are secure-only) and LiveKit must use wss://.
  if (!parsed.data.PUBLIC_BACKEND_URL.startsWith('https://')) {
    // eslint-disable-next-line no-console
    console.error('PUBLIC_BACKEND_URL must be https:// in production.');
    process.exit(1);
  }
  if (!parsed.data.LIVEKIT_URL.startsWith('wss://')) {
    // eslint-disable-next-line no-console
    console.error('LIVEKIT_URL must be wss:// in production (browsers block mixed content).');
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
