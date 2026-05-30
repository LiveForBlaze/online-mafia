// Clubs module — membership operations: kick, leave (with head auto-transfer),
// explicit leadership transfer, set-primary, and the account-deletion handoff.

import { type ClubDetails } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../lib/logger.js';

import { CLUB_ERROR } from './club.errors.js';
import { getClubByCode } from './club.queries.js';
import { Prisma } from '@prisma/client';
import { ok, fail, type ServiceResult } from './club.service.internal.js';

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
