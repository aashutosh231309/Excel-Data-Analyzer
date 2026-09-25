import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useDataset } from '@/state/DatasetProvider';
import {
  EMPTY_FILTER_HINT,
  EMPTY_FILTER_TITLE,
  clearFilterField,
  collectNameOptions,
  createEmptyFilterState,
  deriveFilteredResult,
  describeFilterChips,
  draftFromFilterValues,
  errorsByField,
  isEmptyFilterValues,
  serializeFilterValues,
  todayIsoDate,
  validateFilterState,
  yesterdayIsoDate,
  type AmountMode,
  type FilterChip,
  type FilterError,
  type FilterErrorField,
  type FilterField,
  type FilterState,
  type FilterValues,
  type FilteredResult,
} from '@/domain/filtering';
import type { TransactionRecord } from '@shared/import';

/**
 * Filter state and the filtered result set.
 *
 * The typed filters live here (not in the screen) so the panel, the results
 * summary, the table and the dashboard tiles all read the same numbers. The
 * expensive part — comparing every record — runs only when the filters are
 * applied, on a chip removal or when the dataset changes: never on a keystroke.
 */
export interface FilterContextValue {
  /** Panel input; editing it never re-runs the filter by itself. */
  draft: FilterState;
  /** Problems with the current input, shown next to the fields. */
  errors: FilterError[];
  errorFor: Partial<Record<FilterErrorField, string>>;
  /** Populated categories in the draft (0–4). */
  activeCount: number;
  /** True while an input is invalid, so the filter cannot be run. */
  blocked: boolean;
  /** True while a workbook is being imported: the filters wait for the data. */
  isBusy: boolean;
  /** Filters that are in effect right now, or `null` when unfiltered. */
  applied: FilterValues | null;
  isFiltered: boolean;
  hasPendingChanges: boolean;
  /** The single authoritative result set everything else derives from. */
  result: FilteredResult;
  chips: FilterChip[];
  /** Names available in the current dataset, for the searchable selector. */
  nameOptions: string[];
  updateDraft: (patch: Partial<FilterState>) => void;
  setDate: (date: string | null) => void;
  useToday: () => void;
  useYesterday: () => void;
  setAmountMode: (mode: AmountMode) => void;
  applyFilters: () => boolean;
  clearFilters: () => void;
  removeFilter: (field: FilterField) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

/** Shared empty array so the unfiltered case never allocates a new one. */
const EMPTY_RECORDS: readonly TransactionRecord[] = [];

export function FilterProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const { dataset, isBusy } = useDataset();

  const [draft, setDraft] = useState<FilterState>(createEmptyFilterState);
  const [applied, setApplied] = useState<FilterValues | null>(null);
  const [errors, setErrors] = useState<FilterError[]>([]);

  const records: readonly TransactionRecord[] = dataset?.records ?? EMPTY_RECORDS;

  // A different file or worksheet means different records: stale filters would
  // silently describe the previous dataset, so they are reset with it.
  useEffect(() => {
    setDraft(createEmptyFilterState());
    setApplied(null);
    setErrors([]);
  }, [dataset]);

  const draftValidation = useMemo(() => validateFilterState(draft), [draft]);

  // Inline feedback follows the typed input immediately; the toast repeats it
  // when a blocked filter is submitted.
  const blockingErrors = errors.length > 0 ? errors : draftValidation.errors;
  const errorFor = useMemo(() => errorsByField(blockingErrors), [blockingErrors]);

  const result = useMemo(() => deriveFilteredResult(records, applied), [records, applied]);

  const chips = useMemo(() => (applied === null ? [] : describeFilterChips(applied)), [applied]);

  const nameOptions = useMemo(() => collectNameOptions(records), [records]);

  const hasPendingChanges = useMemo(
    () => serializeFilterValues(draftValidation.values) !== serializeFilterValues(applied),
    [draftValidation.values, applied],
  );

  const updateDraft = useCallback((patch: Partial<FilterState>) => {
    setErrors([]);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const setDate = useCallback(
    (date: string | null) => {
      updateDraft({ date });
    },
    [updateDraft],
  );

  const useToday = useCallback(() => {
    updateDraft({ date: todayIsoDate() });
  }, [updateDraft]);

  const useYesterday = useCallback(() => {
    updateDraft({ date: yesterdayIsoDate() });
  }, [updateDraft]);

  const setAmountMode = useCallback(
    (mode: AmountMode) => {
      updateDraft({ amountMode: mode });
    },
    [updateDraft],
  );

  const applyFilters = useCallback((): boolean => {
    const validation = validateFilterState(draft);
    if (validation.errors.length > 0) {
      setErrors(validation.errors);
      const first = validation.errors[0];
      notify({
        variant: 'error',
        title: 'Filters were not applied',
        description: first?.message ?? 'Please correct the highlighted filter.',
      });
      return false;
    }
    if (validation.values === null) {
      setErrors([]);
      // Nothing to filter on: the whole dataset is never shown as a "result".
      notify({ variant: 'warning', title: EMPTY_FILTER_TITLE, description: EMPTY_FILTER_HINT });
      return false;
    }
    setErrors([]);
    setApplied(validation.values);
    return true;
  }, [draft, notify]);

  const clearFilters = useCallback(() => {
    setDraft(createEmptyFilterState());
    setApplied(null);
    setErrors([]);
    notify({
      variant: 'info',
      title: 'Filters cleared',
      description: 'No filters are applied — every imported record is shown again.',
    });
  }, [notify]);

  const removeFilter = useCallback(
    (field: FilterField) => {
      setErrors([]);
      if (applied === null) {
        return;
      }
      const next = clearFilterField(applied, field);
      if (isEmptyFilterValues(next)) {
        setApplied(null);
        setDraft(createEmptyFilterState());
        return;
      }
      setApplied(next);
      setDraft(draftFromFilterValues(next));
    },
    [applied],
  );

  const value = useMemo<FilterContextValue>(
    () => ({
      draft,
      errors: blockingErrors,
      errorFor,
      activeCount: draftValidation.activeCount,
      blocked: draftValidation.errors.length > 0,
      isBusy,
      applied,
      isFiltered: applied !== null,
      hasPendingChanges,
      result,
      chips,
      nameOptions,
      updateDraft,
      setDate,
      useToday,
      useYesterday,
      setAmountMode,
      applyFilters: () => !isBusy && applyFilters(),
      clearFilters,
      removeFilter,
    }),
    [
      draft,
      blockingErrors,
      errorFor,
      draftValidation.activeCount,
      draftValidation.errors.length,
      applied,
      hasPendingChanges,
      result,
      chips,
      nameOptions,
      updateDraft,
      setDate,
      useToday,
      useYesterday,
      setAmountMode,
      isBusy,
      applyFilters,
      clearFilters,
      removeFilter,
    ],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used inside <FilterProvider>.');
  }
  return context;
}
