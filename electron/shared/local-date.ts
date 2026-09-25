/**
 * Local calendar helpers, shared by both processes.
 *
 * The application treats a filter day as the day the user sees on their own
 * computer, so every value here is built from the local year/month/day parts.
 * `toISOString()` is deliberately never used: it converts to UTC first, which
 * can move a date to the previous or next day depending on the offset.
 */

/** Local calendar date as `YYYY-MM-DD`. */
export function toLocalIsoDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today in the computer's local calendar. */
export function todayIsoDate(now: Date = new Date()): string {
  return toLocalIsoDate(now);
}

/** Yesterday in the computer's local calendar (month and year roll over). */
export function yesterdayIsoDate(now: Date = new Date()): string {
  return toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/**
 * Local calendar date as `DD-MM-YYYY`, the readable form used in file names
 * (safe on every file system, unlike the `YYYY-MM-DD` ISO form which is only
 * used internally).
 */
export function toLocalFileStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/** Today as `DD-MM-YYYY`, matching what the interface shows. */
export function todayFileStamp(now: Date = new Date()): string {
  return toLocalFileStamp(now);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when the text is a real `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
