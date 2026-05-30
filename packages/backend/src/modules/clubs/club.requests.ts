// Clubs module — join-request flow: submit / cancel / approve / reject.

import { Prisma } from '@prisma/client';
import { MAX_CLUBS_PER_USER, type ClubDetails } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import { CLUB_ERROR } from './club.errors.js';
import { getClubByCode } from './club.queries.js';
import {
  ok,
  fail,
  ClubLimitReachedError,
  userMembershipCount,
  type ServiceResult,
} from './club.service.internal.js';

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
    await prisma.$transaction(
      async (tx) => {
        // Authoritative re-check inside the serializable transaction: two heads
        // approving the same user into different clubs at once can't both pass a
        // stale count and push the user past MAX_CLUBS_PER_USER.
        if (
          (await tx.clubMember.count({ where: { userId: targetUserId } })) >= MAX_CLUBS_PER_USER
        ) {
          throw new ClubLimitReachedError(CLUB_ERROR.TARGET_MAX_CLUBS_REACHED);
        }
        // Will throw P2025 if no row — we surface as NOT_PENDING.
        await tx.clubJoinRequest.delete({
          where: { clubId_userId: { clubId: club.id, userId: targetUserId } },
        });
        await tx.clubMember.create({
          data: { clubId: club.id, userId: targetUserId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof ClubLimitReachedError) return fail(error.code);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Serialization conflict — the contended invariant here is the target's
      // club limit, so report it as reached.
      if (error.code === 'P2034') return fail(CLUB_ERROR.TARGET_MAX_CLUBS_REACHED);
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
