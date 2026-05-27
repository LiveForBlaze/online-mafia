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

// ---- Join request submission ----

export async function submitJoinRequest(
  code: string,
  userId: string,
): Promise<ServiceResult<{ pending: true }>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);

  // Превентивная проверка лимита — чтобы юзер не плодил бесполезные заявки.
  // approveJoinRequest всё равно перепроверит, чтобы закрыть race-window.
  if ((await userMembershipCount(userId)) >= MAX_CLUBS_PER_USER) {
    return fail(CLUB_ERROR.MAX_CLUBS_REACHED);
  }

  // Reject if already a member or already pending.
  const existingMember = await prisma.clubMember.findUnique({
    where: { clubId_userId: { clubId: club.id, userId } },
    select: { userId: true },
  });
  if (existingMember) return fail(CLUB_ERROR.ALREADY_MEMBER);

  try {
    await prisma.clubJoinRequest.create({
      data: { clubId: club.id, userId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return fail(CLUB_ERROR.ALREADY_PENDING);
    }
    throw error;
  }
  return ok({ pending: true });
}

// ---- Cancel my own pending request ----

export async function cancelJoinRequest(
  code: string,
  userId: string,
): Promise<ServiceResult<{ cancelled: true }>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);

  try {
    await prisma.clubJoinRequest.delete({
      where: { clubId_userId: { clubId: club.id, userId } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail(CLUB_ERROR.NOT_PENDING);
    }
    throw error;
  }
  return ok({ cancelled: true });
}

// ---- Head approves a pending request ----

export async function approveJoinRequest(
  code: string,
  actorUserId: string,
  targetUserId: string,
): Promise<ServiceResult<ClubDetails>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true, headId: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);

  // Перепроверка лимита для target. Между submit и approve target мог
  // одобриться в другие клубы и дойти до MAX_CLUBS_PER_USER. Отдаём
  // специальный код чтобы head понимал что approve бесполезен.
  if ((await userMembershipCount(targetUserId)) >= MAX_CLUBS_PER_USER) {
    return fail(CLUB_ERROR.TARGET_MAX_CLUBS_REACHED);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Will throw P2025 if no row — we surface as NOT_PENDING.
      await tx.clubJoinRequest.delete({
        where: { clubId_userId: { clubId: club.id, userId: targetUserId } },
      });
      await tx.clubMember.create({
        data: { clubId: club.id, userId: targetUserId },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return fail(CLUB_ERROR.NOT_PENDING);
      // ALREADY_MEMBER unlikely (we removed Request which preceded Member),
      // but guard anyway in case of race with a manual DB insert.
      if (error.code === 'P2002') return fail(CLUB_ERROR.ALREADY_MEMBER);
    }
    throw error;
  }
  return getClubByCode(code, actorUserId);
}

// ---- Head rejects a pending request ----

export async function rejectJoinRequest(
  code: string,
  actorUserId: string,
  targetUserId: string,
): Promise<ServiceResult<ClubDetails>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true, headId: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);

  try {
    await prisma.clubJoinRequest.delete({
      where: { clubId_userId: { clubId: club.id, userId: targetUserId } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail(CLUB_ERROR.NOT_PENDING);
    }
    throw error;
  }
  return getClubByCode(code, actorUserId);
}

// ---- Head kicks a member ----

export async function kickMember(
  code: string,
  actorUserId: string,
  targetUserId: string,
): Promise<ServiceResult<ClubDetails>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: { id: true, headId: true },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);
  if (targetUserId === club.headId) return fail(CLUB_ERROR.CANNOT_KICK_HEAD);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.clubMember.delete({
        where: { clubId_userId: { clubId: club.id, userId: targetUserId } },
      });
      // If kicked user had this club as primary, clear it.
      await tx.user.updateMany({
        where: { id: targetUserId, primaryClubId: club.id },
        data: { primaryClubId: null },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail(CLUB_ERROR.TARGET_NOT_MEMBER);
    }
    throw error;
  }
  return getClubByCode(code, actorUserId);
}

// ---- Leave a club ----
//
// Logic:
//   - Member (not head) leaves: simple DELETE ClubMember + clear primaryClubId if needed.
//   - Head leaves with other active members: auto-transfer leadership to oldest
//     member (by joinedAt) in a transaction, then DELETE leaver's row.
//   - Head leaves alone: cascade-delete the club entirely.

