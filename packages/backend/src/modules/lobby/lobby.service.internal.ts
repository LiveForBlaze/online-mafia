// Lobby module — shared internal pieces.
//
// The lobby service was split into cohesive sibling modules (lobby.create /
// lobby.queries / lobby.membership / lobby.room / lobby.lifecycle). This module
// holds the discriminated Result type plus the ok/fail constructors and the
// Prisma error-classification helpers that several of those modules need, so
// they aren't duplicated. lobby.service.ts re-exports the public API from here.

import { Prisma } from '@prisma/client';

import type { LobbyErrorCode } from './lobby.errors.js';

// ---- Result types ----

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
}
export interface ServiceFailure {
  ok: false;
  error: LobbyErrorCode;
}
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
export const fail = (error: LobbyErrorCode): ServiceFailure => ({ ok: false, error });

export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isSerializationFailure(error: unknown): boolean {
  // Postgres SQLSTATE 40001 — serialization failure detected by the database.
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || (error.meta as { code?: string } | undefined)?.code === '40001')
  );
}
