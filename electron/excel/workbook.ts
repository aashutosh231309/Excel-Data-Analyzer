import { readFile, stat } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import type { ExcelFileSelection } from '../shared/api';
import type {
  ColumnMapping,
  ImportResult,
  ImportStage,
  ImportStatistics,
  TransactionRecord,
  WorksheetSummary,
} from '../shared/import';
import {
  evaluateHeaderRow,
  getFieldDefinition,
  HEADER_SEARCH_DEPTH,
  type HeaderMatch,
} from './headers';
import { parseAmountMinorUnits } from '../shared/money';
import { parseDateCell } from './dates';
import {
  collapseWhitespace,
  createVehicleKey,
  isBlankCell,
  normalizeFreeText,
  normalizePaymentMode,
  normalizePersonName,
  normalizeVehicleDisplay,
} from '../shared/text';

/**
 * Workbook reading, worksheet inspection and record extraction.
 *
 * SheetJS runs entirely in the Electron main process: the renderer never
 * receives the workbook bytes, only the normalized records. Cell values are
 * treated strictly as data — no formula, macro, hyperlink or HTML content from
 * the file is ever executed.
 */

/** SheetJS read options: values only, no formulas, no styles, no VBA. */
const READ_OPTIONS: XLSX.ParsingOptions = {
  type: 'buffer',
  cellFormula: false,
  cellHTML: false,
  cellStyles: false,
  // Number formats are required to recognize date cells reliably.
  cellNF: true,
  bookVBA: false,
  bookDeps: false,
  cellText: false,
  sheetStubs: false,
};

/** Rows processed between two progress notifications. */
const PROGRESS_CHUNK_ROWS = 2500;

/**
 * Offset between the 1900 and the 1904 date systems.
 * Workbooks saved by Mac Excel can use the 1904 system, where serial 0 is
 * 1904-01-01 instead of 1899-12-30. SheetJS exposes the flag but hands back the
 * raw serial, so the offset is applied explicitly — otherwise every date in such
 * a workbook would be four years early without any visible sign.
 */
const DATE_1904_OFFSET_DAYS = 1462;

export interface ImportProgressDetail {
  stage: ImportStage;
  message: string;
  processed?: number;
  total?: number;
}

export type ImportProgressListener = (detail: ImportProgressDetail) => void | Promise<void>;

export interface ImportOptions {
  /** Worksheet to read; when omitted the best matching sheet is chosen. */
  sheetName?: string;
  onProgress?: ImportProgressListener;
}

