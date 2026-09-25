import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC_CHANNELS } from './shared/channels';
import type {
  BrowseFileResult,
  ExcelDataAnalyzerApi,
  PlatformInfo,
  ValidateFileResult,
  WindowState,
} from './shared/api';

/**
 * The single, explicitly whitelisted bridge between the renderer and the
 * Electron main process. Nothing else is exposed to the web page: the renderer
 * receives no `require`, no `process` and no unrestricted file-system access.
 */
const api: ExcelDataAnalyzerApi = {
  app: {
    getPlatformInfo: (): Promise<PlatformInfo> => ipcRenderer.invoke(IPC_CHANNELS.getPlatformInfo),
  },
  window: {
    getState: (): Promise<WindowState> => ipcRenderer.invoke(IPC_CHANNELS.getWindowState),
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: (): Promise<WindowState> =>
      ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    close: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    onStateChanged: (listener: (state: WindowState) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState): void =>
        listener(state);
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, handler);
      };
    },
  },
  excel: {
    browse: (): Promise<BrowseFileResult> => ipcRenderer.invoke(IPC_CHANNELS.browseExcelFile),
    validatePath: (filePath: string): Promise<ValidateFileResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.validateExcelFile, filePath),
    resolvePath: (file: File): string => webUtils.getPathForFile(file),
  },
};

contextBridge.exposeInMainWorld('excelDataAnalyzer', api);
