// Single source of truth for team-coloured badge tones inside the game feature.
//
// Several in-game surfaces (GameOverReview role chips, PhaseHeader role badge,
// SeatVideoTile role label) render the same "is this seat red or black team?"
// badge with the same colour logic. Previously each duplicated the
// `isBlack ? black-tone : red-tone` className inline, with slightly different
// opacities and a team-red text token that failed contrast. This helper
// centralises it so the tones stay consistent and accessible.
//
// Contrast: black-team badge uses `text-fg` on a dark surface; red-team badge
// uses `text-danger-text` (the lighter red text token, ~5.9:1 on card) instead
// of the dimmer `text-team-red` (4.47:1) so it passes WCAG AA while keeping the
// red team identity.

import { ROLE_TO_TEAM, TEAM, type Role } from '@mafia/shared';

/** Tailwind classes for a team-coloured badge (background + text). */
export function teamBadgeTone(isBlack: boolean): string {
  return isBlack ? 'bg-team-black/40 text-fg' : 'bg-team-red/20 text-danger-text';
}

/** Resolve a role to its team-badge tone classes. Null role → neutral red tone. */
export function roleBadgeTone(role: Role | null): string {
  const isBlack = !!role && ROLE_TO_TEAM[role] === TEAM.BLACK;
  return teamBadgeTone(isBlack);
}
