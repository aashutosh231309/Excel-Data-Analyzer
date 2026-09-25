import type { ExcelDataAnalyzerApi } from '@shared/api';

/**
 * The renderer only ever sees the whitelisted bridge defined in
 * `electron/preload.ts`. No Node.js or Electron module is reachable from here.
 */
declare global {
  interface Window {
    readonly excelDataAnalyzer?: ExcelDataAnalyzerApi;
  }
}

export {};
