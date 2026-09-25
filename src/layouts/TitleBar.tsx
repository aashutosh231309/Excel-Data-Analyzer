import { FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { WindowControls } from '@/layouts/WindowControls';
import { usePlatformInfo } from '@/hooks/usePlatformInfo';

/**
 * Application title bar. The bar itself is the window drag surface
 * (`app-drag`); the interactive controls opt out with `app-no-drag`.
 */
export function TitleBar() {
  const platform = usePlatformInfo();

  return (
    <header className="app-drag relative z-20 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-background-secondary pl-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-accent-gradient shadow-glow">
          <FileSpreadsheet className="h-4 w-4 text-white" aria-hidden="true" />
        </span>
        <h1 className="truncate text-[13px] font-semibold tracking-tight text-content">
          Excel Data Analyzer
        </h1>
        {platform.status === 'ready' && (
          <Badge variant="accent">v{platform.info.appVersion}</Badge>
        )}
      </div>
      <WindowControls />
    </header>
  );
}
