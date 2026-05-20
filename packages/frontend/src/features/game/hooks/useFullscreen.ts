// Tracks and toggles browser fullscreen for an HTML element (default: document root).
//
// Safari prefixes the API as `webkit*`, so we feature-detect carefully. The hook returns
// the current fullscreen state plus a toggle function that requests/exits as needed.

import { useCallback, useEffect, useState } from 'react';

interface UseFullscreenResult {
  isFullscreen: boolean;
  toggle: () => Promise<void>;
  isSupported: boolean;
}

export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const target = document.documentElement;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    }
  }, []);

  const isSupported = typeof document.documentElement.requestFullscreen === 'function';

  return { isFullscreen, toggle, isSupported };
}
