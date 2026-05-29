// Business logic of the authentication module.
//
// All Prisma calls and password operations live here, isolated from route handlers.
// Route handlers translate HTTP <-> service calls and have no business logic of their own.
//
// The implementation is split across cohesive sibling modules; this file is a
// barrel that re-exports the public API so existing importers keep working:
//   - auth.projection.ts     — error codes, result types, pure DTO mappers
//   - auth.user.service.ts    — register / login / Google / lookup / logout-everywhere
//   - auth.profile.service.ts — nickname / profile / public lookups / account deletion

export {
  AUTH_ERROR,
  loadAuthenticatedUserBundle,
  toAuthenticatedUser,
  toPublicUserProfile,
  toPublicUserProfileWithClub,
  type AuthErrorCode,
  type AuthFailure,
  type AuthSuccess,
  type AuthResult,
  type AuthenticatedUserBundle,
} from './auth.projection.js';

export {
  findOrCreateUserFromGoogle,
  getUserById,
  loginWithPassword,
  logoutEverywhere,
  registerWithPassword,
} from './auth.user.service.js';

export {
  deleteOwnAccount,
  findUserByPublicCode,
  listPublicUsers,
  updateNickname,
  updateProfile,
  type UserListOptions,
} from './auth.profile.service.js';
