import { Minus, Minimize2, Square, X, type LucideIcon } from 'lucide-react';
import { useWindowControls } from '@/hooks/useWindowControls';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';

const CONTROL_BASE_CLASSES =
  'app-no-drag inline-flex h-8 w-9 items-center justify-center rounded-control text-content-muted ' +
  'transition-colors duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Custom window controls for the frameless desktop window. They call the
 * whitelisted IPC commands, so minimise / maximise / close behave exactly like
 * the native Windows buttons.
 */
export function WindowControls() {
  const { isMaximized, minimize, toggleMaximize, close, available } = useWindowControls();

  return (
    <div className="flex items-center gap-1 pr-2">
      <ControlButton
        label="Minimize"
        icon={Minus}
        onClick={minimize}
        disabled={!available}
        tooltip="Minimize"
      />
      <ControlButton
        label={isMaximized ? 'Restore down' : 'Maximize'}
        icon={isMaximized ? Minimize2 : Square}
        onClick={toggleMaximize}
        disabled={!available}
        tooltip={isMaximized ? 'Restore down' : 'Maximize'}
      />
      <ControlButton
        label="Close"
        icon={X}
        onClick={close}
        disabled={!available}
        tone="danger"
        tooltip="Close"
      />
    </div>
  );
}

interface ControlButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  tooltip: string;
}

function ControlButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  tone = 'default',
  tooltip,
}: ControlButtonProps) {
  return (
    <Tooltip label={tooltip}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          CONTROL_BASE_CLASSES,
          tone === 'danger'
            ? 'hover:bg-danger hover:text-white'
            : 'hover:bg-surface-elevated hover:text-content',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
