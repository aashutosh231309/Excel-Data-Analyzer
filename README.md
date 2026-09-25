# Excel Data Analyzer

A modern, offline Windows desktop application for analyzing Excel payment records.

Load a spreadsheet containing **Date, Name, Vehicle Number, Payment Mode, Amount, Payment Reason
and Remark**, then filter by **date, name, vehicle number and amount** with automatically
calculated totals. Everything runs locally — no server, no database, no account, no upload.

> **Stage 1 status — desktop shell only.**
> This repository currently contains the application shell, the design system, the secure
> file-selection foundation and the reusable UI components. Workbooks are **not parsed yet**;
> filtering, totals and export arrive in the following stages. The interface never claims that
> data has been processed.

---

## Technology stack

| Area              | Choice                                        |
| ----------------- | --------------------------------------------- |
| Desktop shell     | Electron 44 + Electron Builder 26             |
| Frontend          | React 18 + Vite 7 + TypeScript 5 (strict)     |
| Styling           | Tailwind CSS 3 (dark design system)           |
| Icons             | Lucide React                                  |
| Spreadsheet engine| SheetJS (`xlsx`) — installed, wired up in Stage 2 |
| Fonts             | Inter (bundled locally via `@fontsource-variable`) |
| Package manager   | npm                                           |

No backend server, database, cloud service, authentication system or external API is involved.
The packaged application performs no network requests at all.

---

## Getting started

Requirements: **Node.js ≥ 20.19** and npm.

```bash
npm install          # install dependencies (downloads the Electron runtime)
npm run dev          # start Vite + Electron together (development mode)
```

`npm run dev` launches the Vite dev server, bundles the Electron main/preload scripts in watch
mode and opens the desktop window against the dev server.

### All scripts

| Script                    | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `npm run dev`             | Development: Vite dev server + Electron with hot reload         |
| `npm run dev:renderer`    | Renderer only, in a browser (useful for UI work)                |
| `npm run build`           | Type-check, then build main/preload (`dist-electron`) and UI (`dist`) |
| `npm run typecheck`       | TypeScript strict-mode check with no emit                       |
| `npm start`               | Build and run the packaged-style application (`electron .`)     |
| `npm run verify`          | Build, then run the Stage 1 verification harness (136 checks)    |
| `npm run icons`           | Regenerate `build/icon.ico` / `build/icon.png`                  |
| `npm run pack`            | Unpacked application directory (`release/`)                     |
| `npm run dist:win`        | Windows installer (NSIS, x64)                                   |
| `npm run dist:linux`      | Linux AppImage (for local packaging checks)                     |

### Building the Windows application

```bash
npm run dist:win
```

The installer is written to `release/Excel Data Analyzer-<version>-Setup.exe` (NSIS, per-user
install, selectable installation directory, desktop and Start-menu shortcuts). `npm run pack`
produces an unpacked `release/win-unpacked/` directory for quick smoke tests.

---

## Project structure

```
excel-data-analyzer/
├── electron/
│   ├── main.ts                  # Window management, dialogs, IPC handlers, security policy
│   ├── preload.ts               # contextBridge: the only renderer ↔ main surface
│   └── shared/                  # Contracts shared by both processes (no privileged APIs)
│       ├── api.ts               # Request/response types + the exposed API surface
│       ├── channels.ts          # IPC channel names
│       ├── file-types.ts        # Supported extensions (.xlsx, .xls)
│       └── file-selection.ts    # Pure file-validation helpers (unit-testable)
├── src/
│   ├── components/
│   │   ├── ui/                  # Button, Card, Input, Badge, Tooltip, EmptyState,
│   │   │                        # FileDropZone, PageHeader, Toast + ToastProvider
│   │   └── dashboard/           # FileImportCard, StatCard, StatsGrid, RoadmapCard
│   ├── hooks/                   # useFileSelection, useWindowControls, usePlatformInfo
│   ├── layouts/                 # AppShell, TitleBar, WindowControls, Sidebar, NavItem
│   ├── lib/                     # desktop-bridge accessor, navigation config, excel rules
│   ├── pages/                   # DashboardPage, DataPage, SettingsPage
│   ├── styles/globals.css       # Tailwind layers, focus states, scrollbars, motion rules
│   ├── types/                   # Domain model (records, columns, filters) + window typings
│   ├── utils/                   # cn(), formatting helpers
│   ├── App.tsx                  # Providers + shell
│   └── main.tsx                 # React entry point
├── scripts/
│   ├── dev.mjs                  # Development launcher (Vite + esbuild watch + Electron)
│   ├── build-electron.mjs       # esbuild bundler for main/preload
│   ├── generate-icons.mjs       # Dependency-free PNG/ICO icon generator
│   └── verify-stage1.mjs        # Stage 1 verification harness
├── build/                       # Generated app icons (icon.ico, icon.png)
├── electron-builder.yml         # Packaging configuration
├── index.html
├── package.json
├── tsconfig.json                # TypeScript strict mode
├── vite.config.ts               # Renderer build + production CSP injection
└── tailwind.config.ts           # The design system (single source of truth)
```

---

## Architecture

```
Electron main process                     Renderer (React)
├── window management                     ├── layouts / pages / components
├── app:// protocol (packaged bundle)     ├── hooks & UI state
├── file dialogs & validation             └── lib/desktop-bridge  ──┐
└── IPC handlers  ──┐                                               │
                    └────────────► preload.ts (contextBridge) ◄────┘
                                    window.excelDataAnalyzer
```

