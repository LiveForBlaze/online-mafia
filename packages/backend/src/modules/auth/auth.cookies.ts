// Cookie names and shared cookie-setting helpers used by the auth module.
// Kept in a separate file so route handlers do not duplicate the cookie config
// (path, sameSite, secure, etc.).

import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';

import { env } from '../../config/env.js';

export const COOKIE_NAME = {
  SESSION: 'session',
  OAUTH_STATE: 'oauth_state',
  OAUTH_CODE_VERIFIER: 'oauth_code_verifier',
} as const;

/** OAuth state and PKCE verifier are short-lived — they only need to survive the round-trip to Google. */
const OAUTH_TEMP_COOKIE_TTL_SECONDS = 60 * 10; // 10 minutes

const isProduction = env.NODE_ENV === 'production';

function baseCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME.SESSION, token, {
    ...baseCookieOptions(),
    maxAge: env.SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME.SESSION, { path: '/' });
}

export function setOAuthTempCookie(reply: FastifyReply, name: string, value: string): void {
  reply.setCookie(name, value, {
    ...baseCookieOptions(),
    maxAge: OAUTH_TEMP_COOKIE_TTL_SECONDS,
  });
}

export function clearOAuthTempCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME.OAUTH_STATE, { path: '/' });
  reply.clearCookie(COOKIE_NAME.OAUTH_CODE_VERIFIER, { path: '/' });
}
