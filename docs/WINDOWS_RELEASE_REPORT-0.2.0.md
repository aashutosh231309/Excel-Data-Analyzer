# Windows release QA report — Excel Data Analyzer 0.2.0

> **STATUS: NOT EXECUTED — WINDOWS VALIDATION HAS NOT HAPPENED.**
> This file records an *attempt* to execute Stage 8 (real Windows validation) in an environment that
> has no Windows machine. Nothing in it is a Windows test result, and the release is **not** Windows
> validated. It exists so the run that does happen has a place to be recorded, and so the release
> preflight cannot treat an unfilled report as evidence.
>
> When a real run happens: replace every **NOT EXECUTED** with the observed result, fill section 1 with
> the machine actually used, set the decision in section 15, and only then treat this file as
> evidence. The preflight checks the decision and the machine before it clears a single blocker.

| | |
| --- | --- |
| Application | Excel Data Analyzer 0.2.0 |
| Application id | `com.exceldataanalyzer.app` |
| Revision under test | `b145a1b` plus the Stage 8 changes described in section 12 |
| Report written | 25/09/2026 |
| Result | **RELEASE VALIDATION PENDING** |

## 1. Build and environment

| Field | Value |
| ----- | ----- |
| Windows version and build | **NOT EXECUTED** — no supported Windows release was available to this attempt |
| Architecture | **NOT EXECUTED** — the checks ran on Linux `x86_64`, which is not Windows |
| Application version under test | 0.2.0 (`package.json`, `electron-builder.yml`, About card, runtime report) |
| Installer file name | **NOT EXECUTED** — no installer was produced (section 10) |
| Installer SHA-256 | **NOT EXECUTED** — no installer to hash |
| Portable file name and SHA-256 | **NOT EXECUTED** — no portable build was produced |
| Build command used | `npm run build` (PASS), `npm run dist:win` (FAIL — environment, section 10) |
| Excel version used for interoperability checks | **NOT EXECUTED** — no spreadsheet application reachable |
| Other spreadsheet application | **NOT EXECUTED** |
| Date tested | **NOT EXECUTED** — nothing was tested on Windows |
| Tester | Not applicable — no Windows session took place |

The environment of this attempt, for the record: Debian GNU/Linux 12 (bookworm), kernel
6.1.158, Node.js 22.22.3, no Wine, no PowerShell, no Windows host, no display server. Per the stage
brief, none of those are a substitute for Windows validation, and none were treated as one.

## 2. Automated preflight (before the manual run)

