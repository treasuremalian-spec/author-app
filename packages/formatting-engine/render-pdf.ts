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

// pagedjs's package.json restricts imports to its declared `exports` map,
// which does not include anything under dist/ -- so a direct
// require.resolve("pagedjs/dist/paged.polyfill.min.js") fails at build
// time (Turbopack enforces the same exports restriction Node itself does,
// and failed the Vercel build on the first deploy attempt).
//
// A later attempt resolved the package's real entry point via
// require.resolve("pagedjs") and computed the dist path from there --
// but that broke too (2026-09-05, found via the pdf.json error the PDF
// export route now returns on failure -- see route.ts): in the deployed
// Vercel function, Turbopack's bundling of require.resolve() for an
// externalized package (see serverExternalPackages in next.config.ts)
// returned an internal bundler module id -- a bare NUMBER -- instead of a
// real file path, crashing path.dirname() with "The path argument must
// be of type string. Received type number". This is a known class of
// Turbopack bug around require.resolve() + externalized native/asset
// packages in a monorepo (see e.g. vercel/next.js#76497, #87737) -- not
// fixable by changing what we resolve, since require.resolve() itself is
// the unreliable part here.
//
// Fix: don't use require.resolve() (or any bundler-visible require/import
// of "pagedjs") to find the file at all. Walk up from the process's own
// working directory looking for a real node_modules/pagedjs folder on
// disk -- plain fs.existsSync checks, nothing a bundler can rewrite. This
// works locally (cwd is apps/web; pagedjs is hoisted one level up to the
// npm workspaces root's node_modules) and on Vercel (cwd is the deployed
// function root, which outputFileTracingIncludes below guarantees has a
// real node_modules/pagedjs/dist on disk) without needing to know or
// guess which of those two shapes we're actually running under.
function findNodeModulesDir(packageName: string): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, "node_modules", packageName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find node_modules/${packageName} by walking up from ${process.cwd()}.`
      );
    }
    dir = parent;
  }
}

function loadPagedPolyfillSource(): string {
  const packageRoot = findNodeModulesDir("pagedjs");
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
