// Turns a print-ready HTML document (see print-html.ts) into a real,
// paginated PDF -- by loading it into a real headless Chromium and running
// the Paged.js polyfill inside it, then asking that browser to print the
// paginated result to PDF. This is the same technique the official
// pagedjs-cli tool uses internally; the two differences here are
// deliberate:
//
// 1. pagedjs-cli depends on the full `puppeteer` package, which downloads
//    and bundles an entire Chrome build (~300MB+) -- far too big for a
//    Vercel serverless function's 250MB uncompressed size limit. We use
//    `puppeteer-core` (no bundled browser) driving `@sparticuz/chromium`
//    (a Chromium build compressed specifically to fit that limit) instead.
// 2. We trigger and await Paged.js ourselves via its programmatic
//    `PagedPolyfill.preview()` promise rather than the CLI's event-bridge
//    machinery, since we don't need progress callbacks -- just the
//    finished, paginated DOM before calling page.pdf().
//
// The sequencing below (disable Paged.js's auto-run via `PagedConfig.auto
// = false` *before* the script loads, inject the polyfill, then manually
// await `PagedPolyfill.preview()`) mirrors pagedjs-cli's own source
// exactly, to avoid a real race condition: if Paged.js is left to
// auto-run on the page's `load` event, and that event has already fired
// by the time the script tag is added (which it usually has, since we
// set the page's content ourselves), the polyfill never runs at all.
//
// IMPORTANT (see project memory's environment-constraints section): both
// @sparticuz/chromium's compressed Chromium binary and the pagedjs
// package's dist/ folder are read from node_modules at runtime via
// non-static paths, which Next.js's build-time file tracer can miss.
// apps/web/next.config.ts has an `outputFileTracingIncludes` entry for
// this route that must stay in sync with this file if it moves.

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// pagedjs's package.json restricts imports to its declared `exports` map,
// which does not include anything under dist/ -- so a direct
// require.resolve("pagedjs/dist/paged.polyfill.min.js") fails at build
// time (Turbopack enforces the same exports restriction Node itself does,
// and failed the Vercel build on the first deploy attempt). Instead we
// resolve the package's real entry point (an allowed, exported path),
// then compute the dist file's path ourselves with plain path math --
// exports restrictions only govern require/import resolution, not
// filesystem access once we already know where the package lives.
function loadPagedPolyfillSource(): string {
  const require = createRequire(import.meta.url);
  const entryPath = require.resolve("pagedjs"); // .../node_modules/pagedjs/lib/index.cjs
  const packageRoot = path.dirname(path.dirname(entryPath)); // strip lib/index.cjs
  const polyfillPath = path.join(packageRoot, "dist", "paged.polyfill.min.js");
  return fs.readFileSync(polyfillPath, "utf8");
}

/** Renders a full print-ready HTML document (from buildPrintHtml) to a PDF buffer. */
export async function renderPrintPdf(html: string): Promise<Buffer> {
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // Paged.js measures against the viewport before it repaginates into
    // fixed-size page boxes -- give it a roomy canvas rather than
    // puppeteer-core's narrow 800x600 default so nothing wraps oddly
    // before the real @page sizing takes over.
    await page.setViewport({ width: 1200, height: 1600 });

    // Must be registered before the polyfill script loads -- see the note
    // above about the auto-run race.
    await page.evaluateOnNewDocument(() => {
      (window as unknown as { PagedConfig?: { auto: boolean } }).PagedConfig = { auto: false };
    });

    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: loadPagedPolyfillSource() });

    await page.evaluate(async () => {
      const w = window as unknown as { PagedPolyfill: { preview: () => Promise<unknown> } };
      await w.PagedPolyfill.preview();
    });

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
