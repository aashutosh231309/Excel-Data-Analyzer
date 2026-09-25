/**
 * Filtering engine.
 *
 * Pure functions only: no React, no DOM and no I/O, so the rules can be tested
 * on their own and reused by the interface. Filtering always runs over the
 * normalized records that are already in memory — the workbook is never read,
 * parsed or re-normalized again for a filter, and the source file is never
 * touched.
 *
 * Comparison rules reuse the Stage 2 normalization exactly:
 *   - names      → whitespace collapsed, compared case-insensitively
 *   - vehicles   → display uppercased with separators removed (`vehicleKey`)
 *   - dates      → the ISO `YYYY-MM-DD` value produced during import
 *   - amounts    → integer minor units (paise), parsed by the shared money rules
 *
 * An invalid amount stays `null` and simply never satisfies an amount filter; it
 * is never treated as ₹0.
 */
import { parseAmountMinorUnits } from '@shared/money';
import { collapseWhitespace, createVehicleKey, normalizePersonName, normalizeVehicleDisplay } from '@shared/text';
import type { TransactionRecord } from '@shared/import';
import { formatAmountMinor, formatDateIso } from '@/utils/format';

export const AMOUNT_MODES = ['exact', 'range'] as const;
export type AmountMode = (typeof AMOUNT_MODES)[number];

/** The four filter categories of this stage. */
export const FILTER_FIELDS = ['date', 'name', 'vehicleNumber', 'amount'] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

/** What the user has typed into the filter panel. */
export interface FilterState {
  /** Single calendar day, ISO `YYYY-MM-DD` (never a range, never UTC-shifted). */
  date: string | null;
  name: string;
  vehicleNumber: string;
  amountMode: AmountMode;
  exactAmount: string;
  minAmount: string;
  maxAmount: string;
}

export function createEmptyFilterState(): FilterState {
  return {
    date: null,
    name: '',
    vehicleNumber: '',
    amountMode: 'exact',
    exactAmount: '',
    minAmount: '',
    maxAmount: '',
  };
}

/** Exact amount: `amount === exactMinor`. */
export interface AmountConstraintExact {
  mode: 'exact';
  exactMinor: number;
}

/** Range amount: open-ended on either side (`minMinor`/`maxMinor` may be null). */
export interface AmountConstraintRange {
  mode: 'range';
  minMinor: number | null;
  maxMinor: number | null;
}

export type AmountConstraint = AmountConstraintExact | AmountConstraintRange;

/**
 * Validated filter values, ready for comparison. Every field is optional; at
 * least one is always set because an empty filter set is rejected before it
 * reaches this shape.
 */
export interface FilterValues {
  date: string | null;
  /** Case-insensitive name key, e.g. `raj kumar`. */
  nameKey: string | null;
  /** Name as typed, for the summary chips. */
  nameLabel: string | null;
  /** Comparison key of the vehicle registration, e.g. `UP32AB1234`. */
  vehicleKey: string | null;
  /** Vehicle registration as typed, for the summary chips. */
  vehicleLabel: string | null;
  amount: AmountConstraint | null;
}

export type FilterErrorField = FilterField | 'exactAmount' | 'minAmount' | 'maxAmount' | 'form';

export interface FilterError {
  field: FilterErrorField;
  message: string;
}

