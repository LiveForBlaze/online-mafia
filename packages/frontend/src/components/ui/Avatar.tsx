// Universal avatar renderer.
//
// Resolves three cases:
//   1. Standard avatar ID stored in avatarUrl -> placeholder coloured tile (until real images ship)
//   2. External URL (Google sign-in) -> <img>
//   3. Null -> nickname initial on a neutral surface

import { isStandardAvatar, type StandardAvatarId } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';

// Placeholder colour palette — one per slot. Replaced by real PNGs later.
const AVATAR_COLORS: Record<StandardAvatarId, string> = {
  'avatar-01': '#E57373',
  'avatar-02': '#FF8A65',
  'avatar-03': '#FFB74D',
  'avatar-04': '#A5D6A7',
  'avatar-05': '#4DB6AC',
  'avatar-06': '#64B5F6',
  'avatar-07': '#7986CB',
  'avatar-08': '#BA68C8',
  'avatar-09': '#F06292',
  'avatar-10': '#90A4AE',
};

interface AvatarProps {
  avatarUrl: string | null | undefined;
  nickname: string;
  /** Side length in pixels for fixed sizing; pass null to let the container drive it. */
  size?: number | null;
  /** Border radius — circle by default; pass 'rounded-md' or similar for tile-style. */
  shape?: 'circle' | 'square';
  className?: string;
}

export function Avatar({
  avatarUrl,
  nickname,
  size = 48,
  shape = 'circle',
  className,
}: AvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-md';
  const style = size !== null ? { width: size, height: size, fontSize: size * 0.42 } : undefined;
  const fillClass = size !== null ? '' : 'w-full h-full';

  if (isStandardAvatar(avatarUrl)) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center font-bold text-white',
          radius,
          fillClass,
          className,
        )}
        style={{ ...style, backgroundColor: AVATAR_COLORS[avatarUrl] }}
      >
        {Number(avatarUrl.slice(-2))}
      </span>
    );
  }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nickname}
        className={cn('shrink-0 object-cover', radius, fillClass, className)}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-card-deep font-semibold text-muted',
        radius,
        fillClass,
        className,
      )}
      style={style}
    >
      {extractInitial(nickname)}
    </span>
  );
}
