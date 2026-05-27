// HTTP client for the admin API. All endpoints require the caller to be
// an admin — the backend gate rejects others with 403, and the /admin route
// is fenced behind a useAuthStore.user.isAdmin check on the frontend.

import type {
  AdminLobbyListResponse,
  AdminRenameLobbyInput,
  AdminRenameUserInput,
  AdminSetRestrictionsInput,
  AdminUserListResponse,
  BanRestrictionCode,
} from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

export const adminApi = {
  listLobbies(
    params: { status?: string; search?: string; offset?: number; limit?: number } = {},
  ): Promise<AdminLobbyListResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<AdminLobbyListResponse>(`/api/v1/admin/lobbies${suffix}`);
  },
  renameLobby(id: string, input: AdminRenameLobbyInput): Promise<{ ok: true }> {
    return apiClient.patch<{ ok: true }>(`/api/v1/admin/lobbies/${id}`, input);
  },
  closeLobby(id: string): Promise<{ ok: true }> {
    return apiClient.delete<{ ok: true }>(`/api/v1/admin/lobbies/${id}`);
  },
  listUsers(
    params: { search?: string; includeBots?: boolean; offset?: number; limit?: number } = {},
  ): Promise<AdminUserListResponse> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.includeBots) qs.set('includeBots', 'true');
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<AdminUserListResponse>(`/api/v1/admin/users${suffix}`);
  },
  renameUser(id: string, input: AdminRenameUserInput): Promise<{ ok: true }> {
    return apiClient.patch<{ ok: true }>(`/api/v1/admin/users/${id}`, input);
  },
  setRestrictions(
    id: string,
    restrictions: BanRestrictionCode[],
    reason: string | null,
  ): Promise<{ userId: string; banRestrictions: string[]; bannedAt: string | null }> {
    const input: AdminSetRestrictionsInput = { restrictions, reason };
    return apiClient.post<{ userId: string; banRestrictions: string[]; bannedAt: string | null }>(
      `/api/v1/admin/users/${id}/restrictions`,
      input,
    );
  },
  deleteUser(id: string): Promise<{ ok: true }> {
    return apiClient.delete<{ ok: true }>(`/api/v1/admin/users/${id}`);
  },
};
