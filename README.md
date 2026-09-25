# Excel Data Analyzer

A modern, offline Windows desktop application for analyzing Excel payment records.

Load a spreadsheet containing **Date, Name, Vehicle Number, Payment Mode, Amount, Payment Reason
and Remark**, then filter by **date, name, vehicle number and amount** with automatically
calculated totals. Everything runs locally — no server, no database, no account, no upload.

> **Stage 2 status — import and data understanding.**
> The application now reads `.xlsx` / `.xls` workbooks locally, recognizes the expected columns,
> normalizes every value into a typed record and shows the imported data with a data-quality
> summary. Filtering, totals and export arrive in the following stages. The interface never
> invents figures: every number on screen comes from the parsed workbook.

---

## Technology stack

| Area              | Choice                                        |
| ----------------- | --------------------------------------------- |
| Desktop shell     | Electron 44 + Electron Builder 26             |
| Frontend          | React 18 + Vite 7 + TypeScript 5 (strict)     |
| Styling           | Tailwind CSS 3 (dark design system)           |
| Icons             | Lucide React                                  |
| Spreadsheet engine| SheetJS (`xlsx`) — parsing runs in the Electron main process |
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
| `npm run verify`          | Build, then run every verification suite (Stage 1 + Stage 2)      |
| `npm run verify:only`     | Run the suites against the existing `dist/` build                 |
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
│   ├── excel/                   # Parsing pipeline (main process only)
│   │   ├── workbook.ts          # Reading, worksheet inspection, record extraction
│   │   ├── headers.ts           # Column recognition and header-row detection
│   │   ├── dates.ts             # Excel serials, Date objects and written dates → ISO
│   │   ├── amounts.ts           # ₹-formatted text → integer paise
│   │   └── text.ts              # Name, vehicle, payment-mode and free-text rules
│   └── shared/                  # Contracts shared by both processes (no privileged APIs)
│       ├── api.ts               # Request/response types + the exposed API surface
│       ├── channels.ts          # IPC channel names
│       ├── import.ts            # Record, statistics, issue and result contracts
│       ├── file-types.ts        # Supported extensions (.xlsx, .xls)
│       └── file-selection.ts    # Pure file-validation helpers (unit-testable)
├── src/
│   ├── components/
│   │   ├── ui/                  # Button, Card, Badge, Tooltip, EmptyState, StatCard,
│   │   │                        # StatGrid, ErrorState, FileDropZone, PageHeader, Toast…
│   │   ├── dashboard/           # FileImportCard, ImportProgressPanel, DashboardStats, RoadmapCard
│   │   └── data/                # DataTable, DatasetStats, ValidationSummary,
│   │                            # RecordDetailsPanel, ImportSummaryPanel, WorksheetSelector
│   ├── hooks/                   # useWindowControls, usePlatformInfo, useCountUp
│   ├── layouts/                 # AppShell, TitleBar, WindowControls, Sidebar, NavItem
│   ├── lib/                     # desktop-bridge accessor, navigation config, excel rules
│   ├── pages/                   # DashboardPage, DataPage, SettingsPage
│   ├── state/DatasetProvider.tsx# Single source of truth for the imported workbook
│   ├── styles/globals.css       # Tailwind layers, focus states, scrollbars, motion rules
│   ├── types/                   # Domain model (records, columns, filters) + window typings
│   ├── utils/                   # cn(), formatting helpers
│   ├── App.tsx                  # Providers + shell
│   └── main.tsx                 # React entry point
├── scripts/
│   ├── dev.mjs                  # Development launcher (Vite + esbuild watch + Electron)
│   ├── build-electron.mjs       # esbuild bundler for main/preload
│   ├── generate-icons.mjs       # Dependency-free PNG/ICO icon generator
│   ├── verify.mjs               # Verification entry point (runs every suite)
│   └── verify/                  # Suites + shared harness + fictional fixtures
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
  `excel.{browse,validatePath,resolvePath,importWorkbook,selectWorksheet,onImportProgress}`.
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
| Spreadsheet content            | Read as data only: no formulas, macros, hyperlinks or HTML are evaluated; the file is opened read-only and never modified |
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

## Importing a workbook

The whole pipeline runs inside the Electron **main process**; the renderer only ever receives
normalized records over IPC. Nothing is uploaded, cached in the cloud or sent anywhere.

1. **Selection** — the Windows dialog is filtered to `.xlsx`/`.xls`, or a file is dropped onto the
   import card. Dropped files are resolved with `webUtils.getPathForFile` and validated in main.
2. **Inspection** — every worksheet is examined. The first ten rows are scanned for the expected
   headers, so title rows above a header row are fine. The sheet with the most expected columns
   wins; worksheets without them are listed with the columns they are missing, and the user can
   switch sheets from the Data screen without re-reading the file.
3. **Normalization** — each data row becomes a `TransactionRecord`; completely empty rows are
   skipped, duplicate-looking rows are kept as separate records, and every record gets a stable
   id (`<worksheet>#<row>`).
4. **Quality report** — rows whose date or amount could not be interpreted are kept, flagged and
   listed in the interface; an invalid amount becomes `null` (never ₹0) and stays out of the
   totals.

### Column recognition

