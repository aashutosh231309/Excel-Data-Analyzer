# Expected results — Windows validation workbook

This folder holds the fictional workbooks for the manual Windows release checks in
[`docs/WINDOWS_RELEASE_CHECKLIST.md`](../docs/WINDOWS_RELEASE_CHECKLIST.md), together with the
figures a correct application must show for each of them.

**Every value in this document was calculated from the fixture definition and then verified against
the application's own modules** — the real import pipeline (`electron/excel/workbook.ts`), the
analytics engine (`src/domain/analytics.ts`) and the filtering rules (`src/domain/filtering.ts`) were
loaded and run over the generated files on 2026-09-25, outside Windows. That verification is not
Windows testing: it only proves the fixtures and the numbers below belong together. The interface
must still reproduce them on the real machine, and the Windows run is what makes them evidence.

**All data is invented.** No real person, vehicle number, amount, remark or payment appears here.
The workbooks are not production data and must never be replaced with real records.

## 1. Files

| File | Purpose | Records |
| ---- | ------- | ------- |
| `Excel Data Analyzer - Validation Data.xlsx` | The main import, filtering, analytics and export workbook | 31 |
| `Excel Data Analyzer - Pagination Data.xlsx` | Enough rows to exercise page sizes 50 and 100 | 130 |
| `Excel Data Analyzer - Missing Vehicle Column.xlsx` | Import must be refused: a required column is absent | 3 |
| `Excel Data Analyzer - Corrupt Workbook.xlsx` | Import must fail cleanly: a truncated archive | 0 |
| `Excel Data Analyzer - Not a Workbook.xlsx` | A plain text file with a workbook extension | 0 |
| `Excel Data Analyzer - Legacy Validation Data.xls` | The legacy `.xls` import path | 7 |

Regenerate them at any time:

```powershell
node scripts/validation/windows-fixture.mjs --out validation --dated-today
```

Without `--dated-today` the workbooks are date-independent and every table below applies verbatim.
With `--dated-today` the main workbook gains two records dated today and yesterday, so the **Today**
and **Yesterday** filter checks have data on the day of the run; see section 4 for the adjusted
figures.

## 2. Main workbook — `Excel Data Analyzer - Validation Data.xlsx`

### 2.1 Worksheets

| Worksheet | Importable | Data rows | What the run must show |
| --------- | ---------- | --------- | ---------------------- |
| `Cover` | no | 0 | Never imported. It carries no transaction columns. |
| `Payments September` | yes | 31 | **Selected by default** — it holds the most data rows. |
| `Payments October` | yes | 4 | Offered by the worksheet switcher; switching re-loads the data without restarting. |

Worksheets are listed in that order. The default selection must not be the first sheet: the cover
sheet has no transaction columns, so this workbook also covers the *"a workbook whose first sheet has
no transaction columns falls back to the sheet that has them"* check.

### 2.2 What each row is for (`Payments September`)

Header row is row 1; records start at row 2.

| Row | Record | Purpose |
| --- | ------ | ------- |
| 2–10 | ₹0, ₹499, ₹500, ₹999, ₹1,000, ₹4,999, ₹5,000, ₹9,999, ₹10,000 | The nine boundary values of the amount distribution |
| 11 | Missing name (`UP65ST0123`, UPI, ₹1,500) | Missing field |
| 12 | Missing vehicle number (Jaya Nair, Cash, ₹1,500) | Missing field |
| 13 | Missing payment mode (Kiran Bose, ₹1,500) | Missing field — must appear as *Unknown / Missing*, never dropped |
| 14 | Blank amount (Lalita Joshi, UPI) | Unreadable amount — never counted as ₹0 |
| 15 | Amount `N/A` (Mohan Das, Cash) | Uninterpretable amount |
| 16 | Blank date (Nisha Gupta, UPI, ₹2,000) | Unreadable date |
| 17 | Missing payment reason (Ojas Kulkarni, ₹2,000) | Missing optional field |
| 18 | Blank remark (Priya Sharma, ₹2,000) | Missing optional field |
| 19 | `not a date`, blank name/vehicle/mode/reason/remark, amount `abc` | Seven problems on one record — counted once in the affected-record total |
| 20–22 | Sana Qureshi, UP32GH7890, Cash, ₹2,500, Fuel, *Exact duplicate row* | One exact duplicate group of three |
| 23–28 | Tanvi Desai, 20/09/2026, UPI, ₹3,000, remark *Near duplicate comparison row* | See the duplicate table below |
| 29–31 | Usha Rani `UP32XY4321`, Vikram Seth `up32 xy 4321`, Wasim Akram `UP-32-XY-4321` | One vehicle written three ways |
| 32 | Zoya Mirza, date written as the text `25/09/2026` | Day-first proof: day 25 cannot be a month |

