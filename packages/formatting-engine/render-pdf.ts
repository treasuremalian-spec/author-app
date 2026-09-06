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
// = false` *before* the polyfill script loads, then manually await
// `PagedPolyfill.preview()` once) mirrors pagedjs-cli's own source, to
// avoid Paged.js's own preview() running a second, uncontrolled time on
// top of ours -- see the longer note further down (right above where
// PagedConfig gets set) for the real, confirmed failure mode this guards
// against, and why it matters even though it looks like a formality.
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
import { TRIM_SIZE_DIMENSIONS, type TrimSize } from "./print-html";

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

// @sparticuz/chromium extracts its bundled Chromium binary to /tmp/chromium
// the first time executablePath() is called in a given (warm) serverless
// instance, and short-circuits to that path on every later call by simply
// checking existsSync(/tmp/chromium) -- see its source. That existsSync
// check races against its own extraction: the target file is created (and
// already passes existsSync) the moment the write stream opens, well
// before the decompressed Chromium binary has actually finished writing
// to it. If a second export request reaches this same warm instance while
// the first is still mid-extraction, executablePath() hands it that
// still-being-written path immediately, and puppeteer's spawn() of it
// fails with "spawn ETXTBSY" (the OS refuses to execve() a file that's
// still open for writing elsewhere) -- confirmed 2026-09-06 both from a
// real production error (a user's PDF export failed with exactly this
// message and stack trace) and by reproducing the race directly against
// the pinned @sparticuz/chromium version in this sandbox: two overlapping
// calls to chromium.executablePath(), staggered by as little as 60ms,
// reliably reproduced the identical "spawn ETXTBSY" failure on whichever
// call lost the race.
//
// Fix: memoize the extraction at module scope so every renderPrintPdf()
// call in the same warm instance shares one in-flight extraction instead
// of each independently hitting chromium's racy existsSync shortcut. A
// concurrent caller now awaits the SAME promise and only proceeds once
// extraction has actually finished -- verified locally to fully resolve
// the race across 5 repeated concurrent-launch runs.
let chromiumExecutablePathPromise: Promise<string> | null = null;
function getChromiumExecutablePath(): Promise<string> {
  if (!chromiumExecutablePathPromise) {
    chromiumExecutablePathPromise = chromium.executablePath();
  }
  return chromiumExecutablePathPromise;
}

