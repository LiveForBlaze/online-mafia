// Возвращает значение, обновляющееся через delay мс после последнего
// изменения source. Используется чтобы не дёргать API на каждый keystroke
// в поисковых input'ах.

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(source: T, delayMs = 300): T {
  const [value, setValue] = useState(source);
  useEffect(() => {
    const timer = window.setTimeout(() => setValue(source), delayMs);
    return () => window.clearTimeout(timer);
  }, [source, delayMs]);
  return value;
}