### 2.3 Import summary card

| Item | Expected |
| ---- | -------- |
| Records | 31 |
| Total amount | ₹72,447.00 |
| Empty rows ignored | 0 |
| Records with a valid amount | 28 |
| Records needing attention | **2** (rows 15 and 19 — a value was present but could not be read) |
| Data rows scanned | 31 |

### 2.4 Dashboard figures

| Card | Expected |
| ---- | -------- |
| Imported Records | 31 |
| Valid Amount Records | 28 |
| Total Amount | ₹72,447.00 |
| Average Amount | ₹2,587.39 (₹7,24,4700 paise ÷ 28 = 258,739.28 paise, rounded to 258,739) |
| Invalid / Incomplete Records | **9** (rows 11–19: any missing field *or* unreadable value, each record once) |

`Records needing attention` (2) and `Invalid / Incomplete Records` (9) are different figures on
purpose: the first counts values that were present but unreadable, the second also counts missing
fields.

### 2.5 Payment mode breakdown

| Mode | Records | Share | Valid amounts | Total | Average |
| ---- | ------- | ----- | ------------- | ----- | ------- |
| UPI | 14 | 45.2% | 13 | ₹35,749.00 | ₹2,749.92 |
| Cash | 8 | 25.8% | 7 | ₹14,749.00 | ₹2,107.00 |
| Bank Transfer | 4 | 12.9% | 4 | ₹7,450.00 | ₹1,862.50 |
| Cheque | 3 | 9.7% | 3 | ₹12,999.00 | ₹4,333.00 |
| *Unknown / Missing* | 2 | 6.5% | 1 | ₹1,500.00 | ₹1,500.00 |

Rows 13 and 19 have no payment mode; they must appear under *Unknown / Missing* and must not
disappear from the other figures. Shares are rounded to one decimal, so they can add up to 100.1%.

### 2.6 Amount distribution

Only records with a valid amount are counted; shares are of the 28 valid amounts.

| Range | Records | Share | Total |
| ----- | ------- | ----- | ----- |
| ₹0 – ₹499 | 2 | 7.1% | ₹499.00 |
| ₹500 – ₹999 | 5 | 17.9% | ₹3,749.00 |
| ₹1,000 – ₹4,999 | 18 | 64.3% | ₹43,200.00 |
| ₹5,000 – ₹9,999 | 2 | 7.1% | ₹14,999.00 |
| ₹10,000 and above | 1 | 3.6% | ₹10,000.00 |

The nine boundary amounts must fall exactly as follows: ₹0 and ₹499 in the first range; ₹500 and
₹999 in the second; ₹1,000 and ₹4,999 in the third; ₹5,000 and ₹9,999 in the fourth; ₹10,000 in the
fifth.

### 2.7 Data quality

| Category | Records | Share of 31 |
| -------- | ------- | ----------- |
| Missing Name | 2 | 6.5% |
| Missing Vehicle Number | 2 | 6.5% |
| Missing Payment Mode | 2 | 6.5% |
| Missing Payment Reason | 2 | 6.5% |
| Missing Remark | 2 | 6.5% |
| Invalid Date | 2 | 6.5% |
| Invalid Amount | 3 | 9.7% |
| **Records with at least one problem** | **9** | **29.0%** |

