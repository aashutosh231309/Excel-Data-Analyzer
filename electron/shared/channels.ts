/**
 * Channel names shared by the Electron main process and the preload bridge.
 * Keeping them in one place prevents typos and keeps the IPC surface auditable.
 */
export const IPC_CHANNELS = {
  /** Opens the native file picker and returns the validated selection. */
  browseExcelFile: 'excel:browse-file',
  /** Validates a file path that arrived from a drag & drop gesture. */
  validateExcelFile: 'excel:validate-file',
  /** Reads and normalizes the workbook behind the validated path. */
  importWorkbook: 'excel:import-workbook',
  /** Re-derives the records from another worksheet of the loaded workbook. */
  selectWorksheet: 'excel:select-worksheet',
  /** Streaming import progress notifications (main → renderer). */
  importProgress: 'excel:import-progress',
  /** Read-only runtime information used by the Settings screen. */
  getPlatformInfo: 'app:get-platform-info',
  /** Window control commands and their state notifications. */
  getWindowState: 'window:get-state',
  windowStateChanged: 'window:state-changed',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
} as const;