In development the renderer is served by the Vite dev server (`http://localhost:5273`). The
packaged application serves it from the privileged `app://bundle/` scheme registered in
`electron/main.ts`: Chromium refuses to load ES module scripts from `file://` pages, so loading
the Vite bundle with `loadFile()` would produce a window that never renders. The handler maps
`app://bundle/…` onto files inside `dist/` and refuses anything that escapes that directory.

* The renderer has **no** access to Node.js, `require`, `process`, `fs` or `ipcRenderer`.
* The only bridge is `window.excelDataAnalyzer`, a frozen, explicitly whitelisted API:
  `app.getPlatformInfo`, `window.{getState,minimize,toggleMaximize,close,onStateChanged}` and
  `excel.{browse,validatePath,resolvePath}`.
* Every privileged operation is validated in the main process — including files that arrive via
  drag & drop, whose path is resolved with `webUtils.getPathForFile` and then validated.

### Security model

| Control                        | Setting                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `contextIsolation`             | `true`                                                      |
| `nodeIntegration`              | `false`                                                     |
| `sandbox`                      | `true`                                                      |
| `webSecurity`                  | `true`                                                      |
| Content-Security-Policy        | Injected at build time: no inline scripts, no remote origins, `connect-src 'none'` |
| Navigation                     | `will-navigate` blocked; external links open in the default browser |
| OS permissions                 | All denied (camera, microphone, geolocation, …)             |
| File dialogs                   | Filtered to `xlsx`/`xls`; unsupported paths are rejected in main |
| Renderer origin                | Privileged `app://bundle/` scheme; path traversal out of `dist/` refused |
| Single instance                | Enforced; a second launch focuses the existing window        |

### Window behaviour

The window is 1280 × 800 with a 900 × 620 minimum and is resizable; the layout is designed for
1280 × 800, 1366 × 768 and 1920 × 1080. The window is frameless and draws its own title bar
(`-webkit-app-region: drag`), while minimise, maximise/restore and close remain fully functional
through the whitelisted window IPC commands. The native resize borders are preserved and the
window itself never scrolls — only the content region does.

### Design system

Every colour, radius, shadow and animation is declared once in `tailwind.config.ts`:

* Backgrounds `#0B1020` / `#111827`, surfaces `#151D2E` / `#1B2538`, borders `#263247`
* Accent gradient `#6366F1 → #8B5CF6`, cyan support `#22D3EE` used sparingly
* Text `#F8FAFC` / `#CBD5E1` / `#94A3B8`, status colours `#22C55E` / `#F59E0B` / `#EF4444`
* Radii: 8 px controls, 10 px inputs/buttons, 14 px cards, 18 px panels
* Motion: 300–450 ms page entrance, ~200 ms card and hover transitions, 150–200 ms buttons,
  reduced-motion respected

---

## Verification

```bash
npm run verify
```

The harness performs 136 checks that do not require a GUI:

1. **Selection rules** — `xlsx`/`xls` acceptance (including upper case and dotted names),
   rejection of other types, metadata mapping and user-facing messages.
2. **Security configuration** — static verification of the Electron flags, the whitelisted bridge,
   the absence of Node/Electron imports in the renderer and the strict CSP.
3. **Main process** — the real `dist-electron/main.js` bundle is loaded with a mocked Electron API
   to exercise the window options, the `app://` renderer protocol (including path-traversal
   protection), every IPC handler, the file dialog (accept, cancel, reject), drag-and-drop
   validation (wrong type, directory, missing file, malformed input), the window commands, the
   permission policy, navigation blocking and the single-instance rule.
4. **Renderer** — the real React application is rendered against the compiled Tailwind stylesheet
   in a DOM environment: copy, palette, radii, empty-state placeholders, navigation, notification
   and drag-and-drop behaviour.
5. **Desktop bridge** — the renderer is re-run against a mocked preload bridge to verify the file
   selection flow, rejection handling and the window controls end to end.

The native window and the Windows file picker themselves need a machine that can run Electron:
`npm run dev` on Windows, then work through the checklist below.

### Manual Stage 1 checklist

* Dashboard opens as the default screen; the sidebar highlights the active section.
* Hover the sidebar items, buttons, statistic cards and the import area — all respond subtly.
* Press <kbd>Tab</kbd>: focus rings are visible on every interactive element.
* Click **Browse Excel File** → the Windows file picker appears filtered to `.xlsx`/`.xls`.
* Select an `.xlsx` or `.xls` file → its name, location and size are displayed.
* Choose a non-spreadsheet file → an error notification appears and the prompt stays.
* Drag a spreadsheet onto the card → the drop zone highlights, then the file is accepted.
* Minimise, maximise/restore and close the window with the custom title-bar controls.
* `npm start` (packaged-style build, `app://` origin) renders exactly like `npm run dev`.
* Resize the window (including down to 900 × 620) — the layout stays usable.
* The **Data** and **Settings** screens render; placeholder controls are visibly disabled.

---

## Roadmap

| Stage | Scope                                                                |
| ----- | -------------------------------------------------------------------- |
| 1     | Desktop shell, architecture, design system, file selection ✅         |
| 2     | Workbook parsing and normalisation (`xlsx` → records)                |
| 3     | Record table, filtering by date/name/vehicle/amount, totals          |
| 4     | Export of filtered results and preferences                           |
| 5     | Windows installer polish, icons, signing, release packaging          |

The domain model and column definitions already exist in `src/types/domain.ts`, and SheetJS is
installed, so parsing can be added in the main process (raw file access) and fed to the renderer
through the existing bridge without restructuring.
