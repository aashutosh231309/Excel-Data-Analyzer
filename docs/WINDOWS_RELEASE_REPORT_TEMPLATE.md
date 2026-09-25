# Windows release QA report — template

Copy this file to `docs/WINDOWS_RELEASE_REPORT-<version>.md` (for example
`docs/WINDOWS_RELEASE_REPORT-0.2.0.md`), fill it in while executing
[`WINDOWS_RELEASE_CHECKLIST.md`](WINDOWS_RELEASE_CHECKLIST.md), and keep it with the release.

Do not invent values. If something was not executed, write **NOT EXECUTED** — that is a valid and
useful answer, and it is the honest one until a real Windows run has happened.

---

## 1. Build and environment

| Field | Value |
| ----- | ----- |
| Windows version and build (e.g. Windows 11 24H2, 26100.1742) | |
| Architecture | x64 |
| Application version under test (`package.json` / About card) | |
| Installer file name | |
| Installer SHA-256 (from `Get-FileHash -Algorithm SHA256`) | |
| Portable file name and SHA-256 (if built) | |
| Build command used | |
| Excel version used for the interoperability checks | |
| Other spreadsheet application used (if any) | |
| Date tested (local date) | |
| Tester | |

## 2. Automated preflight (before the manual run)

| Command | Result |
| ------- | ------ |
| `npm run verify` | checks passed / total |
| `npm run release:check` | checks passed / total |
| `npm run dist:win` | PASS / FAIL / NOT EXECUTED (+ message) |

## 3. Installation result

| Item | Result | Notes |
| ---- | ------ | ----- |
| Installer launched | | |
| Installer name and icon correct | | |
| No unexpected elevation prompt | | |
| Installation completed | | |
| *Installed apps* entry correct (name, icon, version) | | |
| Start-menu entry created | | |
| SmartScreen warning (expected: unsigned installer) | | |

## 4. First launch result

| Item | Result | Notes |
| ---- | ------ | ----- |
| Application launched | | |
| Window title correct | | |
| Taskbar / Start-menu icon correct | | |
| About card name and version correct | | |
| No development labels | | |
| No blank window | | |
| Single instance behaviour | | |

## 5. Import results

| Item | Result | Notes |
| ---- | ------ | ----- |
| `.xlsx` import | | |
| `.xls` import | | |
| Worksheet detection and switching | | |
| Invalid / damaged workbook handled | | |
| Missing required column handled | | |
| Invalid date and amount handling (never ₹0) | | |
| File with spaces / Unicode in its path | | |

## 6. Filtering results

| Item | Result | Notes |
| ---- | ------ | ----- |
| Date filter (day-first) | | |
| Today / Yesterday | | |
| Name selector (keyboard, search, Escape) | | |
| Vehicle number (separator-insensitive) | | |
| Amount exact / minimum / maximum / range | | |
| Combined filters (AND) | | |
| Chips and chip removal | | |
| Clear Filters | | |
| Zero-result state | | |
| Figures match the listed rows | | |
| Pagination, page sizes, reset behaviour | | |

## 7. Analytics results

| Item | Result | Notes |
| ---- | ------ | ----- |
| Dashboard statistics vs the table | | |
| Payment-mode breakdown (incl. Unknown / Missing) | | |
| Amount distribution ranges | | |
| Data-quality summary (record counted once) | | |
| Data-quality inspection and return | | |
| Duplicate insight and inspection | | |
| Filtered analytics distinct from imported | | |

## 8. Export results

| Item | Result | Notes |
| ---- | ------ | ----- |
| Unfiltered export | | |
| Filtered export | | |
| Save-dialog cancel (no file, no notification) | | |
| Path containing spaces | | |
| Path containing Unicode / parentheses | | |
| Refusal to overwrite the loaded workbook | | |
| Unwritable destination handled | | |
| Seven columns and their order in Excel | | |
| Amount numeric and summing in Excel | | |
| Dates as DD/MM/YYYY | | |
| Row count and order equal the on-screen rows | | |
| Blank / invalid amounts blank, duplicates kept | | |
| Disabled state with no matching records | | |

## 9. Dialog results

| Item | Result | Notes |
| ---- | ------ | ----- |
| Open dialog (filter correct, cancelling safe) | | |
| Save dialog (default name, cancelling safe) | | |
| Drag & drop path resolution | | |

## 10. Window, accessibility and offline results

| Item | Result | Notes |
| ---- | ------ | ----- |
| Resize / maximize / restore / close | | |
| Minimum size 900 × 620 usable | | |
| Maximized 1920 × 1080 usable | | |
| Keyboard navigation and focus rings | | |
| Offline import → filter → analyze → export | | |
| No network connections observed | | |

## 11. Uninstallation result

| Item | Result | Notes |
| ---- | ------ | ----- |
| Uninstaller ran without elevation | | |
| Start-menu and desktop shortcuts removed | | |
| Installation directory removed | | |
| *Installed apps* entry removed | | |
| Reinstall afterwards works | | |

## 12. Failures and observations

| # | Checklist item | What happened | Severity (blocker / major / minor) | Evidence (screenshot, log, file) |
| - | -------------- | ------------- | ---------------------------------- | ------------------------------- |
| 1 | | | | |
| 2 | | | | |

Attachments: screenshots, exported workbooks (fictional data only), notes.

## 13. Known issues carried into the release

| Issue | Impact | Decision (ship / fix / document) |
| ----- | ------ | -------------------------------- |
| The installer is not code-signed | SmartScreen warns on first run | |
| | | |

## 14. Data-safety confirmation

| Question | Answer |
| -------- | ------ |
| Was the loaded source workbook modified at any point? | must be **no** |
| Was an export written without the save dialog confirming a destination? | must be **no** |
| Were any records deleted, merged or edited by the application? | must be **no** |

## 15. Final release decision

| Field | Value |
| ----- | ----- |
| Checklist completed (every box executed) | yes / no |
| Blocking failures found | |
| Decision | release / release with known issues / block |
| Decided by | |
| Date | |
