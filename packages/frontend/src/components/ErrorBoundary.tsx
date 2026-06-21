// App-level error boundary. A render-time crash in any descendant is caught
// here instead of unmounting the whole React tree into a blank white page.
//
// Kept intentionally dependency-free (no react-error-boundary, no router): it
// wraps the Router in main.tsx, so navigation links use plain anchors. The
// fallback is recoverable — "Reload" hard-reloads, "Back to lobby" navigates
// home — and the error is reported through the existing diag mechanism.

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { pushDiag } from '@/features/game/socket/diag-log.js';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    pushDiag('error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info);
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-fg">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted max-w-md text-sm">
          An unexpected error interrupted the page. You can reload to continue.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-primary text-primary-fg hover:opacity-90 inline-flex h-10 items-center justify-center rounded-md px-4 text-base font-medium transition-opacity"
          >
            Reload
          </button>
          <a
            href="/"
            className="text-fg border-border hover:bg-card inline-flex h-10 items-center justify-center rounded-md border px-4 text-base font-medium transition-opacity"
          >
            Back to lobby
          </a>
        </div>
      </div>
    );
  }
}
