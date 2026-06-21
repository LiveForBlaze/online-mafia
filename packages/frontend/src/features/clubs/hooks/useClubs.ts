import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clubsApi } from '@/features/clubs/api/clubs.api.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';

export const CLUB_QUERY_KEY = {
  list: (search: string) => ['clubs', 'list', search] as const,
  detail: (code: string) => ['clubs', 'detail', code] as const,
};

export function useClubsList(search: string) {
  return useQuery({
    queryKey: CLUB_QUERY_KEY.list(search),
    queryFn: () => clubsApi.list({ search: search || undefined, limit: 50 }),
    staleTime: 30_000,
  });
}

export function useClubDetail(code: string) {
  return useQuery({
    queryKey: CLUB_QUERY_KEY.detail(code),
    queryFn: () => clubsApi.get(code),
    enabled: code.length > 0,
  });
}

// Generic invalidator for any club mutation — invalidates both list and the
// affected detail. The authenticated user's club memberships / primaryClub also
// change, but the user lives in the zustand auth store (NOT react-query), so we
// re-fetch /auth/me and write it back into the store instead of a no-op query
// invalidation.
function useClubInvalidator() {
  const qc = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  return (code?: string) => {
    void qc.invalidateQueries({ queryKey: ['clubs'] });
    if (code) void qc.invalidateQueries({ queryKey: CLUB_QUERY_KEY.detail(code) });
    void authApi
      .getCurrentUser()
      .then((res) => setUser(res.user))
      .catch(() => {
        // Best-effort re-hydrate; a failure here just leaves the store as-is.
      });
  };
}

export function useCreateClub() {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (name: string) => clubsApi.create({ name }),
    onSuccess: (res) => invalidate(res.club.publicCode),
  });
}

export function useRenameClub(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (name: string) => clubsApi.rename(code, { name }),
    onSuccess: () => invalidate(code),
  });
}

export function useDisbandClub(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: () => clubsApi.disband(code),
    onSuccess: () => invalidate(),
  });
}

export function useJoinClub(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: () => clubsApi.join(code),
    onSuccess: () => invalidate(code),
  });
}

export function useCancelJoinRequest(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: () => clubsApi.cancelRequest(code),
    onSuccess: () => invalidate(code),
  });
}

export function useApproveJoin(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (userId: string) => clubsApi.approve(code, userId),
    onSuccess: () => invalidate(code),
  });
}

export function useRejectJoin(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (userId: string) => clubsApi.reject(code, userId),
    onSuccess: () => invalidate(code),
  });
}

export function useLeaveClub(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: () => clubsApi.leave(code),
    onSuccess: () => invalidate(),
  });
}

export function useTransferLeadership(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (newHeadId: string) => clubsApi.transfer(code, { newHeadId }),
    onSuccess: () => invalidate(code),
  });
}

export function useKickMember(code: string) {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (userId: string) => clubsApi.kick(code, userId),
    onSuccess: () => invalidate(code),
  });
}

export function useSetPrimaryClub() {
  const invalidate = useClubInvalidator();
  return useMutation({
    mutationFn: (clubId: string | null) => clubsApi.setPrimaryClub({ clubId }),
    onSuccess: () => invalidate(),
  });
}
