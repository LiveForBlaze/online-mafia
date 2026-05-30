// Clubs module — listing and details (read operations).

import { Prisma } from '@prisma/client';
import { type ClubDetails, type ClubSummary } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import { CLUB_ERROR } from './club.errors.js';
import { toClubDetails, toClubSummary } from './club.mappers.js';
import { ok, fail, type ServiceResult } from './club.service.internal.js';

const DEFAULT_PAGE_SIZE = 50;

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
