// Converters between Prisma rows and the public API shapes declared in @mafia/shared.
//
// Keeping these in one place ensures that the same response body comes out of every
// route and that internal-only fields (passwordHash, joinedAt) never leak.

import type { Lobby, LobbyMember, User } from '@prisma/client';
import {
  LOBBY,
  LOBBY_STATUS,
  ROLE,
  type LobbyDetails,
  type LobbyMemberPublic,
  type LobbyStatus,
  type LobbySummary,
  type Role,
} from '@mafia/shared';

const PREASSIGNED_ROLES: ReadonlySet<string> = new Set([
  ROLE.CIVILIAN,
  ROLE.SHERIFF,
  ROLE.MAFIA,
  ROLE.DON,
]);

function parsePreassignedRole(value: string | null): Role | null {
  if (value && PREASSIGNED_ROLES.has(value)) return value as Role;
  return null;
}

type LobbyWithHost = Lobby & {
  host: Pick<User, 'id' | 'nickname' | 'publicCode'>;
  game?: { id: string } | null;
};

type MemberWithUser = LobbyMember & {
  user: Pick<User, 'id' | 'nickname' | 'publicCode' | 'avatarUrl' | 'isBot'>;
};

type LobbyWithMembersAndHost = LobbyWithHost & {
  members: MemberWithUser[];
};

const DB_STATUS_TO_API: Record<string, LobbyStatus> = {
  WAITING: LOBBY_STATUS.WAITING,
  IN_GAME: LOBBY_STATUS.IN_GAME,
  CLOSED: LOBBY_STATUS.CLOSED,
};

export function toLobbySummary(
  lobby: LobbyWithHost,
  memberCount: number,
  isViewerMember: boolean,
): LobbySummary {
  return {
    id: lobby.id,
    name: lobby.name,
    isPrivate: lobby.isPrivate,
    hostId: lobby.hostId,
    hostNickname: lobby.host.nickname,
    hostPublicCode: lobby.host.publicCode,
    rulesetSlug: lobby.rulesetSlug,
    status: DB_STATUS_TO_API[lobby.status] ?? LOBBY_STATUS.WAITING,
    memberCount,
    maxMembers: LOBBY.MAX_MEMBERS,
    createdAt: lobby.createdAt.toISOString(),
    gameId: lobby.game?.id ?? null,
    isViewerMember,
  };
}

export function toLobbyMemberPublic(
  member: MemberWithUser,
  hostId: string,
  viewerIsHost: boolean,
): LobbyMemberPublic {
  return {
    userId: member.user.id,
    nickname: member.user.nickname,
    publicCode: member.user.publicCode,
    avatarUrl: member.user.avatarUrl,
    seat: member.seat,
    isJudge: member.isJudge,
    isHost: member.user.id === hostId,
    isBot: member.user.isBot,
    // Pre-assigned roles are a host-only dev affordance — never leak them to
    // other players (knowing your role before role distribution would break
    // the game).
    preassignedRole: viewerIsHost ? parsePreassignedRole(member.preassignedRole) : null,
  };
}

export function toLobbyDetails(lobby: LobbyWithMembersAndHost, viewerUserId: string): LobbyDetails {
  const isViewerMember = lobby.members.some((m) => m.userId === viewerUserId);
  const viewerIsHost = lobby.hostId === viewerUserId;
  const summary = toLobbySummary(lobby, lobby.members.length, isViewerMember);
  return {
    ...summary,
    members: lobby.members.map((m) => toLobbyMemberPublic(m, lobby.hostId, viewerIsHost)),
  };
}
