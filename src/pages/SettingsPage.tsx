import { HardDrive, Lock, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { usePlatformInfo } from '@/hooks/usePlatformInfo';
import { PLACEHOLDER_VALUE } from '@/utils/format';

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

const SECURITY_GUARANTEES = [
  'The renderer runs with contextIsolation enabled and Node.js integration disabled.',
  'All privileged work happens in the Electron main process.',
  'The UI can only call the explicitly whitelisted preload API.',
  'Unsupported file types are rejected by the trusted main process.',
];

const PRIVACY_NOTES = [
  'Spreadsheets are read from your local disk only.',
  'Nothing is uploaded: the application makes no external network requests.',
  'No account, telemetry or cloud service is involved.',
];

interface RuntimeRow {
  label: string;
  value: string;
}

/** Application, runtime and privacy information. */
export function SettingsPage() {
  const platform = usePlatformInfo();
  const runtimeRows: RuntimeRow[] = buildRuntimeRows(platform);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Application, runtime and privacy information"
        actions={
          <span className="text-[11px] text-content-muted">
            Preferences and export arrive in a later stage
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-content">Runtime</h2>
          <dl className="flex flex-col gap-3">
            {runtimeRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[13px] text-content-muted">{row.label}</dt>
                <dd className="text-right text-[13px] font-medium text-content-secondary">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {platform.status !== 'ready' && (
            <p className="border-t border-surface-border pt-3 text-[11px] text-content-muted">
              Runtime details are available inside the desktop application.
            </p>
          )}
        </Card>

        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Security model</h2>
          </div>
          <ul className="flex flex-col gap-3">
            {SECURITY_GUARANTEES.map((item) => (
              <li key={item} className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span className="text-[13px] leading-relaxed text-content-secondary">{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="lg" className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-accent-violet" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Data &amp; privacy</h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {PRIVACY_NOTES.map((note) => (
              <li
                key={note}
                className="rounded-card border border-surface-border bg-surface-elevated/50 p-3 text-[12px] leading-relaxed text-content-secondary"
              >
                {note}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function buildRuntimeRows(platform: ReturnType<typeof usePlatformInfo>): RuntimeRow[] {
  if (platform.status !== 'ready') {
    return [
      { label: 'Application', value: PLACEHOLDER_VALUE },
      { label: 'Platform', value: PLACEHOLDER_VALUE },
      { label: 'Distribution', value: PLACEHOLDER_VALUE },
    ];
  }

  const { info } = platform;
  return [
    { label: 'Application', value: `Excel Data Analyzer ${info.appVersion}` },
    { label: 'Platform', value: PLATFORM_LABELS[info.platform] ?? info.platform },
    { label: 'Distribution', value: info.isPackaged ? 'Packaged build' : 'Development build' },
    { label: 'Electron', value: info.electronVersion },
    { label: 'Chromium', value: info.chromeVersion },
    { label: 'Node.js', value: info.nodeVersion },
  ];
}
