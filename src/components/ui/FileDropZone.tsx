import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface FileDropZoneProps {
  onFilesDropped: (files: FileList) => void;
  /** Accessible name describing what can be dropped here. */
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Reusable drag & drop surface.
 *
 * It owns only the drag interaction state and the visual feedback; deciding
 * whether a dropped file is acceptable stays with the caller (and ultimately
 * with the Electron main process).
 */
export function FileDropZone({
  onFilesDropped,
  label,
  disabled = false,
  className,
  children,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  // Drag events fire for every nested element; a depth counter avoids flicker.
  const dragDepth = useRef(0);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    onFilesDropped(event.dataTransfer.files);
  };

  return (
    <div
      role="region"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-dragging={isDragging ? 'true' : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group/drop relative flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-panel',
        'border border-dashed p-8 text-center',
        'transition-[transform,background-color,border-color,box-shadow] duration-200 ease-smooth',
        isDragging
          ? 'scale-[1.01] border-accent bg-accent-decorative shadow-glow'
          : 'border-surface-border bg-surface hover:border-accent/50 hover:bg-surface-elevated/40',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}
