# Excel Data Analyzer

A modern, offline Windows desktop application for analyzing Excel payment records.

Load a spreadsheet containing **Date, Name, Vehicle Number, Payment Mode, Amount, Payment Reason
and Remark**, then filter by **date, name, vehicle number and amount** with automatically
calculated totals. Everything runs locally — no server, no database, no account, no upload.

> **Stage 5 status — the analytics workspace, data quality insights and session UX.**
> The application reads `.xlsx` / `.xls` workbooks locally, normalizes every value into a typed
> record, filters by **date, name, vehicle number and amount** in any combination, calculates the
> matching **record count, total amount and average amount** automatically and exports **exactly
> the records on screen** to a new `.xlsx` file through the native Windows save dialog — the
> source workbook is never modified or overwritten. On top of that, the Dashboard now describes
> the imported workbook: baseline statistics, a payment-mode breakdown, an application-defined
> amount distribution, a data-quality summary and an informational duplicate insight — all of them
> calculated once from the records that are already in memory. A quality or duplicate insight opens
> the affected rows in the existing table without filtering, editing or deleting anything.
> Record editing, filter presets, diagrams and packaging polish are deliberately not part of this
> build. The interface never invents figures: every number on screen comes from the parsed
> workbook.

---

## Technology stack

| Area              | Choice                                        |
| ----------------- | --------------------------------------------- |
| Desktop shell     | Electron 44 + Electron Builder 26             |
| Frontend          | React 18 + Vite 7 + TypeScript 5 (strict)     |
| Styling           | Tailwind CSS 3 (light design system)          |
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
| `npm run verify`          | Build, then run every verification suite (Stages 1–5)             |
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
│   ├── excel/                   # Parsing pipeline (READ ONLY — never writes to disk)
│   │   ├── workbook.ts          # Reading, worksheet inspection, record extraction
│   │   ├── headers.ts           # Column recognition and header-row detection
│   │   └── dates.ts             # Excel serials, Date objects and written dates → ISO
│   ├── export/
│   │   └── workbook.ts          # SheetJS export: the only module that ever writes a file
│   └── shared/                  # Contracts shared by both processes (no privileged APIs)
│       ├── api.ts               # Request/response types + the exposed API surface
│       ├── channels.ts          # IPC channel names
│       ├── import.ts            # Record, statistics, issue and result contracts
│       ├── export.ts            # Export contracts, row preparation, file-name rules
│       ├── local-date.ts        # Local calendar-day helpers (filters and export names)
│       ├── money.ts             # ₹-formatted text → integer paise (shared by both processes)
│       ├── text.ts              # Name, vehicle, payment-mode and free-text rules (shared)
│       ├── file-types.ts        # Supported extensions (.xlsx, .xls)
│       └── file-selection.ts    # Pure file-validation helpers (unit-testable)
├── src/
│   ├── components/
│   │   ├── ui/                  # Button, Card, Badge, Tooltip, EmptyState, StatCard,
│   │   │                        # StatGrid, ErrorState, ErrorBoundary, FileDropZone,
│   │   │                        # PageHeader, Toast…
│   │   ├── dashboard/           # FileImportCard, ImportProgressPanel, AnalyticsSection,
│   │   │                        # AnalyticsStats, FilteredAnalyticsSection, PaymentModeBreakdown,
│   │   │                        # AmountDistribution, DataQualityInsights, DuplicateInsights,
│   │   │                        # BarList, RoadmapCard
│   │   └── data/                # DataTable, DatasetStats, ValidationSummary,
│   │                            # RecordDetailsPanel, ImportSummaryPanel, WorksheetSelector,
│   │                            # FilterPanel, NameCombobox, FilteredSummary, ResultHeader,
│   │                            # ExportDataButton, InspectionBanner
│   ├── domain/                  # Pure rules: filtering/validation/matching/totals/paging
│   │   ├── analytics.ts         #   + the single-pass analytics report (no React, no Electron)
│   │   ├── filtering.ts         #   + local-day helpers and filter chips
│   │   └── pagination.ts        #   + the compact page list (first/last/gap)
│   ├── hooks/                   # useWindowControls, usePlatformInfo, useCountUp
│   ├── layouts/                 # AppShell, TitleBar, WindowControls, Sidebar, NavItem
│   ├── lib/                     # desktop-bridge accessor, navigation config, excel rules
│   ├── pages/                   # DashboardPage, DataPage, SettingsPage
│   ├── state/                   # DatasetProvider (imported workbook, single copy of records)
│   │   ├── AnalyticsProvider.tsx#   + the memoized reports, session state and inspections
│   │   └── FilterProvider.tsx   #   + the filters and the single filtered result set
│   ├── styles/globals.css       # Tailwind layers, focus states, scrollbars, motion rules
│   ├── types/                   # Display schema (columns, fields) + window typings
│   ├── utils/                   # cn(), formatting helpers
│   ├── App.tsx                  # Providers + shell
│   └── main.tsx                 # React entry point
├── scripts/
│   ├── dev.mjs                  # Development launcher (Vite + esbuild watch + Electron)
│   ├── build-electron.mjs       # esbuild bundler for main/preload
│   ├── generate-icons.mjs       # Dependency-free PNG/ICO icon generator
│   ├── verify.mjs               # Verification entry point (runs every suite)
│   └── verify/                  # Suites + shared harness + fictional fixtures
│       ├── stage1.mjs … stage5.mjs  # shell → import → filtering → export → analytics
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

