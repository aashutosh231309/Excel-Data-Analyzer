/**
 * Analytics engine.
 *
 * Pure functions only: no React, no DOM, no Electron and no I/O, so every figure
 * on the dashboard can be tested on its own. Analytics always run over the
 * normalized records already in memory — the workbook is never read, parsed or
 * normalized again, and the source file is never modified.
 *
 * One pass over the records produces the import statistics, the payment mode
 * breakdown, the amount distribution, the data quality counters and the duplicate
 * signatures, so adding a card to the interface never adds another scan.
 *
 * Comparison rules reuse the Stage 2 normalization exactly:
 *   - names      → whitespace collapsed, compared case-insensitively
 *   - vehicles   → the Stage 2 comparison key (`vehicleKey`)
 *   - modes      → whitespace collapsed
 *   - dates      → the ISO `YYYY-MM-DD` value produced during import
 *   - amounts    → integer minor units (paise), exactly as imported
 */
import { collapseWhitespace } from '@shared/text';
import type { TransactionRecord } from '@shared/import';
import { createNameKey, vehicleComparisonKey } from '@/domain/filtering';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Rounds a ratio to one decimal, so every percentage on screen is consistent. */
export function percentageOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 1000) / 10;
}

function isBlankText(value: string): boolean {
  return value.trim() === '';
}

/* -------------------------------------------------------------------------- */
/* Payment mode breakdown                                                      */
/* -------------------------------------------------------------------------- */

/** Grouping label for records without a usable payment mode. Never dropped. */
export const UNKNOWN_PAYMENT_MODE_LABEL = 'Unknown / Missing';

export interface PaymentModeEntry {
  /** Normalized mode as stored on the record; `''` for the unknown group. */
  mode: string;
  /** Display label: the mode itself, or `Unknown / Missing`. */
  label: string;
  count: number;
  /** Share of the analysed records, in percent (one decimal). */
  percentage: number;
  /** Sum of the valid amounts in this group, in integer paise. */
  totalAmountMinor: number;
  /** Records in this group that carry a valid amount. */
  amountRecords: number;
  /** Mean valid amount of this group, or `null` when it has none. */
  averageAmountMinor: number | null;
}

/* -------------------------------------------------------------------------- */
/* Amount distribution                                                         */
/* -------------------------------------------------------------------------- */

export interface AmountBucketDefinition {
  id: string;
  label: string;
  /** Lower bound in paise; `null` means the bucket is open at the bottom. */
  minMinor: number | null;
  /** Upper bound in paise; `null` means the bucket is open at the top. */
  maxMinor: number | null;
}

/**
 * Application-defined analytical ranges. They exist to describe the shape of the
 * payments, not to classify them: nothing is stored back and no record is
 * changed by falling into a bucket.
 */
export const AMOUNT_BUCKETS: readonly AmountBucketDefinition[] = [
  { id: '0-499', label: '₹0 – ₹499', minMinor: null, maxMinor: 49_999 },
  { id: '500-999', label: '₹500 – ₹999', minMinor: 50_000, maxMinor: 99_999 },
  { id: '1000-4999', label: '₹1,000 – ₹4,999', minMinor: 100_000, maxMinor: 499_999 },
  { id: '5000-9999', label: '₹5,000 – ₹9,999', minMinor: 500_000, maxMinor: 999_999 },
  { id: '10000-plus', label: '₹10,000 and above', minMinor: 1_000_000, maxMinor: null },
];

export const AMOUNT_BUCKETS_NOTE =
  'Application-defined analytical ranges. Only records with a valid amount are counted; unreadable amounts are listed under data quality.';

export interface AmountBucketEntry extends AmountBucketDefinition {
  count: number;
  /** Share of the records with a valid amount, in percent (one decimal). */
  percentage: number;
  totalAmountMinor: number;
}

/** Index of the bucket an amount belongs to; negative values fall in the first. */
function amountBucketIndex(amountMinor: number): number {
  for (let index = 0; index < AMOUNT_BUCKETS.length; index += 1) {
    const bucket = AMOUNT_BUCKETS[index];
    if (!bucket) {
      continue;
    }
    const aboveMinimum = bucket.minMinor === null || amountMinor >= bucket.minMinor;
    if (aboveMinimum && (bucket.maxMinor === null || amountMinor <= bucket.maxMinor)) {
      return index;
    }
  }
  return AMOUNT_BUCKETS.length - 1;
}

