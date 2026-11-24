# V1 Release Readiness Review

**Review date:** 2026-11-24  
**Candidate:** Professional BOQ V1.0  
**Branch:** `feature/professional-boq-v1`  
**Release state:** NOT APPROVED — validation is in progress  
**Production rule:** Do not merge this branch or change GitHub Pages publishing without explicit owner approval.

## Executive result

The current V1 build has a useful engineering-estimating workflow and an extensive Chromium acceptance suite. The release review identified a vulnerable spreadsheet parser version in the initial candidate. The application and CI have now been updated to the official SheetJS 0.20.3 distribution, and upload-size limits plus security regression checks have been added. These changes still require a completed CI run before they can be treated as verified.

## 1. Security and project-data protection

### Findings and controls

| Area | Finding | Control / release note |
|---|---|---|
| Data location | Projects are stored in browser `localStorage`; there is no application server, account system, or cloud sync. | Data stays in the browser profile for this origin. It is not encrypted by the application. Do not use shared/public devices for confidential estimates. |
| Backups | JSON backup contains project details and BOQ data in readable form. | Treat exported JSON and Excel files as confidential project records. Store them in an approved company location. |
| Spreadsheet parser | The previous SheetJS 0.18.5 build was affected by CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS) when parsing crafted spreadsheet files. | Replaced the browser script with the official SheetJS 0.20.3 distribution. CI now installs the matching official package for tests. Confirm the final workflow passes before release. |
| Import size | Previously there was no explicit upper bound on imported file size. | JSON restore is limited to 10 MiB; Excel import is limited to 20 MiB. |
| DOM injection | Project rows and preview values are constructed with DOM nodes and text values, rather than inserting user-provided strings as HTML. | Static regression checks reject unsafe `innerHTML`, `document.write`, and `eval` usage in the application script. |
| Storage failures | Corrupt/unreadable local storage and quota/security exceptions can occur. | Existing recovery behavior reports unreadable storage and save failure; invalid stored data is not silently overwritten. Keep a separate JSON backup. |
| External dependency | Excel support loads a version-pinned script from the official SheetJS CDN. | Excel features require internet access and trust in the CDN delivery path. Offline/self-hosted vendoring and Subresource Integrity remain recommended hardening work. |

### Security decision

**The vulnerable 0.18.5 parser must not be restored.** The 0.20.3 upgrade is the minimum security correction for the current import feature. The application is a client-side estimating aid, not a secure records-management system: browser storage is accessible to scripts running in the same origin and to anyone with access to the browser profile.

References:
- SheetJS security advisories and supported fixed releases: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- CVE-2023-30533: https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- CVE-2024-22363: https://github.com/advisories/GHSA-5pgg-2g8v-p4x9

## 2. Browser compatibility

The CI workflow now includes a dedicated acceptance script with three targets:

| Target | Automated coverage | Interpretation |
|---|---|---|
| Chrome / Chromium | Core form interaction, calculation, save/reload, Arabic RTL, JSON/Excel export, print CSS | Chromium engine coverage |
| Microsoft Edge | Same acceptance path using the installed Edge channel | Actual Edge browser channel in CI |
| WebKit | Same acceptance path using Playwright WebKit | Safari-engine proxy, not the native Safari application |

The existing Chromium suite also exercises import validation, project recovery, large BOQs, Excel precision, PDF generation and pagination.

**Manual Safari gate:** Playwright WebKit is not identical to shipping Safari on macOS/iOS. Before release, open the deployed candidate in current Safari on macOS and, ideally, iPhone Safari; verify file selection/download behavior, Arabic RTL table scrolling, project persistence, Excel import/export and browser print-to-PDF. Record the tested Safari and OS versions here.

## 3. Final export / restore verification

