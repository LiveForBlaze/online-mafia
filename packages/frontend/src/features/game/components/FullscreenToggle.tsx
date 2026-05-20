// Small icon button that toggles browser fullscreen for the whole game view.
// Render only when the API is available — old browsers without it just see no button.

import { Button } from '@/components/ui/Button.js';
import { useFullscreen } from '@/features/game/hooks/useFullscreen.js';

export function FullscreenToggle() {
  const { isFullscreen, toggle, isSupported } = useFullscreen();

  if (!isSupported) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void toggle();
      }}
      title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
      aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
    >
      {isFullscreen ? <ExitIcon /> : <EnterIcon />}
    </Button>
  );
}

function EnterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
