// Минимальная toast-система: глобальный Zustand-стор + компонент-рендерер.
//
// Использование:
//   import { toast } from '@/components/ui/Toaster.js';
//   toast.error('Не удалось сохранить');
//   toast.success('Сохранено');
//
// Toaster монтируется один раз в App.tsx. Авто-дисмис через 4с, ручной — по
// клику на ✕. Без анимационных библиотек — простой fade через CSS-transition.

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

import { cn } from '@/lib/cn.js';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextId++, kind, message }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success(message: string) {
    useToastStore.getState().push('success', message);
  },
  error(message: string) {
    useToastStore.getState().push('error', message);
  },
  info(message: string) {
    useToastStore.getState().push('info', message);
  },
};

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  error: 'border-danger/40 bg-danger/10 text-danger-text',
  info: 'border-border bg-card text-fg',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    // Per-toast live regions: error toasts announce assertively (role=alert),
    // success/info stay polite (role=status). See ToastItem.
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), 4000);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismiss]);
  const isError = toast.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg',
        'flex items-start gap-3',
        KIND_STYLES[toast.kind],
      )}
    >
      <span className="flex-1 self-center">{toast.message}</span>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="dismiss"
        className={cn(
          'inline-flex h-11 w-11 -my-2 -mr-2 shrink-0 items-center justify-center rounded-md',
          'text-current opacity-60 hover:opacity-100 transition-opacity',
          'focus:outline-none focus:ring-2 focus:ring-accent',
        )}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
