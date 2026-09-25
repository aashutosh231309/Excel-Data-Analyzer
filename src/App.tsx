import { ToastProvider } from '@/components/ui/ToastProvider';
import { AppShell } from '@/layouts/AppShell';

/** Root component: global providers wrap the application shell. */
export function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
