# Sales dashboard

A single-page sales dashboard that runs entirely in your browser. Drop an Excel
or CSV export on the left, read your numbers on the right.

There is no build step, no server and no database. `index.html` is the whole
application — inline CSS and JavaScript, with the
[SheetJS](https://sheetjs.com) spreadsheet reader pulled from a CDN.

## Opening it

Double-click **`index.html`**, or drag it onto a browser window. That's it.

The one thing it needs from the network is the SheetJS library (and the web
fonts). If you are offline, `.xlsx` files cannot be read — the page will say so
rather than fail quietly — but **`.csv` files still work**, because the CSV
reader is built into the page itself.

Your file is never uploaded. It is read in the browser and forgotten when you
close the tab; refreshing the page clears everything.

## What it shows

- **Total sales quantity** and **total sales amount** for the whole file.
- A **daily table** — one row per date, with the number of sales, the quantity
  and the amount. Click any column heading to sort by it.
- A **trend chart** of daily sales amount. Hover it, or focus it and use the
  arrow keys, to read a single day. The **Amount / Quantity** toggle at the top
  right switches which measure the chart plots.

Amounts are shown with thousands separators and 2 decimal places. Quantities
show decimals only if your file actually contains fractional quantities.

## Column names it recognises

You do not need to rename anything. The dashboard scores every heading in your
sheet, then checks the winning column's own values before trusting it — so a
column called "Units" holding `EA` / `BOX` is rejected as a quantity, and
"Unit Price" never gets mistaken for the line amount.

| Field | Headings it recognises (any of these, case-insensitive) |
|---|---|
| **Date** | `Date`, `Sale Date`, `Sales Date`, `Order Date`, `Invoice Date`, `Document Date`, `Billing Date`, `Transaction Date`, `Posting Date`, `Closed Date`, `Day` |
| **Quantity** | `Quantity`, `Qty`, `Sales Quantity`, `Order Quantity`, `Billed Quantity`, `Quantity Sold`, `Units Sold`, `Units`, `Pieces`, `Pcs`, `Volume`, `Count` |
| **Amount** | `Amount`, `Total`, `Revenue`, `Sales Amount`, `Net Amount`, `Gross Amount`, `Total Amount`, `Amount After VAT`, `Order Value`, `Sales Value`, `Line Total`, `Turnover`, `Value` |

Near-misses are matched too — `Amount (USD)`, `Sale Date (GMT)` and
`Net Amount after VAT` all resolve correctly. Headings such as `Due Date`,
`Unit Price`, `Discount`, `Commission Rate` and `Tax` are explicitly *excluded*
so they cannot win a slot.

**If a guess is wrong, fix it on screen.** The **Columns** section in the
sidebar shows which heading was used for each field and lets you pick a
different one; everything recalculates immediately. **Auto-detect** puts the
guesses back.

## Messy files

The dashboard is built for real exports, not tidy samples.

| Situation | What happens |
|---|---|
| Title rows above the headings | Found and skipped; you're told how many. |
| A repeated heading block mid-file | Detected and ignored. |
| Blank rows, or rows with no figures | Skipped and counted. |
| Numbers stored as text | Read. `$1,234.56`, `1.234,56`, `1 234,56`, `(1,275.00)` and the SAP-style `1275.00-` all parse, the last two as negatives. |
| Mixed date formats | `2026-03-07`, `07/03/2026`, `7.3.2026`, `7 Mar 2026`, `Mar 7, 2026`, `20260307` and Excel's own date serials are all understood. |
| `3/7/2026` — March or July? | Decided per column: if any date in it has a day above 12, the whole column is read day/month/year. You're told when that happens. |
| Rows with an unreadable date | Kept in the totals, left out of the daily breakdown — and a banner says how many, so the two never silently disagree. |
| More than one sheet | The first sheet loads by default; a **Sheet** picker in the sidebar switches between them. |
| A required column is missing | A plain error naming what is missing, and the list of headings it did find. Nothing is charted from a guess. |

Anything worth knowing about your file is listed under **About this file** in
the sidebar.

## Accepted formats

`.xlsx` · `.xls` · `.xlsm` · `.csv` · `.tsv`

CSV files are sniffed for comma, semicolon or tab delimiters, and quoted fields
containing commas are handled correctly.

## Currency

The currency symbol is guessed from the amount heading or its values — `$`, `€`,
`£`, `¥`, `₹`, AED and SAR are recognised, defaulting to `$`. It is display-only:
no conversion happens, and it does not affect any total.
