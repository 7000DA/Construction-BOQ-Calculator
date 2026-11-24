"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("xlsx");
const normalizedDigits = value => value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^0-9]/g, "");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end("Not found"); return; }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    });
  });

  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", route =>
      route.fulfill({ path: path.resolve(__dirname, "../../node_modules/xlsx/dist/xlsx.full.min.js"), contentType: "text/javascript" })
    );
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await page.locator("#grand").waitFor();
    assert.equal(await page.locator(".section").count(), 2, "Fresh project should initialize with its two starter sections");

    await page.locator("#name").fill("CI Smoke Project");
    const first = page.locator(".section").first();
    await first.locator(".add-item").click();
    const row = first.locator("tbody tr").nth(1);
    assert.equal(await row.locator(".item-no").textContent(), "02", "Item numbers should increment automatically within a section");
    await row.locator("input.description").fill("Reinforced concrete");
    await row.locator("input.unit").fill("m3");
    assert.ok(!(await row.locator("input.description").evaluate(el => el.classList.contains("invalid-input"))), "Text descriptions must not be subjected to numeric validation");
    assert.ok(!(await row.locator("input.unit").evaluate(el => el.classList.contains("invalid-input"))), "Unit labels must not be subjected to numeric validation");
    await row.locator("input.numeric").nth(0).fill("2.5");
    await row.locator("input.numeric").nth(1).fill("2000");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^0-9]/g, "").startsWith("5000"));
    await row.locator("input.numeric").nth(1).fill("2100");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,250"));
    await row.locator("input.numeric").nth(1).fill("2000");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000"));

    await first.locator(".add-item").click();
    const disposableRow = first.locator("tbody tr").last();
    await disposableRow.locator("input.description").fill("Temporary test item");
    await disposableRow.locator("input.unit").fill("m");
    await disposableRow.locator("input.numeric").nth(0).fill("0.1");
    await disposableRow.locator("input.numeric").nth(1).fill("0.2");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000.02"));
    const [precisionDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#excelOut").click()
    ]);
    const precisionBook = XLSX.readFile(await precisionDownload.path());
    const precisionRows = XLSX.utils.sheet_to_json(precisionBook.Sheets.BOQ, { header: 1, defval: "" });
    const precisionItem = precisionRows.find(row => row[1] === "Temporary test item");
    assert.equal(Number(precisionItem[5]), 0.02, "Decimal multiplication must export the exact decimal result without binary floating-point noise");
    await row.locator("input.numeric").nth(0).fill("1234567890123456");
    await row.locator("input.numeric").nth(1).fill("1.000000000000001");
    assert.equal(await row.locator("input.numeric").nth(0).inputValue(), "1234567890123456", "Browser input must retain the high-precision quantity before export");
    assert.equal(await row.locator("input.numeric").nth(1).inputValue(), "1.000000000000001", "Browser input must retain the high-precision rate before export");
    const [highPrecisionDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#excelOut").click()
    ]);
    const highPrecisionBook = XLSX.readFile(await highPrecisionDownload.path());
    const highPrecisionRows = XLSX.utils.sheet_to_json(highPrecisionBook.Sheets.BOQ, { header: 1, defval: "" });
    const highPrecisionItem = highPrecisionRows.find(itemRow => itemRow[1] === "Reinforced concrete");
    assert.equal(highPrecisionItem[3], "1234567890123456", "Excel export should preserve high-precision quantities as text instead of silently rounding. Rows: " + JSON.stringify(highPrecisionRows));
    assert.equal(highPrecisionItem[4], "1.000000000000001", "Excel export should preserve high-precision rates as text instead of silently rounding");
    assert.equal(highPrecisionItem[5], "1234567890123457.234567890123456", "Excel export should calculate and preserve high-precision amounts as text");
    await row.locator("input.numeric").nth(0).fill("2.5");
    await row.locator("input.numeric").nth(1).fill("2000");
    await disposableRow.locator("input.numeric").nth(0).fill("1");
    await disposableRow.locator("input.numeric").nth(1).fill("100");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,100"));
    await disposableRow.locator(".remove").click();
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000"));

    await row.locator("input.numeric").nth(0).fill("-2");
    assert.ok(await row.locator("input.numeric").nth(0).evaluate(el => el.classList.contains("invalid-input")), "Negative quantities should be visibly invalid");
    assert.ok((await page.locator("#grand").textContent()).includes("0.00"), "Invalid negative quantities must be excluded from totals");
    await row.locator("input.numeric").nth(0).fill("1e-999999999999");
    assert.ok(await row.locator("input.numeric").nth(0).evaluate(el => el.classList.contains("invalid-input")), "Extreme exponents must be rejected before decimal arithmetic");
    assert.equal(pageErrors.length, 0, "Unsupported numeric precision must not cause browser errors");
    await row.locator("input.numeric").nth(0).fill("1e101");
    assert.ok(await row.locator("input.numeric").nth(0).evaluate(el => el.classList.contains("invalid-input")), "Values that could overflow line-item calculations must be rejected");
    assert.equal(pageErrors.length, 0, "Out-of-range values must not cause browser errors");
    await row.locator("input.numeric").nth(0).fill("-2");
    await page.waitForTimeout(500);
    assert.ok((await page.locator("#saveState").textContent()).includes("Saved valid data"), "The save indicator should distinguish saved data from highlighted invalid edits");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#grand").waitFor();
    assert.equal(await page.locator(".section").first().locator("tbody tr").last().locator("input.numeric").nth(0).inputValue(), "2.5", "Invalid edits must not poison the last valid saved quantity");
    assert.ok((await page.locator("#grand").textContent()).includes("5,000"), "Reload should recover the last valid saved calculation");
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Project information should persist after reload");
    assert.equal(await page.locator(".section").first().locator("tbody tr").count(), 2, "BOQ rows should persist after reload");
    assert.ok((await page.locator("#saveState").textContent()).includes("·"), "Last saved time should be visible after reload");
    await page.locator("#currency").selectOption("USD");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("$5,000.00"));
    await page.locator("#currency").selectOption("EGP");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000"));
    await page.locator("#units").selectOption("Imperial");
    assert.ok((await page.locator("#unitOptions option").evaluateAll(options => options.map(option => option.value))).includes("ft³/day"), "Imperial construction-rate unit suggestions should be available");
    assert.equal(await page.locator(".section").first().locator("tbody tr").last().locator("input.numeric").nth(0).inputValue(), "2.5", "Changing unit system must not convert stored quantities");
    await page.locator("#units").selectOption("Custom");
    assert.equal(await page.locator("#unitOptions option").count(), 0, "Custom unit mode should leave unit labels fully user-defined");
    await page.locator("#units").selectOption("Metric");
    assert.ok((await page.locator("#unitOptions option").evaluateAll(options => options.map(option => option.value))).includes("m³/day"), "Metric construction-rate unit suggestions should be available");

    await page.locator("#lang").click();
    await page.getByRole("heading", { name: "جدول الكميات", exact: true }).waitFor();
    assert.equal(await page.locator("#print").textContent(), "طباعة / PDF", "Print action should be translated into Arabic");
    assert.equal(await page.locator(".totals .grand small").textContent(), "الإجمالي العام", "Grand total label should be translated into Arabic");
    assert.equal(await page.locator("#units option[value=\"Metric\"]").textContent(), "متري", "Metric unit choice should be translated into Arabic");
    assert.equal(await page.locator("#units option[value=\"Imperial\"]").textContent(), "إنجليزي (Imperial)", "Imperial unit choice should be translated into Arabic");
    assert.equal(await page.locator("#units option[value=\"Custom\"]").textContent(), "مخصص", "Custom unit choice should be translated into Arabic");
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Language switching must not change project data");
    assert.ok((await page.locator(".note").textContent()).includes("تُحفظ المشروعات"), "Project instructions should be translated into Arabic");
    assert.ok((await page.locator(".note").textContent()).includes("تتطلب أدوات Excel اتصالًا بالإنترنت"), "Excel internet requirement should be documented in Arabic");
    await page.locator("#open").click();
    await page.locator("#projects").waitFor({ state: "visible" });
    await page.getByRole("heading", { name: "المشروعات المحفوظة", exact: true }).waitFor();
    await page.locator("#closeProjects").click();

    await page.locator("#lang").click(); // Restore English numeric formatting before total assertions.
    await page.locator("#addSection").click();
    assert.equal(await page.locator(".section").count(), 3, "Adding a section should create one independent section");
    const independentSection = page.locator(".section").last();
    const independentRow = independentSection.locator("tbody tr").last();
    await independentRow.locator("input.description").fill("Independent section item");
    await independentRow.locator("input.unit").fill("m2");
    await independentRow.locator("input.numeric").nth(0).fill("1");
    await independentRow.locator("input.numeric").nth(1).fill("300");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[^0-9]/g, "").startsWith("5300"));
    assert.ok(normalizedDigits(await independentSection.locator(".section-total").textContent()).startsWith("300"), "Section total should be independent from the grand total");
    page.once("dialog", dialog => dialog.accept());
    await independentSection.locator(".section-head .delete").click();
    assert.equal(await page.locator(".section").count(), 2, "Deleting a section should remove only that section");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000"));

    const importBook = XLSX.utils.book_new();
    const importSheet = XLSX.utils.aoa_to_sheet([
      ["Section", "Description", "Unit", "Quantity", "Unit Rate"],
      ["Concrete", "Imported concrete", "m3", 1, 500],
      ["Finishes", "Imported plaster", "m2", 2, 100],
      ["Finishes", "Invalid row", "", 1, 100],
      ["Finishes", "Whitespace quantity", "m2", "   ", 100]
    ]);
    XLSX.utils.book_append_sheet(importBook, importSheet, "BOQ");
    const importBuffer = XLSX.write(importBook, { type: "buffer", bookType: "xlsx" });
    await page.locator("#excelFile").setInputFiles({
      name: "grouped-import.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: importBuffer
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 4, "Every imported row must be visible in the preview");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("2 valid"), "Import preview should report valid rows");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("2 invalid"), "Import preview should report invalid rows, including whitespace-only numbers");
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Excel import should preserve distinct section groups");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,700"));

    const ambiguousBook = XLSX.utils.book_new();
    const ambiguousSheet = XLSX.utils.aoa_to_sheet([
      ["Description", "Description", "Unit", "Quantity", "Unit Rate"],
      ["Ambiguous item", "Should not import", "m2", 1, 100]
    ]);
    XLSX.utils.book_append_sheet(ambiguousBook, ambiguousSheet, "BOQ");
    const ambiguousDialog = page.waitForEvent("dialog");
    await page.locator("#excelFile").setInputFiles({
      name: "ambiguous-headers.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(ambiguousBook, { type: "buffer", bookType: "xlsx" })
    });
    const rejectedWorkbook = await ambiguousDialog;
    assert.ok(rejectedWorkbook.message().includes("Could not read this workbook"), "Ambiguous duplicate Excel headers must be rejected");
    await rejectedWorkbook.accept();
    assert.equal(await page.locator(".section").count(), 4, "Rejected Excel workbooks must not change existing sections");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "Rejected Excel workbooks must not change existing totals");

    const missingUnitBook = XLSX.utils.book_new();
    const missingUnitSheet = XLSX.utils.aoa_to_sheet([
      ["Description", "Quantity", "Unit Rate"],
      ["Missing unit", 1, 100]
    ]);
    XLSX.utils.book_append_sheet(missingUnitBook, missingUnitSheet, "BOQ");
    const missingUnitDialog = page.waitForEvent("dialog");
    await page.locator("#excelFile").setInputFiles({
      name: "missing-unit-column.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(missingUnitBook, { type: "buffer", bookType: "xlsx" })
    });
    const rejectedMissingUnit = await missingUnitDialog;
    assert.ok(rejectedMissingUnit.message().includes("Could not read this workbook"), "Unit Rate must never be misidentified as the required Unit column");
    await rejectedMissingUnit.accept();
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "Missing required Excel columns must not alter project totals");

    const duplicateBook = XLSX.utils.book_new();
    const duplicateSheet = XLSX.utils.aoa_to_sheet([
      ["Section", "Description", "Unit", "Quantity", "Unit Rate"],
      ["  concrete  ", "Duplicate-section check", "m3", 0, 0]
    ]);
    XLSX.utils.book_append_sheet(duplicateBook, duplicateSheet, "BOQ");
    await page.locator("#excelFile").setInputFiles({
      name: "duplicate-section.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(duplicateBook, { type: "buffer", bookType: "xlsx" })
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Importing an existing section name must not create a duplicate section");
    const concreteRows = await page.locator(".section").evaluateAll(els => {
      const section = els.find(el => el.querySelector(".section-name").value === "Concrete");
      return section ? section.querySelectorAll("tbody tr").length : 0;
    });
    assert.equal(concreteRows, 2, "Rows imported into a matching section must be merged into it");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "A zero-value imported row must not change totals");

    await page.locator("#lang").click();
    const arabicBook = XLSX.utils.book_new();
    const arabicSheet = XLSX.utils.aoa_to_sheet([
      ["المجموعة", "وصف البند", "الوحدة", "الكمية", "سعر الوحدة"],
      ["اختبار عربي", "بند عربي", "م²", 1, 50]
    ]);
    XLSX.utils.book_append_sheet(arabicBook, arabicSheet, "BOQ");
    await page.locator("#excelFile").setInputFiles({
      name: "arabic-boq.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(arabicBook, { type: "buffer", bookType: "xlsx" })
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.ok((await page.locator("#previewInfo").textContent()).includes("صف صحيح"), "Arabic Excel headers should be recognized and previewed");
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 5, "Arabic Excel import should create the named section");
    assert.ok((await page.locator("#grand").textContent()).includes("٥٬٧٥٠"), "Arabic imported amounts should update the grand total");
    const arabicSection = page.locator(".section").last();
    assert.equal(await arabicSection.locator(".section-name").inputValue(), "اختبار عربي", "Arabic section names should be preserved");
    page.once("dialog", dialog => dialog.accept());
    await arabicSection.locator(".section-head .delete").click();
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("٥٬٧٠٠"));
    await page.locator("#lang").click();
    await page.locator("#excelFile").setInputFiles({ name: "grouped-import.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: importBuffer });
    await page.locator("#preview").waitFor({ state: "visible" });
    await page.locator("#cancelImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Reselecting the same Excel file must reopen preview without changing data");
    await page.locator("#excelFile").setInputFiles({ name: "simple-import.csv", mimeType: "text/csv", buffer: Buffer.from("Section,Description,Unit,Quantity,Unit Rate\nCSV review,CSV item,m,1,1\n") });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 1, "CSV import should parse and preview its data row");
    await page.locator("#cancelImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Canceling CSV preview must not change the project");

    const reorderedBook = XLSX.utils.book_new();
    const reorderedSheet = XLSX.utils.aoa_to_sheet([
      ["Unit Rate", "Description", "Quantity", "Unit", "Section"],
      ["12.5", "Reordered columns item", "3", "m2", "Reordered test"],
      [],
      ["", "", "", "", ""]
    ]);
    reorderedSheet.A2 = { t: "n", f: "6+6.5", v: 12.5 };
    XLSX.utils.book_append_sheet(reorderedBook, reorderedSheet, "BOQ");
    await page.locator("#excelFile").setInputFiles({
      name: "reordered-formula-text-numbers.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(reorderedBook, { type: "buffer", bookType: "xlsx" })
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 1, "Blank Excel rows should be ignored while the single populated row is previewed");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("1 valid"), "Reordered columns and numeric text should be accepted when values are valid");
    await page.locator("#cancelImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Canceling reordered Excel import must not alter the project");

    await page.locator("#excelFile").setInputFiles({
      name: "utf8-arabic-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Section,Description,Unit,Quantity,Unit Rate\nأعمال خرسانة,خرسانة مسلحة,m3,2,1500\n", "utf8")
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 1, "UTF-8 CSV import should expose its populated data row");
    assert.ok((await page.locator("#previewRows").textContent()).includes("خرسانة مسلحة"), "UTF-8 CSV import should preserve Arabic item descriptions");
    await page.locator("#cancelImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Canceling UTF-8 CSV preview must leave project data unchanged");

    const bulkBook = XLSX.utils.book_new();
    const bulkRows = [["Section", "Description", "Unit", "Quantity", "Unit Rate"]];
    for (let index = 1; index <= 125; index++) bulkRows.push(["Bulk test", "Bulk item " + index, "m", 1, 1]);
    XLSX.utils.book_append_sheet(bulkBook, XLSX.utils.aoa_to_sheet(bulkRows), "BOQ");
    await page.locator("#excelFile").setInputFiles({
      name: "bulk-125-items.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(bulkBook, { type: "buffer", bookType: "xlsx" })
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 125, "Excel preview must show every row beyond the first 100");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("125 valid"), "Bulk preview should validate every imported row");
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    await page.emulateMedia({ media: "print" });
    const multiPagePdf = await page.pdf({ format: "A4", printBackground: true });
    const multiPageDocument = await require("pdf-lib").PDFDocument.load(multiPagePdf);
    assert.ok(multiPageDocument.getPageCount() >= 2, "A large BOQ report must paginate into multiple PDF pages");
    await page.emulateMedia({ media: "screen" });
    const bulkSection = page.locator(".section").last();
    assert.equal(await bulkSection.locator("tbody tr").count(), 125, "All valid bulk rows should be imported");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,825"));
    const [bulkExportDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#excelOut").click()
    ]);
    const bulkExportBook = XLSX.readFile(await bulkExportDownload.path());
    const bulkExportRows = XLSX.utils.sheet_to_json(bulkExportBook.Sheets.BOQ, { header: 1, defval: "" });
    assert.equal(bulkExportRows.filter(row => String(row[1] || "").trim() && String(row[2] || "").trim() && typeof row[3] === "number" && typeof row[4] === "number").length, 129, "Excel export should preserve every valid item in a large BOQ");

    const performanceBook = XLSX.utils.book_new();
    const performanceRows = [["Section", "Description", "Unit", "Quantity", "Unit Rate"]];
    for (let index = 1; index <= 1000; index++) performanceRows.push(["Performance 1000", "Performance item " + index, "m", 1, 1]);
    XLSX.utils.book_append_sheet(performanceBook, XLSX.utils.aoa_to_sheet(performanceRows), "BOQ");
    const performanceStarted = Date.now();
    await page.locator("#excelFile").setInputFiles({
      name: "performance-1000-items.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(performanceBook, { type: "buffer", bookType: "xlsx" })
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 1000, "Large import preview should display all 1000 rows");
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    const performanceSection = page.locator(".section").last();
    assert.equal(await performanceSection.locator("tbody tr").count(), 1000, "The app should render all 1000 imported items");
    console.log("BOQ performance benchmark: 1000-row Excel preview + import + render = " + (Date.now() - performanceStarted) + " ms");
    page.once("dialog", dialog => dialog.accept());
    await performanceSection.locator(".section-head .delete").click();
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,825"));
    page.once("dialog", dialog => dialog.accept());
    await bulkSection.locator(".section-head .delete").click();
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,700"));

    const [excelDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#excelOut").click()
    ]);
    const exportedBook = XLSX.readFile(await excelDownload.path());
    const exportedRows = XLSX.utils.sheet_to_json(exportedBook.Sheets.BOQ, { header: 1, defval: "" });
    assert.ok(exportedRows.some(row => row[0] === "Concrete" && row[1] === "Imported concrete"), "Excel export should retain imported section names and items");
    assert.ok(exportedRows.some(row => row[4] === "Grand total" && Number(row[5]) === 5700), "Excel export should include the correct grand total");
    assert.ok(exportedRows.some(row => row[0] === "Project" && row[1] === "CI Smoke Project"), "Excel export should include project metadata");
    assert.equal(exportedRows.filter(row => String(row[1] || "").trim() && String(row[2] || "").trim() && typeof row[3] === "number" && typeof row[4] === "number").length, 4, "Excel export should contain only complete BOQ items and no blank item rows");

    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#jsonOut").click()
    ]);
    const backup = JSON.parse(fs.readFileSync(await jsonDownload.path(), "utf8"));
    assert.equal(backup.schemaVersion, 1, "JSON backup should declare its schema version");
    assert.equal(backup.project.sections.length, 4, "JSON backup should contain all imported sections");
    await page.locator("#name").fill("Temporary change");
    await page.waitForTimeout(500);
    await page.locator("#jsonFile").setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup))
    });
    await page.waitForFunction(() => document.querySelector("#name").value === "CI Smoke Project");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "JSON restore should recover project calculations");
    await page.locator("#jsonFile").setInputFiles({ name: "restore.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction(() => document.querySelector("#name").value === "CI Smoke Project");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "Reselecting the same JSON backup must restore without stale file-input state");

    const futureBackup = structuredClone(backup);
    futureBackup.project.schemaVersion = 99;
    const futureDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "future-version.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(futureBackup))
    });
    const rejectedDialog = await futureDialog;
    assert.ok(rejectedDialog.message().includes("Invalid BOQ backup"), "Unsupported future backup versions should be rejected clearly");
    await rejectedDialog.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected backup must not overwrite the current project");

    const negativeBackup = structuredClone(backup);
    negativeBackup.project.sections[0].items[0].qty = -1;
    const invalidDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "negative-quantity.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(negativeBackup))
    });
    const invalidRestore = await invalidDialog;
    assert.ok(invalidRestore.message().includes("Invalid BOQ backup"), "Negative quantities in JSON backups must be rejected");
    await invalidRestore.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected invalid numeric backup must preserve the current project");

    const whitespaceBackup = structuredClone(backup);
    whitespaceBackup.project.sections[0].items[0].qty = "   ";
    const whitespaceDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "whitespace-quantity.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(whitespaceBackup))
    });
    const rejectedWhitespace = await whitespaceDialog;
    assert.ok(rejectedWhitespace.message().includes("Invalid BOQ backup"), "Whitespace-only numeric values in JSON backups must be rejected");
    await rejectedWhitespace.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected whitespace backup must preserve current project");

    const oversizedNumberBackup = structuredClone(backup);
    oversizedNumberBackup.project.sections[0].items[0].qty = "1e101";
    const oversizedNumberDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "oversized-number.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(oversizedNumberBackup))
    });
    const rejectedOversizedNumber = await oversizedNumberDialog;
    assert.ok(rejectedOversizedNumber.message().includes("Invalid BOQ backup"), "Unsupported oversized decimal exponents must be rejected");
    await rejectedOversizedNumber.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected oversized-number backup must preserve current project");

    const duplicateIdBackup = structuredClone(backup);
    duplicateIdBackup.project.sections[0].items[0].id = duplicateIdBackup.project.sections[0].id;
    const duplicateIdDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "duplicate-ids.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(duplicateIdBackup))
    });
    const rejectedDuplicateId = await duplicateIdDialog;
    assert.ok(rejectedDuplicateId.message().includes("Invalid BOQ backup"), "Duplicate item identifiers must be rejected");
    await rejectedDuplicateId.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected duplicate-ID backup must preserve current project");

    const unknownFieldBackup = structuredClone(backup);
    unknownFieldBackup.project.info.unexpectedField = "must not be accepted";
    const unknownFieldDialog = page.waitForEvent("dialog");
    await page.locator("#jsonFile").setInputFiles({
      name: "unknown-info-field.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(unknownFieldBackup))
    });
    const rejectedUnknownField = await unknownFieldDialog;
    assert.ok(rejectedUnknownField.message().includes("Invalid BOQ backup"), "Unknown project metadata fields must be rejected");
    await rejectedUnknownField.accept();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Rejected unknown-field backup must preserve current project");

    const originalViewport = page.viewportSize();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        main: document.querySelector("main").getBoundingClientRect().width,
        tableViewport: document.querySelector(".table-wrap").getBoundingClientRect().width,
        tableContent: document.querySelector(".table-wrap table").scrollWidth
      }));
      assert.ok(layout.document <= layout.viewport, "Page must not create horizontal viewport overflow at " + viewport.width + "px");
      assert.ok(layout.main <= layout.viewport, "Main content must fit the viewport at " + viewport.width + "px");
      assert.ok(layout.tableContent >= layout.tableViewport, "BOQ table should remain horizontally scrollable within its wrapper on narrow screens");
    }
    await page.setViewportSize(originalViewport);

    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("header").evaluate(el => getComputedStyle(el).display), "none", "Print output must hide navigation controls");
    assert.equal(await page.locator(".section-head .delete").first().evaluate(el => getComputedStyle(el).display), "none", "Print output must hide destructive section controls");
    assert.equal(await page.locator(".section tbody tr.incomplete").first().evaluate(el => getComputedStyle(el).display), "none", "Print output must omit incomplete BOQ rows");
    assert.equal(await page.locator(".section").first().evaluate(el => getComputedStyle(el).breakInside), "auto", "Long BOQ sections must be allowed to split across printed pages");
    assert.equal(await page.locator(".section thead").first().evaluate(el => getComputedStyle(el).display), "table-header-group", "BOQ table headings must repeat on printed pages");
    assert.equal(await page.locator(".section tbody tr").first().evaluate(el => getComputedStyle(el).breakInside), "avoid", "Individual BOQ rows should not split across printed pages");
    assert.equal(await page.locator(".section").count(), 4, "Print layout must retain BOQ sections");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "Print layout must retain the grand total");
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    assert.ok(pdf.subarray(0, 5).toString() === "%PDF-", "Print output should produce a valid PDF document");
    assert.ok(pdf.length > 1000, "PDF report should contain rendered content");

    assert.deepEqual(pageErrors, [], "The page must not throw uncaught JavaScript errors");

    const recoveryPage = await context.newPage();
    const recoveryErrors = [];
    recoveryPage.on("pageerror", error => recoveryErrors.push(error.message));
    await recoveryPage.addInitScript(() => {
      localStorage.setItem("professional-boq-v1-projects", JSON.stringify([
        { id: "unsupported", schemaVersion: 99, info: {}, sections: [] },
        { id: "malformed", schemaVersion: 1, info: {}, sections: "not-an-array" }
      ]));
    });
    await recoveryPage.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await recoveryPage.locator("#grand").waitFor();
    assert.equal(await recoveryPage.locator(".section").count(), 2, "Corrupt saved projects must not prevent a fresh project from opening");
    await recoveryPage.evaluate(() => localStorage.removeItem("professional-boq-v1-projects"));
    await recoveryPage.locator("#lang").click();
    await recoveryPage.locator("#open").click();
    assert.ok((await recoveryPage.locator("#projectList").textContent()).includes("لا توجد مشروعات محفوظة بعد"), "Empty saved-project state should be translated into Arabic");
    await recoveryPage.locator("#closeProjects").click();
    await recoveryPage.evaluate(() => { window.__printCalled = false; window.print = () => { window.__printCalled = true; }; });
    await recoveryPage.locator("#print").click();
    assert.equal(await recoveryPage.evaluate(() => window.__printCalled), false, "Formal reports must require a project name");
    assert.ok(await recoveryPage.locator("#name").evaluate(el => el.validity.customError), "Missing project name should show a validation message");
    await recoveryPage.locator("#name").fill("Recovery project");
    await recoveryPage.locator("#print").click();
    assert.equal(await recoveryPage.evaluate(() => window.__printCalled), true, "A named project should be printable");
    assert.deepEqual(recoveryErrors, [], "Corrupt local project data must not cause uncaught errors");

    const lifecycleContext = await browser.newContext();
    const lifecyclePage = await lifecycleContext.newPage();
    await lifecyclePage.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await lifecyclePage.locator("#grand").waitFor();
    const activeProjectId = await lifecyclePage.evaluate(() => JSON.parse(localStorage.getItem("professional-boq-v1-projects"))[0].id);
    await lifecyclePage.locator("#name").fill("Project pending deletion");
    await lifecyclePage.locator("#open").click();
    await lifecyclePage.locator("#projectList .saved").first().waitFor();
    lifecyclePage.once("dialog", dialog => dialog.accept());
    await lifecyclePage.locator("#projectList .saved .danger").first().click();
    await lifecyclePage.waitForTimeout(600);
    const remainingProjectIds = await lifecyclePage.evaluate(() => JSON.parse(localStorage.getItem("professional-boq-v1-projects") || "[]").map(project => project.id));
    assert.ok(!remainingProjectIds.includes(activeProjectId), "Deleting the currently open project must cancel pending autosave and must not recreate the deleted project");
    assert.equal(await lifecyclePage.locator("#sections .section").count(), 0, "Deleting the active project should leave a clean unsaved workspace");
    await lifecycleContext.close();

    const legacyPage = await context.newPage();
    await legacyPage.addInitScript(() => {
      localStorage.setItem("professional-boq-v1-projects", JSON.stringify([{
        id: "legacy-project",
        info: { name: "Legacy BOQ" },
        sections: [{
          id: "legacy-section",
          name: "Legacy works",
          items: [{ id: "legacy-item", description: "Legacy concrete", unit: "m3", qty: "2", rate: "10" }]
        }]
      }]));
    });
    await legacyPage.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await legacyPage.locator("#grand").waitFor();
    assert.equal(await legacyPage.locator("#name").inputValue(), "Legacy BOQ", "Legacy projects without schemaVersion or savedAt must remain readable");
    assert.equal(await legacyPage.locator(".section-name").inputValue(), "Legacy works", "Legacy section names must be preserved");
    assert.ok((await legacyPage.locator("#grand").textContent()).includes("20"), "Legacy BOQ quantities and rates must retain their calculation");
    await legacyPage.locator("#save").click();
    const migratedLegacy = await legacyPage.evaluate(() => JSON.parse(localStorage.getItem("professional-boq-v1-projects")).find(project => project.id === "legacy-project"));
    assert.equal(migratedLegacy.schemaVersion, 1, "Saving a legacy project should write the current schema version");
    assert.ok(typeof migratedLegacy.savedAt === "string" && Number.isFinite(Date.parse(migratedLegacy.savedAt)), "Saving a legacy project should populate a valid savedAt timestamp");
    await legacyPage.close();

    const storageContext = await browser.newContext();
    const storagePage = await storageContext.newPage();
    await storagePage.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new DOMException("Quota exceeded", "QuotaExceededError"); };
    });
    await storagePage.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await storagePage.locator("#grand").waitFor();
    assert.ok((await storagePage.locator("#saveState").textContent()).includes("Local save failed"), "Unavailable local storage must be reported without crashing");
    await storagePage.locator("#name").fill("Backup-only project");
    await storagePage.waitForTimeout(500);
    let saveFailureMessage = "";
    storagePage.on("dialog", async dialog => {
      if (dialog.type() === "confirm") await dialog.accept();
      else { saveFailureMessage = dialog.message(); await dialog.accept(); }
    });
    await storagePage.locator("#newProject").click();
    assert.ok(saveFailureMessage.includes("could not save this project"), "A failed save must be reported before starting another project");
    assert.equal(await storagePage.locator("#name").inputValue(), "Backup-only project", "Starting a new project after a failed save must preserve the unsaved project in the current workspace");
    const [fallbackDownload] = await Promise.all([
      storagePage.waitForEvent("download"),
      storagePage.locator("#jsonOut").click()
    ]);
    const fallbackBackup = JSON.parse(fs.readFileSync(await fallbackDownload.path(), "utf8"));
    assert.equal(fallbackBackup.project.info.name, "Backup-only project", "JSON backup must remain available when local storage fails");
    await storageContext.close();
    await recoveryPage.close();

    const unreadableStoragePage = await context.newPage();
    await unreadableStoragePage.addInitScript(() => {
      localStorage.setItem("professional-boq-v1-projects", "{corrupt-json");
    });
    await unreadableStoragePage.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await unreadableStoragePage.locator("#grand").waitFor();
    assert.ok((await unreadableStoragePage.locator("#saveState").textContent()).includes("unreadable"), "Corrupt local storage must be reported instead of treated as empty");
    assert.equal(await unreadableStoragePage.evaluate(() => localStorage.getItem("professional-boq-v1-projects")), "{corrupt-json", "Corrupt local storage must not be overwritten during startup");
    await unreadableStoragePage.locator("#open").click();
    assert.ok((await unreadableStoragePage.locator("#projectList").textContent()).includes("unreadable"), "Saved-project browser must explain unreadable storage without crashing");
    await unreadableStoragePage.close();
    console.log("V1 browser tests passed: numeric validation, persistence, bilingual interface, sections, grouped/ambiguous Excel handling, strict JSON restore and generated PDF output.");
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