| Command | Result |
| ------- | ------ |
| `npm run verify` | **PASS — 801/801 checks** (798 before this stage; the three new checks are in section 12) |
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npm run build` | **PASS** |
| `npm run release:check` | **PASS — 77 PASS · 0 FAIL · 13 NOT EXECUTED** (90 checks) |
| `npm run release:check -- --static` | **PASS — 0 FAIL** |
| `npm run dist:win` | **FAIL — environment only** (section 10); no artefact was produced or claimed |

`release:check` reports **no automatic blockers** and 13 items `NOT EXECUTED`: five artefact checks
(there is no installer) and eight manual Windows checks (installer, launch, native dialogs, Excel
interoperability, uninstall, SmartScreen, and this report). Those are the same items listed as
pending below.

## 3. Installation result — NOT EXECUTED

| Item | Result | Notes |
| ---- | ------ | ----- |
| Installer launched | NOT EXECUTED | No installer exists; `npm run dist:win` failed on the runtime download |
| Installer name and icon correct | NOT EXECUTED | Cannot be inspected without a built installer |
| No unexpected elevation prompt | NOT EXECUTED | |
| Installation completed | NOT EXECUTED | |
| *Installed apps* entry correct | NOT EXECUTED | |
| Start-menu entry created | NOT EXECUTED | |
| SmartScreen warning observed | NOT EXECUTED | The build is unsigned, so a warning is expected — but expectation is not observation |

The installer is **unsigned**. No certificate was obtained, generated or invented, and SmartScreen was
not disabled or bypassed anywhere.

## 4. First launch result — NOT EXECUTED

| Item | Result | Notes |
| ---- | ------ | ----- |
| Application launched from the Start menu | NOT EXECUTED | No installation exists to launch |
| Window title correct | NOT EXECUTED | |
| Taskbar / Start-menu icon correct | NOT EXECUTED | |
| About card name and version correct | NOT EXECUTED | Identity is asserted only from source and packaged files, never from a launched window |
| No development labels | NOT EXECUTED | |
| No blank window | NOT EXECUTED | |
| Single instance behaviour | NOT EXECUTED | |
| Window resize, maximise, restore, minimise, close, relaunch | NOT EXECUTED | |
| Minimum size around 900 × 620 usable | NOT EXECUTED | |

## 5. Import results — NOT EXECUTED

| Case | Result | Notes |
| ---- | ------ | ----- |
| `.xlsx` imported through the native Open dialog | NOT EXECUTED | Native dialogs only exist on Windows |
| Open dialog cancelled | NOT EXECUTED | |
| Worksheet detection and switching | NOT EXECUTED | |
| `.xls` imported | NOT EXECUTED | A legacy `.xls` fixture was prepared (§13 below); the import itself was not run |
| Invalid workbook refused cleanly | NOT EXECUTED | Two prepared fixtures cover a truncated archive and a text file with a workbook extension |
| Failed replacement keeps the previous dataset | NOT EXECUTED | The automated suite covers the state rule; the real dialog path does not |
| Record count and pagination after import | NOT EXECUTED | |

**Fixtures are ready for the run.** `validation/` holds six fictional workbooks and
[`validation/EXPECTED_RESULTS.md`](../validation/EXPECTED_RESULTS.md) holds the figure the interface
must show for each one — record counts, totals, averages, mode shares, the nine amount boundaries,
the seven quality categories, the duplicate groups and every filter combination. Those figures were
calculated from the fixture definition and checked against the application's own import, analytics
and filtering modules outside Windows; that check is *not* Windows validation.

The workbooks: main validation data (31 records, three worksheets), pagination data (130 records),
missing required column, truncated archive, plain text with a `.xlsx` extension, and a legacy `.xls`.
`node scripts/validation/windows-fixture.mjs --out validation --dated-today` regenerates them and adds
records dated today and yesterday so the **Today** and **Yesterday** filters have data on the day of
the run.

## 6. Filtering and totals — NOT EXECUTED

| Case | Result |
| ---- | ------ |
| Date filter, day-first interpretation, selected-date chip | NOT EXECUTED |
| Today / Yesterday / Clear Filters | NOT EXECUTED |
| Name filter, exact normalized match, no fuzzy matching | NOT EXECUTED |
| Vehicle filter across casing and separators | NOT EXECUTED |
| Amount exact, at-least, at-most, range, paise precision | NOT EXECUTED |
| Combined filters (AND) in every pairing and all four together | NOT EXECUTED |
| Empty filter rejected with user feedback | NOT EXECUTED |
| Zero-result state, totals and pagination | NOT EXECUTED |
| Pagination 50 / 100 / 250, boundaries, reset on filter and page-size change | NOT EXECUTED |
| Filtered counts, totals and the valid-amount average denominator | NOT EXECUTED |

## 7. Analytics — NOT EXECUTED

| Case | Result |
| ---- | ------ |
| Dashboard cards (imported, valid amounts, total, average, invalid/incomplete) | NOT EXECUTED |
| Payment mode breakdown including *Unknown / Missing* | NOT EXECUTED |
| Amount distribution across the five ranges | NOT EXECUTED |
| Data quality categories and the affected-record count | NOT EXECUTED |
| Duplicate groups, exact-match-only behaviour | NOT EXECUTED |
| Quality and duplicate inspection views | NOT EXECUTED |

## 8. Export — NOT EXECUTED

| Case | Result |
| ---- | ------ |
| Unfiltered export through the native save dialog | NOT EXECUTED |
| Filtered export holds exactly the displayed records | NOT EXECUTED |
| Seven columns in the exact order | NOT EXECUTED |
| Amounts numeric, invalid amounts blank rather than `0` | NOT EXECUTED |
| Destination with spaces in the path | NOT EXECUTED |
| Save dialog cancelled — no file, no error | NOT EXECUTED |
| Unwritable destination — clear error, dataset intact | NOT EXECUTED |
| Workbook opened in Excel | NOT EXECUTED |
| Source workbook never modified or overwritten | NOT EXECUTED |
| Row guard at 250 000 records | NOT EXECUTED manually — the constant is unchanged and covered by the automated suite |

## 9. Offline operation — NOT EXECUTED

Disconnecting a Windows machine, launching the installed application and completing import, filter,
analytics, inspection and export offline: **NOT EXECUTED** — there is no installation and no Windows
session. The static evidence (no remote script, style, fetch or socket; `connect-src 'none'`; no
localhost or development-server dependency in any production file) is unchanged and still passes, but
it is not an offline test.

## 10. Windows packaging — FAILED (environment), no artefact

| Item | Result |
| ---- | ------ |
| Command | `npm run dist:win` |
| Result | **FAIL** after the production build succeeded |
| Message | `⨯ unable to verify the first certificate` — `RequestError` raised while downloading the Windows Electron runtime |
| Installer produced | **No** — `release/` was created empty and removed |
| Portable produced | **No** |
| `release/win-unpacked/` | **No** |

This is an environment limitation (the sandbox cannot verify the certificate chain of the download
host), not a defect of the application or the packaging configuration: the same command reaches
`packaging platform=win32 arch=x64` and fails inside Electron Builder's downloader. Nothing was worked
around: TLS verification was not disabled, no certificate error was ignored, no `NODE_TLS_REJECT_UNAUTHORIZED`
was set, and no runtime was fetched manually from an unverified source. **No file from this attempt was
reported as an installer.**

## 11. Security regression — PASS (automated, re-run this stage)

| Control | Result |
| ------- | ------ |
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` | PASS — asserted in source, in the runtime mock and in the packaged bundle |
| Production renderer served from `app://bundle/`, never `file://` | PASS |
| No Node, file system, shell or `child_process` access in the renderer | PASS |
| Preload exposes one named bridge and no raw `ipcRenderer` | PASS |
| Every renderer-callable IPC channel whitelisted, every expected handler registered | PASS |
| Content security policy restrictive (`connect-src 'none'`, no `unsafe-eval`) | PASS |
| No insecure command-line switch in the application or the packaged configuration | PASS |
| No TLS bypass, no certificate-ignore flag, no credential, no telemetry, no remote runtime dependency | PASS |

