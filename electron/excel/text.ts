/**
 * Text normalization used by the Excel import pipeline.
 *
 * Every rule here is deliberately conservative: the application is an analyzer,
 * so it trims mechanical noise (whitespace, stray separators) but never rewrites
 * the meaning or the spelling of the data it reads.
 */

/** Collapses runs of whitespace (including non-breaking and thin spaces). */
export function collapseWhitespace(value: string): string {
  return value.replace(/[\s\u00A0\u202F\u2007]+/g, ' ').trim();
}

/** Converts an arbitrary cell value into trimmed text. */
export function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return '';
}

/**
 * Names keep their spelling and capitalization: only leading, trailing and
 * repeated internal whitespace is removed ("  Raj   Kumar " → "Raj Kumar").
 */
export function normalizePersonName(value: unknown): string {
  return collapseWhitespace(toDisplayText(value));
}

/**
 * Display form of a vehicle registration: trimmed, with accidental internal
 * spaces collapsed but characters and letter case left untouched.
 */
export function normalizeVehicleDisplay(value: unknown): string {
  return collapseWhitespace(toDisplayText(value)).toUpperCase();
}

/**
 * Comparison form of a vehicle registration: uppercase with every separator
 * removed, so "up32 ab 1234" and "UP32AB1234" match. Missing characters are
 * never invented.
 */
export function createVehicleKey(displayValue: string): string {
  return displayValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Payment modes are preserved as written ("Cash", "UPI", "Bank Transfer") with
 * only surrounding whitespace removed; no fixed list is assumed.
 */
export function normalizePaymentMode(value: unknown): string {
  return collapseWhitespace(toDisplayText(value));
}

/**
 * Free text (payment reason, remark): kept verbatim apart from trimming, so
 * blank stays blank and wording is never rewritten.
 */
export function normalizeFreeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  return toDisplayText(value).trim();
}

/** True when a cell holds nothing that should keep a row alive. */
export function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return false;
}
