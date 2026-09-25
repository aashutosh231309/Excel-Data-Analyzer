import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron';
import { statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC_CHANNELS } from './shared/channels';
import { isSupportedExcelFile, SUPPORTED_EXCEL_EXTENSIONS } from './shared/file-types';
import {
  buildExcelFileSelection,
  createSelectionId,
  getFileName,
  rejectionMessage,
} from './shared/file-selection';
import type {
  BrowseFileResult,
  PlatformInfo,
  ValidateFileResult,
  WindowState,
} from './shared/api';

/** Renderer entry points. */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');
const BACKGROUND_COLOR = '#0B1020';

/**
 * The packaged renderer is served from a privileged `app://` scheme instead of
 * `file://`. Chromium refuses to load ES module scripts from `file://` pages
 * (their origin is opaque, so the module request fails CORS), and Vite emits a
 * module script — loading the bundle through `file://` would produce a window
 * that never renders. Serving from `app://` gives the renderer a real, secure
 * origin, keeps relative asset resolution and fonts working, and lets the
 * Content-Security-Policy rely on `'self'`.
 */
const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const RENDERER_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`;

// Runs at module scope on purpose: privileged schemes must be declared before
// the `ready` event, and this call is only allowed once per process.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;

/** Electron is single-instance: reopening the app focuses the existing window. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  void app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    lockDownPermissions();
    registerRendererProtocol();
    registerIpcHandlers();
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Window                                                                     */
/* -------------------------------------------------------------------------- */

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: BACKGROUND_COLOR,
    autoHideMenuBar: true,
    title: 'Excel Data Analyzer',
    // Frameless window: the application draws its own title bar. Minimise,
    // maximise/restore and close stay fully functional through the whitelisted
    // window IPC commands; the native resize borders are preserved.
    frame: false,
    minimizable: true,
    maximizable: true,
    closable: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Security baseline: the renderer never receives Node.js primitives.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  void window.loadURL(DEV_SERVER_URL ?? RENDERER_ENTRY_URL);

  window.once('ready-to-show', () => window.show());

  // Keep a custom title bar in sync with the real window state.
  const publishState = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.windowStateChanged, readWindowState(window));
    }
  };
  window.on('maximize', publishState);
  window.on('unmaximize', publishState);
  window.on('restore', publishState);
  window.on('enter-full-screen', publishState);
  window.on('leave-full-screen', publishState);

  // External links open in the default browser, never inside the application.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // The renderer is a local SPA: navigating away from it is never expected.
  window.webContents.on('will-navigate', (event, url) => {
    const isAllowed = DEV_SERVER_URL ? url.startsWith(DEV_SERVER_URL) : url.startsWith(RENDERER_ORIGIN);
    if (!isAllowed) {
      event.preventDefault();
    }
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  return window;
}

function readWindowState(window: BrowserWindow): WindowState {
  return {
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen(),
  };
}

function requireWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error('No application window is associated with this request.');
  }
  return window;
}

/* -------------------------------------------------------------------------- */
/* IPC                                                                        */
/* -------------------------------------------------------------------------- */

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.browseExcelFile, async (event): Promise<BrowseFileResult> => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: 'Select an Excel file',
      buttonLabel: 'Select file',
      properties: ['openFile'],
      filters: [
        { name: 'Excel workbooks', extensions: [...SUPPORTED_EXCEL_EXTENSIONS] },
        { name: 'All files', extensions: ['*'] },
      ],
    };

    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) {
      return { status: 'cancelled' };
    }

    return validateExcelPath(selectedPath);
  });

  // Drag & drop reaches the renderer first; the path is validated here so that
  // unsupported files are rejected by the trusted process, not by the UI alone.
  ipcMain.handle(
    IPC_CHANNELS.validateExcelFile,
    (_event, filePath: string): ValidateFileResult => validateExcelPath(filePath),
  );

  ipcMain.handle(IPC_CHANNELS.getPlatformInfo, (): PlatformInfo => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle(IPC_CHANNELS.getWindowState, (event): WindowState =>
    readWindowState(requireWindow(event)),
  );

  ipcMain.handle(IPC_CHANNELS.windowMinimize, (event): void => {
    requireWindow(event).minimize();
  });

  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, (event): WindowState => {
    const window = requireWindow(event);
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return readWindowState(window);
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, (event): void => {
    requireWindow(event).close();
  });
}

/**
 * Validates a candidate spreadsheet path and returns renderer-safe metadata.
 * Parsing is intentionally out of scope for Stage 1.
 */
function validateExcelPath(filePath: unknown): ValidateFileResult {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return { status: 'rejected', message: rejectionMessage('empty-path') };
  }

  const fileName = getFileName(filePath);

  if (!isSupportedExcelFile(filePath)) {
    return {
      status: 'rejected',
      fileName,
      message: rejectionMessage('unsupported-type', fileName),
    };
  }

  let sizeInBytes = 0;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { status: 'rejected', fileName, message: rejectionMessage('not-a-file', fileName) };
    }
    sizeInBytes = stats.size;
  } catch {
    return { status: 'rejected', fileName, message: rejectionMessage('unreadable') };
  }

  return {
    status: 'selected',
    file: buildExcelFileSelection(filePath, sizeInBytes, createSelectionId(fileName)),
  };
}

/* -------------------------------------------------------------------------- */
/* Renderer protocol                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Serves the packaged renderer bundle over `app://bundle/…`.
 * Only files inside the build output directory can ever be returned.
 */
function registerRendererProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRendererFile(request.url);
    if (!filePath) {
      return notFoundResponse();
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return notFoundResponse();
    }
  });
}

/** Maps an `app://bundle/…` URL onto a file inside the build output directory. */
function resolveRendererFile(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.host !== APP_HOST) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (pathname.includes('\0')) {
    return null;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(RENDERER_DIST, requestedPath);

  // Reject anything that escapes the bundle, e.g. app://bundle/../../secret.txt
  const relativePath = path.relative(RENDERER_DIST, target);
  const isInsideBundle =
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

  return isInsideBundle ? target : null;
}

function notFoundResponse(): Response {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
}

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */

/** The application needs no OS permissions (camera, microphone, geolocation, …). */
function lockDownPermissions(): void {
  const allowedPermissions = new Set(['clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
}
