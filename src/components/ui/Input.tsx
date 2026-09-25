import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string;
  /** Short helper text shown below the field. */
  hint?: string;
  /** Validation message; replaces the hint and marks the field invalid. */
  error?: string;
  icon?: LucideIcon;
  id?: string;
}

export function Input({
  label,
  hint,
  error,
  icon: Icon,
  id,
  className,
  disabled,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  const descriptionId = `${inputId}-description`;
  const hasDescription = Boolean(error ?? hint);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-content-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
            aria-hidden="true"
          />
        )}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasDescription ? descriptionId : undefined}
          className={cn(
            'h-10 w-full rounded-field border bg-background-secondary/60 px-3 text-sm text-content',
            'placeholder:text-content-muted',
            'transition-colors duration-150 ease-smooth',
            'hover:border-accent/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-surface-border',
            Icon && 'pl-9',
            error ? 'border-danger focus:border-danger focus:ring-danger/30' : 'border-surface-border',
            className,
          )}
          {...rest}
        />
      </div>
      {hasDescription && (
        <p
          id={descriptionId}
          className={cn('text-[11px]', error ? 'text-danger' : 'text-content-muted')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
