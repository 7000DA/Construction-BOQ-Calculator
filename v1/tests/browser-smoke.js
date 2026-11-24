"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

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
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await page.locator("#grand").waitFor();
    assert.equal(await page.locator(".section").count(), 2, "Fresh project should initialize with its two starter sections");

    await page.locator("#name").fill("CI Smoke Project");
    const first = page.locator(".section").first();
    await first.locator(".add-item").click();
    const row = first.locator("tbody tr").last();
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

    await page.locator("#lang").click();
    await page.getByRole("heading", { name: "جدول الكميات" }).waitFor();
    assert.equal(await page.locator("#name").inputValue(), "CI Smoke Project", "Language switching must not change project data");

    await page.locator("#addSection").click();
    assert.equal(await page.locator(".section").count(), 3, "Adding a section should create one independent section");
    page.once("dialog", dialog => dialog.accept());
    await page.locator(".section").last().locator(".section-head .delete").click();
    assert.equal(await page.locator(".section").count(), 2, "Deleting a section should remove only that section");

    assert.deepEqual(pageErrors, [], "The page must not throw uncaught JavaScript errors");
    console.log("V1 browser smoke tests passed: startup, BOQ calculation, local persistence, language toggle, section add/delete.");
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
