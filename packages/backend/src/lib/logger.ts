// Centralised logger instance used by Fastify and all modules.
// Use pino in production (fast structured JSON) and pino-pretty in development for readability.

import { pino } from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Fields to never write to logs even if accidentally included in a log object.
// Pino's redact rewrites them to "[Redacted]". Anything secret-ish goes here.
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'request.headers.cookie',
  'request.headers.authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.jwt',
  '*.JWT_SECRET',
  '*.LIVEKIT_API_SECRET',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