export interface LoadedWorkbook {
  workbook: XLSX.WorkBook;
  sheets: WorksheetSummary[];
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** Reads a workbook from disk. Never modifies the file. */
export async function readWorkbookFromFile(filePath: string): Promise<XLSX.WorkBook> {
  const buffer = await readFile(filePath);
  return XLSX.read(buffer, READ_OPTIONS);
}

/** Stat comparison used to decide whether a cached workbook is still valid. */
export async function describeFileState(filePath: string): Promise<{ mtimeMs: number; size: number }> {
  const stats = await stat(filePath);
  return { mtimeMs: stats.mtimeMs, size: stats.size };
}

/* -------------------------------------------------------------------------- */
/* Worksheet inspection                                                        */
/* -------------------------------------------------------------------------- */

type Sheet = XLSX.WorkSheet;
type Cell = XLSX.CellObject | undefined;

function getCell(sheet: Sheet, rowIndex: number, columnIndex: number): Cell {
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as Cell;
}

function getRange(sheet: Sheet): XLSX.Range | null {
  const reference = sheet['!ref'];
  if (!reference) {
    return null;
  }
  try {
    const range = XLSX.utils.decode_range(reference);
    if (range.e.r < range.s.r || range.e.c < range.s.c) {
      return null;
    }
    return range;
  } catch {
    return null;
  }
}

/** Reads the raw value of a cell, leaving formatted text behind. */
function getCellValue(cell: Cell): unknown {
  if (!cell) {
    return null;
  }
  if (cell.t === 'z') {
    return null;
  }
  return cell.v ?? null;
}

function hasDateFormat(cell: Cell): boolean {
  if (!cell || typeof cell.z !== 'string' || cell.z.length === 0) {
    return false;
  }
  try {
    return XLSX.SSF.is_date(cell.z);
  } catch {
    return false;
  }
}

/** Picks the header row that matches the most expected columns. */
function findHeaderRow(sheet: Sheet, range: XLSX.Range): HeaderMatch | null {
  const lastCandidateRow = Math.min(range.s.r + HEADER_SEARCH_DEPTH - 1, range.e.r);
  let best: HeaderMatch | null = null;

  for (let rowIndex = range.s.r; rowIndex <= lastCandidateRow; rowIndex += 1) {
    const match = evaluateHeaderRow(rowIndex, range.e.c, (row, column) =>
      getCellValue(getCell(sheet, row, column)),
    );
    if (match.matches.length === 0) {
      continue;
    }
    if (
      !best ||
      match.requiredMatches > best.requiredMatches ||
      (match.requiredMatches === best.requiredMatches && match.matches.length > best.matches.length)
    ) {
      best = match;
    }
  }

  return best;
}

function toColumnMappings(match: HeaderMatch): ColumnMapping[] {
  return match.matches.map((entry) => ({
    field: entry.field,
    header: entry.header,
    columnIndex: entry.columnIndex,
    required: getFieldDefinition(entry.field).required,
  }));
}

function countDataRows(sheet: Sheet, range: XLSX.Range, match: HeaderMatch): number {
  let count = 0;
  for (let rowIndex = match.headerRowIndex + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const hasContent = match.matches.some(
      (entry) => !isBlankCell(getCellValue(getCell(sheet, rowIndex, entry.columnIndex))),
    );
    if (hasContent) {
      count += 1;
    }
  }
  return count;
}

/** Inspects every worksheet without extracting records. */
export function inspectWorkbook(workbook: XLSX.WorkBook): WorksheetSummary[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet ? getRange(sheet) : null;

    if (!sheet || !range) {
      return {
        name,
        headerRowIndex: null,
        dataRowCount: 0,
        columns: [],
        missingRequiredFields: missingRequiredFields([]),
        isImportable: false,
      };
    }

    const match = findHeaderRow(sheet, range);
    if (!match) {
      return {
        name,
        headerRowIndex: null,
        dataRowCount: 0,
        columns: [],
        missingRequiredFields: missingRequiredFields([]),
        isImportable: false,
      };
    }

    const columns = toColumnMappings(match);
    return {
      name,
      headerRowIndex: match.headerRowIndex,
      dataRowCount: countDataRows(sheet, range, match),
      columns,
      missingRequiredFields: match.missingRequiredFields,
      isImportable: match.missingRequiredFields.length === 0,
    };
  });
}

function missingRequiredFields(present: ColumnMapping['field'][]): WorksheetSummary['missingRequiredFields'] {
  const required: WorksheetSummary['missingRequiredFields'] = [
    'date',
    'name',
    'vehicleNumber',
    'paymentMode',
    'amount',
  ];
  return required.filter((field) => !present.includes(field));
}

/**
 * Chooses the worksheet to read automatically: the importable sheet with the
 * most data rows wins, ties are resolved by the workbook order. The first
 * worksheet is never assumed to be the right one.
 */
export function selectDefaultWorksheet(sheets: WorksheetSummary[]): WorksheetSummary | null {
  const importable = sheets.filter((sheet) => sheet.isImportable);
  if (importable.length === 0) {
    return null;
  }
  return importable.reduce((best, candidate) =>
    candidate.dataRowCount > best.dataRowCount ? candidate : best,
  );
}

/* -------------------------------------------------------------------------- */
/* Record extraction                                                           */
/* -------------------------------------------------------------------------- */

function describeRawValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return collapseWhitespace(value).slice(0, 160);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return '';
}

const EMPTY_STATISTICS: ImportStatistics = {
  rowsScanned: 0,
  emptyRowsIgnored: 0,
  importedRecords: 0,
  validRecords: 0,
  recordsWithIssues: 0,
  recordsWithAmount: 0,
  totalAmountMinor: 0,
  averageAmountMinor: null,
};

/** True when the workbook counts days from 1904-01-01 instead of 1899-12-30. */
export function usesDate1904System(workbook: XLSX.WorkBook): boolean {
  return workbook.Workbook?.WBProps?.date1904 === true;
}

export interface ExtractedRecords {
  records: TransactionRecord[];
  statistics: ImportStatistics;
  columns: ColumnMapping[];
}

/**
 * Converts the data rows of one worksheet into normalized records.
 *
 * Completely empty rows are skipped; duplicate rows are preserved exactly as
 * they appear, because two identical rows can be two real transactions.
 */
