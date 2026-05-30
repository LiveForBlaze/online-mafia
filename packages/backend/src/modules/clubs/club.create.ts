// Clubs module — create / rename / disband.

import { Prisma } from '@prisma/client';
import { MAX_CLUBS_PER_USER, type ClubDetails } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { allocatePublicCode } from '../../lib/public-code.js';
import { logger } from '../../lib/logger.js';

import { CLUB_ERROR } from './club.errors.js';
import { getClubByCode } from './club.queries.js';
import {
  ok,
  fail,
  ClubLimitReachedError,
  userMembershipCount,
  type ServiceResult,
} from './club.service.internal.js';

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
    const club = await prisma.$transaction(
      async (tx) => {
        // Authoritative re-check inside the serializable transaction closes the
        // TOCTOU window between the early guard above and the insert: two
        // concurrent createClub calls can't both slip past a stale count.
        if (
          (await tx.clubMember.count({ where: { userId: creatorUserId } })) >= MAX_CLUBS_PER_USER
        ) {
          throw new ClubLimitReachedError(CLUB_ERROR.MAX_CLUBS_REACHED);
        }
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    logger.info({ clubId: club.id, headId: creatorUserId, name }, 'club created');
    return getClubByCode(club.publicCode, creatorUserId);
  } catch (error) {
    if (error instanceof ClubLimitReachedError) return fail(error.code);
    // Serialization conflict between two concurrent membership writes — the
    // limit was the contended invariant, so report it as reached.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return fail(CLUB_ERROR.MAX_CLUBS_REACHED);
    }
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
