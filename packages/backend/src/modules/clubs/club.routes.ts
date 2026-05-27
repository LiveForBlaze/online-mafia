// HTTP routes of the clubs module.
//
// All routes require an authenticated session. Mutating routes additionally
// require the EDIT_PROFILE restriction not to be set — clubs are part of the
// public profile so a banned-from-profile user can't manipulate them.

import type { FastifyPluginAsync } from 'fastify';
import {
  BAN_RESTRICTION,
  approveJoinInputSchema,
  createClubInputSchema,
  renameClubInputSchema,
  transferLeadershipInputSchema,
} from '@mafia/shared';

import { CLUB_ERROR, type ClubErrorCode } from './club.errors.js';
import {
  approveJoinRequest,
  cancelJoinRequest,
  createClub,
  disbandClub,
  getClubByCode,
  kickMember,
  leaveClub,
  listClubs,
  rejectJoinRequest,
  renameClub,
  submitJoinRequest,
  transferLeadership,
} from './club.service.js';

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

function clubErrorToHttpStatus(code: ClubErrorCode): number {
  switch (code) {
    case CLUB_ERROR.NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case CLUB_ERROR.NAME_REJECTED:
      return HTTP_STATUS.BAD_REQUEST;
    case CLUB_ERROR.NOT_HEAD:
    case CLUB_ERROR.NOT_MEMBER:
      return HTTP_STATUS.FORBIDDEN;
    case CLUB_ERROR.NAME_TAKEN:
    case CLUB_ERROR.NOT_PENDING:
    case CLUB_ERROR.ALREADY_MEMBER:
    case CLUB_ERROR.ALREADY_PENDING:
    case CLUB_ERROR.TARGET_NOT_MEMBER:
    case CLUB_ERROR.CANNOT_KICK_HEAD:
    case CLUB_ERROR.MAX_CLUBS_REACHED:
    case CLUB_ERROR.TARGET_MAX_CLUBS_REACHED:
      return HTTP_STATUS.CONFLICT;
  }
}

// Anti-spam rate limits.
const CLUB_CREATE_LIMIT = {
  max: 5,
  timeWindow: '1 day',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;
const CLUB_JOIN_LIMIT = {
  max: 30,
  timeWindow: '1 day',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;

export const clubRoutes: FastifyPluginAsync = async (app) => {
  const editProfileGate = app.requireRestrictionNotSet(BAN_RESTRICTION.EDIT_PROFILE);

  // ---- List ----
  app.get<{ Querystring: { search?: string; offset?: string; limit?: string } }>(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const result = await listClubs({
        viewerUserId: request.user.sub,
        search: request.query.search,
        offset: Number.isFinite(offset) ? offset : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return reply.send(result);
    },
  );

  // ---- Detail by publicCode ----
  app.get<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await getClubByCode(request.params.code, request.user.sub);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );

  // ---- Create ----
  app.post(
    '/',
    {
      preHandler: [app.authenticate, editProfileGate],
      config: { rateLimit: CLUB_CREATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = createClubInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await createClub(request.user.sub, parsed.data.name);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.code(HTTP_STATUS.CREATED).send({ club: result.data });
    },
  );

  // ---- Rename (head only) ----
  app.patch<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [app.authenticate, editProfileGate] },
    async (request, reply) => {
      const parsed = renameClubInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await renameClub(request.params.code, request.user.sub, parsed.data.name);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );

  // ---- Disband (head only) ----
  app.delete<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [app.authenticate, editProfileGate] },
    async (request, reply) => {
      const result = await disbandClub(request.params.code, request.user.sub);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Submit join request ----
  app.post<{ Params: { code: string } }>(
    '/:code/join',
    {
      preHandler: [app.authenticate, editProfileGate],
      config: { rateLimit: CLUB_JOIN_LIMIT },
    },
    async (request, reply) => {
      const result = await submitJoinRequest(request.params.code, request.user.sub);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Cancel my own pending request ----
  app.post<{ Params: { code: string } }>(
    '/:code/cancel-request',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await cancelJoinRequest(request.params.code, request.user.sub);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Head approves a pending request ----
  app.post<{ Params: { code: string } }>(
    '/:code/approve',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = approveJoinInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await approveJoinRequest(
        request.params.code,
        request.user.sub,
        parsed.data.userId,
      );
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );

  // ---- Head rejects a pending request ----
  app.post<{ Params: { code: string } }>(
    '/:code/reject',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = approveJoinInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await rejectJoinRequest(
        request.params.code,
        request.user.sub,
        parsed.data.userId,
      );
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );

  // ---- Leave ----
  app.post<{ Params: { code: string } }>(
    '/:code/leave',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await leaveClub(request.params.code, request.user.sub);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Transfer leadership ----
  app.post<{ Params: { code: string } }>(
    '/:code/transfer',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = transferLeadershipInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await transferLeadership(
        request.params.code,
        request.user.sub,
        parsed.data.newHeadId,
      );
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );

  // ---- Kick member ----
  app.delete<{ Params: { code: string; userId: string } }>(
    '/:code/members/:userId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await kickMember(request.params.code, request.user.sub, request.params.userId);
      if (!result.ok) {
        return reply.code(clubErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ club: result.data });
    },
  );
};
