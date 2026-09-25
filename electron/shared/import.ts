/**
 * Data contracts for Excel import, normalization and the data preview.
 *
 * These types are shared by the Electron main process (which parses the
 * workbook), the preload bridge and the React renderer. They contain no
 * Node.js or Electron types so the renderer can consume them directly.
 *
 * Internal representations (fixed for every later stage):
 *   - date        ISO calendar date `YYYY-MM-DD`, timezone free and sortable
 *   - amount      integer minor units (paise), never a float
 *   - vehicle     display string plus a comparison key (uppercase, no spaces)
 */

/** The logical fields the application understands. */
export const IMPORT_FIELDS = [
  'date',
  'name',
  'vehicleNumber',
  'paymentMode',
  'amount',
  'paymentReason',
  'remark',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Canonical, user-facing names of the logical fields. */
export const IMPORT_FIELD_LABELS = {
  date: 'Date',
  name: 'Name',
  vehicleNumber: 'Vehicle Number',
  paymentMode: 'Payment Mode',
  amount: 'Amount',
  paymentReason: 'Payment Reason',
  remark: 'Remark',
} as const satisfies Record<ImportField, string>;

/**
 * Fields that must be present in the worksheet.
 * `paymentReason` and `remark` are optional text columns: their cells may be
 * blank, and a worksheet that does not carry them still imports correctly.
 */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = [
  'date',
  'name',
  'vehicleNumber',
  'paymentMode',
  'amount',
];

export const OPTIONAL_IMPORT_FIELDS: readonly ImportField[] = ['paymentReason', 'remark'];

/** A field value that could not be interpreted (kept so nothing is lost). */
export interface RecordIssue {
  field: 'date' | 'amount';
  /** The raw cell value exactly as it appeared in the workbook. */
  originalValue: string;
  /** Short, user-facing explanation. */
  message: string;
}

/** One normalized transaction. Analysis never mutates the source workbook. */
export interface TransactionRecord {
  /** Stable identifier for the lifetime of this session. */
  id: string;
  /** 1-based row number in the worksheet, used for diagnostics. */
  rowNumber: number;
  /** ISO `YYYY-MM-DD`, or `null` when the cell could not be interpreted. */
  date: string | null;
  name: string;
  /** Display form of the vehicle number, as typed by the user. */
  vehicleNumber: string;
  /** Comparison form: uppercase, whitespace and punctuation removed. */
  vehicleKey: string;
  paymentMode: string;
  /** Integer paise (₹1 = 100). `null` when the cell is not a valid amount. */
  amountMinor: number | null;
  paymentReason: string;
  remark: string;
  /** Empty for a fully valid record. */
  issues: RecordIssue[];
}

/** Which sheet column was matched to which logical field. */
export interface ColumnMapping {
  field: ImportField;
  /** Header text exactly as found in the worksheet. */
  header: string;
  /** Zero-based column index in the header row. */
  columnIndex: number;
  required: boolean;
}

/** Result of inspecting a single worksheet. */
export interface WorksheetSummary {
  name: string;
  /** Zero-based index of the row that looks like the header row. */
  headerRowIndex: number | null;
  /** Non-empty data rows below the header row. */
  dataRowCount: number;
  columns: ColumnMapping[];
  missingRequiredFields: ImportField[];
  /** A sheet is importable when every required field was matched. */
  isImportable: boolean;
}

/** Import statistics shown on the Data screen. */
export interface ImportStatistics {
  /** Data rows examined below the header row, empty rows included. */
  rowsScanned: number;
  /** Completely empty rows that were ignored. */
  emptyRowsIgnored: number;
  /** Records produced from the remaining rows (duplicates preserved). */
  importedRecords: number;
  /** Records without any invalid field. */
  validRecords: number;
  /** Records with at least one uninterpretable date or amount. */
  recordsWithIssues: number;
  /** Records that contributed to the totals (valid amount). */
  recordsWithAmount: number;
  /** Sum of valid amounts in paise. */
  totalAmountMinor: number;
  /** Mean of valid amounts in paise, or `null` when no amount is valid. */
  averageAmountMinor: number | null;
}

/** A workbook that was read and inspected successfully. */
export interface ImportedWorkbook {
  file: {
    name: string;
    path: string;
    extension: string;
    sizeInBytes: number;
    selectionId: string;
  };
  /** Worksheet the records were taken from. */
  sheetName: string;
  sheets: WorksheetSummary[];
  columns: ColumnMapping[];
  records: TransactionRecord[];
  statistics: ImportStatistics;
}

/** Import phases reported while a workbook is processed. */
export type ImportStage = 'reading' | 'inspecting' | 'normalizing' | 'preparing';

export interface ImportProgress {
  stage: ImportStage;
  /** Human readable description of the current phase. */
  message: string;
  /** Rows processed so far during normalization. */
  processed?: number;
  /** Total rows to process, when it is known in advance. */
  total?: number;
  /** New file vs. switching worksheet inside the already loaded workbook. */
  reason: 'import' | 'sheet';
}

export type ImportResult =
  | { status: 'imported'; workbook: ImportedWorkbook }
  | {
      /** The workbook is valid but carries no usable data rows. */
      status: 'empty';
      file: ImportedWorkbook['file'];
      sheetName: string;
      sheets: WorksheetSummary[];
      statistics: ImportStatistics;
    }
  | {
      /** No worksheet contains all required columns. */
      status: 'invalid-headers';
      file: ImportedWorkbook['file'];
      sheets: WorksheetSummary[];
      missingRequiredFields: ImportField[];
      message: string;
    }
  | {
      /** The file could not be read or is not a spreadsheet. */
      status: 'unreadable';
      fileName?: string;
      message: string;
    };

/** Short form of an import result, used to drive the UI flow. */
export type ImportOutcome = ImportResult['status'] | 'cancelled' | 'failed';
