/**
 * Monetary normalization — shared by the main process (Excel parsing) and the
 * renderer (filter inputs), so an amount typed into a filter is parsed by
 * exactly the same rules as an amount read from a workbook.
 *
 * Amounts are stored as an integer number of minor units (paise, ₹1 = 100).
 * Integers keep totals exact: adding `200000 + 50` can never produce the
 * floating point drift that `2000 + 0.5` can, which matters for the totals and
 * filters of the later stages.
 *
 * Accepted spellings include `2000`, `2000.00`, `"2,000"`, `"₹2,000"`,
 * `"₹ 2,000.00"`, `"Rs. 2000/-"` and parenthesised negatives `"(1,500)"`.
 * Indian digit grouping ("8,42,500") and plain grouping ("842,500") are both
 * read the same way: commas are thousand separators, a dot is the decimal point.
 */

const CURRENCY_PATTERN = /[₹$€£¥]|(?:\b(?:rs|inr|rupees?|rupaye)\b\.?)/gi;
const SPACE_PATTERN = /[\s\u00A0\u202F\u2007]/g;
const GROUPED_NUMBER_PATTERN = /^\d[\d,]*(?:\.\d+)?$/;
const MAX_SAFE_WHOLE_UNITS = Math.floor(Number.MAX_SAFE_INTEGER / 100);

/** Rounds a float amount (rupees) to integer minor units. */
function rupeesToMinorUnits(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (Math.abs(value) > MAX_SAFE_WHOLE_UNITS) {
    return null;
  }
  // Half-away-from-zero rounding keeps float noise (1999.9999999998) harmless.
  return Math.sign(value) * Math.round(Math.abs(value) * 100);
}

/** Converts a sanitized decimal string into integer minor units. */
function decimalStringToMinorUnits(integerPart: string, fractionPart: string): number | null {
  const whole = Number(integerPart);
  if (!Number.isFinite(whole) || Math.abs(whole) > MAX_SAFE_WHOLE_UNITS) {
    return null;
  }

  // Keep three fractional digits so values such as 0.005 can round up correctly.
  const fractionDigits = (fractionPart + '000').slice(0, 3);
  const fractionValue = Number(fractionDigits);
  if (!Number.isFinite(fractionValue)) {
    return null;
  }

  const hundredths = Math.floor(fractionValue / 10);
  const needsRounding = fractionValue % 10 >= 5;
  return whole * 100 + hundredths + (needsRounding ? 1 : 0);
}

/**
 * Normalizes one amount cell.
 * Returns `null` when the value is not a valid amount — never `0`, because an
 * invalid amount and a genuine ₹0 are different facts.
 */
export function parseAmountMinorUnits(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return rupeesToMinorUnits(value);
  }

  if (typeof value !== 'string') {
    // Booleans, dates and objects are not monetary values.
    return null;
  }

  let text = value.trim();
  if (text.length === 0) {
    return null;
  }

  let negative = false;
  const parenthesised = /^\((.*)\)$/.exec(text);
  if (parenthesised && parenthesised[1] !== undefined) {
    negative = true;
    text = parenthesised[1];
  }

  text = text.replace(CURRENCY_PATTERN, '').replace(SPACE_PATTERN, '');

  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  // A trailing "/-" is a common ledger shorthand for "only".
  text = text.replace(/\/-$/, '');

  if (!GROUPED_NUMBER_PATTERN.test(text)) {
    return null;
  }

  const withoutGrouping = text.replace(/,/g, '');
  const [integerPart = '', fractionPart = ''] = withoutGrouping.split('.');
  if (!/^\d+$/.test(integerPart)) {
    return null;
  }
  if (fractionPart.length > 0 && !/^\d+$/.test(fractionPart)) {
    return null;
  }

  const minorUnits = decimalStringToMinorUnits(integerPart, fractionPart);
  if (minorUnits === null) {
    return null;
  }
  return negative ? -minorUnits : minorUnits;
}

/** True when the parsed amount is exactly zero rupees. */
export function isZeroAmount(minorUnits: number | null): boolean {
  return minorUnits === 0;
}