/* -------------------------------------------------------------------------- */
/* Data quality                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The seven quality checks of a record. "Missing" means the cell carried no
 * value; "Invalid" means the value could not be interpreted during import (a
 * blank date or amount counts as not interpretable, never as zero).
 */
export const DATA_QUALITY_CATEGORIES = [
  { id: 'missingName', label: 'Missing Name', kind: 'missing' },
  { id: 'missingVehicleNumber', label: 'Missing Vehicle Number', kind: 'missing' },
  { id: 'missingPaymentMode', label: 'Missing Payment Mode', kind: 'missing' },
  { id: 'missingPaymentReason', label: 'Missing Payment Reason', kind: 'missing' },
  { id: 'missingRemark', label: 'Missing Remark', kind: 'missing' },
  { id: 'invalidDate', label: 'Invalid Date', kind: 'invalid' },
  { id: 'invalidAmount', label: 'Invalid Amount', kind: 'invalid' },
] as const;

export type DataQualityCategoryId = (typeof DATA_QUALITY_CATEGORIES)[number]['id'];

export interface DataQualityEntry {
  id: DataQualityCategoryId;
  label: string;
  count: number;
  /** Share of the imported records affected by this single problem. */
  percentage: number;
}

export interface DataQualitySummary {
  totalRecords: number;
  /** Records with at least one problem. A record is counted here only once. */
  affectedRecords: number;
  affectedPercentage: number;
  categories: readonly DataQualityEntry[];
}

/** True when the record carries the given problem, using the import rules. */
export function recordHasQualityProblem(
  record: TransactionRecord,
  categoryId: DataQualityCategoryId,
): boolean {
  switch (categoryId) {
    case 'missingName':
      return isBlankText(record.name);
    case 'missingVehicleNumber':
      return isBlankText(record.vehicleNumber);
    case 'missingPaymentMode':
      return isBlankText(record.paymentMode);
    case 'missingPaymentReason':
      return isBlankText(record.paymentReason);
    case 'missingRemark':
      return isBlankText(record.remark);
    case 'invalidDate':
      return record.date === null;
    case 'invalidAmount':
      return record.amountMinor === null;
  }
}

/** All records affected by one quality problem, in workbook order. */
export function collectDataQualityRecords(
  records: readonly TransactionRecord[],
  categoryId: DataQualityCategoryId,
): TransactionRecord[] {
  return records.filter((record) => recordHasQualityProblem(record, categoryId));
}

/* -------------------------------------------------------------------------- */
/* Duplicates                                                                  */
/* -------------------------------------------------------------------------- */

export const DUPLICATE_NOTICE =
  'Possible duplicate records are informational only. No records have been removed.';

export interface DuplicateGroup {
  /** Deterministic identifier: `group-1`, `group-2`, … in workbook order. */
  id: string;
  /** Exact duplicate signature over the seven normalized fields. */
  signature: string;
  count: number;
  firstRowNumber: number;
  records: readonly TransactionRecord[];
  /** Key fields of the group, for the summary line. */
  date: string | null;
  name: string;
  vehicleNumber: string;
  paymentMode: string;
  amountMinor: number | null;
}

export interface DuplicateSummary {
  /** Groups of two or more records that are identical on all seven fields. */
  groupCount: number;
  /** Records taking part in at least one duplicate group. */
  recordCount: number;
  groups: readonly DuplicateGroup[];
}

/**
 * Exact duplicate signature over the seven normalized fields.
 *
 * The identity of a record is the value that was imported: the ISO date, the
 * normalized name, the Stage 2 vehicle comparison key, the normalized payment
 * mode, the amount in integer paise and the two free-text fields. Two records
 * that differ in any one of them are different records — no fuzzy matching, no
 * approximate text comparison and no amount tolerance.
 */
export function recordDuplicateSignature(record: TransactionRecord): string {
  return JSON.stringify([
    record.date ?? '',
    createNameKey(record.name),
    vehicleComparisonKey(record),
    collapseWhitespace(record.paymentMode).toUpperCase(),
    record.amountMinor === null ? '' : record.amountMinor,
    collapseWhitespace(record.paymentReason),
    collapseWhitespace(record.remark),
  ]);
}

/**
 * Records that take part in duplicates: one group when a group id is given, or
 * every record of every duplicate group. Workbook order is preserved.
 */