Row 19 carries seven problems and must be counted **once** in the affected-record total and once in
each category it belongs to.

### 2.8 Duplicates

| Group | Rows | Why |
| ----- | ---- | --- |
| 1 | 20, 21, 22 | Three records identical in all seven fields |
| 2 | 23, 27, 28 | The same record; rows 27 and 28 differ only in vehicle separators and in name case/spacing |

**2 groups, 6 records.** The following rows must **not** be treated as exact duplicates, because each
one changes exactly one field:

| Row | Differs from row 23 by |
| --- | ---------------------- |
| 24 | Amount (₹3,001 instead of ₹3,000) |
| 25 | Payment Reason (*Seal repair* instead of *Fuel*) |
| 26 | Vehicle number (`UP65IJ8902`) |

Nothing is deleted, merged or relabelled by this view; the notice *"Possible duplicate records are
informational only. No records have been removed."* must be present.

### 2.9 Filtering

All populated filters combine with **AND**. Dates are day-first (`DD/MM/YYYY`), names ignore case and
repeated spaces, vehicles ignore case and separators, amounts are exact or a range.

| Filter | Records | Valid amounts | Total | Average |
| ------ | ------- | ------------- | ----- | ------- |
| Date `25/09/2026` | 1 | 1 | ₹1,200.00 | ₹1,200.00 |
| Name `Sana Qureshi` | 3 | 3 | ₹7,500.00 | ₹2,500.00 |
| Name `sana qureshi` (lower case) | 3 | 3 | ₹7,500.00 | ₹2,500.00 |
| Name `San` (not a name in the workbook) | 0 | 0 | ₹0.00 | — |
| Vehicle `UP32XY4321` | 3 | 3 | ₹2,250.00 | ₹750.00 |
| Vehicle `up32xy4321` | 3 | 3 | ₹2,250.00 | ₹750.00 |
| Vehicle `up-32-xy-4321` | 3 | 3 | ₹2,250.00 | ₹750.00 |
| Vehicle `UP32XY9999` (absent) | 0 | 0 | ₹0.00 | — |
| Amount exactly `2000` | 3 | 3 | ₹6,000.00 | ₹2,000.00 |
| Amount exactly `3000` | 5 | 5 | ₹15,000.00 | ₹3,000.00 |
| Amount at least `1000` | 21 | 21 | ₹68,199.00 | ₹3,247.57 |
| Amount up to `5000` | 26 | 26 | ₹52,448.00 | ₹2,017.23 |
| Amount `1000` – `5000` | 19 | 19 | ₹48,200.00 | ₹2,536.84 |
| Date `19/09/2026` + Name `Sana Qureshi` | 3 | 3 | ₹7,500.00 | ₹2,500.00 |
| Name `Sana Qureshi` + Vehicle `UP32GH7890` | 3 | 3 | ₹7,500.00 | ₹2,500.00 |
| Vehicle `UP32XY4321` + Amount `700` – `800` | 3 | 3 | ₹2,250.00 | ₹750.00 |
| Date `20/09/2026` + Amount exactly `3000` | 5 | 5 | ₹15,000.00 | ₹3,000.00 |
| Date `20/09/2026` + Name `Tanvi Desai` + Vehicle `UP65IJ8901` + Amount exactly `3000` | 4 | 4 | ₹12,000.00 | ₹3,000.00 |
| Date `31/12/2026` + Name `Sana Qureshi` | 0 | 0 | — | — |

Notes for the run:

- The last row of the four-filter case is 4, not 6: rows 24 (₹3,001) and 26 (`UP65IJ8902`) must be
  excluded, while row 27 (`UP-65-IJ-8901`) must be **included** — its separators are ignored.
- The vehicle `UP32XY4321` above is written three different ways (rows 29, 30, 31) and all three must
  match. A genuinely different registration (`UP32XY9999`) matches nothing.
