// Error codes the club service returns. Routes map each code to an HTTP status.
// Codes mirror @mafia/shared CLUB_ERROR so the wire format stays a single
// source of truth.

import { CLUB_ERROR, type ClubErrorCode } from '@mafia/shared';

export { CLUB_ERROR };
export type { ClubErrorCode };
