// Convert raw Prisma rows into wire-format ClubSummary / ClubDetails.
//
// Computing viewerStatus is the part most likely to surprise — we resolve
// it in one pass over the included data instead of issuing extra queries.

import type {
  Club,
  ClubJoinRequest as ClubJoinRequestRow,
  ClubMember as ClubMemberRow,
  User,
} from '@prisma/client';
import type { ClubDetails, ClubSummary } from '@mafia/shared';

type ViewerStatus = 'none' | 'pending' | 'member' | 'head';

interface ClubWithCounts extends Club {
  head: Pick<User, 'id' | 'nickname'>;
  _count: { members: number };
  members?: { userId: string }[];
  joinRequests?: { userId: string }[];
}

export function resolveViewerStatus(
  viewerUserId: string,
  headId: string,
  memberIds: Set<string>,
  pendingIds: Set<string>,
): ViewerStatus {
  if (headId === viewerUserId) return 'head';
  if (memberIds.has(viewerUserId)) return 'member';
  if (pendingIds.has(viewerUserId)) return 'pending';
  return 'none';
}

export function toClubSummary(row: ClubWithCounts, viewerUserId: string): ClubSummary {
  const memberIds = new Set((row.members ?? []).map((m) => m.userId));
  const pendingIds = new Set((row.joinRequests ?? []).map((r) => r.userId));
  return {
    id: row.id,
    publicCode: row.publicCode,
    name: row.name,
    memberCount: row._count.members,
    headNickname: row.head.nickname,
    viewerStatus: resolveViewerStatus(viewerUserId, row.headId, memberIds, pendingIds),
  };
}

interface ClubWithFullDetails extends Club {
  members: (ClubMemberRow & {
    user: Pick<User, 'id' | 'nickname' | 'publicCode' | 'avatarUrl'>;
  })[];
  joinRequests: (ClubJoinRequestRow & {
    user: Pick<User, 'id' | 'nickname' | 'publicCode' | 'avatarUrl'>;
  })[];
}

export function toClubDetails(row: ClubWithFullDetails, viewerUserId: string): ClubDetails {
  const memberIds = new Set(row.members.map((m) => m.userId));
  const pendingIds = new Set(row.joinRequests.map((r) => r.userId));
  const viewerStatus = resolveViewerStatus(viewerUserId, row.headId, memberIds, pendingIds);
  const isHead = viewerStatus === 'head';
  return {
    id: row.id,
    publicCode: row.publicCode,
    name: row.name,
    headId: row.headId,
    createdAt: row.createdAt.toISOString(),
    members: row.members.map((m) => ({
      userId: m.userId,
      nickname: m.user.nickname,
      publicCode: m.user.publicCode,
      avatarUrl: m.user.avatarUrl ?? null,
      joinedAt: m.joinedAt.toISOString(),
      isHead: m.userId === row.headId,
    })),
    // Hide pending requests from non-heads — they're private to the head.
    joinRequests: isHead
      ? row.joinRequests.map((r) => ({
          userId: r.userId,
          nickname: r.user.nickname,
          publicCode: r.user.publicCode,
          avatarUrl: r.user.avatarUrl ?? null,
          requestedAt: r.requestedAt.toISOString(),
        }))
      : [],
    viewerStatus,
  };
}