export function collectDuplicateRecords(
  records: readonly TransactionRecord[],
  groupId?: string,
): TransactionRecord[] {
  const groups = new Map<string, TransactionRecord[]>();
  for (const record of records) {
    const signature = recordDuplicateSignature(record);
    const group = groups.get(signature);
    if (group) {
      group.push(record);
    } else {
      groups.set(signature, [record]);
    }
  }

  if (groupId) {
    const ordered = [...groups.values()].filter((group) => group.length > 1);
    const index = Number.parseInt(groupId.replace(/^group-/, ''), 10);
    return Number.isFinite(index) && index >= 1 ? [...(ordered[index - 1] ?? [])] : [];
  }

  const duplicatedSignatures = new Set(
    [...groups.entries()].filter(([, group]) => group.length > 1).map(([signature]) => signature),
  );
  return records.filter((record) => duplicatedSignatures.has(recordDuplicateSignature(record)));
}

/* -------------------------------------------------------------------------- */
/* The report                                                                  */
/* -------------------------------------------------------------------------- */

export interface AnalyticsSummary {
  importedRecords: number;
  /** Records with a readable amount. */
  validAmountRecords: number;
  /** Records whose amount is blank or could not be interpreted. */
  invalidAmountRecords: number;
  /** Records whose date is blank or could not be interpreted. */
  invalidDateRecords: number;
  /** Records with at least one missing or invalid field. Counted once each. */
  incompleteRecords: number;
  /** Sum of the valid amounts, in integer paise. */
  totalAmountMinor: number;
  /** Mean valid amount, or `null` when no record carries a valid amount. */
  averageAmountMinor: number | null;
}

export interface AnalyticsReport {
  summary: AnalyticsSummary;
  paymentModes: readonly PaymentModeEntry[];
  amountBuckets: readonly AmountBucketEntry[];
  dataQuality: DataQualitySummary;
  duplicates: DuplicateSummary;
}

/** Report for an empty record set: every figure is honest about having no data. */
export const EMPTY_ANALYTICS: AnalyticsReport = {
  summary: {
    importedRecords: 0,
    validAmountRecords: 0,
    invalidAmountRecords: 0,
    invalidDateRecords: 0,
    incompleteRecords: 0,
    totalAmountMinor: 0,
    averageAmountMinor: null,
  },
  paymentModes: [],
  amountBuckets: AMOUNT_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
    percentage: 0,
    totalAmountMinor: 0,
  })),
  dataQuality: {
    totalRecords: 0,
    affectedRecords: 0,
    affectedPercentage: 0,
    categories: DATA_QUALITY_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      count: 0,
      percentage: 0,
    })),
  },
  duplicates: { groupCount: 0, recordCount: 0, groups: [] },
};

/**
 * The one analytics entry point: a single pass over one record set produces the
 * whole report. The same function serves the imported dataset and the filtered
 * result set, so both describe their records with identical rules.
 */
