import { Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatCount, formatPercent } from '@/utils/format';
import type { ImportProgress } from '@shared/import';

interface ImportProgressPanelProps {
  progress: ImportProgress | null;
  /** Shown while the native file dialog is open, before any parsing starts. */
  selecting?: boolean;
  className?: string;
}

/**
 * Loading state for an import.
 *
 * The phase messages come from the main process. A percentage is only shown
 * when the number of rows is genuinely known, so the bar never reports a made
 * up figure.
 */
export function ImportProgressPanel({ progress, selecting = false, className }: ImportProgressPanelProps) {
  const message = selecting ? 'Waiting for the file dialog' : progress?.message ?? 'Reading Excel file';
  const detail = selecting
    ? 'Choose an .xlsx or .xls workbook to continue.'
    : 'Preparing your data…';

  const hasRealProgress =
    !selecting &&
    typeof progress?.total === 'number' &&
    progress.total > 0 &&
    typeof progress.processed === 'number';
  const percent = hasRealProgress
    ? formatPercent(progress?.processed ?? 0, progress?.total ?? 0)
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex w-full max-w-xl flex-col items-center gap-4 text-center', className)}
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-accent-decorative animate-pulse"
        />
        <Loader2 className="relative h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      </span>

      <div>
        <p className="text-sm font-semibold text-content">{message}</p>
        <p className="mt-1 text-xs text-content-muted">{detail}</p>
      </div>

      <div className="w-full max-w-xs">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated"
          role={percent === null ? undefined : 'progressbar'}
          aria-valuemin={percent === null ? undefined : 0}
          aria-valuemax={percent === null ? undefined : 100}
          aria-valuenow={percent ?? undefined}
          aria-label={percent === null ? undefined : 'Import progress'}
        >
          {percent === null ? (
            <span
              aria-hidden="true"
              className="block h-full w-1/3 rounded-full bg-accent-gradient"
              style={{ animation: 'import-indeterminate 1.4s ease-in-out infinite' }}
            />
          ) : (
            <span
              className="block h-full rounded-full bg-accent-gradient transition-[width] duration-200 ease-smooth"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        <p className="mt-2 text-[11px] tabular-nums text-content-muted">
          {percent === null
            ? 'This can take a moment for large workbooks.'
            : `${formatCount(progress?.processed ?? 0)} of ${formatCount(progress?.total ?? 0)} rows · ${percent}%`}
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-content-muted">
        <ShieldCheck className="h-3 w-3 text-success" aria-hidden="true" />
        Read locally — nothing is uploaded
      </p>
    </div>
  );
}
