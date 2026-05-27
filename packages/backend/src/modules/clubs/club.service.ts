// Clubs module business logic. All Prisma calls live here so routes stay thin.
// Each public operation returns a discriminated Result<T> instead of throwing
// for known business errors — the route layer translates each error code to
// an HTTP status mechanically. Mirrors the lobby module's pattern.

import { Prisma } from '@prisma/client';
import { MAX_CLUBS_PER_USER, type ClubDetails, type ClubSummary } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { allocatePublicCode } from '../../lib/public-code.js';
import { logger } from '../../lib/logger.js';

import { CLUB_ERROR, type ClubErrorCode } from './club.errors.js';
import { toClubDetails, toClubSummary } from './club.mappers.js';

// ---- Result types ----

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
}
export interface ServiceFailure {
  ok: false;
  error: ClubErrorCode;
}
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
const fail = (error: ClubErrorCode): ServiceFailure => ({ ok: false, error });

const DEFAULT_PAGE_SIZE = 50;

// Перепроверка лимита перед каждой операцией которая делает юзера членом
// (createClub, submitJoinRequest превентивно, approveJoinRequest для target).
// Экспортируется потому что Task 6 переиспользует.
export async function userMembershipCount(userId: string): Promise<number> {
  return prisma.clubMember.count({ where: { userId } });
}

// ---- Listing ----

export interface ListClubsInput {
  viewerUserId: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export async function listClubs(
  input: ListClubsInput,
): Promise<{ clubs: ClubSummary[]; total: number }> {
  const where: Prisma.ClubWhereInput = {};
  if (input.search?.trim()) {
    where.name = { contains: input.search.trim(), mode: 'insensitive' };
  }
  const take = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), 200);
  const skip = Math.max(input.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    prisma.club.findMany({
      where,
      include: {
        head: { select: { id: true, nickname: true } },
        _count: { select: { members: true } },
        // Viewer-only filter: include ONLY the viewer's membership/pending row
        // so the mapper can resolve viewerStatus without loading the full roster.
        members: { where: { userId: input.viewerUserId }, select: { userId: true } },
        joinRequests: { where: { userId: input.viewerUserId }, select: { userId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.club.count({ where }),
  ]);

  return {
    clubs: rows.map((r) => toClubSummary(r, input.viewerUserId)),
    total,
  };
}

// ---- Details ----

export async function getClubByCode(
  code: string,
  viewerUserId: string,
): Promise<ServiceResult<ClubDetails>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    include: {
      members: {
        include: {
          user: { select: { id: true, nickname: true, publicCode: true, avatarUrl: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
      joinRequests: {
        include: {
          user: { select: { id: true, nickname: true, publicCode: true, avatarUrl: true } },
        },
        orderBy: { requestedAt: 'asc' },
      },
    },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  return ok(toClubDetails(club, viewerUserId));
}

// ---- Create ----

export async function createClub(
  creatorUserId: string,
  name: string,
): Promise<ServiceResult<ClubDetails>> {
  // Гард на лимит клубов. Создатель сразу становится member нового, так что
  // если у него уже MAX_CLUBS_PER_USER — отказ.
  if ((await userMembershipCount(creatorUserId)) >= MAX_CLUBS_PER_USER) {
    return fail(CLUB_ERROR.MAX_CLUBS_REACHED);
  }

  // AI-moderate same way as lobby/nickname.
  const verdict = await moderateName(name, 'club');
  if (!verdict.allowed) return fail(CLUB_ERROR.NAME_REJECTED);

  const publicCode = await allocatePublicCode(async (candidate) => {
    const taken = await prisma.club.findUnique({
      where: { publicCode: candidate },
      select: { id: true },
    });
    return Boolean(taken);
  });

  try {
    const club = await prisma.$transaction(async (tx) => {
      const created = await tx.club.create({
        data: {
          name,
          publicCode,
          headId: creatorUserId,
        },
      });
      await tx.clubMember.create({
        data: { clubId: created.id, userId: creatorUserId },
      });
      return created;
    });
    logger.info({ clubId: club.id, headId: creatorUserId, name }, 'club created');
    return getClubByCode(club.publicCode, creatorUserId);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string[] | undefined)?.includes('name')
    ) {
      return fail(CLUB_ERROR.NAME_TAKEN);
    }
    throw error;
  }
}

// ---- Rename ----

export async function renameClub(
  code: string,
  actorUserId: string,
  newName: string,
): Promise<ServiceResult<ClubDetails>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true, headId: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);

  const verdict = await moderateName(newName, 'club');
  if (!verdict.allowed) return fail(CLUB_ERROR.NAME_REJECTED);

  try {
    await prisma.club.update({ where: { id: club.id }, data: { name: newName } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail(CLUB_ERROR.NAME_TAKEN);
    }
    throw error;
  }
  return getClubByCode(code, actorUserId);
}

// ---- Disband (delete) ----

export async function disbandClub(
  code: string,
  actorUserId: string,
): Promise<ServiceResult<{ disbanded: true }>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true, headId: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);

  // Cascade in schema removes members + requests automatically.
  await prisma.club.delete({ where: { id: club.id } });
  logger.info({ clubId: club.id, actorUserId }, 'club disbanded');
  return ok({ disbanded: true });
}
