import { ToastProvider } from '@/components/ui/ToastProvider';
import { DatasetProvider } from '@/state/DatasetProvider';
import { AppShell } from '@/layouts/AppShell';

/**
 * Root component.
 * `ToastProvider` owns notifications, `DatasetProvider` is the single source of
 * truth for the imported workbook, and `AppShell` renders the window chrome.
 */
export function App() {
  return (
    <ToastProvider>
      <DatasetProvider>
        <AppShell />
      </DatasetProvider>
    </ToastProvider>
  );
}
