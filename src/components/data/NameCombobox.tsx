import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { filterNameOptions } from '@/domain/filtering';

interface NameComboboxProps {
  /** Current draft text. */
  value: string;
  /** Names available in the imported dataset (already deduplicated and sorted). */
  options: readonly string[];
  /** Marks the field with the error styling; the message is rendered by the field. */
  invalid?: boolean;
  describedBy?: string;
  onChange: (text: string) => void;
  /** Called with the chosen name (or `''` when the selection is cleared). */
  onSelect: (name: string) => void;
  /** Called when Enter is pressed with the list closed, so Enter can filter. */
  onSubmitRequest?: () => void;
}

const FIELD_CLASSES =
  'h-10 w-full rounded-field border bg-surface-elevated pl-3 pr-9 text-sm text-content placeholder:text-content-muted ' +
  'transition-colors duration-150 ease-smooth focus:outline-none focus:ring-2 focus:ring-accent/30';

/**
 * Searchable name selector.
 *
 * Suggestions come from the normalized names of the current dataset. Typing
 * narrows them case-insensitively and whitespace-insensitively; the empty box
 * lists every available name. Only the keyboard-highlighted suggestion is
 * selected — there is no fuzzy matching, so choosing "Raj Kumar" can never
 * match a different person.
 */
export function NameCombobox({
  value,
  options,
  invalid = false,
  describedBy,
  onChange,
  onSelect,
  onSubmitRequest,
}: NameComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => filterNameOptions(options, value), [options, value]);

  // Clicking anywhere else closes the list without stealing the typed text.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const safeHighlighted = matches.length === 0 ? -1 : Math.min(highlighted, matches.length - 1);

  const select = (name: string): void => {
    onSelect(name);
    setOpen(false);
    setHighlighted(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setHighlighted((current) => (matches.length === 0 ? 0 : (Math.max(current, -1) + 1) % matches.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        setHighlighted((current) =>
          matches.length === 0 ? 0 : (current <= 0 ? matches.length - 1 : current - 1),
        );
        break;
      case 'Enter': {
        const highlightedName = safeHighlighted >= 0 ? matches[safeHighlighted] : undefined;
        if (open && highlightedName !== undefined) {
          // Enter picks the highlighted suggestion instead of submitting.
          event.preventDefault();
          select(highlightedName);
          return;
        }
        onSubmitRequest?.();
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id="filter-name"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder="Search a name, e.g. Raj Kumar"
        className={cn(FIELD_CLASSES, invalid ? 'border-danger' : 'border-surface-border hover:border-accent/40')}
        aria-label="Name"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && safeHighlighted >= 0 ? `${listboxId}-option-${safeHighlighted}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
      />

      <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
        {value.length > 0 && (
          <button
            type="button"
            aria-label="Clear name filter"
            onClick={() => select('')}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-control text-content-muted',
              'transition-colors duration-150 ease-smooth hover:bg-surface hover:text-content',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <ChevronDown className="mr-1 h-4 w-4 shrink-0 text-content-muted" aria-hidden="true" />
      </span>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Available names"
          // Keeping the input focused lets the click land on the option.
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            'absolute z-20 mt-1 max-h-56 w-full animate-fade-up overflow-auto rounded-card border border-surface-border',
            'bg-surface-elevated py-1 shadow-raised',
          )}
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-content-muted">
              No imported name matches “{value.trim()}”. You can still filter with the typed name.
            </li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === safeHighlighted}
                onClick={() => select(option)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-sm text-content-secondary transition-colors duration-100',
                  index === safeHighlighted ? 'bg-accent/15 text-content' : 'hover:bg-surface',
                )}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
