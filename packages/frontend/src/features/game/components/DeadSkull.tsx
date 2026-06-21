// Shared dead-seat skull marker. Used on both the desktop SeatVideoTile and the
// mobile MiniTile so an eliminated seat looks identical across breakpoints
// (previously desktop used an SVG silhouette and mobile a 💀 emoji).

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn.js';

export function DeadSkull({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('text-muted', className)}
      fill="currentColor"
      aria-label={t('game.ui.playerLeftIcon')}
      role="img"
    >
      <path d="M12 2C7.03 2 3 5.94 3 10.8c0 2.34 1.02 4.5 2.7 6.1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h.6a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3.1c1.68-1.6 2.7-3.76 2.7-6.1C21 5.94 16.97 2 12 2zM8.5 12.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zm7 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zM10 16c0-.55.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1h-2c-.55 0-1-.45-1-1z" />
    </svg>
  );
}
