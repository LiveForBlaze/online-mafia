// Avatar circle + nickname pill, fully clickable. Used in page headers as the
// affordance that opens the profile page. Hides the nickname text on narrow
// viewports so only the avatar remains.

import { useNavigate } from 'react-router';

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { userProfilePath } from '@/routes/paths.js';

export function UserChip() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(userProfilePath(user.publicCode))}
      title={user.nickname}
      className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 text-sm hover:bg-bg transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-semibold">
        {extractInitial(user.nickname)}
      </span>
      <span className="hidden sm:inline text-fg max-w-[140px] truncate pr-1">{user.nickname}</span>
    </button>
  );
}

function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