/** Renders a full print-ready HTML document (from buildPrintHtml) to a PDF buffer. */
export async function renderPrintPdf(html: string, trimSize: TrimSize): Promise<Buffer> {
  const executablePath = await getChromiumExecutablePath();

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

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // Wait for the embedded print font (see fonts-embedded.ts /
    // print-html.ts) to actually finish loading before Paged.js measures
    // and paginates the text. Without this, Paged.js could lay out (and
    // page-break) the book against a fallback font's metrics while the
    // real font is still decoding, which would make its line/page breaks
    // wrong for the font that actually ends up rendered.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // Tell Paged.js not to auto-run its own preview() on page load, since
    // we trigger it ourselves below and need to await its result directly.
    //
    // This USED to be a page.evaluateOnNewDocument() call registered
    // before setContent(), on the theory (stated in the comment that used
    // to be here) that it "must run before the polyfill script loads."
    // That theory was wrong in a way that silently broke everything below
    // it: page.evaluateOnNewDocument() only re-runs its script on each
    // subsequent *navigation* (a real page.goto()) -- page.setContent()
    // does NOT count as a navigation for this purpose, so the script
    // registered there was never actually applied to this page at all.
    // Confirmed 2026-09-06 by reproducing this whole pipeline locally
    // (this cloud sandbox's Chromium is the same architecture as
    // production's, unlike the user's Mac) and instrumenting
    // Node.prototype.appendChild to log a stack trace on every <style>
    // insertion: with the old code, Paged.js's own preview() ran TWICE --
    // once auto-triggered on load (because window.PagedConfig was in fact
    // still its default {auto: true}, the evaluateOnNewDocument script
    // having silently never applied), and a second time from our own
    // explicit call below. The first run correctly parsed our @page
    // { size: ... } rule; the second run's setup() then re-inserted Paged.js's
    // own DEFAULT 8.5in x 11in page-size stylesheet, which (later in
    // source order, equal CSS specificity) silently overrode the correct
    // page dimensions right back to US Letter -- while also leaving the
    // running-footer page number mis-measured against the wrong page
    // height, since it re-chunked the already-paginated DOM as if it were
    // the original flow. This is why the page size and footer position
    // bugs (see the "5x8/6x9 came out as Letter" and "page number floats
    // mid-page" history in project memory) survived earlier fixes that
    // looked complete but were never verified against a real local
    // reproduction.
    //
    // The fix: set PagedConfig via an actual injected script tag, run
    // in-page via addScriptTag (which we can order and await directly),
    // instead of depending on evaluateOnNewDocument's document-lifecycle
    // semantics at all.
    await page.addScriptTag({ content: "window.PagedConfig = { auto: false };" });
    await page.addScriptTag({ content: loadPagedPolyfillSource() });

    await page.evaluate(async () => {
      const w = window as unknown as { PagedPolyfill: { preview: () => Promise<unknown> } };
      await w.PagedPolyfill.preview();
    });

    // Tag every physical page Paged.js just built that contains a chapter
    // (or part) opening with a plain class, so the stylesheet can hide the
    // running header only on those specific pages (see print-html.ts's
    // ".pagedjs_page_chapter_start" rule and the long comment above it for
    // why this is done here, in real DOM, rather than in CSS alone --
    // CSS's own "@page <name>:first" turned out to mean "first page with
    // this name in the WHOLE document," not "first page of each chapter,"
    // which is not what a running-header rule needs). Done directly in
    // the page after pagination finishes rather than before, since only
    // now do real .pagedjs_page boxes (and which original content ended
    // up on which one) actually exist.
    await page.evaluate(() => {
      document.querySelectorAll(".pagedjs_page").forEach((pageEl) => {
        if (pageEl.querySelector(".pagedjs_area .chapter-start")) {
          pageEl.classList.add("pagedjs_page_chapter_start");
        }
      });
    });

    // Puppeteer's page.pdf() forces the page into "print" media by
    // default. Paged.js, though, does its actual pagination work (the
    // .pagedjs_page boxes it just built above, each precisely sized to
    // the real trim size) under "screen" media -- that's the CSS Paged.js
    // itself is designed to run under, per its own docs and pagedjs-cli's
    // own printing step. Without explicitly re-emulating "screen" here,
    // Chromium's print pipeline ignores Paged.js's already-finished
    // layout and falls back to its own generic print pagination against
    // the underlying content, which was the first reported bug (pages
    // sized to fit the text). Forcing "screen" here tells Chromium to
    // print exactly the paginated boxes Paged.js already built, rather
    // than re-deriving page breaks itself.
    await page.emulateMediaType("screen");

    // `preferCSSPageSize` (reading the physical page size from the @page
    // CSS rule) turned out NOT to work together with the "screen" media
    // emulation above: once media is forced to "screen", Chromium's print
    // pipeline stopped picking up the @page { size: ... } rule at all and
    // silently fell back to its default of US Letter (confirmed 2026-09-06
    // by inspecting a real exported PDF's actual page dimensions -- they
    // came out as 612x792pt, i.e. 8.5x11in, regardless of the requested
    // trim size). Rather than depend on that CSS-detection path at all
    // (which we now know is unreliable under the exact media mode Paged.js
    // needs), tell Chromium the real physical page size directly -- we
    // already know it exactly, since it's the same TRIM_SIZE_DIMENSIONS
    // value buildPrintHtml() baked into the @page rule in the first place.
    const { width, height } = TRIM_SIZE_DIMENSIONS[trimSize];

    const pdf = await page.pdf({
      printBackground: true,
      width,
      height,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
