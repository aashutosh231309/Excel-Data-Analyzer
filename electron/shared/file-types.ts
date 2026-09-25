/**
 * Supported spreadsheet file types.
 * Used by the main process (dialog filters + validation) and by the renderer
 * (drag & drop pre-filtering, "accepted formats" hints).
 */
export const SUPPORTED_EXCEL_EXTENSIONS = ['xlsx', 'xls'] as const;

export type SupportedExcelExtension = (typeof SUPPORTED_EXCEL_EXTENSIONS)[number];

/** File extensions grouped for the native dialog and the drop zone. */
export const EXCEL_EXTENSION_LABEL = SUPPORTED_EXCEL_EXTENSIONS.map((ext) => `.${ext}`).join(', ');

export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot < 0 || lastDot === filePath.length - 1) {
    return '';
  }
  return filePath.slice(lastDot + 1).toLowerCase();
}

export function isSupportedExcelFile(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return (SUPPORTED_EXCEL_EXTENSIONS as readonly string[]).includes(extension);
}
