# Windows release checklist

This checklist is the **manual** half of the release validation. It must be executed on a real
Windows machine by a person; nothing in this repository can execute it for you.

> **Status: NOT EXECUTED.** No Windows environment is available in the development container where
> this project is built. Every box below is therefore unchecked by definition, and no result here
> has been observed. The automated half (`npm run release:check`) proves configuration and code
> behaviour only — it never claims these items.

Print or copy this file, run the checklist top to bottom, and record the outcome in
[`WINDOWS_RELEASE_REPORT-0.2.0.md`](WINDOWS_RELEASE_REPORT-0.2.0.md) — the template is at
[`WINDOWS_RELEASE_REPORT_TEMPLATE.md`](WINDOWS_RELEASE_REPORT_TEMPLATE.md). Use the prepared
**fictional** workbooks in `validation/` for the import/export steps, and compare the figures the
interface shows with `validation/EXPECTED_RESULTS.md`: this project is tested with invented payment
records only, and release testing should not involve real personal or financial data.

---

## 0. Prerequisites

| Item | Value |
| ---- | ----- |
| Build machine | Windows 10 or 11, x64, with Node.js ≥ 20.19 and npm |
| Build command | the sequence below, in this order |
| Installer under test | `release/Excel Data Analyzer-0.2.0-Setup.exe` |
| Portable under test | `release/Excel Data Analyzer-0.2.0-Portable.exe` (optional) |
| Excel | Microsoft Excel (any current version) or another spreadsheet application, for the export interop checks |
| Test workbook | The prepared fictional workbooks in `validation/` — regenerate them with `node scripts/validation/windows-fixture.mjs --out validation --dated-today` so the Today and Yesterday checks have data. Every expected figure is written down in `validation/EXPECTED_RESULTS.md`. |

Run these commands from the repository root before testing anything. Every one of them must be run
for real; a skipped command is recorded as **NOT EXECUTED**, never assumed to have passed:

```powershell
npm install
npm run verify                              # expect 801/801 checks, no failures
npx tsc --noEmit                            # expect no output
npm run build                               # production renderer, main process, preload
node scripts/validation/windows-fixture.mjs --out validation --dated-today
npm run dist:win                            # produces release/Excel Data Analyzer-0.2.0-Setup.exe
npm run release:check                       # expect 0 FAIL; the artefact checks must stop saying NOT EXECUTED
```

Then confirm what the build actually produced. Only report files that exist:

```powershell
Get-ChildItem ".\release" | Select-Object Name, Length
```

`Get-ChildItem ".\release\win-unpacked"` should show the unpacked application, and
`Get-ChildItem ".\release\*.blockmap", ".\release\latest.yml" -ErrorAction SilentlyContinue`
shows the update metadata Electron Builder emits. Nothing in `release/` is committed to the
repository.

Before installing anything, record the artefact hashes so the file you tested can be identified
later:

```powershell
Get-ChildItem ".\release\*.exe" | ForEach-Object {
  $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
  "{0}  {1}" -f $hash, $_.Name
}
```

Single file variant:

```powershell
Get-FileHash ".\Excel Data Analyzer-0.2.0-Setup.exe" -Algorithm SHA256
```

Also check the file properties of the installer (right-click → **Properties → Details**) and record
the product name (`Excel Data Analyzer`) and version (`0.2.0`) shown by Windows.

---

## 1. Installation

