import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the subtle elevation/border hover response used by interactive cards. */
  interactive?: boolean;
  padding?: CardPadding;
  children?: ReactNode;
}

/**
 * Surface container. Cards are differentiated through background, border and a
 * slight elevation rather than heavy shadows.
 */
export function Card({
  interactive = false,
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-surface-border bg-surface shadow-card',
        'transition-[transform,border-color,background-color,box-shadow] duration-200 ease-smooth',
        interactive &&
          'hover:-translate-y-px hover:border-accent/40 hover:bg-surface-elevated/60 hover:shadow-raised',
        PADDING_CLASSES[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