export async function extractRecords(
  sheet: Sheet,
  summary: WorksheetSummary,
  options: {
    onProgress?: ImportProgressListener;
    /** Serial offset for the workbook's date system (0 unless it is 1904-based). */
    serialOffsetDays?: number;
  } = {},
): Promise<ExtractedRecords> {
  const range = getRange(sheet);
  const headerRowIndex = summary.headerRowIndex;
  if (!range || headerRowIndex === null || summary.columns.length === 0) {
    return { records: [], statistics: { ...EMPTY_STATISTICS }, columns: summary.columns };
  }

  const columnByField = new Map(summary.columns.map((column) => [column.field, column.columnIndex]));
  const columnIndexes = summary.columns.map((column) => column.columnIndex);
  const serialOffset = options.serialOffsetDays ?? 0;

  const records: TransactionRecord[] = [];
  let emptyRowsIgnored = 0;
  let rowsScanned = 0;
  let totalAmountMinor = 0;
  let recordsWithAmount = 0;
  let recordsWithIssues = 0;

  for (let rowIndex = headerRowIndex + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const cellValues = columnIndexes.map((columnIndex) => getCell(sheet, rowIndex, columnIndex));

    const hasContent = cellValues.some((cell) => !isBlankCell(getCellValue(cell)));
    if (!hasContent) {
      emptyRowsIgnored += 1;
      continue;
    }

    rowsScanned += 1;

    const dateCell = getCell(sheet, rowIndex, columnByField.get('date') ?? -1);
    const amountCell = getCell(sheet, rowIndex, columnByField.get('amount') ?? -1);
    const rawDateValue = getCellValue(dateCell);
    // The 1904 date system shifts every serial by 1462 days.
    const dateValue =
      typeof rawDateValue === 'number' && serialOffset !== 0
        ? rawDateValue + serialOffset
        : rawDateValue;
    const amountValue = getCellValue(amountCell);

    const issues: TransactionRecord['issues'] = [];

    let date: string | null = null;
    if (!isBlankCell(dateValue)) {
      const parsed = parseDateCell({ value: dateValue, hasDateFormat: hasDateFormat(dateCell) });
      if (parsed) {
        date = parsed.iso;
      } else {
        issues.push({
          field: 'date',
          originalValue: describeRawValue(dateValue),
          message: 'Date could not be interpreted.',
        });
      }
    }

    let amountMinor: number | null = null;
    if (!isBlankCell(amountValue)) {
      amountMinor = parseAmountMinorUnits(amountValue);
      if (amountMinor === null) {
        issues.push({
          field: 'amount',
          originalValue: describeRawValue(amountValue),
          message: 'Amount is not a valid number and is excluded from the totals.',
        });
      }
    }

    if (issues.length > 0) {
      recordsWithIssues += 1;
    }
    if (amountMinor !== null) {
      totalAmountMinor += amountMinor;
      recordsWithAmount += 1;
    }

    const vehicleNumber = normalizeVehicleDisplay(
      getCellValue(getCell(sheet, rowIndex, columnByField.get('vehicleNumber') ?? -1)),
    );

    records.push({
      id: `${summary.name}#${rowIndex + 1}`,
      rowNumber: rowIndex + 1,
      date,
      name: normalizePersonName(getCellValue(getCell(sheet, rowIndex, columnByField.get('name') ?? -1))),
      vehicleNumber,
      vehicleKey: createVehicleKey(vehicleNumber),
      paymentMode: normalizePaymentMode(
        getCellValue(getCell(sheet, rowIndex, columnByField.get('paymentMode') ?? -1)),
      ),
      amountMinor,
      paymentReason: normalizeFreeText(
        getCellValue(getCell(sheet, rowIndex, columnByField.get('paymentReason') ?? -1)),
      ),
      remark: normalizeFreeText(getCellValue(getCell(sheet, rowIndex, columnByField.get('remark') ?? -1))),
      issues,
    });

    if ((rowsScanned + emptyRowsIgnored) % PROGRESS_CHUNK_ROWS === 0) {
      await options.onProgress?.({
        stage: 'normalizing',
        message: 'Normalizing records',
        processed: rowsScanned,
        total: summary.dataRowCount,
      });
    }
  }

  const statistics: ImportStatistics = {
    rowsScanned,
    emptyRowsIgnored,
    importedRecords: records.length,
    validRecords: records.length - recordsWithIssues,
    recordsWithIssues,
    recordsWithAmount,
    totalAmountMinor,
    averageAmountMinor:
      recordsWithAmount > 0 ? Math.round(totalAmountMinor / recordsWithAmount) : null,
  };

  return { records, statistics, columns: summary.columns };
}

