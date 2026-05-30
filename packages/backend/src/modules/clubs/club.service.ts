// Clubs module business logic (barrel).
//
// All Prisma calls live here so routes stay thin. Each public operation returns
// a discriminated Result<T> instead of throwing for known business errors — the
// route layer translates each error code to an HTTP status mechanically. Mirrors
// the lobby module's pattern.
//
// This file used to hold the whole clubs service. It has been split into cohesive
// sibling modules (club.service.internal / club.queries / club.create /
// club.requests / club.membership); this barrel re-exports the public API so
// existing importers keep using './club.service.js'.

export type { ServiceSuccess, ServiceFailure, ServiceResult } from './club.service.internal.js';
export { userMembershipCount } from './club.service.internal.js';

export { listClubs, getClubByCode, type ListClubsInput } from './club.queries.js';

export { createClub, renameClub, disbandClub } from './club.create.js';

export {
  submitJoinRequest,
  cancelJoinRequest,
  approveJoinRequest,
  rejectJoinRequest,
} from './club.requests.js';

export {
  kickMember,
  leaveClub,
  transferLeadership,
  setPrimaryClub,
  handOffOrDisbandHeadClubs,
} from './club.membership.js';
