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
import {
  BAN_RESTRICTION,
  deleteAccountInputSchema,
  loginInputSchema,
  registerInputSchema,
  setPrimaryClubInputSchema,
  updateNicknameInputSchema,
  updateProfileInputSchema,
} from '@mafia/shared';

import { env } from '../../config/env.js';

import {
  AUTH_ERROR,
  deleteOwnAccount,
  findOrCreateUserFromGoogle,
  loadAuthenticatedUserBundle,
  loginWithPassword,
  logoutEverywhere,
  registerWithPassword,
  toAuthenticatedUser,
  updateNickname,
  updateProfile,
  type AuthErrorCode,
} from './auth.service.js';
import { CLUB_ERROR } from '../clubs/club.errors.js';
import { setPrimaryClub } from '../clubs/club.service.js';
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
import { revokeLiveKitForUser } from '../game/game.livekit.js';

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
    case AUTH_ERROR.NICKNAME_REJECTED:
    case AUTH_ERROR.AVATAR_LOCKED:
      return HTTP_STATUS.BAD_REQUEST;
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

// @fastify/rate-limit runs its keyGenerator in an `onRequest` hook — BEFORE the
// `authenticate` preHandler that populates request.user, and (because this
// plugin is registered before @fastify/cookie) before request.cookies is parsed.
// So we cannot read request.user / request.cookies here. Instead we re-derive
// the user id straight from the raw session cookie: parse the Cookie header via
// the server's parseCookie decorator, then verify the JWT with the same
// app.jwt.verify the /logout handler uses. Any failure (no cookie, bad/expired
// token) falls back to per-IP keying.
function rateLimitKeyByUser(request: {
  headers: { cookie?: string };
  ip: string;
  server: {
    parseCookie: (header: string) => Record<string, string | undefined>;
    jwt: { verify: <T>(token: string) => T };
  };
}): string {
  const header = request.headers.cookie;
  if (header) {
    try {
      const token = request.server.parseCookie(header)[COOKIE_NAME.SESSION];
      if (token) {
        const payload = request.server.jwt.verify<{ sub?: string }>(token);
        if (payload?.sub) return payload.sub;
      }
    } catch {
      // invalid/expired token — fall through to per-IP keying
    }
  }
  return request.ip;
}

