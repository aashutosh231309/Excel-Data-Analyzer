import { Loader2, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE_CLASSES =
  'inline-flex select-none items-center justify-center gap-2 rounded-field font-medium ' +
  'transition-all duration-150 ease-smooth disabled:cursor-not-allowed disabled:opacity-45 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-gradient text-white shadow-glow hover:brightness-110 active:translate-y-px active:brightness-95',
  secondary:
    'border border-surface-border bg-surface-elevated text-content-secondary hover:border-accent/40 ' +
    'hover:bg-surface-elevated/70 hover:text-content active:translate-y-px',
  ghost:
    'text-content-secondary hover:bg-surface-elevated hover:text-content active:translate-y-px',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction while an async action runs. */
  loading?: boolean;
  icon?: LucideIcon;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also used by the surrounding tooltip. */
  label: string;
  icon: LucideIcon;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const ICON_SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
};

/** Square, icon-only button. Always requires a label for assistive technology. */
export function IconButton({
  label,
  icon: Icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        ICON_SIZE_CLASSES[size],
        'p-0',
        className,
      )}
      {...rest}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