- Name matching is exact after normalization: `Sana Qureshi` matches; the partial text `San` is not a
  name in the workbook and matches nothing. The selector narrows the *suggestion list* by substring,
  the filter itself matches the selected name after normalization.
- Amount matching is exact — `3000` matches five records and never `3001`.
- Zero-result combinations must show the empty state, must not crash, and the totals must not show
  misleading values; `Clear Filters` must restore all 31 records.
- Applying **no** filter at all is rejected with *"Please provide at least one filter."* and the
  dataset stays as it is.

### 2.10 Pagination

31 records, page sizes 50, 100 and 250: every size gives exactly one page, so the next/previous
buttons must be disabled. Use `Excel Data Analyzer - Pagination Data.xlsx` (section 5) for the page
behaviour itself.

### 2.11 Export

| Case | Expected |
| ---- | -------- |
| No filters | Button reads **Export Data**; helper *"No filters applied — exporting all imported records."*; the saved file holds all 31 records |
| With a filter | Button reads **Export Excel**; helper names the filtered record count; the saved file holds exactly the displayed records |
| Suggested file name | `Imported_Data_DD-MM-YYYY.xlsx`, or `Filtered_Data_DD-MM-YYYY.xlsx` when filtered — the name must still be editable in the dialog |
| Columns | Exactly seven, in this order: `Date`, `Name`, `Vehicle Number`, `Payment Mode`, `Amount`, `Payment Reason`, `Remark` |
| Amounts | Numeric cells (right-aligned, no currency symbol baked into the text), with the invalid amounts left empty — never `0` |
| Dates | `DD/MM/YYYY` |
| Cancel | No file, no error message, dataset unchanged |
| Saving over the loaded workbook | Refused: *"That is the workbook that is currently loaded. Choose another name so the original file stays untouched."* |
| Failure | *"The filtered data could not be saved. Please choose another location and try again."* |

A filtered export of the `19/09/2026` filter must therefore hold exactly 3 rows (Sana Qureshi,
₹2,500.00 each) plus the header.

## 3. Filters with `Today` and `Yesterday`

Run the generator with `--dated-today` on the test machine. The main workbook then holds **33**
records: the 31 above plus *Validation Today* (Cash, ₹1,111) and *Validation Yesterday* (UPI,
₹2,222), both dated on the day of the run.

| Figure | Value |
| ------ | ----- |
| Records | 33 |
| Valid amount records | 30 |
| Total amount | ₹75,780.00 |
| Average amount | ₹2,526.00 |
| Invalid / Incomplete Records | 9 |
| Duplicates | 2 groups, 6 records |
| Today filter | 1 record, ₹1,111.00 |
| Yesterday filter | 1 record, ₹2,222.00 |

Distribution changes: UPI 15 records / ₹37,971.00; Cash 9 / ₹15,860.00; the ranges ₹0–₹499 2,
₹500–₹999 5, ₹1,000–₹4,999 20 (₹46,533.00), ₹5,000–₹9,999 2, ₹10,000 and above 1. If the test date
itself is 25/09/2026, the written-date row from section 2.9 is dated the same day, so that filter
returns 2 records (₹2,311.00) instead of 1.

## 4. `Excel Data Analyzer - Missing Vehicle Column.xlsx`

The worksheet has six of the seven columns; `Vehicle Number` is absent.

| Item | Expected |
| ---- | -------- |
| Result | Import refused — nothing is loaded |
| Message | Title *"Required columns are missing"*, listing **Vehicle Number** |
| Previous dataset | Must remain loaded and usable when this file is chosen as a replacement |

## 5. `Excel Data Analyzer - Corrupt Workbook.xlsx`

A truncated archive (the file begins with a ZIP signature and ends in garbage).

| Item | Expected |
| ---- | -------- |
| Result | Import refused, no crash, no blank window |
| Message | *"Unable to read this Excel file. Please verify that it is a valid .xlsx or .xls workbook."* |

