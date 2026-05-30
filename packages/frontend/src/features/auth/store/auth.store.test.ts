import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthenticatedUser } from '@mafia/shared';

import { useAuthStore } from './auth.store.js';

function makeUser(): AuthenticatedUser {
  // Cast through unknown — the test only cares about identity of the object the
  // store holds, not the full shape of AuthenticatedUser.
  return { id: 'u1', nickname: 'alice' } as unknown as AuthenticatedUser;
}

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset only the data fields (a non-replace merge keeps the action
    // functions intact).
    useAuthStore.setState({ user: null, banned: null, isHydrated: false });
  });

  it('starts with no user, not banned, not hydrated', () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.banned).toBeNull();
    expect(s.isHydrated).toBe(false);
  });

  it('setUser stores the user and clears any banned flag', () => {
    useAuthStore.setState({ banned: { reason: 'spam' } });

    const user = makeUser();
    useAuthStore.getState().setUser(user);

    const s = useAuthStore.getState();
    expect(s.user).toBe(user);
    expect(s.banned).toBeNull();
  });

  it('setUser(null) logs the user out', () => {
    useAuthStore.getState().setUser(makeUser());
    useAuthStore.getState().setUser(null);

    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setBanned stores the banned flag and clears the user', () => {
    useAuthStore.getState().setUser(makeUser());

    useAuthStore.getState().setBanned({ reason: 'banned_site_access' });

    const s = useAuthStore.getState();
    expect(s.banned).toEqual({ reason: 'banned_site_access' });
    expect(s.user).toBeNull();
  });

  it('setBanned accepts a null reason', () => {
    useAuthStore.getState().setBanned({ reason: null });
    expect(useAuthStore.getState().banned).toEqual({ reason: null });
  });

  it('setBanned(null) clears the banned flag', () => {
    useAuthStore.getState().setBanned({ reason: 'x' });
    useAuthStore.getState().setBanned(null);
    expect(useAuthStore.getState().banned).toBeNull();
  });

  it('markHydrated flips isHydrated to true without touching user/banned', () => {
    const user = makeUser();
    useAuthStore.getState().setUser(user);

    useAuthStore.getState().markHydrated();

    const s = useAuthStore.getState();
    expect(s.isHydrated).toBe(true);
    expect(s.user).toBe(user);
    expect(s.banned).toBeNull();
  });
});
