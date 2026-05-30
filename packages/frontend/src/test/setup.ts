// Vitest setup for the frontend test suite (jsdom environment).
//
// - Extends `expect` with @testing-library/jest-dom matchers (toBeInTheDocument, …).
// - Unmounts rendered components after every test so the DOM doesn't leak between tests.
// - Mocks react-i18next so `useTranslation().t(key)` returns the key verbatim — unit
//   tests assert on stable keys instead of translated copy, and no locale files load.

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
