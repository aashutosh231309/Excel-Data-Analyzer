/**
 * Display formatting.
 *
 * Normalized values are stored in machine-friendly forms (ISO dates, integer
 * minor units); everything the user reads is formatted here, and only here.
 * Amounts are formatted from the integer paise value without ever dividing by
 * 100 into a float, so the displayed figure is always exact.
 */

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

/** Renders an empty-state placeholder for values that are not available. */
export const PLACEHOLDER_VALUE = '—';

const COUNT_FORMATTER = new Intl.NumberFormat('en-IN');
const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Groups a count for display (1,250). */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? COUNT_FORMATTER.format(Math.round(value)) : PLACEHOLDER_VALUE;
}

/**
 * Formats integer minor units (paise) as rupees, e.g. 200000 → ₹2,000 and
 * 84250000 → ₹8,42,500 (Indian digit grouping). Paise are shown only when the
 * amount is not a whole rupee value.
 */
export function formatAmountMinor(minorUnits: number | null | undefined): string {
  if (minorUnits === null || minorUnits === undefined || !Number.isFinite(minorUnits)) {
    return PLACEHOLDER_VALUE;
  }
  const sign = minorUnits < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(minorUnits));
  const rupees = Math.trunc(absolute / 100);
  const paise = absolute % 100;
  const formattedRupees = RUPEE_FORMATTER.format(rupees);
  return paise === 0 ? `${sign}${formattedRupees}` : `${sign}${formattedRupees}.${String(paise).padStart(2, '0')}`;
}

/**
 * Formats an ISO calendar date (`YYYY-MM-DD`) as DD/MM/YYYY.
 * Anything that is not an ISO date is returned untouched so the caller can show
 * the original workbook value for diagnostics.
 */
export function formatDateIso(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return PLACEHOLDER_VALUE;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Formats a ratio as a whole percentage for progress reporting. */
export function formatPercent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}
