/** Formats a byte count for human readable display. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'Unknown size';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  // Whole numbers stay whole ("2 KB"); fractional values keep one decimal ("1.5 MB").
  const decimals = unitIndex === 0 || value >= 10 ? 0 : 1;
  const formatted = value.toFixed(decimals).replace(/\.0$/, '');
  return `${formatted} ${units[unitIndex]}`;
}

/** Renders an empty-state placeholder for values that are not available yet. */
export const PLACEHOLDER_VALUE = '—';
