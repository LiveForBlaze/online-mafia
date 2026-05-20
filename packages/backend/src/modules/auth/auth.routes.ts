// HTTP routes of the auth module.
//
// Routes are intentionally thin — they validate input, call the service layer,
// translate results to HTTP responses, and manage cookies.
//
// Endpoints:
//   POST /register          email + password registration
//   POST /login             email + password login
//   POST /logout            clear session cookie
//   GET  /me                current user (requires session)
//   GET  /google            start Google OAuth flow
//   GET  /google/callback   complete Google OAuth flow

import type { FastifyPluginAsync } from 'fastify';
import { loginInputSchema, registerInputSchema, updateNicknameInputSchema } from '@mafia/shared';

import { env } from '../../config/env.js';

import {
  AUTH_ERROR,
  findOrCreateUserFromGoogle,
  getUserById,
  loginWithPassword,
  registerWithPassword,
  toAuthenticatedUser,
  updateNickname,
  type AuthErrorCode,
} from './auth.service.js';
import {
  COOKIE_NAME,
  clearOAuthTempCookies,
  clearSessionCookie,
  setOAuthTempCookie,
  setSessionCookie,
} from './auth.cookies.js';
import {
  GOOGLE_SCOPES,
  createGoogleClient,
  fetchGoogleUserInfo,
  generateCodeVerifier,
  generateState,
  isGoogleOAuthConfigured,
} from './google.js';

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  NOT_IMPLEMENTED: 501,
} as const;

function authErrorToHttpStatus(code: AuthErrorCode): number {
  switch (code) {
    case AUTH_ERROR.EMAIL_TAKEN:
    case AUTH_ERROR.NICKNAME_TAKEN:
      return HTTP_STATUS.CONFLICT;
    case AUTH_ERROR.INVALID_CREDENTIALS:
    case AUTH_ERROR.PASSWORD_NOT_SET:
    case AUTH_ERROR.OAUTH_LINK_REFUSED:
    case AUTH_ERROR.OAUTH_EMAIL_NOT_VERIFIED:
      return HTTP_STATUS.UNAUTHORIZED;
    default: {
      // Exhaustiveness check — new error codes must be added above.
      const _exhaustive: never = code;
      void _exhaustive;
      return HTTP_STATUS.UNAUTHORIZED;
    }
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ---- Registration ----
  app.post('/register', async (request, reply) => {
    const parsed = registerInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }

    const result = await registerWithPassword(parsed.data);
    if (!result.ok) {
      return reply.code(authErrorToHttpStatus(result.error)).send({ error: result.error });
    }

    const token = await reply.jwtSign({ sub: result.user.id, nickname: result.user.nickname });
    setSessionCookie(reply, token);
    return reply.code(HTTP_STATUS.CREATED).send({ user: toAuthenticatedUser(result.user) });
  });

  // ---- Login ----
  app.post('/login', async (request, reply) => {
    const parsed = loginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }

    const result = await loginWithPassword(parsed.data);
    if (!result.ok) {
      return reply.code(authErrorToHttpStatus(result.error)).send({ error: result.error });
    }

    const token = await reply.jwtSign({ sub: result.user.id, nickname: result.user.nickname });
    setSessionCookie(reply, token);
    return reply.code(HTTP_STATUS.OK).send({ user: toAuthenticatedUser(result.user) });
  });

  // ---- Logout ----
  app.post('/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.code(HTTP_STATUS.NO_CONTENT).send();
  });

  // ---- Current user ----
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getUserById(request.user.sub);
    if (!user) {
      // Token references a user that no longer exists — treat as unauthenticated.
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ error: 'invalid_session' });
    }
    return reply.send({ user: toAuthenticatedUser(user) });
  });

  // ---- Change nickname ----
  app.patch('/me/nickname', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateNicknameInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }

    const result = await updateNickname(request.user.sub, parsed.data.nickname);
    if (!result.ok) {
      return reply.code(authErrorToHttpStatus(result.error)).send({ error: result.error });
    }
    return reply.send({ user: toAuthenticatedUser(result.user) });
  });

  // ---- Google OAuth: start ----
  app.get('/google', async (_request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      return reply.code(HTTP_STATUS.NOT_IMPLEMENTED).send({ error: 'google_oauth_not_configured' });
    }

    const google = createGoogleClient();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    setOAuthTempCookie(reply, COOKIE_NAME.OAUTH_STATE, state);
    setOAuthTempCookie(reply, COOKIE_NAME.OAUTH_CODE_VERIFIER, codeVerifier);

    const url = google.createAuthorizationURL(state, codeVerifier, [...GOOGLE_SCOPES]);
    return reply.redirect(url.toString());
  });

  // ---- Google OAuth: callback ----
  app.get('/google/callback', async (request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      return reply.code(HTTP_STATUS.NOT_IMPLEMENTED).send({ error: 'google_oauth_not_configured' });
    }

    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error) {
      clearOAuthTempCookies(reply);
      return reply.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(query.error)}`);
    }

    const expectedState = request.cookies[COOKIE_NAME.OAUTH_STATE];
    const codeVerifier = request.cookies[COOKIE_NAME.OAUTH_CODE_VERIFIER];

    if (!query.code || !query.state || !expectedState || !codeVerifier) {
      clearOAuthTempCookies(reply);
      return reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: 'oauth_missing_parameters' });
    }
    if (query.state !== expectedState) {
      clearOAuthTempCookies(reply);
      return reply.code(HTTP_STATUS.BAD_REQUEST).send({ error: 'oauth_state_mismatch' });
    }

    try {
      const google = createGoogleClient();
      const tokens = await google.validateAuthorizationCode(query.code, codeVerifier);
      const profile = await fetchGoogleUserInfo(tokens.accessToken());

      const result = await findOrCreateUserFromGoogle(profile);
      if (!result.ok) {
        clearOAuthTempCookies(reply);
        // Redirect back to /login with a typed error code so the UI can render
        // a helpful message ("This email is already registered with a password —
        // please log in with the password, verify your email, then link Google").
        return reply.redirect(
          `${env.FRONTEND_URL}/login?error=${encodeURIComponent(result.error)}`,
        );
      }

      const token = await reply.jwtSign({
        sub: result.user.id,
        nickname: result.user.nickname,
      });
      clearOAuthTempCookies(reply);
      setSessionCookie(reply, token);

      return reply.redirect(env.FRONTEND_URL);
    } catch (error) {
      request.log.error({ error }, 'Google OAuth callback failed');
      clearOAuthTempCookies(reply);
      return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  });
};
