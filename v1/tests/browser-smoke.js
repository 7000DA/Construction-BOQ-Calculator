"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("xlsx");

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
    const row = first.locator("tbody tr").last();
    assert.equal(await row.locator(".item-no").textContent(), "02", "Item numbers should increment automatically within a section");
    await row.locator("input.description").fill("Reinforced concrete");
    await row.locator("input.unit").fill("m3");
    await row.locator("input.numeric").nth(0).fill("2.5");
    await row.locator("input.numeric").nth(1).fill("2000");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,000"));
    await page.waitForTimeout(700);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#grand").waitFor();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Project information should persist after reload");
    assert.equal(await page.locator(".section").first().locator("tbody tr").count(), 2, "BOQ rows should persist after reload");
    assert.ok((await page.locator("#grand").textContent()).includes("5,000"), "Calculated grand total should persist after reload");
    assert.ok((await page.locator("#saveState").textContent()).includes("·"), "Last saved time should be visible after reload");
    await page.locator("#units").selectOption("Imperial");
    assert.equal(await page.locator(".section").first().locator("tbody tr").last().locator("input.numeric").nth(0).inputValue(), "2.5", "Changing unit system must not convert stored quantities");

    await page.locator("#lang").click();
    await page.getByRole("heading", { name: "جدول الكميات", exact: true }).waitFor();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Language switching must not change project data");

    await page.locator("#addSection").click();
    assert.equal(await page.locator(".section").count(), 3, "Adding a section should create one independent section");
    page.once("dialog", dialog => dialog.accept());
    await page.locator(".section").last().locator(".section-head .delete").click();
    assert.equal(await page.locator(".section").count(), 2, "Deleting a section should remove only that section");
    await page.locator("#lang").click(); // Use English numeric formatting for deterministic total assertions.

    const importBook = XLSX.utils.book_new();
    const importSheet = XLSX.utils.aoa_to_sheet([
      ["Section", "Description", "Unit", "Quantity", "Unit Rate"],
      ["Concrete", "Imported concrete", "m3", 1, 500],
      ["Finishes", "Imported plaster", "m2", 2, 100],
      ["Finishes", "Invalid row", "", 1, 100]
    ]);
    XLSX.utils.book_append_sheet(importBook, importSheet, "BOQ");
    const importBuffer = XLSX.write(importBook, { type: "buffer", bookType: "xlsx" });
    await page.locator("#excelFile").setInputFiles({
      name: "grouped-import.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: importBuffer
    });
    await page.locator("#preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#previewRows tr").count(), 3, "Every imported row must be visible in the preview");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("2 valid"), "Import preview should report valid rows");
    assert.ok((await page.locator("#previewInfo").textContent()).includes("1 invalid"), "Import preview should report invalid rows");
    await page.locator("#confirmImport").click();
    await page.locator("#preview").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".section").count(), 4, "Excel import should preserve distinct section groups");
    await page.waitForFunction(() => document.querySelector("#grand").textContent.includes("5,700"));

    const duplicateBook = XLSX.utils.book_new();
    const duplicateSheet = XLSX.utils.aoa_to_sheet([
      ["Section", "Description", "Unit", "Quantity", "Unit Rate"],
      ["Concrete", "Duplicate-section check", "m3", 0, 0]
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

    const [excelDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#excelOut").click()
    ]);
    const exportedBook = XLSX.readFile(await excelDownload.path());
    const exportedRows = XLSX.utils.sheet_to_json(exportedBook.Sheets.BOQ, { header: 1, defval: "" });
    assert.ok(exportedRows.some(row => row[0] === "Concrete" && row[1] === "Imported concrete"), "Excel export should retain imported section names and items");
    assert.ok(exportedRows.some(row => row[4] === "Grand total" && Number(row[5]) === 5700), "Excel export should include the correct grand total");

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

    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("header").evaluate(el => getComputedStyle(el).display), "none", "Print output must hide navigation controls");
    assert.equal(await page.locator(".section").count(), 4, "Print layout must retain BOQ sections");
    assert.ok((await page.locator("#grand").textContent()).includes("5,700"), "Print layout must retain the grand total");

    assert.deepEqual(pageErrors, [], "The page must not throw uncaught JavaScript errors");
    console.log("V1 browser tests passed: startup, calculation, persistence, language, sections, grouped and duplicate-section Excel import/export, strict JSON restore and print layout.");
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