export interface FilterValidation {
  /** Machine values to filter with, or `null` when nothing is set. */
  values: FilterValues | null;
  /** Blocking problems; while any exist the filters must not be applied. */
  errors: FilterError[];
  /** Number of populated categories (0–4); the amount block counts once. */
  activeCount: number;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export const EMPTY_FILTER_TITLE = 'Please provide at least one filter.';
export const EMPTY_FILTER_HINT = 'Add at least one filter to search the data.';
export const RANGE_ORDER_MESSAGE = 'Minimum amount cannot be greater than maximum amount.';
export const INVALID_DATE_MESSAGE = 'Enter a valid date as DD/MM/YYYY.';
export const INVALID_VEHICLE_MESSAGE = 'Enter a vehicle number, for example UP32AB1234.';

export function invalidAmountMessage(raw: string): string {
  return `"${raw}" is not a valid amount. Use a number such as 2000, 2,000 or ₹2,000.`;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Comparison key for a name: whitespace collapsed, case-insensitive. */
export function createNameKey(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

/** Comparison key for a vehicle registration, reusing the Stage 2 rules. */
export function vehicleComparisonKey(record: TransactionRecord): string {
  return record.vehicleKey || createVehicleKey(normalizeVehicleDisplay(record.vehicleNumber));
}

/** Cached `Intl` formatter for short weekday-free dates is not needed: ISO only. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Local calendar date as `YYYY-MM-DD`.
 * Built from the local year/month/day parts, so the value can never be shifted
 * by the UTC offset the way `toISOString()` can.
 */
export function toLocalIsoDate(date: Date): string {
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

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Turns the panel input into machine values, collecting blocking errors.
 *
 * A field only counts as a filter when it actually carries a value: a blank
 * name, an empty vehicle box or untouched amount inputs are simply not filters.
 */
export function validateFilterState(state: FilterState): FilterValidation {
  const errors: FilterError[] = [];
  let activeCount = 0;

  let date: string | null = null;
  const rawDate = state.date?.trim() ?? '';
  if (rawDate.length > 0) {
    if (isIsoDate(rawDate)) {
      date = rawDate;
      activeCount += 1;
    } else {
      errors.push({ field: 'date', message: INVALID_DATE_MESSAGE });
    }
  }

  const nameLabel = normalizePersonName(state.name);
  const nameKey = nameLabel.length > 0 ? createNameKey(nameLabel) : null;
  if (nameKey !== null) {
    activeCount += 1;
  }

  const vehicleLabel = normalizeVehicleDisplay(state.vehicleNumber);
  let vehicleKey: string | null = null;
  if (vehicleLabel.length > 0) {
    vehicleKey = createVehicleKey(vehicleLabel);
    if (vehicleKey.length === 0) {
      vehicleKey = null;
      errors.push({ field: 'vehicleNumber', message: INVALID_VEHICLE_MESSAGE });
    } else {
      activeCount += 1;
    }
  }

  let amount: AmountConstraint | null = null;
  if (state.amountMode === 'exact') {
    const raw = state.exactAmount.trim();
    if (raw.length > 0) {
      const exactMinor = parseAmountMinorUnits(raw);
      if (exactMinor === null) {
        errors.push({ field: 'exactAmount', message: invalidAmountMessage(raw) });
      } else {
        amount = { mode: 'exact', exactMinor };
        activeCount += 1;
      }
    }
  } else {
    const rawMin = state.minAmount.trim();
    const rawMax = state.maxAmount.trim();
    let minMinor: number | null = null;
    let maxMinor: number | null = null;

    if (rawMin.length > 0) {
      const parsed = parseAmountMinorUnits(rawMin);
      if (parsed === null) {
        errors.push({ field: 'minAmount', message: invalidAmountMessage(rawMin) });
      } else {
        minMinor = parsed;
      }
    }
    if (rawMax.length > 0) {
      const parsed = parseAmountMinorUnits(rawMax);
      if (parsed === null) {
        errors.push({ field: 'maxAmount', message: invalidAmountMessage(rawMax) });
      } else {
        maxMinor = parsed;
      }
    }
    if (minMinor !== null && maxMinor !== null && minMinor > maxMinor) {
      errors.push({ field: 'form', message: RANGE_ORDER_MESSAGE });
    }
    if (minMinor !== null || maxMinor !== null) {
      amount = { mode: 'range', minMinor, maxMinor };
      activeCount += 1;
    }
  }

  // Labels only exist for the categories that are actually populated, so an
  // untouched input never produces an empty chip.
  const values: FilterValues | null =
    activeCount === 0
      ? null
      : {
          date,
          nameKey,
          nameLabel: nameKey === null ? null : nameLabel,
          vehicleKey,
          vehicleLabel: vehicleKey === null ? null : vehicleLabel,
          amount,
        };

  return { values, errors, activeCount };
}

/** Error messages keyed by the input they belong next to. */
export function errorsByField(errors: readonly FilterError[]): Partial<Record<FilterErrorField, string>> {
  const byField: Partial<Record<FilterErrorField, string>> = {};
  for (const error of errors) {
    if (byField[error.field] === undefined) {
      byField[error.field] = error.message;
    }
  }
  return byField;
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                    */
/* -------------------------------------------------------------------------- */

function matchesAmount(amountMinor: number | null, constraint: AmountConstraint): boolean {
  // An unreadable amount never satisfies an amount filter and never equals ₹0.
  if (amountMinor === null) {
    return false;
  }
  if (constraint.mode === 'exact') {
    return amountMinor === constraint.exactMinor;
  }
  if (constraint.minMinor !== null && amountMinor < constraint.minMinor) {
    return false;
  }
  if (constraint.maxMinor !== null && amountMinor > constraint.maxMinor) {
    return false;
  }
  return true;
}

/**
 * One record against the validated filters. Every populated category must match
 * (AND) — categories are never combined with OR, and a category that is not set
 * does not restrict anything.
 */
export function matchesFilterValues(record: TransactionRecord, values: FilterValues): boolean {
  if (values.date !== null && record.date !== values.date) {
    return false;
  }
  if (values.nameKey !== null && createNameKey(record.name) !== values.nameKey) {
    return false;
  }
  if (values.vehicleKey !== null && vehicleComparisonKey(record) !== values.vehicleKey) {
    return false;
  }
  if (values.amount !== null && !matchesAmount(record.amountMinor, values.amount)) {
    return false;
  }
  return true;
}

/**
 * The authoritative filtered result set.
 *
 * Records keep their imported order, stay separate (duplicates are never merged)
 * and are shared with the dataset rather than cloned.
 */
export function filterRecords(
  records: readonly TransactionRecord[],
  values: FilterValues,
): readonly TransactionRecord[] {
  const matched: TransactionRecord[] = [];
  for (const record of records) {
    if (matchesFilterValues(record, values)) {
      matched.push(record);
    }
  }
  return matched;
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

export interface RecordSummary {
  /** Matching records, including those without a usable amount. */
  count: number;
  /** Matching records that carry a valid amount. */
  amountRecords: number;
  /** Sum of the valid amounts, in integer paise. */
  totalAmountMinor: number;
  /** Mean of the valid amounts, in integer paise; `null` when there is none. */
  averageAmountMinor: number | null;
}

/**
 * Totals over one set of records.
 * Integer paise are added directly (no formatted strings, no float rupees), and
 * records without a valid amount stay out of the sum instead of counting as ₹0.
 */
export function summarizeRecords(records: readonly TransactionRecord[]): RecordSummary {
  let amountRecords = 0;
  let totalAmountMinor = 0;
  for (const record of records) {
    if (record.amountMinor === null) {
      continue;
    }
    amountRecords += 1;
    totalAmountMinor += record.amountMinor;
  }
  return {
    count: records.length,
    amountRecords,
    totalAmountMinor,
    averageAmountMinor: amountRecords === 0 ? null : Math.round(totalAmountMinor / amountRecords),
  };
}

export interface FilteredResult extends RecordSummary {
  /** Records to display: the matches, or the imported records when unfiltered. */
  records: readonly TransactionRecord[];
  /** True once at least one filter is applied. */
  isFiltered: boolean;
}

/**
 * Single entry point the interface uses: with no filters the imported records
 * are returned untouched (same array identity), otherwise exactly the matches.
 */
export function deriveFilteredResult(
  records: readonly TransactionRecord[],
  values: FilterValues | null,
): FilteredResult {
  if (values === null) {
    return { records, isFiltered: false, ...summarizeRecords(records) };
  }
  const matched = filterRecords(records, values);
  return { records: matched, isFiltered: true, ...summarizeRecords(matched) };
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                       */
/* -------------------------------------------------------------------------- */

export interface FilterChip {
  field: FilterField;
  /** Short description, e.g. `Date: 25/09/2026`. */
  label: string;
}

/** Compact, removable summary of the filters that are currently applied. */
export function describeFilterChips(values: FilterValues): FilterChip[] {
  const chips: FilterChip[] = [];
  if (values.date !== null) {
    chips.push({ field: 'date', label: `Date: ${formatDateIso(values.date)}` });
  }
  if (values.nameLabel !== null) {
    chips.push({ field: 'name', label: `Name: ${values.nameLabel}` });
  }
  if (values.vehicleLabel !== null) {
    chips.push({ field: 'vehicleNumber', label: `Vehicle: ${values.vehicleLabel}` });
  }
  if (values.amount?.mode === 'exact') {
    chips.push({ field: 'amount', label: `Amount: ${formatAmountMinor(values.amount.exactMinor)}` });
  } else if (values.amount?.mode === 'range') {
    const { minMinor, maxMinor } = values.amount;
    if (minMinor !== null && maxMinor !== null) {
      chips.push({ field: 'amount', label: `Amount: ${formatAmountMinor(minMinor)} – ${formatAmountMinor(maxMinor)}` });
    } else if (minMinor !== null) {
      chips.push({ field: 'amount', label: `Amount: ${formatAmountMinor(minMinor)} or more` });
    } else if (maxMinor !== null) {
      chips.push({ field: 'amount', label: `Amount: up to ${formatAmountMinor(maxMinor)}` });
    }
  }
  return chips;
}

/** Clears one category of an applied filter set (used by the chip buttons). */
export function clearFilterField(values: FilterValues, field: FilterField): FilterValues {
  const next: FilterValues = { ...values };
  switch (field) {
    case 'date':
      next.date = null;
      break;
    case 'name':
      next.nameKey = null;
      next.nameLabel = null;
      break;
    case 'vehicleNumber':
      next.vehicleKey = null;
      next.vehicleLabel = null;
      break;
    case 'amount':
      next.amount = null;
      break;
  }
  return next;
}

/** True when nothing is left to filter on, i.e. the filters became empty. */
export function isEmptyFilterValues(values: FilterValues): boolean {
  return (
    values.date === null &&
    values.nameKey === null &&
    values.vehicleKey === null &&
    values.amount === null
  );
}

/* -------------------------------------------------------------------------- */
/* Draft ⇄ values                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Plain, grouping-free number for an amount input (`200000` → `2000`,
 * `200050` → `2000.50`). Never a currency string, so it round-trips through the
 * amount parser unchanged.
 */
export function amountMinorToInputValue(minorUnits: number): string {
  const sign = minorUnits < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(minorUnits));
  const rupees = Math.trunc(absolute / 100);
  const paise = absolute % 100;
  return paise === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${String(paise).padStart(2, '0')}`;
}

/**
 * Rebuilds panel input from applied values, so removing a chip and clearing the
 * filters keep the visible inputs in step with the filters that are in effect.
 */
export function draftFromFilterValues(values: FilterValues): FilterState {
  const state = createEmptyFilterState();
  state.date = values.date;
  state.name = values.nameLabel ?? '';
  state.vehicleNumber = values.vehicleLabel ?? '';
  if (values.amount?.mode === 'exact') {
    state.amountMode = 'exact';
    state.exactAmount = amountMinorToInputValue(values.amount.exactMinor);
  } else if (values.amount?.mode === 'range') {
    state.amountMode = 'range';
    state.minAmount = values.amount.minMinor === null ? '' : amountMinorToInputValue(values.amount.minMinor);
    state.maxAmount = values.amount.maxMinor === null ? '' : amountMinorToInputValue(values.amount.maxMinor);
  }
  return state;
}

/** Stable comparison key for a filter set, used to detect unapplied edits. */
export function serializeFilterValues(values: FilterValues | null): string {
  if (values === null) {
    return '';
  }
  return JSON.stringify([values.date, values.nameKey, values.vehicleKey, values.amount]);
}

/* -------------------------------------------------------------------------- */
/* Name options                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Names available in the current dataset, deduplicated case-insensitively and
 * sorted for the combobox. The first spelling encountered wins, so the list
 * shows the names as they were imported.
 */
export function collectNameOptions(records: readonly TransactionRecord[]): string[] {
  const byKey = new Map<string, string>();
  for (const record of records) {
    const label = normalizePersonName(record.name);
    if (label.length === 0) {
      continue;
    }
    const key = label.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, label);
    }
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right));
}

/** Narrows name options with a partial, case-insensitive query. */
export function filterNameOptions(options: readonly string[], query: string): string[] {
  const term = createNameKey(query);
  if (term.length === 0) {
    return [...options];
  }
  return options.filter((option) => createNameKey(option).includes(term));
}
