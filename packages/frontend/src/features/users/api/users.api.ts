// REST-клиент для каталога игроков.
//
// Сервер защищён auth-cookie — apiClient автоматически шлёт session.

import { type PublicUserListResponse, type PublicUserProfileResponse } from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const BASE = '/api/v1/users';

export const usersApi = {
  list: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    const qs = q.toString();
    return apiClient.get<PublicUserListResponse>(qs ? `${BASE}?${qs}` : BASE);
  },
  profile: (code: string) =>
    apiClient.get<PublicUserProfileResponse>(`${BASE}/${encodeURIComponent(code)}`),
};
