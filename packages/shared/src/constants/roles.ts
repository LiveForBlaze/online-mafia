// Game roles in classic sport mafia (10-player setup).
// Reference: https://en.wikipedia.org/wiki/Mafia_(party_game)

export const ROLE = {
  CIVILIAN: 'civilian',
  SHERIFF: 'sheriff',
  MAFIA: 'mafia',
  DON: 'don',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

// Teams are aggregated from roles. Sheriff plays for the red team; don plays for the black team.
export const TEAM = {
  RED: 'red',
  BLACK: 'black',
} as const;

export type Team = (typeof TEAM)[keyof typeof TEAM];

// Mapping from a role to the team it belongs to.
export const ROLE_TO_TEAM: Record<Role, Team> = {
  [ROLE.CIVILIAN]: TEAM.RED,
  [ROLE.SHERIFF]: TEAM.RED,
  [ROLE.MAFIA]: TEAM.BLACK,
  [ROLE.DON]: TEAM.BLACK,
};

// Roles that know about each other from night zero (the mafia and the don see each other).
export const ROLES_AWARE_OF_TEAM: ReadonlyArray<Role> = [ROLE.MAFIA, ROLE.DON];