/* -------------------------------------------------------------------------- */
/* Import orchestration                                                        */
/* -------------------------------------------------------------------------- */

/** Reads a workbook and inspects its worksheets (cached by the caller). */
export async function loadWorkbook(
  file: ExcelFileSelection,
  options: { onProgress?: ImportProgressListener } = {},
): Promise<LoadedWorkbook> {
  await options.onProgress?.({ stage: 'reading', message: 'Reading Excel file' });
  const workbook = await readWorkbookFromFile(file.path);
  await options.onProgress?.({ stage: 'inspecting', message: 'Analyzing columns' });
  const sheets = inspectWorkbook(workbook);
  return { workbook, sheets };
}

/**
 * Turns an already loaded workbook into an import result for one worksheet.
 * Used both for the initial import and for switching worksheets afterwards,
 * so the workbook bytes are never parsed twice.
 */
export async function buildImportResult(
  file: ExcelFileSelection,
  loaded: LoadedWorkbook,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { sheets, workbook } = loaded;

  if (sheets.length === 0) {
    return {
      status: 'invalid-headers',
      file,
      sheets,
      missingRequiredFields: missingRequiredFields([]),
      message: 'This workbook does not contain any worksheets.',
    };
  }

  const target = options.sheetName
    ? sheets.find((sheet) => sheet.name === options.sheetName) ?? null
    : selectDefaultWorksheet(sheets);

  const summary = target ?? selectDefaultWorksheet(sheets) ?? sheets[0];
  if (!summary) {
    return {
      status: 'invalid-headers',
      file,
      sheets,
      missingRequiredFields: missingRequiredFields([]),
      message: 'This workbook does not contain any worksheets.',
    };
  }

  if (!summary.isImportable) {
    return {
      status: 'invalid-headers',
      file,
      sheets,
      missingRequiredFields: summary.missingRequiredFields,
      message: `Worksheet "${summary.name}" is missing required columns.`,
    };
  }

  await options.onProgress?.({
    stage: 'normalizing',
    message: 'Normalizing records',
    processed: 0,
    total: summary.dataRowCount,
  });

  const sheet = workbook.Sheets[summary.name];
  if (!sheet) {
    return {
      status: 'unreadable',
      fileName: file.name,
      message: `Worksheet "${summary.name}" could not be read.`,
    };
  }

  const extracted = await extractRecords(sheet, summary, {
    onProgress: options.onProgress,
    serialOffsetDays: usesDate1904System(workbook) ? DATE_1904_OFFSET_DAYS : 0,
  });
  await options.onProgress?.({ stage: 'preparing', message: 'Preparing data' });

  if (extracted.statistics.importedRecords === 0) {
    return {
      status: 'empty',
      file,
      sheetName: summary.name,
      sheets,
      statistics: extracted.statistics,
    };
  }

  return {
    status: 'imported',
    workbook: {
      file,
      sheetName: summary.name,
      sheets,
      columns: extracted.columns,
      records: extracted.records,
      statistics: extracted.statistics,
    },
  };
}

/** Full import: read the file, inspect it and normalize the selected sheet. */
export async function importWorkbookFile(
  file: ExcelFileSelection,
  options: ImportOptions = {},
): Promise<ImportResult> {
  try {
    const loaded = await loadWorkbook(file, { onProgress: options.onProgress });
    return await buildImportResult(file, loaded, options);
  } catch (error) {
    return {
      status: 'unreadable',
      fileName: file.name,
      message: describeReadFailure(error),
    };
  }
}

/** Maps a parse failure to a message that is useful without being a stack trace. */
export function describeReadFailure(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (code === 'ENOENT') {
    return 'The file could not be found. It may have been moved, renamed or deleted.';
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return 'The file could not be opened. Close it in Excel and try again, or check its permissions.';
  }
  if (code === 'EBUSY') {
    return 'The file is in use by another application. Close it and try again.';
  }
  if (code === 'EISDIR') {
    return 'The selected item is a folder, not a workbook.';
  }

  return 'Unable to read this Excel file. Please verify that it is a valid .xlsx or .xls workbook.';
}
