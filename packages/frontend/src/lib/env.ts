// Frontend env vars are exposed by Vite via `import.meta.env`.
// We validate them once at startup so the rest of the app gets typed values
// and crashes immediately if anything required is missing.

import { z } from 'zod';

const envSchema = z.object({
  VITE_BACKEND_URL: z.string().url(),
  VITE_LIVEKIT_URL: z.string().url(),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid frontend env variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid frontend environment configuration');
}

export const env = parsed.data;
