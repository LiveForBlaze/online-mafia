// Tracks and toggles browser fullscreen for the document root.
//
// Safari (especially on iOS) ships only webkit-prefixed methods, so we
// feature-detect both. iOS Safari on iPhone in particular has had a long
// history of limited fullscreen support — there it may resolve a no-op,
// but we still render the button so the user has an opt-in affordance
// without us having to guess the platform.

import { useCallback, useEffect, useState } from 'react';

interface UseFullscreenResult {
  isFullscreen: boolean;
  toggle: () => Promise<void>;
  isSupported: boolean;
}

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitElement extends Element {
  webkitRequestFullscreen?: () => Promise<void>;
}

function currentFullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen(target: Element): Promise<void> {
  const el = target as Element & WebkitElement;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen();
  }
}

async function exitFullscreen(): Promise<void> {
  const doc = document as WebkitDocument;
  if (doc.exitFullscreen) {
    await doc.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

export function useFullscreen(): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(currentFullscreenElement()),
  );

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(currentFullscreenElement()));
    }
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    if (currentFullscreenElement()) {
      await exitFullscreen();
      return;
    }
    await requestFullscreen(document.documentElement);
  }, []);

  const el = document.documentElement as Element & WebkitElement;
  const isSupported =
    typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';

  return { isFullscreen, toggle, isSupported };
}
