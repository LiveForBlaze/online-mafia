// Tailwind class merger.
// `cn('px-2', condition && 'bg-red-500', 'px-4')` resolves conflicts (the last px wins)
// and accepts the conditional patterns we use in components.
//
// This is the same helper used by shadcn/ui and most production Tailwind codebases.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
