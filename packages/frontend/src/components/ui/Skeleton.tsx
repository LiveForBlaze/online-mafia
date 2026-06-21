// Placeholder block shown while content loads. Token-only: a pulsing card-
// colored rectangle with the standard radius. Compose several to mimic the
// shape of the content that will replace them.

import { cn } from '@/lib/cn.js';

export type SkeletonVariant = 'row' | 'card';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  row: 'h-4 w-full rounded-md',
  card: 'h-32 w-full rounded-lg',
};

export function Skeleton({ width, height, variant = 'row', className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{ width, height }}
      className={cn('animate-pulse bg-card', variantClasses[variant], className)}
    />
  );
}
