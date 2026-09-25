import { ToastProvider } from '@/components/ui/ToastProvider';
import { DatasetProvider } from '@/state/DatasetProvider';
import { FilterProvider } from '@/state/FilterProvider';
import { AppShell } from '@/layouts/AppShell';

/**
 * Root component.
 * `ToastProvider` owns notifications, `DatasetProvider` is the single source of
 * truth for the imported workbook, `FilterProvider` holds the filters and the
 * filtered result set that every screen reads, and `AppShell` renders the
 * window chrome.
 */
export function App() {
  return (
    <ToastProvider>
      <DatasetProvider>
        <FilterProvider>
          <AppShell />
        </FilterProvider>
      </DatasetProvider>
    </ToastProvider>
  );
}
