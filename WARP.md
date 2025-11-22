# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This repository contains a lightweight, fully client-side web dashboard that visualizes PhD research projects from an uploaded Excel spreadsheet. There is **no backend** and **no build tooling**; everything runs in the browser via `index.html` plus static assets.

Key characteristics:
- Data source: user-uploaded Excel (`.xlsx`/`.xls`) file that must contain a single worksheet with these exact column headers: `Domain`, `Project Type`, `Title`, `Funding Agency`, `Amount(in lakhs)`, `Status`, `Faculty Name`.
- Tech stack: plain HTML/CSS/JavaScript, [Chart.js] (via CDN) for charts, and [SheetJS / xlsx] (via CDN) for Excel parsing.
- Output: summary cards, interactive charts, and a scrollable table of all projects.

For details on the expected Excel format and feature list, see `README.md`.

## How to Run / Develop

There is no build step, package manager, or test framework configured for this project. Development is done directly against the static files.

Typical ways to run locally:
- **Open directly in a browser** (as described in `README.md`):
  - Open `index.html` in a modern browser (Chrome, Edge, Firefox) via the file system UI.
- **Or serve the folder with a simple static server** (optional, if you prefer `http://localhost`):
  - Using Python (if available):
    - `python -m http.server 8000`
    - Then open `http://localhost:8000/index.html` in your browser.

There are currently **no linting or automated test commands** defined (no `package.json`, `pytest`, etc.). If you introduce tooling (e.g., ESLint, Jest, or a bundler), document the commands here and in `README.md`.

## High-Level Architecture

The app is structured as a small, self-contained front-end:

- `index.html`
  - Declares the overall layout: header, upload controls, filter dropdowns, summary cards, three chart canvases, and a project details table.
  - Loads CSS from `./css/styles.css`.
  - Loads third-party scripts from CDNs:
    - `Chart.js` for bar/pie charts.
    - `xlsx.full.min.js` (SheetJS) for parsing Excel files in the browser.
  - Loads the main application script `./js/app.js` at the end of the `<body>`.

- `css/styles.css`
  - Provides the visual style and layout for the entire dashboard: dark theme, responsive layout, summary card grid, charts grid, and scrollable table.
  - No CSS preprocessor or build step is used; styles are written and consumed as plain CSS.

- `js/app.js`
  - Implements all runtime logic. The main responsibilities and data flow are:

    1. **DOM wiring and state**
       - Grabs references to the file input, filter dropdowns, summary fields, and table body using `document.getElementById` / `querySelector`.
       - Maintains an in-memory array `allRows` of normalized project records.
       - Maintains a `charts` object holding three Chart.js instance references so they can be destroyed and recreated when filters change.

    2. **File upload and Excel parsing**
       - `handleFileUpload` is registered as a listener on `fileInput`.
       - On change, it uses `FileReader.readAsArrayBuffer` to read the selected Excel file, then:
         - Uses `XLSX.read` to create a workbook from the binary data.
         - Reads the first sheet with `workbook.Sheets[firstSheetName]`.
         - Converts the sheet to JSON rows via `XLSX.utils.sheet_to_json(worksheet, { defval: "" })`.
       - Each raw row is passed through `normalizeRow` to produce a consistent object shape and types.

    3. **Row normalization** (`normalizeRow`)
       - Maps raw worksheet columns to canonical fields:
         - `Domain`, `ProjectType`, `Title`, `FundingAgency`, `Amount`, `Status`, `FacultyName`.
       - Trims strings and converts the `Amount(in lakhs)` column to a `Number` (removing commas and defaulting to `0` when parsing fails).
       - This normalization is the single source of truth for how spreadsheet columns map into the dashboard model.

    4. **Filters and options**
       - The current filter selection is read from the three `<select>` elements (`domainFilter`, `statusFilter`, `facultyFilter`).
       - `populateFilterOptions(rows)` builds unique sets of domains, statuses, and faculty names from `allRows` and populates the dropdowns using `fillSelect`.
       - `fillSelect`:
         - Clears the select, adds an `All` option, and appends one option per unique value (sorted lexicographically).
         - Attempts to preserve the previously selected value if it is still valid.
       - `applyFilters(rows)` applies the current dropdown selections to return a filtered subset used for rendering.

    5. **Rendering pipeline** (`render`)
       - Central orchestration function called after a file is loaded and whenever filters change:
         - If no rows exist, clears summary, table, and charts.
         - Otherwise, computes `filtered = applyFilters(rows)`.
         - Calls, in order:
           - `updateSummary(filtered)` – aggregates top-line metrics.
           - `renderTable(filtered)` – populates the table body.
           - `renderCharts(filtered)` – (re)builds the three charts.

    6. **Summary metrics** (`updateSummary` / `clearSummary`)
       - `updateSummary` computes:
         - `totalProjects`: number of filtered rows.
         - `totalFunding`: sum of `Amount` across filtered rows (displayed with 2 decimal places).
         - `uniqueDomains`: number of unique non-empty `Domain` values.
         - `statusBreakdown`: derived counts per `Status`, rendered as a `"Status: count"` pipe-separated string in the UI.
       - `clearSummary` resets these fields to `-` when there is no data.

    7. **Table rendering** (`renderTable` / `clearTable`)
       - `renderTable` builds a `<tr>` per filtered row and appends `<td>` cells for each field in the order defined by the table header.
       - `Amount` is formatted via `toFixed(2)`.
       - Uses a `DocumentFragment` to minimize DOM thrashing.
       - `clearTable` empties the `<tbody>` between renders.

    8. **Chart rendering** (`renderCharts` / `clearCharts` / `aggregateBy`)
       - `aggregateBy` is a general helper that accumulates either counts or sums keyed by some property (e.g., domain, status):
         - Without a `valueFn`, each row contributes `1` to its key (used for counts).
         - With a `valueFn`, each row contributes a numeric value (used for funding sums).
       - `renderCharts`:
         - Calls `clearCharts` to destroy any existing Chart.js instances.
         - Builds:
           - **Projects by Domain** (bar chart) using counts per domain.
           - **Funding by Domain** (bar chart) using summed `Amount` per domain.
           - **Projects by Status** (pie chart) using counts per status.
         - Uses a shared palette array to color bars/slices consistently.
         - Configures basic Chart.js options such as hiding legends on bar charts, enabling responsiveness, and setting tick label colors for better contrast on the dark theme.

This architecture assumes that **all state is front-end only** and tied to the current browser session; reloading the page or choosing a new file will reset the in-memory data.

## Guidelines for Future Changes

- When adding new data fields from the Excel sheet, update **all of these in sync**:
  - The expected column documentation in `README.md`.
  - `normalizeRow` in `js/app.js` to parse and normalize the new column.
  - The table header and row rendering (in `index.html` and `renderTable`).
  - Any summary metrics or charts that should incorporate the new field.
- When changing the Excel format (column names), keep `normalizeRow` as the single mapping layer from raw column names to internal field names so the rest of the app stays stable.
- If you introduce build tooling, tests, or additional libraries, prefer to:
  - Keep the public interface of `index.html` (DOM IDs and structure) stable where possible.
  - Add your new commands and conventions both here and in `README.md` so future agents can rely on them.
