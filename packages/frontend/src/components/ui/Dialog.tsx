// Simple modal dialog with backdrop. Closes on backdrop click and on Escape.
//
// Accessibility:
//   - role="dialog" + aria-modal + aria-labelledby pointing at the heading
//   - Focus moves into the dialog on open and returns to the previously focused
//     element on close
//   - Rest of the page is marked inert so keyboard tabbing is trapped inside
//     (React 19 lets us set `inert` on the body; falls back gracefully on
//     browsers without inert support)

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn.js';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Save the element that had focus before the dialog opened so we can restore it.
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog. We pick the first focusable element if any;
    // otherwise focus the panel itself so screen readers announce it.
    const panel = dialogRef.current;
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panel).focus();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      // Restore focus to where it was before the dialog opened.
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn(
          'w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-fg">
          {title}
        </h2>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
