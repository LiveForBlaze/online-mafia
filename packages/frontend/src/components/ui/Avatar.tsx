// Universal avatar renderer.
//
// Resolves three cases:
//   1. Standard avatar ID -> /avatars/<id>.jpg from the frontend's public dir
//   2. Full URL (Google sign-in photo) -> <img src=url>
//   3. Null -> nickname initial on a neutral surface

import { isStandardAvatar, type StandardAvatarId } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';

function standardAvatarSrc(id: StandardAvatarId): string {
  return `/avatars/${id}.jpg`;
}

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
      <img
        src={standardAvatarSrc(avatarUrl)}
        alt={nickname}
        className={cn('shrink-0 object-cover', radius, fillClass, className)}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={nickname}
        className={cn('shrink-0 object-cover', radius, fillClass, className)}
        style={style}
        loading="lazy"
        decoding="async"
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
