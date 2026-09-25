import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DATA_QUALITY_CATEGORIES,
  DUPLICATE_NOTICE,
  EMPTY_ANALYTICS,
  UNKNOWN_PAYMENT_MODE_LABEL,
  analyzeRecords,
  collectDataQualityRecords,
  collectDuplicateRecords,
  type AnalyticsReport,
  type DataQualityCategoryId,
} from '@/domain/analytics';
import { useDataset } from '@/state/DatasetProvider';
import { useFilters } from '@/state/FilterProvider';
import { formatCount } from '@/utils/format';
import type { TransactionRecord } from '@shared/import';

/**
 * Analytics and inspection state.
 *
 * The reports are derived once per record set and memoized: the dashboard, the
 * breakdowns, the data quality panel and the duplicate list all read the same
 * objects, so no card recomputes a total on its own. Analytics never mutate the
 * records and never touch the workbook.
 *
 * An inspection is a view state only: it points at records that are already in
 * memory, it never edits them, and it never touches the filters the user applied.
 */

export type InspectionKind = 'data-quality' | 'duplicates';

export interface InspectionState {
  kind: InspectionKind;
  /** Quality category id, duplicate group id, or `null` for all groups. */
  key: string | null;
  /** Heading of the inspection view. */
  title: string;
  /** What the user is looking at, in plain language. */
  description: string;
  /** Records shown in the existing table while inspecting. */
  records: readonly TransactionRecord[];
}

export type SessionStateId =
  | 'no-workbook'
  | 'workbook-loaded'
  | 'filters-active'
  | 'zero-results'
  | 'data-quality-inspection'
  | 'duplicate-inspection';

export interface SessionState {
  id: SessionStateId;
  /** Short, unambiguous label for the session chip. */
  label: string;
  /** One sentence describing what the user is looking at. */
  description: string;
  tone: 'neutral' | 'accent' | 'warning';
}

