// Full-screen "rotate your phone" overlay shown when a portrait-orientation
// mobile device opens the game. The game's mobile layout (header + stage +
// 5×2 seat grid + judge panel) is designed for landscape — in portrait the
// stage and the seats would compete for too little width.

import { useEffect, useState } from 'react';

export function RotateDeviceOverlay() {
  const isPortraitPhone = useIsPortraitPhone();
  if (!isPortraitPhone) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-bg flex items-center justify-center p-6"
    >
      <div className="max-w-xs text-center space-y-4">
        <RotateIcon />
        <h2 className="text-xl font-bold text-fg">Поверните телефон</h2>
        <p className="text-sm text-muted leading-relaxed">
          Игра идёт в альбомном режиме — поверните устройство, чтобы продолжить.
        </p>
      </div>
    </div>
  );
}

// Phone in portrait — the only condition under which we render the overlay.
// Larger screens (tablets, laptops) ignore orientation entirely.
function useIsPortraitPhone(): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 1023px)');
    setMatch(mq.matches);
    const handler = (event: MediaQueryListEvent) => setMatch(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return match;
}

function RotateIcon() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-auto text-accent animate-pulse"
      aria-hidden="true"
    >
      <rect x="5" y="2.5" width="14" height="19" rx="2" transform="rotate(-30 12 12)" />
      <path d="M12 18.5h.01" />
      <path d="M3 8a9 9 0 0 1 14-4" />
      <path d="M3 8V4m0 4h4" />
    </svg>
  );
}
