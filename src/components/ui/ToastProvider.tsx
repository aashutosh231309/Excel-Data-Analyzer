import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastViewport, type ToastRecord, type ToastVariant } from '@/components/ui/Toast';

/** How long a notification stays on screen before it dismisses itself. */
export const TOAST_DURATION_MS = 5000;

/** Must match the `toast-out` animation in `tailwind.config.ts`. */
export const TOAST_EXIT_MS = 220;

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Overrides the default auto-dismiss delay. */
  duration?: number;
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Central notification system: browser dialogs are never used for feedback. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Fades the notification out and removes it afterwards, so dismissing one
   * never makes the stack jump.
   */
  const dismiss = useCallback(
    (id: string) => {
      const timer = timers.current.get(id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      );
      timers.current.set(
        id,
        window.setTimeout(() => remove(id), TOAST_EXIT_MS),
      );
    },
    [remove],
  );

  const notify = useCallback(
    ({ title, description, variant = 'info', duration = TOAST_DURATION_MS }: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, title, description, variant }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}