* Backgrounds `#F4F5F7` (workspace) / `#FFFFFF` (title bar), surfaces `#FFFFFF` (cards) /
  `#F7F8FA` (elevated rows, secondary buttons), borders `#E3E6EB`
* Accent gradient `#4F46E5 → #4338CA` (a single indigo hue — no neon two-tone look), cyan support
  `#0E7490` used sparingly
* Text `#1F2430` / `#3F4753` / `#5F6773`, status colours `#065F46` (success) / `#92400E`
  (warning) / `#B91C1C` (errors and serious validation findings only)
* Every text/background combination that appears in the interface is measured against WCAG AA
  (4.5:1) by the verification suite
* Radii: 8 px controls, 10 px inputs/buttons, 14 px cards, 18 px panels
* Motion: 250–400 ms content transitions, ~200 ms card and hover transitions, 150–200 ms buttons,
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

## Filtering and totals

The filter panel on the Data screen works on the **normalized records already in memory**. The
workbook is never read, parsed or normalized again for a filter, the source file is never
modified and the result is deterministic.

| Category | Input | Rule |
| -------- | ----- | ---- |
| Date | One calendar day (`Today`, `Yesterday`, `Clear` shortcuts) | Compared with the ISO date of the record; `03/04/2026` is 3 April 2026 |
| Name | Searchable selector built from the names in the current worksheet | Case- and whitespace-insensitive; the chosen name must match exactly — no fuzzy matching |
| Vehicle Number | Free text, e.g. `UP32AB1234` | Compared with the Stage 2 key: upper-cased with separators removed, so `up32 ab 1234` ≡ `UP-32-AB-1234` |
| Amount | Exact value (default) or a minimum/maximum range | Compared as integer paise; `2000`, `2,000`, `2000.00`, `₹2,000` and `₹ 2,000` all parse identically |

* **At least one filter is required.** Submitting the empty panel shows *"Please provide at least
  one filter."* / *"Add at least one filter to search the data."* and keeps the dataset intact —
  the whole sheet is never presented as a search result.
* **Every populated category must match** (AND). Categories are never combined with OR, and a
  category that is left empty does not restrict anything.
* **Filtering is explicit.** Nothing runs while typing: the records are filtered by
  **🔍 Filter Data**, by removing an individual chip (`Date: 25/09/2026 ×`) or by **Clear Filters**,
  which restores the imported dataset.
* **Invalid input blocks the filter** with an inline message and keeps the previous results:
  an unreadable amount (*"abc" is not a valid amount…*), a minimum above the maximum
  (*"Minimum amount cannot be greater than maximum amount."*) or an unusable vehicle number.
* **Totals are exact.** `Total Amount` is the sum of the **matching** records in integer paise (no
  formatted strings, no floating-point drift) and `Average Amount` is that total divided by the
  matching records that carry a valid amount. A record whose amount could not be read is `null`:
  it stays visible in the table, is never counted as ₹0 and never satisfies an amount filter.
* **One authoritative result set.** The `Filtered Records` count, `Total Amount`,
  `Average Amount`, the table, the pagination and the chips are all derived from the same filtered
  array, so they cannot disagree. Duplicate-looking rows stay separate records.