| Format | Expected behavior | Existing automated evidence / gate |
|---|---|---|
| Excel export | Project metadata, section names, valid BOQ rows, exact decimal-derived line amounts and grand total. Values beyond Excel's 15-significant-digit numeric precision are exported as text to preserve digits. | Chromium suite verifies ordinary decimal output and high-precision text preservation. Cross-browser suite verifies the exported workbook can be read and contains the expected line amount. |
| Excel import | First worksheet must contain one unambiguous Description, Unit, Quantity and Unit Rate column. Rows are previewed; invalid rows are identified and only valid rows are imported after confirmation. | Existing browser suite covers valid, invalid, ambiguous and corrupt workbook cases, including large-row import. Re-run after SheetJS upgrade. |
| JSON backup | Full project snapshot, including metadata, sections and BOQ rows. | Existing suite covers backup, strict schema validation, malformed files, restore rollback when storage fails, and fresh-context persistence. |
| PDF | Browser print layout; incomplete rows and controls are omitted, headings repeat, long descriptions wrap, and sections may paginate. | Chromium suite generates a real PDF and checks PDF signature, content and pagination. Human visual inspection of English and Arabic pages remains required for the final candidate. |

Important: Excel's 15-significant-digit limit means a high-precision value exported as text will not behave as a numeric operand in Excel formulas. JSON remains the exact-value backup format.

## 4. Daily technical-office workflow review

### Strengths already present
- Project metadata for project name, BOQ reference, client, contractor, consultant, location, date, currency and unit system.
- Multiple named sections and repeatable BOQ rows.
- Automatic line, section and grand totals using base-10 decimal arithmetic.
- Incomplete or invalid rows are excluded from formal totals and exports.
- Automatic local saving, explicit save, project list, project deletion and recovery behavior.
- Arabic / English interface with RTL support.
- Metric, Imperial and Custom unit suggestions. Selecting a unit system does not silently convert existing quantities.
- Excel import preview and JSON backup / restore.
- Print-friendly report suitable for browser PDF output.

### Operational limitations to understand before daily use
- No central project sharing, permissions, audit trail, revision comparison or multi-user collaboration.
- No automatic cloud backup or cross-device synchronization.
- No built-in rate library, resource analysis, taxes, overhead, profit, escalation, cash flow, or contract-specific measurement rules.
- No drawing take-off or automatic quantity extraction.
- Unit-system selection changes suggestions only; it does not convert quantities.
- Excel import uses the first worksheet and requires clear, unambiguous column headings.
- Large projects are constrained by browser memory and local-storage quotas. The existing 5,000-row stress test is useful evidence, not a guarantee for every device or workbook.

### Suggested engineer's daily routine
1. Create a clearly named project and fill in the reference, client, location, date and currency.
2. Split the BOQ into logical work sections (e.g. preliminaries, earthworks, concrete, masonry, finishes, MEP).
3. Enter and check each item's description, unit, quantity and unit rate.
4. Review incomplete/highlighted rows and section totals before issuing a report.
5. Save explicitly at milestones and export a JSON backup to the approved project folder.
6. Export Excel for further company analysis, and PDF for a controlled review/issue copy.
7. Re-open the saved project after major imports or edits to confirm the correct revision is being used.

## 5. Release record and documentation

### Candidate change set
- Updated SheetJS browser dependency to official 0.20.3.
- Added 10 MiB JSON and 20 MiB Excel import limits.
- Added static security regression assertions.
- Added Edge and WebKit compatibility acceptance script and CI workflow step.
- Retained the existing Chromium functional, stress, persistence, import/export and PDF suite.

### Required final sign-off
- [ ] Latest CI workflow completes successfully on the exact candidate commit.
- [ ] Edge acceptance job passes.
- [ ] WebKit acceptance job passes; Safari manual gate is separately recorded.
- [ ] Excel import/export and JSON backup/restore pass after the parser upgrade.
- [ ] English and Arabic PDF pages are visually reviewed for the final candidate.
- [ ] No unexpected console/page errors in the supported browser tests.
- [ ] Owner explicitly approves V1.
- [ ] Only after approval: prepare merge and production publishing as a separate action.

## Current status

**Not release-ready until the updated CI result and manual Safari/PDF gates are reviewed.** No merge, release tag, or production deployment is authorized by this document.