export async function leaveClub(
  code: string,
  userId: string,
): Promise<ServiceResult<{ left: true; disbanded: boolean; newHeadId: string | null }>> {
  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: {
      id: true,
      headId: true,
      members: { select: { userId: true, joinedAt: true }, orderBy: { joinedAt: 'asc' } },
    },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  const isMember = club.members.some((m) => m.userId === userId);
  if (!isMember) return fail(CLUB_ERROR.NOT_MEMBER);

  const isHead = club.headId === userId;
  // Oldest member that isn't the leaver — successor if head leaves.
  const successor = club.members.find((m) => m.userId !== userId);

  if (isHead && !successor) {
    // Lone head — delete the whole club. Cascade removes member + request rows.
    await prisma.club.delete({ where: { id: club.id } });
    logger.info({ clubId: club.id, userId }, 'club deleted (lone head left)');
    return ok({ left: true, disbanded: true, newHeadId: null });
  }

  await prisma.$transaction(async (tx) => {
    if (isHead && successor) {
      await tx.club.update({
        where: { id: club.id },
        data: { headId: successor.userId },
      });
    }
    await tx.clubMember.delete({
      where: { clubId_userId: { clubId: club.id, userId } },
    });
    await tx.user.updateMany({
      where: { id: userId, primaryClubId: club.id },
      data: { primaryClubId: null },
    });
  });

  if (isHead && successor) {
    logger.info(
      { clubId: club.id, oldHeadId: userId, newHeadId: successor.userId },
      'club leadership auto-transferred (head left)',
    );
  }
  return ok({
    left: true,
    disbanded: false,
    newHeadId: isHead && successor ? successor.userId : null,
  });
}

// ---- Head transfers leadership explicitly ----

export async function transferLeadership(
  code: string,
  actorUserId: string,
  newHeadId: string,
): Promise<ServiceResult<ClubDetails>> {
  if (newHeadId === actorUserId) return fail(CLUB_ERROR.TARGET_NOT_MEMBER);

  const club = await prisma.club.findUnique({
    where: { publicCode: code.toUpperCase() },
    select: {
      id: true,
      headId: true,
      members: { select: { userId: true } },
    },
  });
  if (!club) return fail(CLUB_ERROR.NOT_FOUND);
  if (club.headId !== actorUserId) return fail(CLUB_ERROR.NOT_HEAD);

  const targetIsMember = club.members.some((m) => m.userId === newHeadId);
  if (!targetIsMember) return fail(CLUB_ERROR.TARGET_NOT_MEMBER);

  await prisma.club.update({
    where: { id: club.id },
    data: { headId: newHeadId },
  });
  logger.info(
    { clubId: club.id, oldHeadId: actorUserId, newHeadId },
    'club leadership transferred',
  );
  return getClubByCode(code, actorUserId);
}

// ---- Set primary club (called by auth/me/primary-club PATCH) ----
//
// clubId === null → clear. Non-null → must be an active membership.

export async function setPrimaryClub(
  userId: string,
  clubId: string | null,
): Promise<ServiceResult<{ primaryClubId: string | null }>> {
  if (clubId !== null) {
    const member = await prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
      select: { userId: true },
    });
    if (!member) return fail(CLUB_ERROR.NOT_MEMBER);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { primaryClubId: clubId },
  });
  return ok({ primaryClubId: clubId });
}

// ---- Helper for account deletion ----
//
// Used by deleteOwnAccount and deleteUserAsAdmin: hand off the user's
// head-clubs to successors (or delete if alone) before the user row
// can be removed. Returns the list of clubs that were either transferred
// or fully disbanded.
export async function handOffOrDisbandHeadClubs(
  userId: string,
): Promise<{ transferred: string[]; disbanded: string[] }> {
  const headedClubs = await prisma.club.findMany({
    where: { headId: userId },
    select: {
      id: true,
      members: {
        select: { userId: true, joinedAt: true },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
  const transferred: string[] = [];
  const disbanded: string[] = [];
  for (const club of headedClubs) {
    const successor = club.members.find((m) => m.userId !== userId);
    if (successor) {
      await prisma.club.update({
        where: { id: club.id },
        data: { headId: successor.userId },
      });
      transferred.push(club.id);
    } else {
      // Cascade removes member rows. After this, the leaving User's
      // ClubMember row in this club is gone too, so the cascade on
      // user-delete won't be blocked by RESTRICT.
      await prisma.club.delete({ where: { id: club.id } });
      disbanded.push(club.id);
    }
  }
  if (transferred.length > 0 || disbanded.length > 0) {
    logger.info(
      { userId, transferred, disbanded },
      'handed off / disbanded head-clubs for user deletion',
    );
  }
  return { transferred, disbanded };
}
