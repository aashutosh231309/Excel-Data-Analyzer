/**
 * Pagination maths.
 *
 * Pure helpers that decide which page buttons are shown, so a result set with
 * hundreds of pages never renders hundreds of buttons.
 */

/** A page number, or a gap in the numbering. */
export type PageWindowEntry = number | 'ellipsis';

/** Largest number of buttons a pagination row renders before using gaps. */
export const PAGE_WINDOW_MAX_BUTTONS = 9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compact page list for the footer.
 *
 * The first and the last page are always reachable, the pages around the
 * current one stay clickable, and everything in between collapses into a single
 * `ellipsis` entry.
 */
export function buildPageWindow(
  currentPage: number,
  pageCount: number,
  maxButtons: number = PAGE_WINDOW_MAX_BUTTONS,
): PageWindowEntry[] {
  if (pageCount <= 0) {
    return [];
  }
  const limit = Math.max(5, maxButtons);
  if (pageCount <= limit) {
    return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  }

  const current = clamp(currentPage, 1, pageCount);
  // First and last page are reserved, and up to two gaps may be inserted.
  const runLength = Math.max(3, limit - 4);
  let start = clamp(current - Math.floor(runLength / 2), 2, pageCount - 1 - (runLength - 1));
  let end = start + runLength - 1;
  if (end > pageCount - 1) {
    end = pageCount - 1;
    start = Math.max(2, end - runLength + 1);
  }

  const entries: PageWindowEntry[] = [1];
  if (start > 2) {
    entries.push('ellipsis');
  }
  for (let page = start; page <= end; page += 1) {
    entries.push(page);
  }
  if (end < pageCount - 1) {
    entries.push('ellipsis');
  }
  entries.push(pageCount);
  return entries;
}
