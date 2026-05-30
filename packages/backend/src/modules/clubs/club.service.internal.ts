// Clubs module — shared internal pieces.
//
// Holds the discriminated Result type, the ok/fail constructors, the
// ClubLimitReachedError used by the membership transactions, and the
// userMembershipCount limit-check helper. These are imported by the cohesive
// club.* sibling modules. club.service.ts re-exports the public API from here.

import { prisma } from '../../db/prisma.client.js';

import type { ClubErrorCode } from './club.errors.js';

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

export const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
export const fail = (error: ClubErrorCode): ServiceFailure => ({ ok: false, error });

// Thrown from inside a membership transaction when the authoritative in-tx
// re-count finds the per-user club limit is already reached. Carries the error
// code so the catch block can translate it back into a ServiceFailure. The
// early (out-of-tx) guard stays for fast UX; this is the race-proof backstop.
export class ClubLimitReachedError extends Error {
  constructor(public readonly code: ClubErrorCode) {
    super(code);
  }
}

// Перепроверка лимита перед каждой операцией которая делает юзера членом
// (createClub, submitJoinRequest превентивно, approveJoinRequest для target).
// Экспортируется потому что Task 6 переиспользует.
export async function userMembershipCount(userId: string): Promise<number> {
  return prisma.clubMember.count({ where: { userId } });
}
