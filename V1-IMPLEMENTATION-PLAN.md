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