## 6. `Excel Data Analyzer - Not a Workbook.xlsx`

A plain text file carrying a workbook extension. The reader accepts it as text and finds no
transaction columns, so the application reports missing columns rather than an unreadable file —
that is what it does today:

| Item | Expected |
| ---- | -------- |
| Result | Import refused, no crash, no blank window |
| Message | *"Required columns are missing"* listing Date, Name, Vehicle Number, Payment Mode and Amount |

Record what the machine actually shows. If the wording differs from the line above, that is a
finding to write down — not something to fix during the run.

## 7. `Excel Data Analyzer - Pagination Data.xlsx`

130 records, amount = row index × ₹100 (₹100 … ₹13,000), three dates cycling, three modes cycling,
every field populated.

| Figure | Value |
| ------ | ----- |
| Records | 130 |
| Valid amount records | 130 |
| Total amount | ₹8,51,500.00 |
| Average amount | ₹6,550.00 |
| Invalid / Incomplete Records | 0 |
| Duplicates | none |

| Range | Records | Total |
| ----- | ------- | ----- |
| ₹0 – ₹499 | 4 | ₹1,000.00 |
| ₹500 – ₹999 | 5 | ₹3,500.00 |
| ₹1,000 – ₹4,999 | 40 | ₹1,18,000.00 |
| ₹5,000 – ₹9,999 | 50 | ₹3,72,500.00 |
| ₹10,000 and above | 31 | ₹3,56,500.00 |

| Mode | Records | Total |
| ---- | ------- | ----- |
| Cash | 44 | ₹2,88,200.00 |
| UPI | 43 | ₹2,79,500.00 |
| Bank Transfer | 43 | ₹2,83,800.00 |

| Page size | Pages | Rows per page |
| --------- | ----- | ------------- |
| 50 | 3 | 50 / 50 / 30 |
| 100 | 2 | 100 / 30 |
| 250 | 1 | 130 |

`‹ Previous` must be disabled on page 1 and `Next ›` on the last page; changing the page size must
return to page 1; applying a filter must return to page 1 and the page count must follow the
matches. Filtered counts: date `28/09/2026` → 44 records (₹2,88,200.00); `29/09/2026` → 43
(₹2,79,500.00); `30/09/2026` → 43 (₹2,83,800.00); amount exactly `6500` → 1 (₹6,500.00); amount
`5000`–`9999` → 50 (₹3,72,500.00); name `Pagination Record 001` → 1 (₹100.00).

## 8. `Excel Data Analyzer - Legacy Validation Data.xls`

The legacy BIFF8 workbook, one worksheet, 7 records.

| Figure | Value |
| ------ | ----- |
| Records | 7 |
| Valid amount records | 6 |
| Total amount | ₹2,000.00 |
| Average amount | ₹333.33 (₹2,00,000 paise ÷ 6 = 33,333.33 → 33,333) |
| Invalid / Incomplete Records | 2 (28.6%) — one missing mode, one blank amount |
| Duplicates | 1 group, 2 records |
| Dates | 05/09, 06/09, **13/09** (written as text, day 13), 07/09, 08/09, 09/09, 09/09 — all 2026 |
| Modes | Cash 3 / ₹1,100.00; UPI 2 / ₹200.00; Cheque 1 / ₹300.00; *Unknown / Missing* 1 / ₹400.00 |
| Ranges | ₹0 – ₹499: 4; ₹500 – ₹999: 2; the other three: 0 |

## 9. Using this document during the run

1. Import each workbook as the relevant checklist item asks and compare the figures with the tables
   above.
2. Write **PASS**, **FAIL** or **NOT EXECUTED** next to each item in
   `docs/WINDOWS_RELEASE_REPORT-0.2.0.md`; never leave a cell ambiguous.
3. For a failure, record the expected value, the value actually shown, the steps, and whether it
   blocks the release. Do not fix anything during the run — reproduce it first.
4. Keep the run fictional. These files are the only data the release checks need.
