import type { ExcelDataAnalyzerApi } from '@shared/api';

/**
 * Access point for the preload bridge.
 *
 * `window.excelDataAnalyzer` is only present when the renderer runs inside the
 * Electron shell. When the UI is opened in a plain browser (Vite dev server
 * preview) the accessors return `null` so the interface can degrade gracefully
 * instead of crashing.
 */
export function getDesktopBridge(): ExcelDataAnalyzerApi | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.excelDataAnalyzer ?? null;
}
