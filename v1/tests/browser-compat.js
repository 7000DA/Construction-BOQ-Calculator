"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end("Not found"); return; }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    });
  });

  const targets = [
    { name: "Chrome / Chromium", type: chromium, launch: { args: ["--no-sandbox"] } },
    { name: "Microsoft Edge", type: chromium, launch: { channel: "msedge", args: ["--no-sandbox"] } },
    { name: "WebKit (Safari engine proxy)", type: webkit, launch: {} }
  ];
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const failures = [];
  try {
    for (const target of targets) {
      let browser;
      try {
        browser = await target.type.launch({ headless: true, ...target.launch });
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js", route =>
          route.fulfill({ path: path.resolve(__dirname, "../../node_modules/xlsx/dist/xlsx.full.min.js"), contentType: "text/javascript" })
        );
        await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
        await page.locator("#grand").waitFor();
        await page.locator("#name").fill("Cross-browser acceptance");
        const row = page.locator(".section").first().locator("tbody tr").first();
        await row.locator("input.description").fill("Concrete foundation");
        await row.locator("input.unit").fill("m3");
        await row.locator("input.numeric").nth(0).fill("12.5");
        await row.locator("input.numeric").nth(1).fill("2400");
        await page.locator("#save").click();
        assert.ok((await page.locator("#grand").textContent()).includes("30,000"), target.name + ": BOQ total calculation");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("#grand").waitFor();
        assert.equal(await page.locator("#name").inputValue(), "Cross-browser acceptance", target.name + ": local project persistence");
        assert.equal(await page.locator(".section").first().locator("tbody tr").first().locator("input.description").inputValue(), "Concrete foundation", target.name + ": saved BOQ row persistence");

        await page.locator("#lang").click();
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl", target.name + ": Arabic RTL direction");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), target.name + ": no page-level RTL horizontal overflow");
        await page.locator("#lang").click();
        assert.equal(await page.locator("html").getAttribute("dir"), "ltr", target.name + ": restore English LTR direction");

        const [jsonDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#jsonOut").click()]);
        const jsonText = fs.readFileSync(await jsonDownload.path(), "utf8");
        const backup = JSON.parse(jsonText);
        assert.equal(backup.project.info.name, "Cross-browser acceptance", target.name + ": JSON backup content");
        assert.equal(backup.project.sections[0].items[0].description, "Concrete foundation", target.name + ": JSON BOQ data");

        const [excelDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#excelOut").click()]);
        const workbook = XLSX.readFile(await excelDownload.path());
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets.BOQ, { header: 1, defval: "" });
        const exported = rows.find(item => item[1] === "Concrete foundation");
        assert.ok(exported, target.name + ": Excel export contains the BOQ item");
        assert.equal(Number(exported[5]), 30000, target.name + ": Excel export line amount");

        await page.emulateMedia({ media: "print" });
        assert.equal(await page.locator("header").evaluate(el => getComputedStyle(el).display), "none", target.name + ": print stylesheet hides app navigation");
        assert.equal(await page.locator(".section thead").first().evaluate(el => getComputedStyle(el).display), "table-header-group", target.name + ": print table headings repeat");
        await page.emulateMedia({ media: "screen" });
        assert.deepEqual(errors, [], target.name + ": no uncaught browser JavaScript errors");
        await context.close();
        console.log("PASS " + target.name + ": save/reload, calculations, RTL, JSON/Excel export, print CSS");
      } catch (error) {
        failures.push(target.name + ": " + (error && error.stack || error));
        console.error("FAIL " + target.name + ": " + (error && error.message || error));
      } finally {
        if (browser) await browser.close();
      }
    }
    assert.deepEqual(failures, [], "Cross-browser acceptance failures");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