Re-verified after every change made in this stage; the automated results above are from the final
revision of this report.

## 12. Defects found and fixed in this stage

Two genuine defects were found while preparing this report. Both are tooling and fixture defects —
neither is a Windows test failure, because no Windows test ran — and neither touches application code,
which was left untouched as required.

| # | Defect | Evidence | Fix | Regression test |
| - | ------ | -------- | --- | --------------- |
| 1 | The release preflight treated the *existence* of `docs/WINDOWS_RELEASE_REPORT-0.2.0.md` as a completed Windows report, so an unfilled template or a report that still said `RELEASE VALIDATION PENDING` would have cleared a manual release blocker | The gate matched `Release decision … release/block`, which the template's own wording and the word *PENDING* both satisfy | `inspectWindowsReport()` now requires a finished decision (`release`, `release with known issues`, `block`, `RELEASE VALIDATION COMPLETE` or `RELEASE BLOCKED`) **and** a recorded Windows machine and architecture; missing, unfilled, pending and non-Windows reports stay `NOT EXECUTED` | 3 new checks in `scripts/verify/stage7.mjs` |
| 2 | The prepared validation workbooks could not demonstrate the duplicate rule: the "identical" rows carried different remark text, and the remark is part of the duplicate signature, so no group was detected at all | Running the fixtures through the application's own analytics returned *0 duplicate groups* instead of 2 | The duplicate rows are now identical in all seven fields, and each near-duplicate changes exactly one field | Recorded here; the fixture is documentation, not application code |

