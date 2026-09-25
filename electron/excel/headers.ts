import { IMPORT_FIELD_LABELS, type ImportField } from '../shared/import';

/**
 * Header recognition.
 *
 * Spreadsheet headers are compared after trimming, lower-casing and collapsing
 * repeated whitespace, which makes " Date ", "DATE" and "date" the same field.
 * Beyond that only unambiguous, well-understood aliases are accepted
 * ("Vehicle No" for "Vehicle Number"); unrelated columns are never mapped.
 */

export interface FieldDefinition {
  field: ImportField;
  /** Canonical column label shown in the UI. */
  label: string;
  /** Accepted header spellings, already normalized. */
  aliases: readonly string[];
  /** Must be present for a worksheet to be importable. */
  required: boolean;
}

/** Normalizes a header cell or alias for comparison. */
export function normalizeHeader(value: unknown): string {
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  return text
    .replace(/[\s\u00A0\u202F\u2007]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.:*#]+$/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Canonical fields, their aliases and whether they are mandatory.
 *
 * `paymentReason` and `remark` are optional: a ledger without those columns is
 * still importable, and their cells are allowed to be blank.
 */
export const FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  {
    field: 'date',
    label: IMPORT_FIELD_LABELS.date,
    aliases: ['date', 'transaction date', 'payment date', 'txn date', 'date of payment'],
    required: true,
  },
  {
    field: 'name',
    label: IMPORT_FIELD_LABELS.name,
    aliases: ['name', 'party name', 'driver name', 'customer name', 'payee name'],
    required: true,
  },
  {
    field: 'vehicleNumber',
    label: IMPORT_FIELD_LABELS.vehicleNumber,
    aliases: [
      'vehicle number',
      'vehicle no',
      'vehicle',
      'vehicle registration',
      'registration number',
      'registration no',
      'reg number',
      'reg no',
    ],
    required: true,
  },
  {
    field: 'paymentMode',
    label: IMPORT_FIELD_LABELS.paymentMode,
    aliases: ['payment mode', 'mode of payment', 'payment method', 'mode', 'method'],
    required: true,
  },
  {
    field: 'amount',
    label: IMPORT_FIELD_LABELS.amount,
    aliases: ['amount', 'amt', 'amount inr', 'amount (inr)', 'total amount', 'amount paid'],
    required: true,
  },
  {
    field: 'paymentReason',
    label: IMPORT_FIELD_LABELS.paymentReason,
    aliases: ['payment reason', 'reason', 'payment purpose', 'purpose', 'particulars'],
    required: false,
  },
  {
    field: 'remark',
    label: IMPORT_FIELD_LABELS.remark,
    aliases: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'description'],
    required: false,
  },
];

const FIELD_BY_NORMALIZED_HEADER = new Map<string, FieldDefinition>();
for (const definition of FIELD_DEFINITIONS) {
  for (const alias of definition.aliases) {
    if (!FIELD_BY_NORMALIZED_HEADER.has(alias)) {
      FIELD_BY_NORMALIZED_HEADER.set(alias, definition);
    }
  }
}

/** Resolves one header cell to a logical field, or `null` when unrelated. */
export function matchField(headerCell: unknown): FieldDefinition | null {
  const normalized = normalizeHeader(headerCell);
  if (normalized.length === 0) {
    return null;
  }
  return FIELD_BY_NORMALIZED_HEADER.get(normalized) ?? null;
}

/** Looks up the definition for a logical field. */
export function getFieldDefinition(field: ImportField): FieldDefinition {
  const definition = FIELD_DEFINITIONS.find((entry) => entry.field === field);
  if (!definition) {
    throw new Error(`Unknown import field: ${field}`);
  }
  return definition;
}

/**
 * Scans candidate rows for the header row that matches the most fields.
 * Spreadsheets frequently start with a title or blank rows, so the first ten
 * rows are inspected rather than assuming row 1.
 */
export const HEADER_SEARCH_DEPTH = 10;

export interface HeaderMatch {
  headerRowIndex: number;
  matches: { field: ImportField; columnIndex: number; header: string }[];
  /** Required fields that were not found in this row. */
  missingRequiredFields: ImportField[];
  /** Number of required fields matched, used to rank candidate rows. */
  requiredMatches: number;
}

/**
 * Evaluates a single candidate header row.
 * `readCell(rowIndex, columnIndex)` returns the raw cell value.
 */
export function evaluateHeaderRow(
  rowIndex: number,
  lastColumnIndex: number,
  readCell: (rowIndex: number, columnIndex: number) => unknown,
): HeaderMatch {
  const matches: HeaderMatch['matches'] = [];
  const usedFields = new Set<ImportField>();

  for (let columnIndex = 0; columnIndex <= lastColumnIndex; columnIndex += 1) {
    const cell = readCell(rowIndex, columnIndex);
    const definition = matchField(cell);
    if (!definition || usedFields.has(definition.field)) {
      // Unrelated columns are left alone; a duplicated field keeps its first match.
      continue;
    }
    usedFields.add(definition.field);
    matches.push({
      field: definition.field,
      columnIndex,
      header: typeof cell === 'string' ? cell.trim() : String(cell ?? ''),
    });
  }

  const requiredMatches = matches.filter(
    (match) => getFieldDefinition(match.field).required,
  ).length;
  const missingRequiredFields = FIELD_DEFINITIONS.filter(
    (definition) => definition.required && !usedFields.has(definition.field),
  ).map((definition) => definition.field);

  return { headerRowIndex: rowIndex, matches, missingRequiredFields, requiredMatches };
}
