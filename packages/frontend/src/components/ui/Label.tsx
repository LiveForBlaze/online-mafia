// Label primitive for form fields. Pairs with Input via the `htmlFor` prop.

import { forwardRef, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/cn.js';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...rest }, ref) {
    return (
      <label
        ref={ref}
        className={cn('block text-sm font-medium text-fg mb-1.5', className)}
        {...rest}
      />
    );
  },
);
