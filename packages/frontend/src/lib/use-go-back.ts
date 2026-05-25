// Хук для кнопок «Назад» — возвращает функцию, которая идёт в history-back,
// если в SPA-истории есть куда возвращаться, иначе фолбэчит на переданный
// путь.
//
// Зачем не просто `navigate(-1)`: если юзер открыл страницу через прямой
// URL (закладка, share-link), browser-history пустая — `navigate(-1)`
// выкинет за пределы SPA или просто ничего не сделает. С фолбэком юзер
// гарантированно попадает на осмысленную страницу.
//
// React Router v6+ хранит индекс навигации в `window.history.state.idx`.
// На прямом заходе idx === 0 — значит SPA-истории «выше» нет, идём на
// фолбэк. После любой push-навигации внутри SPA idx > 0 — можно назад.

import { useCallback } from 'react';
import { useNavigate } from 'react-router';

export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }, [navigate, fallback]);
}