* **Zero matches** show a polished empty state (*"No matching records — try changing or clearing
  one or more filters."*) with `Filtered Records 0`, `Total Amount ₹0` and `Average Amount —`;
  no stale figure is left behind. With no filters applied the results area states that the records
  are the imported dataset, and the dashboard tiles say *"No filters applied yet"*.
* **The table stays paginated** (50/100/250 rows per page) and a new filter always returns it to
  page 1, so the user can never be stranded on a page that no longer exists.
* **Amounts are displayed with Indian grouping** (`₹2,000`, `₹48,750`, `₹1,24,500`), with paise
  only when they exist (`₹2,000.50`).

---

## Exporting to Excel

**Export Excel** (next to the result header) writes *the records that are currently displayed* to a
new workbook. It never exports a different set, and it never writes to the workbook that is open.

* **What is exported** — only the current filtered result set, in the order shown, duplicates
  included. Internal ids (`Sheet#row`), vehicle comparison keys, validation metadata and app-only
  state never reach the file. With no filters applied the action is labelled **Export Data** and
  says *"No filters applied — exporting all imported records."*; with an empty result it is
  disabled with *"No records available to export."* and no workbook is created.
* **The file** — `.xlsx`, with exactly seven columns in this order: **Date, Name, Vehicle Number,
  Payment Mode, Amount, Payment Reason, Remark**. `Date` is a real Excel date formatted
  `dd/mm/yyyy` (so 25/09/2026 stays 25 September and the column sorts and filters), and `Amount`
  is a real number formatted `#,##0.00` (so it can be summed in Excel). An unreadable amount stays
  empty instead of becoming ₹0. The sheet is named **Filtered Data** (or **Imported Data** when
  nothing is filtered) and carries an AutoFilter over the header.
* **The file name** — `Filtered_Data_25-09-2026.xlsx` (or `Imported_Data_…`), offered as an
  editable default in the native save dialog. Unsafe characters and path separators are removed,
  and the date is the local calendar day — the same day the date filter uses.
* **The destination** — always chosen by the user in the Windows save dialog; the application never
  saves silently. Cancelling is a normal outcome: no file, no success notification, no error, and
  nothing else changes. The workbook that is currently loaded can never be overwritten: if the
  chosen path is the source file, the export is refused.
* **Feedback** — the loading state reports the real phases (**Preparing Excel…** →
  **Saving file…**; the dialog phase is reported as *Waiting for a save location…*), the action is
  blocked while an export runs so double clicks cannot start a second one, success shows
  *"Export completed successfully. 24 records exported."* and a failure shows *"Export failed —
  The filtered data could not be saved. Please choose another location and try again."* Technical
  detail is logged in the main process for development and never rendered into the interface.
* **How it stays safe** — the renderer prepares plain rows and calls the single whitelisted
  preload method `excel.exportFilteredData(request)`. The save dialog, the destination and the file
  write happen in the main process (`electron/export/workbook.ts`, the only module in the
  application that writes a file). The renderer never receives a file-system API, never sees an
  Electron module and never chooses a path; a path smuggled inside the payload is ignored.

### Result workflow

* The result header states what is on screen: *"Imported Data / Showing all 1,250 imported
  records · No filters applied yet"* or *"Filtered Results / 24 records found · Active
  filters: 3"*, with the source file name underneath (truncated, full name in a tooltip).
* **Change Excel File** opens the same native picker; the new workbook is parsed and only replaces
  the current one after a successful import. If it fails, the error is explained and the previous
  dataset stays fully usable.
* The filter panel can be collapsed (**Collapse** / **Expand**) to give the table more room; while
  collapsed it still shows how many filters are active and which categories they belong to.
* The table keeps its seven columns, adds row hover feedback, truncation with a readable tooltip
  for long Payment Reason / Remark text, and `—` for values that are genuinely empty — an invalid
  value stays visible with its warning marker instead.
* Pagination shows *"Showing 1–100 of 250 matching records"* with **‹ Previous**, a compact page
  list (first, last and the pages around the current one, with `…` for gaps), **Next ›** and the
  page-size selector (50/100/250). The whole dataset is never rendered at once.
* A rendering error anywhere in the main content is caught by an error boundary: the user sees
  *"Something went wrong — The application encountered an unexpected error."* with **Try Again**
  and **Go to Dashboard**, instead of a blank window. Nothing is deleted — the imported records,
  the filters and the source file are untouched.

---

## The analytics workspace

The Dashboard answers *"what does this workbook contain?"* without any interaction, and the Data
screen answers *"what do the current filters select?"*. Both read the same report.

* **Source card** — file name, worksheet, imported row count, import time and the current session
  state, plus **Change Excel File**. The internal file path is never rendered.
* **Baseline cards** — Imported Records, Valid Amount Records, Total Amount, Average Amount and
  Invalid / Incomplete Records. With no valid amount the value is `—` with an explanation, never a
  misleading `₹0.00`, and the average divides by the records that actually carry a valid amount.
* **Filtered analytics** — once a filter is applied, Filtered Records, Filtered Total Amount and
  Filtered Average Amount are promoted above the baseline figures, which keep their imported
  meaning and are never relabelled.
* **Payment mode breakdown** — one row per mode (blank and unrecognised values grouped as
  *Unknown / Missing*) with its count, share of the records and total amount, sorted by count.
* **Amount distribution** — five application-defined ranges (₹0–499, ₹500–999, ₹1 000–4 999,
  ₹5 000–9 999, ₹10 000 and above) with counts and shares of the valid amounts, drawn as plain
  elements — no charting dependency.
* **Data quality** — Missing Name, Vehicle Number, Payment Mode, Payment Reason, Remark, Invalid
  Date and Invalid Amount, with the total records, the records that carry at least one problem and
  the resulting percentage. A record with several problems is counted once.
* **Duplicate insight** — exact matches on all seven normalized fields, reported as a group count
  and the number of participating records, with the notice *"Possible duplicate records are
  informational only. No records have been removed."* Nothing is merged, deleted or labelled
  fraudulent, and no fuzzy matching is performed.
* **Inspections** — a quality category or a duplicate group opens the affected rows in the existing
  table (pagination, formatting and long-text handling unchanged) under a *Data Quality Inspection*
  or *Duplicate Inspection* banner with **Back to results**. It is not a filter: the user's filters,
  the totals and the export are untouched, and leaving restores them exactly.

Every figure is produced by one pure function, `analyzeRecords(records)`, in
`src/domain/analytics.ts`. It walks the records once, is deterministic and testable without
Electron, and is memoized in `AnalyticsProvider` so nothing is recalculated per render.

---

## Verification

```bash
npm run verify
```

`npm run verify` builds the app and then runs every suite — **706 checks** that do not need a GUI:

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
10. **Filter engine** — the pure rules of `src/domain/filtering.ts`: the specification's example
   dataset (date + name = 2 records / ₹3,500 / ₹1,750; vehicle = 3 records / ₹5,500; exact ₹2,000 =
   1 record), every single and combined category, all three amount modes, validation
   (empty submission, unreadable amounts, minimum above maximum), invalid values, duplicate rows,
   chips, the day-first date policy (`03/04/2026` = 3 April 2026) and the local `Today`/`Yesterday`
   rule — including a 20,000-row run to show the single-pass filtering.
11. **Filter UI** — the rendered panel: the four categories, the searchable name selector
   (partial search, arrow keys, `Enter`, `Escape`, `aria-activedescendant`), the amount modes, the
   inline errors, the chips, the count message, the filtered figures, the zero-result state,
   `Clear Filters`, the dashboard tiles following the filters, and the pagination reset when a new
   filter replaces a larger result set. The suite also proves that filtering never returns to the
   workbook (`importWorkbook` is called exactly once).
12. **Export rows** — what is exported and as what: the seven exported fields and nothing else
   (no ids, no comparison keys), paise → plain numbers, empty stays empty, duplicates preserved,
   the source records unchanged after preparing an export, the exact Excel serial numbers, the
   file-name rules (`Filtered_Data_25-09-2026.xlsx`, unsafe characters removed, local day),
   payload validation (malformed rows, empty result, oversized payload) and the source-file guard.
13. **Export workbook** — the real SheetJS output is written and read back: header row and column
   order, `A1:G…` range, amounts as numbers with `#,##0.00`, dates as serials with `dd/mm/yyyy`,
   the sheet names, a zip-signature check, a round trip that proves 25 September stays
   25 September, an unwritable destination, and that exporting a second file cannot change the
   first one. The suite also proves that nothing under `electron/excel/` writes to disk and that
   the writer lives in its own reviewed module.
14. **Export main process** — the real `dist-electron/main.js` bundle with a mocked Electron API:
   the save dialog (default name, xlsx filter, `createDirectory`), a successful write, the
   progress phases, cancelling (including a blank path), the forced `.xlsx` extension, a payload
   that tries to choose a path, refusing to overwrite the loaded workbook through case and
   separator differences, invalid and empty payloads (dialog never opened), a dialog that throws,
   an unwritable destination (technical detail logged, friendly message returned) and the packaged
   preload/main bundles shipping the export.
15. **Export UI** — the rendered action: label and wording for unfiltered, filtered and empty
   results, the exact payload of the records on screen, the success notification, duplicate-click
   blocking, the *Preparing Excel…* / *Saving file…* states, silence on cancel, the failure
   notification, the screen staying usable afterwards, a throwing bridge, and the static proof that
   no renderer module reaches Node, Electron or the file system.
16. **Resilience** — a failed replacement import keeps the previous dataset, an invalid filter
   value survives navigation without ever filtering, the error boundary catches a throwing
   component (fallback copy, no stack trace in the interface, developer detail logged, **Try
   Again** recovery) and the four notification variants share one motion system.
17. **UX polish** — chips (labels, accessible names, immediate re-filtering), the collapsed filter
   panel (active categories stay visible, inputs return unchanged), table header/hover/horizontal
   scroll, truncation with tooltips, `—` versus invalid values, pagination counts for the filtered
   dataset (`Showing 101–125 of 125 matching records`), the page-size choices and the motion
   budget (no bounce, no per-row animation).
18. **Analytics** — `src/domain/analytics.ts` over fictional fixtures: imported / valid-amount /
   invalid-amount records, total and average (an invalid amount is never counted as ₹0 and never
   divided into the average), every payment mode with its count, share and volume including
   `Unknown / Missing`, the five application-defined ranges at their exact boundaries (0 / 499 /
   500 / 999 / 1 000 / 4 999 / 5 000 / 9 999 / 10 000), each data-quality category, a record with
   several problems counted once, exact duplicates on all seven normalized fields (and the
   near-misses that must *not* group), the filtered report next to the unfiltered one, and a
   20 000-record / 200 000-record run that proves the single pass.
19. **Analytics UI** — the Dashboard rendered from a real import: the source card (name, worksheet,
   row count, import time, session state — never a file path), the five baseline cards with `—`
   instead of a fake ₹0, the imported-versus-filtered cards (the filtered ones promoted, the
   imported ones never relabelled), the payment-mode breakdown and the range list following the
   active filters, the data-quality categories with their record counts, the duplicate groups with
   the informational notice, and the empty state when no valid amount is loaded.
20. **Session states** — the nine states end to end: no workbook (welcome, dashes only), workbook
   loaded without filters, filters active, zero matches (dataset, filters and controls survive),
   data-quality inspection (the affected rows in the existing table, no export, nothing edited),
   duplicate inspection (the identical rows unchanged), returning from an inspection (filters,
   results and export come back exactly), a successful replacement (filters, inspection and
   pagination reset, analytics recalculated) and a failed replacement (explicit error, previous
   workbook and its analytics kept).
21. **Workspace quality** — one analytics layer (the dashboard components never calculate),
   memoized reports instead of per-render recomputation, the new modules free of Electron, Node,
   IPC, `eval` and blocking dialogs, no absolute path rendered, the motion budget (no bounce, no
   continuous or oversized animation), no new charting dependency, and a WCAG AA contrast sweep
   that measures every text/background combination in the interface against its own theme.

The native window, the Windows file picker, the Windows save dialog, the packaged application and
the installer need a machine that can run Electron and Windows: `npm run dev` (and
`npm run dist:win`) on Windows, then work through the checklist below. Everything in this
checkout is verified headlessly with a mocked Electron API — the save dialog is *not* exercised
against the real Windows dialog here.

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
* Filter by **Date** (with `Today`, `Yesterday` and `Clear`), by **Name** (typing narrows the
  suggestions; the arrow keys and `Enter` pick one; `Escape` closes the list), by **Vehicle
  Number** (`up-32-ab-1234` finds `UP32AB1234`) and by **Amount** (exact and range) — one at a
  time, then two, then all four together.
* Press **Filter Data** with every box empty → *"Please provide at least one filter."* appears and
  the imported records stay untouched.
* Type `abc` in an amount box and `1000`/`5000` as minimum/maximum → the inline messages appear,
  the filter button is disabled and the previous results stay on screen.
* Remove one chip → only that category stops filtering; press **Clear Filters** → the imported
  dataset and the *"No filters applied yet"* hint return.
* Filter to a combination without matches → *"No matching records"* with `₹0` and `—`, and no
  stale total.
* Check the figures against the table: `Filtered Records`, `Total Amount` and `Average Amount`
  must equal the listed rows — including a worksheet with an invalid amount (never counted as ₹0).
* With more than one page of results, move to the last page and apply a new filter → the table
  returns to page 1 and the page count follows the matches.
* Press **Export Excel** with filters applied → the Windows save dialog appears with
  `Filtered_Data_DD-MM-YYYY.xlsx`; save it, open the file in Excel and check that it holds exactly
  the rows on screen, that the seven columns are in order, that `Amount` sums in Excel and that
  `Date` shows DD/MM/YYYY.
* Press **Export Excel** again and cancel the dialog → no file is created, no notification
  appears and the results stay exactly as they were.
* Try to save the export over the workbook that is loaded → the export is refused with
  *"That is the workbook that is currently loaded…"* and the original file is unchanged.
* Press **Export Data** without any filter → the wording explains that all imported records are
  exported, and the file is named `Imported_Data_…`.
* Filter until no record matches → the export button is disabled and says
  *"No records available to export."*.
* Click **Change Excel File** and pick a different workbook → the new records replace the old ones
  only on success; pick a damaged file instead → the message appears and the previous dataset stays
  usable.
* Collapse the filter panel with **Collapse** → the active categories stay visible and the table
  gains room; **Expand** brings the inputs back with the same values.
* Hover a long Payment Reason / Remark → the tooltip shows the full text; hover a row → only the
  background changes, with no movement.
* Work through a long result set with the page numbers, `‹ Previous` / `Next ›` and the page-size
  selector → the table never renders the whole dataset at once.
* Switch to the Dashboard with filters applied → the imported and the filtered figures are
  visibly separated, and only the breakdowns that describe *the current result* change.
* Check the baseline cards against the table: **Imported Records**, **Valid Amount Records**,
  **Total Amount**, **Average Amount** and **Invalid / Incomplete Records**. A workbook with no
  valid amount shows `—` with an explanation, never `₹0.00`.
* Compare the **Payment Mode Breakdown** with the table: one row per mode with its count, share
  and total; a blank or unrecognised mode appears as *Unknown / Missing* and is never dropped.
* Compare the **Amount Distribution** with the imported amounts: the five ranges are
  application-defined (₹0–499, ₹500–999, ₹1 000–4 999, ₹5 000–9 999, ₹10 000 and above) and count
  valid amounts only.
* Click a **Data Quality** category → the affected rows open in the table under a *Data Quality
  Inspection* banner while the filters, the export and the imported data stay untouched; press
  **Back to results** → exactly the previous screen returns.
* Click a **duplicate group** → the identical rows open with the notice *"Possible duplicate
  records are informational only. No records have been removed."*; nothing is deleted, merged or
  declared fraudulent.
* Press **Change Excel File** and pick another workbook → the filters, the inspection state and the
  pagination reset and every figure is recalculated; pick a damaged file instead → the message
  appears and the previous workbook stays loaded.
* Walk through the six session states (welcome, workbook loaded, filters active, no matches,
  data-quality inspection, duplicate inspection) → each one is visibly distinct, and *no matches*
  keeps the dataset and the filter panel usable.
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
| 3     | Filtering by date/name/vehicle/amount, totals over the filtered set ✅ |
| 4     | Export the filtered records to Excel, production UX and resilience ✅  |
| 5     | Analytics workspace, data-quality insights, duplicate insight, session UX ✅ |
| 6     | Windows installer polish, icons, signing, release packaging           |

Stage 5 is complete: the Dashboard describes the imported workbook with a single-pass analytics
layer (baseline statistics, payment-mode breakdown, amount distribution, data-quality summary and
an informational duplicate insight), each insight opens the affected rows in the existing table
without modifying anything, and every session state — welcome, loaded, filtered, zero matches,
both inspections — is visually distinct. PDF export, record editing, saved filter presets,
diagrams, accounts, cloud sync, scheduled imports and packaging polish remain out of scope and are
deliberately not implemented.
