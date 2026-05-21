// Auth API client. Wraps the apiClient with auth-specific endpoints
// and gives each call a typed signature so callers do not deal with raw paths.

import type {
  AuthSessionResponse,
  DeleteAccountInput,
  LoginInput,
  PublicUserProfileResponse,
  RegisterInput,
  UpdateNicknameInput,
  UpdateProfileInput,
} from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const AUTH_PATH = {
  REGISTER: '/api/v1/auth/register',
  LOGIN: '/api/v1/auth/login',
  LOGOUT: '/api/v1/auth/logout',
  ME: '/api/v1/auth/me',
  UPDATE_NICKNAME: '/api/v1/auth/me/nickname',
  UPDATE_PROFILE: '/api/v1/auth/me/profile',
  PUBLIC_USER: (code: string) => `/api/v1/users/${encodeURIComponent(code)}`,
  GOOGLE_START: '/api/v1/auth/google',
} as const;

export const authApi = {
  register: (input: RegisterInput) =>
    apiClient.post<AuthSessionResponse>(AUTH_PATH.REGISTER, input),
  login: (input: LoginInput) => apiClient.post<AuthSessionResponse>(AUTH_PATH.LOGIN, input),
  logout: () => apiClient.post<void>(AUTH_PATH.LOGOUT),
  getCurrentUser: () => apiClient.get<AuthSessionResponse>(AUTH_PATH.ME),
  updateNickname: (input: UpdateNicknameInput) =>
    apiClient.patch<AuthSessionResponse>(AUTH_PATH.UPDATE_NICKNAME, input),
  updateProfile: (input: UpdateProfileInput) =>
    apiClient.patch<AuthSessionResponse>(AUTH_PATH.UPDATE_PROFILE, input),
  getPublicUser: (code: string) =>
    apiClient.get<PublicUserProfileResponse>(AUTH_PATH.PUBLIC_USER(code)),
  deleteAccount: (input: DeleteAccountInput) => apiClient.delete<void>(AUTH_PATH.ME, input),

  // The Google flow is a navigation, not an AJAX call.
  // The user is sent to the backend, then to Google, then back to the frontend
  // with a session cookie already set. The caller does not handle a response.
  googleSignInUrl: () => `${import.meta.env.VITE_BACKEND_URL}${AUTH_PATH.GOOGLE_START}`,
};