export function analyzeRecords(records: readonly TransactionRecord[]): AnalyticsReport {
  if (records.length === 0) {
    return EMPTY_ANALYTICS;
  }

  const modeCounts = new Map<string, { count: number; amountRecords: number; totalAmountMinor: number }>();
  const bucketCounts = AMOUNT_BUCKETS.map(() => 0);
  const bucketTotals = AMOUNT_BUCKETS.map(() => 0);
  const qualityCounts: Record<DataQualityCategoryId, number> = {
    missingName: 0,
    missingVehicleNumber: 0,
    missingPaymentMode: 0,
    missingPaymentReason: 0,
    missingRemark: 0,
    invalidDate: 0,
    invalidAmount: 0,
  };
  const signatures = new Map<string, TransactionRecord[]>();

  let validAmountRecords = 0;
  let invalidAmountRecords = 0;
  let invalidDateRecords = 0;
  let incompleteRecords = 0;
  let totalAmountMinor = 0;

  for (const record of records) {
    // --- payment mode -----------------------------------------------------
    const mode = collapseWhitespace(record.paymentMode);
    let modeEntry = modeCounts.get(mode);
    if (!modeEntry) {
      modeEntry = { count: 0, amountRecords: 0, totalAmountMinor: 0 };
      modeCounts.set(mode, modeEntry);
    }
    modeEntry.count += 1;

    // --- amounts ----------------------------------------------------------
    const amountMinor = record.amountMinor;
    if (amountMinor === null) {
      invalidAmountRecords += 1;
    } else {
      validAmountRecords += 1;
      totalAmountMinor += amountMinor;
      modeEntry.amountRecords += 1;
      modeEntry.totalAmountMinor += amountMinor;
      const bucketIndex = amountBucketIndex(amountMinor);
      bucketCounts[bucketIndex] = (bucketCounts[bucketIndex] ?? 0) + 1;
      bucketTotals[bucketIndex] = (bucketTotals[bucketIndex] ?? 0) + amountMinor;
    }

    // --- data quality -----------------------------------------------------
    // Every category is counted, but the record itself is remembered at most
    // once, so the affected-records figure never adds up the categories.
    let recordIncomplete = false;
    if (isBlankText(record.name)) {
      qualityCounts.missingName += 1;
      recordIncomplete = true;
    }
    if (isBlankText(record.vehicleNumber)) {
      qualityCounts.missingVehicleNumber += 1;
      recordIncomplete = true;
    }
    if (isBlankText(record.paymentMode)) {
      qualityCounts.missingPaymentMode += 1;
      recordIncomplete = true;
    }
    if (isBlankText(record.paymentReason)) {
      qualityCounts.missingPaymentReason += 1;
      recordIncomplete = true;
    }
    if (isBlankText(record.remark)) {
      qualityCounts.missingRemark += 1;
      recordIncomplete = true;
    }
    if (record.date === null) {
      qualityCounts.invalidDate += 1;
      invalidDateRecords += 1;
      recordIncomplete = true;
    }
    if (amountMinor === null) {
      qualityCounts.invalidAmount += 1;
      recordIncomplete = true;
    }
    if (recordIncomplete) {
      incompleteRecords += 1;
    }

    // --- duplicates -------------------------------------------------------
    const signature = recordDuplicateSignature(record);
    const group = signatures.get(signature);
    if (group) {
      group.push(record);
    } else {
      signatures.set(signature, [record]);
    }
  }

  const paymentModes: PaymentModeEntry[] = [...modeCounts.entries()]
    .map(([mode, entry]) => ({
      mode,
      label: mode === '' ? UNKNOWN_PAYMENT_MODE_LABEL : mode,
      count: entry.count,
      percentage: percentageOf(entry.count, records.length),
      totalAmountMinor: entry.totalAmountMinor,
      amountRecords: entry.amountRecords,
      averageAmountMinor:
        entry.amountRecords === 0 ? null : Math.round(entry.totalAmountMinor / entry.amountRecords),
    }))
    // Most frequent first; ties keep a stable, alphabetical order.
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const amountBuckets: AmountBucketEntry[] = AMOUNT_BUCKETS.map((bucket, index) => ({
    ...bucket,
    count: bucketCounts[index] ?? 0,
    percentage: percentageOf(bucketCounts[index] ?? 0, validAmountRecords),
    totalAmountMinor: bucketTotals[index] ?? 0,
  }));

  const duplicateGroups: DuplicateGroup[] = [];
  let duplicateRecordCount = 0;
  for (const [signature, group] of signatures) {
    if (group.length < 2) {
      continue;
    }
    duplicateRecordCount += group.length;
    const first = group[0];
    if (!first) {
      continue;
    }
    duplicateGroups.push({
      id: `group-${duplicateGroups.length + 1}`,
      signature,
      count: group.length,
      firstRowNumber: first.rowNumber,
      records: group,
      date: first.date,
      name: first.name,
      vehicleNumber: first.vehicleNumber,
      paymentMode: first.paymentMode,
      amountMinor: first.amountMinor,
    });
  }
  // Workbook order keeps the list stable between renders and between runs.
  duplicateGroups.sort((a, b) => a.firstRowNumber - b.firstRowNumber);

  return {
    summary: {
      importedRecords: records.length,
      validAmountRecords,
      invalidAmountRecords,
      invalidDateRecords,
      incompleteRecords,
      totalAmountMinor,
      averageAmountMinor:
        validAmountRecords === 0 ? null : Math.round(totalAmountMinor / validAmountRecords),
    },
    paymentModes,
    amountBuckets,
    dataQuality: {
      totalRecords: records.length,
      affectedRecords: incompleteRecords,
      affectedPercentage: percentageOf(incompleteRecords, records.length),
      categories: DATA_QUALITY_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        count: qualityCounts[category.id],
        percentage: percentageOf(qualityCounts[category.id], records.length),
      })),
    },
    duplicates: {
      groupCount: duplicateGroups.length,
      recordCount: duplicateRecordCount,
      groups: duplicateGroups,
    },
  };
}
