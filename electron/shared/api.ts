/**
 * Data contracts exchanged between the renderer and the Electron main process.
 * These types are intentionally free of Node.js and Electron types so that the
 * renderer can import them without pulling any privileged API into the bundle.
 */

/** Metadata about a spreadsheet the user selected (no parsing happens yet). */
export interface ExcelFileSelection {
  /** File name including extension, e.g. "payments-july.xlsx". */
  name: string;
  /**
   * Absolute path of the selected workbook, validated by the main process.
   * Passing it through the whitelisted bridge is what lets later stages read the
   * workbook in the main process without giving the renderer file-system access.
   */
  path: string;
  /** Lower-cased extension without the dot, e.g. "xlsx". */
  extension: string;
  /** File size in bytes. */
  sizeInBytes: number;
  /** Opaque identifier the renderer can use as a React key. */
  selectionId: string;
}

export type BrowseFileResult =
  | { status: 'selected'; file: ExcelFileSelection }
  | { status: 'cancelled' }
  | { status: 'rejected'; fileName?: string; message: string };

export type ValidateFileResult =
  | { status: 'selected'; file: ExcelFileSelection }
  | { status: 'rejected'; fileName?: string; message: string };

export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
}

export interface PlatformInfo {
  platform: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  isPackaged: boolean;
}

/** The complete API surface exposed to the renderer through `contextBridge`. */
export interface ExcelDataAnalyzerApi {
  app: {
    getPlatformInfo(): Promise<PlatformInfo>;
  };
  window: {
    getState(): Promise<WindowState>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<WindowState>;
    close(): Promise<void>;
    /** Subscribes to window state changes; returns an unsubscribe callback. */
    onStateChanged(listener: (state: WindowState) => void): () => void;
  };
  excel: {
    /** Opens the native file dialog; returns a validated selection. */
    browse(): Promise<BrowseFileResult>;
    /** Validates a file path that arrived from drag & drop or the dialog. */
    validatePath(filePath: string): Promise<ValidateFileResult>;
    /** Resolves the absolute path of a dropped `File` object. */
    resolvePath(file: File): string;
  };
}
