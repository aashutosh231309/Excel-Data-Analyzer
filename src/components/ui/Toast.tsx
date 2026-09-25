import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastRecord {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** True while the exit animation runs, just before the toast is removed. */
  leaving?: boolean;
}

const VARIANT_ICONS: Record<ToastVariant, LucideIcon> = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

const VARIANT_ICON_CLASSES: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-accent',
};

interface ToastViewportProps {
  toasts: readonly ToastRecord[];
  onDismiss: (id: string) => void;
}

/** Bottom-right notification stack. Errors are announced assertively. */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const Icon = VARIANT_ICONS[toast.variant];

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-card border border-surface-border',
        'bg-surface-elevated p-3 shadow-raised',
        toast.leaving ? 'animate-toast-out' : 'animate-toast-in',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', VARIANT_ICON_CLASSES[toast.variant])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-content">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-[11px] leading-relaxed text-content-muted">{toast.description}</p>
        )}
      </div>
      <Tooltip label="Dismiss notification">
        <IconButton
          size="sm"
          icon={X}
          label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
        />
      </Tooltip>
    </div>
  );
}