export interface AnalyticsContextValue {
  /** Report over every imported record. */
  datasetReport: AnalyticsReport;
  /** Report over the records currently on screen: the matches, or the dataset. */
  activeReport: AnalyticsReport;
  /** Records the active report describes (the filtered matches or the dataset). */
  activeRecords: readonly TransactionRecord[];
  isFiltered: boolean;
  /** Set when the analytics could not be computed; the data stays untouched. */
  error: string | null;
  session: SessionState;
  inspection: InspectionState | null;
  inspectQualityCategory: (categoryId: DataQualityCategoryId) => void;
  inspectDuplicateGroup: (groupId: string | null) => void;
  endInspection: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

/** Shared empty list so the no-workbook case never allocates. */
const NO_RECORDS: readonly TransactionRecord[] = [];

/**
 * Runs the analytics without ever breaking the interface: on an unexpected
 * failure the technical detail is logged for development and the caller gets an
 * explicit error state instead of a crashed screen.
 */
function analyzeSafely(records: readonly TransactionRecord[]): {
  report: AnalyticsReport;
  error: string | null;
} {
  try {
    return { report: analyzeRecords(records), error: null };
  } catch (cause) {
    console.error('[analytics] the dataset report could not be computed', cause);
    return {
      report: EMPTY_ANALYTICS,
      error: 'The analytics could not be computed for this dataset. Your records are unchanged.',
    };
  }
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { dataset } = useDataset();
  const { result, isFiltered } = useFilters();
  const [inspection, setInspection] = useState<InspectionState | null>(null);

  const datasetRecords = dataset?.records ?? NO_RECORDS;
  const activeRecords = result.records;

  // One pass per record set, reused by every consumer. Without filters the
  // active report is the dataset report itself — no second scan, no second
  // object identity.
  const datasetOutcome = useMemo(() => analyzeSafely(datasetRecords), [datasetRecords]);
  const activeOutcome = useMemo(
    () => (isFiltered ? analyzeSafely(activeRecords) : datasetOutcome),
    [isFiltered, activeRecords, datasetOutcome],
  );

  // A different file or worksheet invalidates any inspection: the records it
  // pointed at no longer exist.
  useEffect(() => {
    setInspection(null);
  }, [dataset]);

  const inspectQualityCategory = useCallback(
    (categoryId: DataQualityCategoryId) => {
      const category = DATA_QUALITY_CATEGORIES.find((entry) => entry.id === categoryId);
      const records = collectDataQualityRecords(datasetRecords, categoryId);
      setInspection({
        kind: 'data-quality',
        key: categoryId,
        title: `Data Quality Inspection · ${category?.label ?? 'Records needing attention'}`,
        description: `${formatCount(records.length)} ${
          records.length === 1 ? 'record carries' : 'records carry'
        } this problem. The records are shown exactly as imported: nothing was changed, deleted or filtered out of your results.`,
        records,
      });
    },
    [datasetRecords],
  );

  const inspectDuplicateGroup = useCallback(
    (groupId: string | null) => {
      const groups = datasetOutcome.report.duplicates.groups;
      if (groupId) {
        const group = groups.find((entry) => entry.id === groupId);
        const records = collectDuplicateRecords(datasetRecords, groupId);
        setInspection({
          kind: 'duplicates',
          key: groupId,
          title: `Duplicate Inspection · Group ${groupId.replace(/^group-/, '')}`,
          description: `${
            group?.count ?? records.length
          } records match on all seven fields. ${DUPLICATE_NOTICE}`,
          records,
        });
        return;
      }
      const records = collectDuplicateRecords(datasetRecords);
      setInspection({
        kind: 'duplicates',
        key: null,
        title: 'Duplicate Inspection · All groups',
        description: `${
          groups.length === 1 ? '1 group contains' : `${formatCount(groups.length)} groups contain`
        } ${formatCount(records.length)} records. ${DUPLICATE_NOTICE}`,
        records,
      });
    },
    [datasetOutcome.report.duplicates.groups, datasetRecords],
  );

  const endInspection = useCallback(() => setInspection(null), []);

  const session = useMemo<SessionState>(() => {
    if (inspection) {
      return inspection.kind === 'data-quality'
        ? {
            id: 'data-quality-inspection',
            label: 'Data quality inspection',
            description: 'Inspecting records with quality problems. Your filters are untouched.',
            tone: 'warning',
          }
        : {
            id: 'duplicate-inspection',
            label: 'Duplicate inspection',
            description: 'Inspecting possible duplicates. No record has been removed.',
            tone: 'warning',
          };
    }
    if (!dataset) {
      return {
        id: 'no-workbook',
        label: 'No workbook loaded',
        description: 'Import an Excel workbook to see the analytics of this dataset.',
        tone: 'neutral',
      };
    }
    if (isFiltered && result.count === 0) {
      return {
        id: 'zero-results',
        label: 'No matching records',
        description:
          'The filters match none of the imported records. The dataset is still loaded — change or clear the filters.',
        tone: 'warning',
      };
    }
    if (isFiltered) {
      return {
        id: 'filters-active',
        label: 'Filters active',
        description: `${formatCount(result.count)} of ${formatCount(
          datasetRecords.length,
        )} imported records match the filters.`,
        tone: 'accent',
      };
    }
    return {
      id: 'workbook-loaded',
      label: 'Workbook loaded',
      description: `${formatCount(
        datasetRecords.length,
      )} records imported. No filters are applied, so every figure describes the whole dataset.`,
      tone: 'accent',
    };
  }, [dataset, datasetRecords.length, inspection, isFiltered, result.count]);

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      datasetReport: datasetOutcome.report,
      activeReport: activeOutcome.report,
      activeRecords: isFiltered ? activeRecords : datasetRecords,
      isFiltered,
      error: datasetOutcome.error ?? activeOutcome.error,
      session,
      inspection,
      inspectQualityCategory,
      inspectDuplicateGroup,
      endInspection,
    }),
    [
      datasetOutcome.error,
      datasetOutcome.report,
      activeOutcome.error,
      activeOutcome.report,
      activeRecords,
      datasetRecords,
      endInspection,
      inspectDuplicateGroup,
      inspectQualityCategory,
      inspection,
      isFiltered,
      session,
    ],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used inside <AnalyticsProvider>.');
  }
  return context;
}

export { UNKNOWN_PAYMENT_MODE_LABEL };
