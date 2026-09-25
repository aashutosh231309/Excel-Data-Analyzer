import * as XLSX from 'xlsx';

/**
 * Date normalization.
 *
 * Dates are stored internally as ISO calendar dates (`YYYY-MM-DD`): sortable,
 * free of time zones and unambiguous for the comparisons of the later stages.
 *
 * Interpretation rules (documented in the README and the Settings screen):
 *   1. Excel date serials and JS `Date` values are trusted first — no
 *      locale-dependent guessing happens when the workbook already knows.
 *   2. Numeric cells in the Date column without a date format are still read as
 *      Excel serials (a bare `45560` in a Date column is not a meaningful
 *      amount or ID).
 *   3. Strings with an explicit year first (`2026-09-25`, `2026/09/25`,
 *      ISO timestamps) are unambiguous and read directly.
 *   4. Remaining written dates are read **day first** (`25/09/2026`,
 *      `25-09-2026`, `25 Sep 2026`, `25 September 2026`), which is the
 *      convention of the application. `03/04/2026` is therefore 3 April 2026;
 *      month-first-only dates such as `09/25/2026` are rejected as invalid
 *      rather than being silently reinterpreted.
 *   5. Two-digit years follow Excel: 00–68 → 2000–2068, 69–99 → 1969–1999.
 *
 * Anything that cannot be interpreted reliably is reported to the user as a
 * record that needs attention; the raw value stays available for diagnostics
 * and the source workbook is never modified.
 */

/** Excel's serial date range: 1900-01-01 (1) … 9999-12-31 (2958465). */
const EXCEL_SERIAL_MIN = 1;
const EXCEL_SERIAL_MAX = 2958465;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface DateCell {
  /** Raw cell value coming from the workbook. */
  value: unknown;
  /** Whether the cell carries an Excel date number format. */
  hasDateFormat: boolean;
}

export interface ParsedDate {
  /** ISO calendar date, `YYYY-MM-DD`. */
  iso: string;
  /** How the value was interpreted; useful for diagnostics. */
  source: 'excel-serial' | 'date-object' | 'iso-string' | 'written-date';
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** Builds `YYYY-MM-DD`, validating that the date really exists. */
function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    // Rejects impossible dates such as 31/02/2026.
    return null;
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Expands Excel's two-digit-year rule. */
function expandYear(rawYear: number, digits: number): number {
  if (digits >= 3) {
    return rawYear;
  }
  return rawYear <= 68 ? 2000 + rawYear : 1900 + rawYear;
}

/** Converts an Excel serial number through SheetJS' own date decoder. */
function parseExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < EXCEL_SERIAL_MIN || serial > EXCEL_SERIAL_MAX) {
    return null;
  }
  const parts = XLSX.SSF.parse_date_code(serial) as { y: number; m: number; d: number } | null;
  if (!parts) {
    return null;
  }
  return toIso(parts.y, parts.m, parts.d);
}

/** Reads the calendar components of a JavaScript Date in local time. */
function parseDateObject(value: Date): string | null {
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return toIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/** Parses the written date formats the application understands. */
function parseDateString(rawValue: string): string | null {
  const text = rawValue.replace(/[\s\u00A0\u202F\u2007]+/g, ' ').trim();
  if (text.length === 0) {
    return null;
  }

  // ISO styles with an explicit year first: 2026-09-25, 2026/09/25, timestamps.
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\t ].*)?$/.exec(text);
  if (isoMatch) {
    return toIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // Day-first written dates: 25/09/2026, 25-9-26, 25.09.2026.
  const dayFirstMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const yearText = dayFirstMatch[3] ?? '';
    const year = expandYear(Number(yearText), yearText.length);
    return toIso(year, month, day);
  }

  // Month names: "25 Sep 2026", "25-Sep-2026", "Sep 25, 2026", "25 September 2026".
  const dayMonthName = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{2,4})$/.exec(text);
  if (dayMonthName) {
    const month = MONTHS[(dayMonthName[2] ?? '').toLowerCase()];
    const yearText = dayMonthName[3] ?? '';
    if (month !== undefined) {
      return toIso(expandYear(Number(yearText), yearText.length), month, Number(dayMonthName[1]));
    }
    return null;
  }

  const monthNameDay = /^([A-Za-z]{3,9})[-\s](\d{1,2})[-\s,]+(\d{2,4})$/.exec(text);
  if (monthNameDay) {
    const month = MONTHS[(monthNameDay[1] ?? '').toLowerCase()];
    const yearText = monthNameDay[3] ?? '';
    if (month !== undefined) {
      return toIso(expandYear(Number(yearText), yearText.length), month, Number(monthNameDay[2]));
    }
    return null;
  }

  return null;
}

/**
 * Normalizes one Date cell.
 * Returns `null` when the value cannot be interpreted reliably.
 */
export function parseDateCell(cell: DateCell): ParsedDate | null {
  const { value, hasDateFormat } = cell;

  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    const iso = parseDateObject(value);
    return iso ? { iso, source: 'date-object' } : null;
  }

  if (typeof value === 'number') {
    if (hasDateFormat) {
      const iso = parseExcelSerial(value);
      return iso ? { iso, source: 'excel-serial' } : null;
    }
    // A plain number inside the Date column is still an Excel serial date;
    // values outside the serial range (e.g. 20260925) are reported as invalid.
    const iso = parseExcelSerial(value);
    return iso ? { iso, source: 'excel-serial' } : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const isoDirect = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\t ].*)?$/.test(value.trim());
  const iso = parseDateString(value);
  if (!iso) {
    return null;
  }
  return { iso, source: isoDirect ? 'iso-string' : 'written-date' };
}
