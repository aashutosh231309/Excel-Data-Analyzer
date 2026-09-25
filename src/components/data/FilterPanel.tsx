import type { ReactNode } from 'react';
import { CalendarDays, Eraser, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NameCombobox } from '@/components/data/NameCombobox';
import { useFilters } from '@/state/FilterProvider';
import {
  AMOUNT_MODES,
  EMPTY_FILTER_HINT,
  type AmountMode,
} from '@/domain/filtering';
import { cn } from '@/utils/cn';
import { formatDateIso } from '@/utils/format';

const FIELD_CLASSES =
  'h-10 rounded-field border bg-surface-elevated px-3 text-sm text-content placeholder:text-content-muted ' +
  'transition-colors duration-150 ease-smooth focus:outline-none focus:ring-2 focus:ring-accent/30';

const AMOUNT_MODE_LABELS: Record<AmountMode, string> = {
  exact: 'Exact amount',
  range: 'Amount range',
};

/**
 * Filter panel of the Data screen.
 *
 * Date, Name, Vehicle Number and Amount can be combined in any way — one, two,
 * three or all four — and every populated category has to match. Nothing runs
 * while typing: the records are filtered by `🔍 Filter Data`, by removing a chip
 * or by clearing the filters.
 */
export function FilterPanel() {
  const {
    draft,
    errorFor,
    errors,
    activeCount,
    blocked,
    isBusy,
    isFiltered,
    hasPendingChanges,
    chips,
    nameOptions,
    updateDraft,
    setDate,
    useToday,
    useYesterday,
    setAmountMode,
    applyFilters,
    clearFilters,
    removeFilter,
  } = useFilters();

  const formMessage = errors[0]?.message ?? null;
  const canClear = activeCount > 0 || isFiltered || errors.length > 0;
  const statusMessage =
    formMessage ??
    (hasPendingChanges
      ? 'Filters changed — press Filter Data to update the results.'
      : isFiltered
        ? `Filtering ${chips.length} of 4 filter categories.`
        : EMPTY_FILTER_HINT);

  return (
    <Card
      padding="lg"
      role="region"
      aria-label="Filters"
      className="flex animate-fade-up flex-col gap-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-content">Filters</h2>
          <p className="mt-1 text-xs text-content-muted">Find exactly the records you need</p>
        </div>
        <span
          aria-live="polite"
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium',
            isFiltered
              ? 'border-accent/30 bg-accent/10 text-content-secondary'
              : 'border-surface-border bg-surface-elevated text-content-muted',
          )}
        >
          {isFiltered
            ? `${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} applied`
            : 'No filters applied yet'}
        </span>
      </div>

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------------------------ */}
          {/* Date                                                               */}
          {/* ------------------------------------------------------------------ */}
          <FilterField
            label="Date"
            hint="One calendar day, read day first."
            htmlFor="filter-date"
            errorText={errorFor.date}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                  aria-hidden="true"
                />
                <input
                  id="filter-date"
                  type="date"
                  value={draft.date ?? ''}
                  onChange={(event) => setDate(event.target.value === '' ? null : event.target.value)}
                  className={cn(
                    FIELD_CLASSES,
                    'w-[11.5rem] pl-9 tabular-nums',
                    errorFor.date ? 'border-danger' : 'border-surface-border hover:border-accent/40',
                  )}
                  aria-invalid={errorFor.date !== undefined || undefined}
                  aria-describedby="filter-date-help"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={useToday}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={useYesterday}>
                Yesterday
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDate(null)} disabled={draft.date === null}>
                Clear
              </Button>
            </div>
            <p id="filter-date-help" className="text-[11px] text-content-muted">
              {draft.date === null
                ? 'No date selected — pick a day, or use Today / Yesterday.'
                : `Selected: ${formatDateIso(draft.date)} (DD/MM/YYYY)`}
            </p>
          </FilterField>

          {/* ------------------------------------------------------------------ */}
          {/* Name                                                               */}
          {/* ------------------------------------------------------------------ */}
          <FilterField
            label="Name"
            hint="Search the names found in this worksheet."
            htmlFor="filter-name"
            errorText={errorFor.name}
          >
            <NameCombobox
              value={draft.name}
              options={nameOptions}
              invalid={errorFor.name !== undefined}
              describedBy="filter-name-help"
              onChange={(text) => updateDraft({ name: text })}
              onSelect={(name) => updateDraft({ name })}
            />
            <p id="filter-name-help" className="text-[11px] text-content-muted">
              {nameOptions.length === 0
                ? 'This worksheet has no usable names to suggest.'
                : `${nameOptions.length} ${nameOptions.length === 1 ? 'name' : 'names'} available — type to narrow the list.`}
            </p>
          </FilterField>
        </div>

        {/* -------------------------------------------------------------------- */}
        {/* Vehicle number                                                        */}
        {/* -------------------------------------------------------------------- */}
        <FilterField
          label="Vehicle Number"
          hint="Separators and letter case are ignored: UP-32-AB-1234 matches UP32AB1234."
          htmlFor="filter-vehicle"
          errorText={errorFor.vehicleNumber}
        >
          <input
            id="filter-vehicle"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={draft.vehicleNumber}
            placeholder="UP32AB1234"
            onChange={(event) => updateDraft({ vehicleNumber: event.target.value })}
            className={cn(
              FIELD_CLASSES,
              'w-full tracking-wide',
              errorFor.vehicleNumber ? 'border-danger' : 'border-surface-border hover:border-accent/40',
            )}
            aria-invalid={errorFor.vehicleNumber !== undefined || undefined}
            aria-describedby="filter-vehicle-help"
          />
        </FilterField>

        {/* -------------------------------------------------------------------- */}
        {/* Amount                                                                */}
        {/* -------------------------------------------------------------------- */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-medium text-content-secondary">Amount</legend>
          <div
            role="radiogroup"
            aria-label="How the amount should match"
            className="inline-flex w-fit rounded-field border border-surface-border bg-surface-elevated p-1"
          >
            {AMOUNT_MODES.map((mode) => (
              <label
                key={mode}
                htmlFor={`filter-amount-mode-${mode}`}
                className={cn(
                  'cursor-pointer rounded-control px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-smooth',
                  'focus-within:ring-2 focus-within:ring-accent',
                  draft.amountMode === mode
                    ? 'bg-accent-gradient text-white'
                    : 'text-content-secondary hover:text-content',
                )}
              >
                <input
                  id={`filter-amount-mode-${mode}`}
                  type="radio"
                  name="filter-amount-mode"
                  value={mode}
                  checked={draft.amountMode === mode}
                  onChange={() => setAmountMode(mode)}
                  className="sr-only"
                />
                {AMOUNT_MODE_LABELS[mode]}
              </label>
            ))}
          </div>

          {draft.amountMode === 'exact' ? (
            <AmountInput
              id="filter-amount-exact"
              label="Exact amount"
              value={draft.exactAmount}
              placeholder="2000"
              errorText={errorFor.exactAmount}
              onChange={(text) => updateDraft({ exactAmount: text })}
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <AmountInput
                id="filter-amount-min"
                label="Minimum amount"
                value={draft.minAmount}
                placeholder="1000"
                errorText={errorFor.minAmount}
                onChange={(text) => updateDraft({ minAmount: text })}
              />
              <span className="pb-2.5 text-xs text-content-muted">to</span>
              <AmountInput
                id="filter-amount-max"
                label="Maximum amount"
                value={draft.maxAmount}
                placeholder="3000"
                errorText={errorFor.maxAmount}
                onChange={(text) => updateDraft({ maxAmount: text })}
              />
            </div>
          )}

          <div className="flex flex-col gap-1 text-[11px]">
            {errorFor.form && (
              <p id="filter-amount-form-error" role="alert" className="font-medium text-danger">
                {errorFor.form}
              </p>
            )}
            {draft.amountMode === 'exact' ? (
              <p className="text-content-muted">
                Matches records whose amount is exactly this value. Leave it empty to ignore the amount.
              </p>
            ) : (
              <p className="text-content-muted">
                Fill the minimum, the maximum or both — for example 1000 to 3000. Leave both empty to
                ignore the amount.
              </p>
            )}
          </div>
        </fieldset>

        {/* -------------------------------------------------------------------- */}
        {/* Actions                                                               */}
        {/* -------------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
          <p
            aria-live="polite"
            className={cn(
              'text-[11px]',
              formMessage
                ? 'font-medium text-danger'
                : hasPendingChanges
                  ? 'text-warning'
                  : 'text-content-muted',
            )}
          >
            {statusMessage}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={Eraser} onClick={clearFilters} disabled={!canClear}>
              Clear Filters
            </Button>
            <Button type="submit" icon={Search} disabled={blocked || isBusy}>
              Filter Data
            </Button>
          </div>
        </div>
      </form>

      {chips.length > 0 && (
        <div
          role="group"
          aria-label="Active filters"
          className="flex animate-fade-up flex-wrap items-center gap-2 border-t border-surface-border pt-4"
        >
          <span className="text-[11px] font-medium text-content-muted">Active filters</span>
          {chips.map((chip) => (
            <button
              key={chip.field}
              type="button"
              onClick={() => removeFilter(chip.field)}
              aria-label={`Remove filter ${chip.label}`}
              className={cn(
                'inline-flex animate-fade-up items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10',
                'px-2.5 py-1 text-[11px] font-medium text-content-secondary',
                'transition-colors duration-150 ease-smooth hover:border-accent/60 hover:text-content',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              )}
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">remove</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

interface FilterFieldProps {
  label: string;
  hint: string;
  htmlFor: string;
  errorText?: string;
  children: ReactNode;
}

/** One labelled filter category: label, control, hint and inline error. */
function FilterField({ label, hint, htmlFor, errorText, children }: FilterFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-content-secondary">
        {label}
      </label>
      {children}
      {errorText ? (
        <p className="text-[11px] font-medium text-danger">{errorText}</p>
      ) : (
        <p className="text-[11px] text-content-muted">{hint}</p>
      )}
    </div>
  );
}

interface AmountInputProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  /** Validation message for this input, when it holds an unreadable amount. */
  errorText?: string;
  onChange: (text: string) => void;
}

/** Rupee amount input. The value stays a plain number, never a formatted string. */
function AmountInput({ id, label, value, placeholder, errorText, onChange }: AmountInputProps) {
  const invalid = errorText !== undefined;
  return (
    <div className="flex w-[13rem] max-w-full flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-content-muted">
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content-muted"
        >
          ₹
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            FIELD_CLASSES,
            'w-full pl-7 tabular-nums',
            invalid ? 'border-danger' : 'border-surface-border hover:border-accent/40',
          )}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-danger">
          {errorText}
        </p>
      )}
    </div>
  );
}
