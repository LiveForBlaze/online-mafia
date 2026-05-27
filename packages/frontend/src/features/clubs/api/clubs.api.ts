import type {
  ClubDetailsResponse,
  ClubListResponse,
  CreateClubInput,
  RenameClubInput,
  SetPrimaryClubInput,
  TransferLeadershipInput,
} from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

export const clubsApi = {
  list(
    params: { search?: string; offset?: number; limit?: number } = {},
  ): Promise<ClubListResponse> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<ClubListResponse>(`/api/v1/clubs${suffix}`);
  },
  get(code: string): Promise<ClubDetailsResponse> {
    return apiClient.get<ClubDetailsResponse>(`/api/v1/clubs/${encodeURIComponent(code)}`);
  },
  create(input: CreateClubInput): Promise<ClubDetailsResponse> {
    return apiClient.post<ClubDetailsResponse>('/api/v1/clubs', input);
  },
  rename(code: string, input: RenameClubInput): Promise<ClubDetailsResponse> {
    return apiClient.patch<ClubDetailsResponse>(`/api/v1/clubs/${encodeURIComponent(code)}`, input);
  },
  disband(code: string): Promise<{ disbanded: true }> {
    return apiClient.delete<{ disbanded: true }>(`/api/v1/clubs/${encodeURIComponent(code)}`);
  },
  join(code: string): Promise<{ pending: true }> {
    return apiClient.post<{ pending: true }>(`/api/v1/clubs/${encodeURIComponent(code)}/join`);
  },
  cancelRequest(code: string): Promise<{ cancelled: true }> {
    return apiClient.post<{ cancelled: true }>(
      `/api/v1/clubs/${encodeURIComponent(code)}/cancel-request`,
    );
  },
  approve(code: string, userId: string): Promise<ClubDetailsResponse> {
    return apiClient.post<ClubDetailsResponse>(
      `/api/v1/clubs/${encodeURIComponent(code)}/approve`,
      { userId },
    );
  },
  reject(code: string, userId: string): Promise<ClubDetailsResponse> {
    return apiClient.post<ClubDetailsResponse>(`/api/v1/clubs/${encodeURIComponent(code)}/reject`, {
      userId,
    });
  },
  leave(code: string): Promise<{ left: true; disbanded: boolean; newHeadId: string | null }> {
    return apiClient.post<{ left: true; disbanded: boolean; newHeadId: string | null }>(
      `/api/v1/clubs/${encodeURIComponent(code)}/leave`,
    );
  },
  transfer(code: string, input: TransferLeadershipInput): Promise<ClubDetailsResponse> {
    return apiClient.post<ClubDetailsResponse>(
      `/api/v1/clubs/${encodeURIComponent(code)}/transfer`,
      input,
    );
  },
  kick(code: string, userId: string): Promise<ClubDetailsResponse> {
    return apiClient.delete<ClubDetailsResponse>(
      `/api/v1/clubs/${encodeURIComponent(code)}/members/${encodeURIComponent(userId)}`,
    );
  },
  setPrimaryClub(input: SetPrimaryClubInput): Promise<{ primaryClubId: string | null }> {
    return apiClient.patch<{ primaryClubId: string | null }>('/api/v1/auth/me/primary-club', input);
  },
};