Finding 2 is exactly why the fixtures were put through the real modules before being written up: the
hand-written expectation would otherwise have been wrong, and the Windows run would have reported a
false failure.

## 13. Remaining issues

| Issue | Impact | Decision |
| ----- | ------ | -------- |
| Windows validation has not been executed at all (sections 3–9) | The release cannot be called Windows validated | Must be executed on Windows before release |
| No installer exists (`npm run dist:win` fails in this environment) | Nothing can be installed or inspected | Build on Windows, then run the checklist |
| The installer is not code-signed | SmartScreen will warn on first run | Document in the release notes; do not hide it |
| A plain-text file with a `.xlsx` extension is reported as *"Required columns are missing"* rather than as an unreadable file | Cosmetic wording; the import is refused cleanly either way | Observe it on Windows before deciding; not a blocker |
| Export row guard is 250 000 rows, not the 200 000 quoted in earlier stage briefs | None — the constant is the validated behaviour from Stage 4 | Left unchanged; changing it is a product decision, not a validation task |

## 14. Data-safety confirmation

| Question | Answer |
| -------- | ------ |
| Was the loaded source workbook modified at any point? | **NOT EXECUTED** on Windows. Automated checks confirm no module writes to the source workbook, the export is the only writer and it never targets the loaded file. |
| Was an export written without the save dialog confirming a destination? | **NOT EXECUTED** on Windows. The automated check confirms the export path requires the dialog's destination. |
| Were any records deleted, merged or edited by the application? | **NOT EXECUTED** on Windows. Automated checks run filtering, analytics, both inspections and export preparation over frozen, nested records and confirm they are unchanged. |
| Were the validation figures produced from fictional data only? | **Yes** — every workbook in `validation/` is invented; no real person, vehicle, amount or payment appears in them. |

No fabricated answers are recorded here: where a Windows run was required to answer a question, the
answer is **NOT EXECUTED**.

## 15. Final release decision

| Field | Value |
| ----- | ----- |
| Checklist completed (every box executed) | **no** — 0 of the 98 checklist items have been executed on Windows |
| Blocking failures found | none proven — no Windows test ran, so none could be found |
| Decision | **RELEASE VALIDATION PENDING** |
| Decided by | Automated preparation in a non-Windows environment; no human tester involved |
| Date | 25/09/2026 |

**RELEASE VALIDATION PENDING.** The automated side is green (801/801 checks, 0 automatic blockers,
0 failures in the release preflight). The Windows side is untouched: no installer exists, nothing has
been launched on Windows, no native dialog has been exercised, no exported workbook has been opened in
Excel, and no uninstall has been performed.

## 16. How to finish this report

1. Build on Windows: `npm install`, `npm run verify`, `npm run build`, `npm run dist:win`.
2. Record the installer and portable names and their `Get-FileHash -Algorithm SHA256` values in
   section 1.
3. Execute [`WINDOWS_RELEASE_CHECKLIST.md`](WINDOWS_RELEASE_CHECKLIST.md) using the prepared fictional
   workbooks, comparing every figure with [`validation/EXPECTED_RESULTS.md`](../validation/EXPECTED_RESULTS.md).
4. Replace each **NOT EXECUTED** above with the observed result, and fill section 1 with the machine
   actually used.
5. For every failure record the expected result, the actual result, the steps, the severity and
   whether it blocks the release.
6. Set the decision in section 15 to `RELEASE VALIDATION COMPLETE`, `RELEASE BLOCKED` or leave it
   `RELEASE VALIDATION PENDING`, and state the reason.
7. Run `npm run release:check` again. Only a report that records a finished decision and the machine
   it ran on clears the manual blockers.