// Tight per-endpoint rate limits override the global 200/min for routes that
// either burn CPU (argon2) or affect account integrity. Pre-auth routes
// (login, register, oauth callback) are keyed by IP via @fastify/rate-limit's
// default keyGenerator. Authenticated routes (deleteAccount, logoutEverywhere)
// are keyed by user.sub (decoded from the session cookie at onRequest time)
// so that two users behind the same NAT don't share a budget.
const AUTH_RATE_LIMITS = {
  // Login: enough for honest fat-finger retries, way too tight for credential
  // stuffing.
  login: { max: 10, timeWindow: '1 minute' },
  // Registration: signup spam vector — keep this low.
  register: { max: 5, timeWindow: '1 minute' },
  // Google callback: legitimate hit pattern is one redirect per login. Allow
  // some retry headroom for OAuth-flow weirdness without becoming a DoS vector.
  googleCallback: { max: 20, timeWindow: '1 minute' },
  // Account deletion: even with a stolen cookie an attacker shouldn't get many
  // shots at the email-retype confirmation. Keyed by user.sub.
  deleteAccount: {
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKeyByUser,
  },
  // Logout-everywhere bumps tokenVersion — a write op. Same shape as delete,
  // 5/min/user.
  logoutEverywhere: {
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKeyByUser,
  },
  // Logout (single device): cheap, but still a state-changing endpoint (clears
  // the cookie, best-effort LiveKit revoke). Per-IP guard against churn.
  logout: { max: 30, timeWindow: '1 minute' },
} as const;

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ---- Registration ----
  app.post(
    '/register',
    { config: { rateLimit: AUTH_RATE_LIMITS.register } },
    async (request, reply) => {
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

      const token = await reply.jwtSign({
        sub: result.user.id,
        nickname: result.user.nickname,
        v: result.user.tokenVersion,
      });
      setSessionCookie(reply, token);
      const bundle = await loadAuthenticatedUserBundle(result.user.id);
      if (!bundle) {
        clearSessionCookie(reply);
        return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ error: 'invalid_session' });
      }
      return reply.code(HTTP_STATUS.CREATED).send({ user: toAuthenticatedUser(bundle) });
    },
  );

  // ---- Login ----
  app.post('/login', { config: { rateLimit: AUTH_RATE_LIMITS.login } }, async (request, reply) => {
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

    const token = await reply.jwtSign({
      sub: result.user.id,
      nickname: result.user.nickname,
      v: result.user.tokenVersion,
    });
    setSessionCookie(reply, token);
    const bundle = await loadAuthenticatedUserBundle(result.user.id);
    if (!bundle) {
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ error: 'invalid_session' });
    }
    return reply.code(HTTP_STATUS.OK).send({ user: toAuthenticatedUser(bundle) });
  });

  // ---- Logout (this device only) ----
  // Чистит cookie текущей вкладки. Другие устройства того же юзера остаются
  // авторизованы — это сознательный UX-выбор: «выйти везде» — отдельный
  // эндпоинт ниже, чтобы случайный logout в одной вкладке не отрубал все
  // активные сессии.
  app.post(
    '/logout',
    { config: { rateLimit: AUTH_RATE_LIMITS.logout } },
    async (request, reply) => {
      // Если есть сессия — попробуем выкинуть пользователя из всех его активных
      // LiveKit-комнат. Без этого старый LK-токен (TTL 30 минут) продолжает
      // работать с украденным cookie до истечения. Best-effort — ошибки игнорим.
      const cookie = request.cookies?.[COOKIE_NAME.SESSION];
      if (cookie) {
        try {
          const payload = app.jwt.verify<{ sub: string }>(cookie);
          if (payload?.sub) void revokeLiveKitForUser(payload.sub);
        } catch {
          // invalid token — нечего отзывать
        }
      }
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  );

  // ---- Logout everywhere (invalidate every active session of this user) ----
  // Бампает tokenVersion → все существующие JWT этого юзера становятся
  // невалидны на handshake. Активные Socket.IO-сокеты отвалятся в течение
  // RECHECK_INTERVAL_MS (5 минут). LK-сессия тоже принудительно отзывается.
  // Cookie этой вкладки тоже очищаем — пользователь сам инициировал глобальный
  // logout и должен быть выкинут немедленно.
  app.post(
    '/logout/everywhere',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: AUTH_RATE_LIMITS.logoutEverywhere },
    },
    async (request, reply) => {
      await logoutEverywhere(request.user.sub);
      void revokeLiveKitForUser(request.user.sub);
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  );

  // ---- Current user ----
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const bundle = await loadAuthenticatedUserBundle(request.user.sub);
    if (!bundle) {
      // Token references a user that no longer exists — treat as unauthenticated.
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.UNAUTHORIZED).send({ error: 'invalid_session' });
    }
    return reply.send({ user: toAuthenticatedUser(bundle) });
  });

  // ---- Change nickname ----
  app.patch(
    '/me/nickname',
    {
      preHandler: [app.authenticate, app.requireRestrictionNotSet(BAN_RESTRICTION.EDIT_PROFILE)],
    },
    async (request, reply) => {
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
      const bundle = await loadAuthenticatedUserBundle(result.user.id);
      return reply.send({
        user: toAuthenticatedUser(
          bundle ?? {
            user: result.user,
            memberships: [],
            pendingClubCodes: [],
            primaryClub: null,
          },
        ),
      });
    },
  );

  // ---- Update public profile (real name, country, club) ----
  app.patch(
    '/me/profile',
    {
      preHandler: [app.authenticate, app.requireRestrictionNotSet(BAN_RESTRICTION.EDIT_PROFILE)],
    },
    async (request, reply) => {
      const parsed = updateProfileInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }

      const result = await updateProfile(request.user.sub, parsed.data);
      if (!result.ok) {
        return reply.code(authErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      const bundle = await loadAuthenticatedUserBundle(result.user.id);
      return reply.send({
        user: toAuthenticatedUser(
          bundle ?? {
            user: result.user,
            memberships: [],
            pendingClubCodes: [],
            primaryClub: null,
          },
        ),
      });
    },
  );

  // ---- Set primary club ----
  // PATCH /auth/me/primary-club { clubId: string | null }
  //   - clubId === null → clear the explicit override (fallback to newest membership)
  //   - clubId UUID → must be an active membership
  app.patch('/me/primary-club', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = setPrimaryClubInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }
    const result = await setPrimaryClub(request.user.sub, parsed.data.clubId);
    if (!result.ok) {
      const status =
        result.error === CLUB_ERROR.NOT_MEMBER ? HTTP_STATUS.CONFLICT : HTTP_STATUS.BAD_REQUEST;
      return reply.code(status).send({ error: result.error });
    }
    return reply.send(result.data);
  });

  // ---- Delete own account ----
  // Body must contain { confirmEmail }: the user retypes their email to
  // confirm. The server validates the match. Account is anonymised, not
  // hard-deleted, because game history references it.
  app.delete(
    '/me',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: AUTH_RATE_LIMITS.deleteAccount },
    },
    async (request, reply) => {
      const parsed = deleteAccountInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await deleteOwnAccount(
        request.user.sub,
        parsed.data.confirmEmail,
        parsed.data.password,
      );
      if (!result.ok) {
        return reply.code(authErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      // tokenVersion уже бампнут — сокеты и REST отвалятся в течение 5 минут
      // (RECHECK_INTERVAL_MS), но LK-токен живёт своим bearer'ом до TTL.
      // Принудительно выкидываем из любых активных LK-комнат сейчас.
      void revokeLiveKitForUser(request.user.sub);
      clearSessionCookie(reply);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  );

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
  app.get(
    '/google/callback',
    { config: { rateLimit: AUTH_RATE_LIMITS.googleCallback } },
    async (request, reply) => {
      if (!isGoogleOAuthConfigured()) {
        return reply
          .code(HTTP_STATUS.NOT_IMPLEMENTED)
          .send({ error: 'google_oauth_not_configured' });
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
          v: result.user.tokenVersion,
        });
        clearOAuthTempCookies(reply);
        setSessionCookie(reply, token);

        return reply.redirect(env.FRONTEND_URL);
      } catch (error) {
        // Log only name + message, never the raw error object: arctic's token
        // responses can ride along inside a thrown error and would otherwise
        // leak the access/id token into logs.
        request.log.error(
          {
            err: {
              name: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error ? error.message : 'unknown error',
            },
          },
          'Google OAuth callback failed',
        );
        clearOAuthTempCookies(reply);
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }
    },
  );
};