Required: **Date, Name, Vehicle Number, Payment Mode, Amount**. Optional: **Payment Reason,
Remark**. Headers are compared after trimming, lower-casing and collapsing internal whitespace
(`" Vehicle   Number "` ≡ `"vehicle number"`), and only unambiguous aliases are accepted
(`Vehicle No`, `Amount (INR)`, `Remarks`, …). Unrelated columns are never mapped; a missing
required column produces the message *"Required columns are missing: • Vehicle Number"*.

### Normalization rules

| Field | Rule |
| ----- | ---- |
| Date | Stored internally as ISO `YYYY-MM-DD`, displayed as DD/MM/YYYY |
| Name | Trimmed and whitespace-collapsed; spelling and capitalization untouched |
| Vehicle Number | Trimmed, upper-cased for display and reduced to letters/digits for comparison (`up32 ab 1234` ≡ `UP32AB1234`); characters are never invented |
| Payment Mode | Preserved exactly as written, only trimmed (no fixed list) |
| Amount | Stored as integer paise; `2000`, `"2000.00"`, `"₹2,000"`, `"₹ 2,000.00"` and `"8,42,500"` all normalize; displayed as `₹2,000` |
| Payment Reason / Remark | Trimmed at the edges only; blanks stay blank |

### Date policy

1. Excel date serials and `Date` values are trusted first — the workbook already knows the date.
2. A bare number inside the Date column is still read as a serial (`45560`, not ₹45,560).
3. Year-first strings (`2026-09-25`, `2026/09/25`) are unambiguous and read directly.
4. Everything else is read **day first** (`25/09/2026`, `25-09-2026`, `25 Sep 2026`), which is the
   convention of this application. `03/04/2026` is therefore 3 April 2026, and a month-first-only
   value such as `09/25/2026` is rejected instead of being silently reinterpreted.
5. Two-digit years follow Excel: 00–68 → 2000s, 69–99 → 1900s.
6. Workbooks saved with the 1904 date system are detected and offset correctly.
7. Anything that cannot be interpreted reliably is reported on the affected rows with its
   original text preserved; the workbook itself is never modified.

---

## Verification

```bash
npm run verify
```

`npm run verify` builds the app and then runs every suite — **319 checks** that do not need a GUI:

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
   selection and import flow and the window controls end to end.
6. **Import security** — the parsing boundary: SheetJS never enters the renderer, no `eval`,
   child process or write call exists in the Excel modules, records are typed, and the source file
   is left untouched.
7. **Normalization** — headers (including `" Date "`, `"VEHICLE NUMBER"`, `"Vehicle No"`), names,
   vehicles, payment modes, amounts (`2000`, `"2000.00"`, `"₹2,000"`, `"₹ 2,000.00"`, invalid text)
   and dates (serials, `Date` values, `DD/MM/YYYY`, `YYYY-MM-DD`, rejected month-first strings).
8. **Workbook import** — fictional `.xlsx` and `.xls` workbooks are generated in a temporary
   directory and imported end to end: sheet selection, empty-row skipping, duplicate preservation,
   invalid values, statistics, progress phases, the 1904 date system and the failure modes
   (missing columns, empty sheet, corrupt file, missing file, folder). The fixture files are
   fictional and are never committed.
9. **Import UI** — the real React application renders the loading state, the success
   notification, the Data screen (statistics, table, validation summary, record details,
   worksheet switcher), the empty state, the error states, a 5,000-record workbook and the
   retention of the previous dataset when a replacement fails.

The native window, the Windows file picker and the packaged installer need a machine that can run
Electron: `npm run dev` on Windows, then work through the checklist below.

### Manual checklist (Windows)

* Dashboard opens as the default screen; the sidebar highlights the active section.
* Hover the sidebar items, buttons, statistic cards and the import area — all respond subtly.
* Press <kbd>Tab</kbd>: focus rings are visible on every interactive element.
* Click **Browse Excel File** → the Windows file picker appears filtered to `.xlsx`/`.xls`.
* Import an `.xlsx` workbook → a success notification appears, the Data screen opens and the
  statistics, table and quality summary show the real figures.
* Import an `.xls` workbook → it imports through the same path.
* Switch to a workbook whose first sheet has no transaction columns → the sheet with the expected
  headers is used; with several valid sheets, pick one in the worksheet switcher.
* Import a workbook that is missing a required column → *"Required columns are missing:
  • Vehicle Number"*, no stack trace, the previous dataset stays loaded.
* Import a file that is not a spreadsheet, a truncated download and an empty sheet → the
  corresponding friendly messages, and the app never crashes.
* Replace a loaded workbook with another file → the table is replaced only on success.
* Minimise, maximise/restore and close the window with the custom title-bar controls.
* `npm start` (packaged-style build, `app://` origin) renders exactly like `npm run dev`.
* Resize the window (including down to 900 × 620) — the layout stays usable, and a large workbook
  (tens of thousands of rows) keeps scrolling smoothly.

---

## Roadmap

| Stage | Scope                                                                |
| ----- | -------------------------------------------------------------------- |
| 1     | Desktop shell, architecture, design system, file selection ✅         |
| 2     | Workbook parsing, normalization and the data screen ✅                |
| 3     | Filtering by date/name/vehicle/amount, totals over the filtered set   |
| 4     | Export of filtered results and preferences                           |
| 5     | Windows installer polish, icons, signing, release packaging          |

The Data screen deliberately ships without filter controls: Stage 3 adds the date filter (with
Today/Yesterday shortcuts), the name and vehicle search, the amount range and the automatic
filtered total on top of the records that are already loaded.
