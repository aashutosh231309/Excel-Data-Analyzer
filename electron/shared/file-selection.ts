import type { ExcelFileSelection } from './api';
import { EXCEL_EXTENSION_LABEL, getFileExtension } from './file-types';

/**
 * Pure helpers that turn a validated file path into renderer-safe metadata.
 *
 * They contain no file-system or Electron access so the exact same rules can be
 * reasoned about (and tested) independently of the running desktop shell.
 */

/** Reasons a candidate path can be refused, in the order they are evaluated. */
export type RejectionReason = 'empty-path' | 'unsupported-type' | 'not-a-file' | 'unreadable';

const REJECTION_MESSAGES: Record<Exclude<RejectionReason, 'unsupported-type'>, string> = {
  'empty-path': `No file was provided. Supported formats: ${EXCEL_EXTENSION_LABEL}.`,
  'not-a-file': 'The selected item is not a file.',
  unreadable: 'The file could not be read. It may have been moved, renamed or deleted.',
};

/** Extracts the file name from a path using either Windows or POSIX separators. */
export function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] ?? filePath;
}

export function buildExcelFileSelection(
  filePath: string,
  sizeInBytes: number,
  selectionId: string,
): ExcelFileSelection {
  return {
    name: getFileName(filePath),
    path: filePath,
    extension: getFileExtension(filePath),
    sizeInBytes: Math.max(0, sizeInBytes),
    selectionId,
  };
}

export function rejectionMessage(reason: RejectionReason, fileName?: string): string {
  if (reason === 'unsupported-type') {
    return fileName
      ? `"${fileName}" is not a supported spreadsheet. Please choose a ${EXCEL_EXTENSION_LABEL} file.`
      : `Unsupported file type. Please choose a ${EXCEL_EXTENSION_LABEL} file.`;
  }
  const message = REJECTION_MESSAGES[reason];
  return reason === 'not-a-file' && fileName ? `"${fileName}" is not a file.` : message;
}

/** Stable identifier for a selection, used as a React key and change detector. */
export function createSelectionId(fileName: string, timestamp: number = Date.now()): string {
  return `${timestamp}-${fileName}`;
}