- [ ] `release/Excel Data Analyzer-0.2.0-Setup.exe` starts by double-clicking it.
- [ ] Windows SmartScreen warns that the publisher is unknown → **expected**, the installer is not code-signed; continue with *More info → Run anyway* and note the warning in the report.
- [ ] The installer window shows the application name **Excel Data Analyzer** and the application icon.
- [ ] The installer offers a normal (not silent) flow with an installation directory.
- [ ] The installer offers a desktop shortcut choice (or creates one) and a Start-menu entry.
- [ ] No administrator elevation prompt appears (`asInvoker`, per-user installation).
- [ ] The installation completes and the completion page offers to run the application.
- [ ] The application appears in **Windows Settings → Apps → Installed apps** as *Excel Data Analyzer* with the correct icon and the version matching the artefact.
- [ ] A Start-menu entry *Excel Data Analyzer* exists and shows the application icon.
- [ ] The default installation directory is under `%LOCALAPPDATA%\Programs\`.

## 2. First launch

- [ ] Launching from the Start menu opens the application window.
- [ ] The window title bar shows **Excel Data Analyzer**.
- [ ] The taskbar button shows the application icon (all sizes: taskbar, alt-tab, Start menu).
- [ ] The title bar of the application shows the version badge, and **Settings → About** shows *Excel Data Analyzer*, version **0.2.0**, *Installed build*, the product description and the copyright notice.
- [ ] No development label appears anywhere (no *Vite*, *localhost*, *dev server*, *Electron* branding, no browser-style menu, no debug overlay).
- [ ] The window is not blank: the Dashboard with the import surface is visible.
- [ ] Closing the window ends the process (no orphan `Excel Data Analyzer.exe` left in Task Manager).
- [ ] Launching a second instance focuses the existing window instead of opening a second one.

## 3. Import

- [ ] **Browse Excel File** opens the native Windows file picker filtered to `.xlsx` / `.xls`.
- [ ] `validation/Excel Data Analyzer - Validation Data.xlsx` imports: the Data screen shows 33 records, 30 with a valid amount, ₹76,697.00 in total and the table (see `validation/EXPECTED_RESULTS.md`).
- [ ] `validation/Excel Data Analyzer - Legacy Validation Data.xls` imports through the same path: 7 records, ₹2,000.00 in total.
- [ ] A workbook whose first sheet has no transaction columns falls back to the sheet that has them.
- [ ] A workbook with several valid sheets offers the worksheet switcher, and switching re-loads that sheet without restarting.
- [ ] A workbook missing a required column (for example *Vehicle Number*) reports *"Required columns are missing: • Vehicle Number"* and keeps the previous dataset.
- [ ] A damaged/truncated file reports a readable message and no stack trace.
- [ ] A file that is not a spreadsheet, a folder with a spreadsheet extension and a deleted file are each rejected with a readable message.
- [ ] A file dropped onto the drop zone imports the same way.
- [ ] Row 33 of `Payments September` is a real date cell that also carries 14:30: it must import as **26/09/2026**, keep that calendar date in the table, and be found by the date filter `26/09/2026` (see `validation/EXPECTED_RESULTS.md` §2.9).
- [ ] Invalid amounts and invalid dates are visible with their warning markers and are **never** shown as `₹0`.

## 4. Filtering

- [ ] **Filter Data** with every box empty reports *"Please provide at least one filter."* and changes nothing.
- [ ] **Date** — a specific date returns only that day's records (day-first: `03/04/2026` is 3 April 2026).
- [ ] **Today** returns only today's records; **Yesterday** only yesterday's (computer-local calendar day).
- [ ] **Name** — typing narrows the suggestions, arrow keys and <kbd>Enter</kbd> pick one, <kbd>Esc</kbd> closes the list.
- [ ] **Vehicle Number** — `up-32-ab-1234` finds `UP32AB1234` (separators ignored, no fuzzy guessing).
- [ ] **Amount** — exact value returns exactly the matching records.
- [ ] **Amount** — minimum only, maximum only, and minimum + maximum (range) each work.
- [ ] A minimum larger than the maximum is rejected inline and the previous results stay on screen.
- [ ] Two, three and four filters together combine with **AND**.
- [ ] A filter combination with no matches shows *"No matching records"* with `₹0` and `—`, and the dataset, the filters and the export control stay usable.
- [ ] Chips appear for every active filter, each chip has a visible name and a remove button, and removing a chip re-runs the filter immediately.
- [ ] **Clear Filters** returns to the full dataset and the *"No filters applied yet"* hint.
- [ ] The filtered figures (`Filtered Records`, `Total Amount`, `Average Amount`) match the rows listed in the table.
- [ ] With more than one page of results, applying a new filter returns the table to page 1 and the page count follows the matches.
- [ ] Pagination on `validation/Excel Data Analyzer - Pagination Data.xlsx` (130 records): the 50 page size gives **3 pages** (50 / 50 / 30), the 100 page size gives **2 pages** (100 / 30) and the 250 page size gives **1 page**; the counts add up to 130 and no record disappears.
- [ ] Pagination: `‹ Previous` / `Next ›`, page numbers and the 50/100/250 page-size selector all work; changing the page size returns to page 1; the buttons are disabled at the bounds.

## 5. Analytics

- [ ] The Dashboard shows the source card (file name, worksheet, imported row count, import time, session state) and **Change Excel File**.
- [ ] `Imported Records`, `Valid Amount Records`, `Total Amount`, `Average Amount`, `Invalid / Incomplete Records` match the workbook (check the total and the average against the table by hand).
- [ ] A workbook with no valid amount shows `—` with an explanation, never a fake `₹0.00`.
- [ ] With a filter applied, the filtered figures are promoted above the baseline figures, and the imported figures keep their imported meaning.
- [ ] **Payment Mode Breakdown** shows one row per mode with count, share and total; a blank or unrecognised mode appears as *Unknown / Missing* and is never dropped.
- [ ] **Amount Distribution** shows the five application-defined ranges (₹0–499, ₹500–999, ₹1 000–4 999, ₹5 000–9 999, ₹10 000 and above) with counts and shares of the valid amounts.
- [ ] **Data Quality** counts each category; the summary shows total records, records with at least one problem and the percentage; a record with several problems appears once in the affected count.
- [ ] Clicking a quality category opens the affected rows in the existing table under a *Data Quality Inspection* banner; the filters, the totals and the export control are unchanged; **Back to results** restores exactly the previous screen.
- [ ] **Duplicate Insight** on the main fixture shows **2 groups of 6 records**: rows 20–22 (the exact triple) and rows 23, 27, 28 (vehicle separators and name spacing ignored).
- [ ] Rows 24 (amount changed), 25 (payment reason changed), 26 (vehicle changed) and 34 (remark changed only) are **not** in any group — a record that differs by one field is a different record.
- [ ] The notice *"Possible duplicate records are informational only. No records have been removed."* is present; clicking a group opens those rows; nothing is deleted, merged or labelled fraudulent.
- [ ] Inspections are keyboard reachable (<kbd>Tab</kbd> to the card, <kbd>Enter</kbd> to open, focus ring visible).

## 6. Export

- [ ] **Export Data** without filters explains that all imported records are exported.
- [ ] With filters applied, **Export Excel** exports exactly the rows on screen.
- [ ] The native Windows save dialog appears, defaulting to `Filtered_Data_DD-MM-YYYY.xlsx` (or `Imported_Data_…` without filters).
- [ ] Cancelling the save dialog creates no file, shows no success and no error notification, and leaves the results unchanged.
- [ ] Saving into a path that contains spaces (for example `C:\My Documents\Release Test\Export One.xlsx`) succeeds.
- [ ] Saving into a path that contains Unicode characters and parentheses succeeds.
- [ ] Saving over the workbook that is currently loaded is refused with *"That is the workbook that is currently loaded…"* and the original file is unchanged.
- [ ] Saving into an unwritable location (for example `C:\Windows\System32\…` or a read-only folder) shows *"The filtered data could not be saved. Please choose another location and try again."* and the dataset stays usable.
- [ ] The success notification appears only after the file was really written and states the record count (*"Export completed successfully."* / *"24 records exported."*).
- [ ] Opening the exported workbook in Excel: the columns are exactly `Date`, `Name`, `Vehicle Number`, `Payment Mode`, `Amount`, `Payment Reason`, `Remark` in that order.
- [ ] In Excel, `Amount` is a real number (sums correctly, right-aligned) and `Date` is shown as `DD/MM/YYYY`.
- [ ] Row count, order and contents equal the rows that were on screen; blank optional values are blank, not `0` or `—`.
- [ ] Invalid amounts stay blank in the export (never `0`), and duplicates are exported as separate rows.
- [ ] With no matching records the export control is disabled and reads *"No records available to export."*.

## 7. Window behaviour

- [ ] The window opens at a usable size; resizing it keeps the layout intact.
- [ ] Resizing down to the minimum (900 × 620) keeps the layout usable (no overlapping sections, no clipped statistics).
- [ ] At maximized size (1920 × 1080) the dashboard and the table stay readable and aligned.
- [ ] **Minimize**, **Maximize/Restore** and **Close** in the custom title bar work.
- [ ] Double-clicking the title bar maximizes/restores.
- [ ] Relaunching after closing starts cleanly (no leftover state, no error dialog).
- [ ] Smooth scrolling works in the page, and the table scrolls horizontally on narrow widths without trapping the wheel.

## 8. Accessibility (quick pass)

- [ ] <kbd>Tab</kbd> reaches every control, and the focus ring is visible on each.
- [ ] <kbd>Enter</kbd> activates buttons, <kbd>Esc</kbd> closes popovers/tooltips.
- [ ] Only-icon controls (window controls) announce a name to a screen reader.
- [ ] The Windows high-contrast / dark system setting does not make text unreadable.

## 9. Offline

- [ ] Disconnect the network (turn Wi-Fi off / unplug the cable).
- [ ] Launch the application → it opens normally.
- [ ] Import a workbook → it imports.
- [ ] Filter records → the results and totals are correct.
- [ ] Open the Dashboard → the analytics render.
- [ ] Inspect data quality and duplicates → both work.
- [ ] Export a workbook → the save dialog and the write succeed.
- [ ] While the application is open, check it makes no network connections (for example with *Resource Monitor → Network*, or by watching a firewall prompt): nothing should appear.

## 10. Uninstallation

- [ ] The application closes normally before uninstalling.
- [ ] **Windows Settings → Apps → Installed apps → Excel Data Analyzer → Uninstall** runs the uninstaller without elevation.
- [ ] The uninstaller completes without an error.
- [ ] The Start-menu entry is removed; the desktop shortcut is removed.
- [ ] The installation directory under `%LOCALAPPDATA%\Programs\` is removed.
- [ ] *Installed apps* no longer lists the application.
- [ ] Reinstalling afterwards works and the application starts normally.

## 11. Portable build (optional, if `npm run dist:win:portable` was run)

- [ ] `release/Excel Data Analyzer-0.2.0-Portable.exe` starts by double-clicking, without installing.
- [ ] It installs nothing: *Installed apps* and the Start menu stay unchanged.
- [ ] It writes no files next to itself (the folder it lives in stays unchanged after import, filter and export).
- [ ] Core workflow (import → filter → dashboard → export) works identically to the installed build.
- [ ] Closing it leaves no `%TEMP%` leftovers that hold open file handles.

## 12. Interface and visual quality

- [ ] At the default window size the layout has a clear hierarchy: cards align, spacing is even, nothing overlaps and nothing is clipped.
- [ ] At the maximized size the dashboard, the table and the inspection views stay aligned and readable (no stretched or collapsed columns).
- [ ] Hovering a row, button or card gives immediate, subtle feedback; moving the pointer away removes it without a flash or a flicker.
- [ ] Transitions and the toast/notification animations are short and calm — nothing bounces, loops or spins indefinitely.
- [ ] Long file names, long worksheet names, long names and long remarks truncate with an ellipsis and a tooltip that can be reached by keyboard, never overflow their cell.
- [ ] Empty states (no workbook loaded, no filters applied yet, no matching records) each explain what to do next, and read correctly rather than showing a blank panel.
- [ ] The import progress/loading state is visible while a workbook is being read and disappears when it finishes; the interface never looks frozen.
- [ ] Error states (missing columns, unreadable file, failed export) use the documented wording and are readable at both window sizes.
- [ ] Scrolling is smooth in the page and in the table; hover and focus states are visually distinguishable from each other.

---

## Sign-off

| Question | Answer |
| -------- | ------ |
| Was every box above executed? | yes / no (list the ones skipped) |
| Installer SHA-256 recorded? | yes / no |
| Any crash, hang or data loss? | yes / no (describe) |
| Was the source workbook ever modified? | must be **no** — if yes, stop the release |
| Was an export ever written without confirmation of the dialog? | must be **no** |
| Release decision | release / release with known issues / block |

Record the details in [`WINDOWS_RELEASE_REPORT-0.2.0.md`](WINDOWS_RELEASE_REPORT-0.2.0.md) (the
template is [`WINDOWS_RELEASE_REPORT_TEMPLATE.md`](WINDOWS_RELEASE_REPORT_TEMPLATE.md)). Every item
that was not executed must say **NOT EXECUTED** — that is a valid, useful answer, and it is the
honest one until it has really been run.
