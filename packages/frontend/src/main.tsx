import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

import { App } from './App.js';
import { ErrorBoundary } from '@/components/ErrorBoundary.js';
import { pushDiag } from '@/features/game/socket/diag-log.js';
import './i18n/index.js';
import { bootstrapTheme } from './lib/theme.js';
import './styles/globals.css';

// Apply the stored theme before React mounts to avoid the "flash of wrong theme".
bootstrapTheme();

// One QueryClient per app. Sensible defaults: do not retry on 4xx (those are usually
// validation errors that retrying will not fix), and keep cached data for 1 minute
// before it's considered stale.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      staleTime: 60 * 1000,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

window.addEventListener('error', (event) => {
  pushDiag('error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    col: event.colno,
  });
});
window.addEventListener('unhandledrejection', (event) => {
  pushDiag('error', { message: String(event.reason ?? 'unhandled rejection') });
});
