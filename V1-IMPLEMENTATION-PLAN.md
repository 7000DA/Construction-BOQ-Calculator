# Professional BOQ V1.0 — Development Plan

This branch is isolated from `main`. The currently published version remains unchanged.

## Accepted scope
- Bilingual interface: Arabic / English.
- Metric, Imperial and custom unit labels. Changing the system does not convert quantities.
- Project information: name, BOQ reference, client, contractor, consultant, location and date.
- Multiple BOQ sections with editable names and add/remove items.
- Automatic item, section and grand totals. Incomplete rows are excluded from totals and exports.
- Local project save/load and automatic saving.
- JSON backup and restore.
- Excel import with preview and validation; Excel export.
- Print-friendly report, suitable for saving as PDF.
- Input validation and schema versioning.

## Acceptance checks
1. Add/edit/delete sections and items; totals recalculate.
2. Empty/incomplete rows are not included in totals or exports.
3. Language toggle does not alter project data.
4. Unit-system selection never silently converts quantities.
5. Saved projects survive reload in the same browser.
6. JSON backup restores the project.
7. Excel import previews rows and skips invalid rows only after confirmation.
8. Excel export contains project details, sections, valid items and totals.
9. Print layout includes project details and section/grand totals.

## Safety rule
Do not merge this branch into `main` or change GitHub Pages publishing until the new version passes the acceptance checks.
