import { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DataPage } from '@/pages/DataPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { Sidebar } from '@/layouts/Sidebar';
import { TitleBar } from '@/layouts/TitleBar';
import type { AppSection } from '@/lib/navigation';

/**
 * Application shell: custom title bar, slim sidebar and the scrollable main
 * region that hosts the pages. The window itself never scrolls; only the main
 * region does, so the desktop layout stays stable.
 */
export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');

  const navigate = useCallback((section: AppSection) => setActiveSection(section), []);

  // Dropping a file outside a drop zone must never navigate the window.
  useEffect(() => {
    const preventWindowNavigation = (event: DragEvent): void => event.preventDefault();
    window.addEventListener('dragover', preventWindowNavigation);
    window.addEventListener('drop', preventWindowNavigation);
    return () => {
      window.removeEventListener('dragover', preventWindowNavigation);
      window.removeEventListener('drop', preventWindowNavigation);
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar activeSection={activeSection} onSelect={navigate} />
        <main className="scroll-smooth-y relative min-h-0 flex-1 overflow-y-auto">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-accent-decorative opacity-70"
          />
          <div className="relative mx-auto w-full max-w-[1440px] px-6 py-6">
            {/* A rendering error is contained to the page area, so the sidebar
                stays usable and the user can recover without restarting. */}
            <ErrorBoundary
              resetKey={activeSection}
              onGoToDashboard={() => navigate('dashboard')}
            >
              <div key={activeSection} className="animate-fade-up">
                {renderSection(activeSection, navigate)}
              </div>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

function renderSection(section: AppSection, navigate: (section: AppSection) => void) {
  switch (section) {
    case 'dashboard':
      return <DashboardPage onNavigate={navigate} />;
    case 'data':
      return <DataPage onNavigate={navigate} />;
    case 'settings':
      return <SettingsPage />;
  }
}
