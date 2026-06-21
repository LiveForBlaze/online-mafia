// Simple modal dialog with backdrop. Closes on backdrop click and on Escape.
//
// Accessibility:
//   - role="dialog" + aria-modal + aria-labelledby pointing at the heading
//   - Focus moves into the dialog on open (or onto `initialFocusRef` if given)
//     and returns to the previously focused element on close
//   - Tab / Shift+Tab are trapped: focus wraps between the first and last
//     focusable element inside the panel, so keyboard users cannot tab out

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/cn.js';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  // Element to focus when the dialog opens. Defaults to the first focusable.
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  initialFocusRef,
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Save the element that had focus before the dialog opened so we can restore it.
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog: the caller-requested element, else the first
    // focusable, else the panel itself so screen readers announce it.
    const panel = dialogRef.current;
    if (panel) {
      const target =
        initialFocusRef?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      // Focus trap: keep Tab / Shift+Tab inside the panel by wrapping at the ends.
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      // Restore focus to where it was before the dialog opened.
      previouslyFocused.current?.focus();
    };
  }, [open, onClose, initialFocusRef]);

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
