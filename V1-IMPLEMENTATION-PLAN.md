# Professional BOQ V1.0 — Development Plan

This branch is isolated from `main`. The currently published version remains unchanged.

## Accepted scope
- Bilingual interface: Arabic / English.
- Metric, Imperial and custom unit labels. Changing the system does not convert quantities.
- Project information: name, BOQ reference, client, contractor, consultant, location and date.
- Multiple BOQ sections with editable names and add/remove items.
- Automatic item, section and grand totals. Incomplete rows are excluded from totals and exports.
- Base-10 decimal arithmetic for line amounts, section totals and grand totals to avoid binary floating-point calculation noise.
- Numeric input is bounded to prevent extreme exponents, unsupported decimal scales and calculation overflow; values outside the supported range are rejected without crashing the interface.
- Local project save/load and automatic saving.
- JSON backup and restore.
- Excel import with preview and validation; Excel export. The browser test suite stress-tests a 125-row import and export and verifies that the same input file can be selected repeatedly.
- Print-friendly report, suitable for saving as PDF.
- Input validation and schema versioning.
- Strict project-backup validation, unique record identifiers and safe recovery from malformed local data.
- Invalid numeric edits are excluded from calculations and cannot overwrite the last valid saved values.
- Ambiguous or incomplete Excel column mappings are rejected rather than guessed.
- Incomplete BOQ rows are omitted from formal print/PDF reports; formal reports require a project name.
- Excel import/export depends on the SheetJS CDN and therefore requires an internet connection.

## Acceptance checks
1. Add/edit/delete sections and items; totals recalculate.
2. Empty/incomplete rows are not included in totals or exports.
3. Language toggle does not alter project data.
4. Unit-system selection never silently converts quantities.
5. Saved projects survive reload in the same browser.
6. JSON backup restores the project.
7. Excel import previews rows and skips invalid rows only after confirmation.
8. Excel export contains project details, sections, valid items and totals.
9. Print layout includes project details and section/grand totals; generated PDF output is checked for a valid PDF signature.
10. Decimal calculations avoid binary floating-point noise; extreme exponent and overflow-range values are rejected safely.
11. Arabic and English labels, including unit-system choices, are verified in the browser.
12. Re-selecting the same Excel or JSON file triggers a fresh import/restore flow.

## Safety rule
Do not merge this branch into `main` or change GitHub Pages publishing until the new version passes the acceptance checks.


## Additional QA completed (2026-11-24)

- Excel export now writes values with more than 15 significant digits as text to avoid silent Excel numeric rounding. Values with safe precision remain numeric. Exported line amounts and grand totals are derived from the Base-10 decimal representation before choosing a numeric/text cell representation.
- Browser acceptance coverage verifies a 16-digit quantity, a high-precision rate and the exact product `1234567890123457.234567890123456` survive Excel export.
- PDF pagination is tested with a 125-item BOQ; the generated PDF must contain at least two pages.
- A 1,000-item Excel preview/import/render benchmark was measured in CI at **709 ms** in the latest successful run. This is a single CI measurement, not a performance guarantee.
- Latest QA workflow run: `45366044460`, conclusion **success**, branch head `381fb90369317ec80b47fdcc768370fe1a66c714`.
- Main branch and GitHub Pages remain unchanged. No merge or production deployment was performed.

- Latest browser test run after the bilingual precision warning update: `45366170089`, conclusion **success**, code head `78d11763d8ee66ee742a677aa071260590fd9f33`.
- The user-facing warning now states that values exceeding Excel's 15-significant-digit precision are exported as text to preserve digits and therefore are not usable as numeric operands in Excel formulas; JSON backup is identified as the exact source.


## Additional recovery and import QA (2026-11-24)

- Saved-project storage now validates every entry before returning the project list. A valid JSON array containing malformed or unsupported project records is treated as unreadable storage; the application opens a recoverable workspace but does not silently replace the original stored data.
- Browser tests cover a corrupt binary XLSX upload and verify that it is rejected without changing existing BOQ sections or totals.
- Browser tests cover exceptions thrown by `localStorage.getItem`; startup and the saved-project browser must remain usable and report unreadable storage.
- Browser tests verify malformed saved-project entries remain intact in storage and that deleting one saved project does not remove unrelated projects.
- Latest completed workflow before the multi-project test addition: run `45380160997`, conclusion **success**, commit `cc38feac1426e0a7a7dda764fc006ffffb173d57`.
- Latest multi-project and recovery browser-test run: `45380321752`, conclusion **success**, tested code commit `2e9861720875fdf550fa23e1bc405535da0e00ae`.
- The latest CI measured 1,000-row Excel preview + import + render at **612 ms** in that CI run. This is a single environment-specific measurement, not a performance guarantee.
- PDF pagination and print CSS are still not a substitute for a human visual inspection of rendered PDF pages, including Arabic RTL text and long descriptions.
