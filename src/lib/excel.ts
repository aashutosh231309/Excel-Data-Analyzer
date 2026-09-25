/**
 * Spreadsheet format rules shared with the Electron main process.
 * The single source of truth lives in `electron/shared/file-types.ts`.
 */
export {
  EXCEL_EXTENSION_LABEL,
  SUPPORTED_EXCEL_EXTENSIONS,
  getFileExtension,
  isSupportedExcelFile,
  type SupportedExcelExtension,
} from '@shared/file-types';
