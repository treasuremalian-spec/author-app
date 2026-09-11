// Serves the real Paged.js browser polyfill as a plain static-ish JS
// response -- backs the Format tab's "Page Preview" mode (see
// app/projects/[projectId]/format/page-preview/route.ts). Not scoped
// under a project, since this file's content never depends on one --
// same polyfill for every book, every author.
//
// Why a route instead of just committing a copy of the file under
// public/: reading it via loadPagedPolyfillSource() (fs off the real,
// installed node_modules/pagedjs/dist at request time -- see that file's
// comment for why a plain import/require can't do this reliably under
// Next.js/Turbopack) means this can never drift from whatever pagedjs
// version package.json actually pins -- a committed static copy would
// silently go stale the next time that dependency is bumped, with
// nothing to catch it. The one cost is this route needs its own
// outputFileTracingIncludes entry (see next.config.ts) so Vercel's build
// actually ships node_modules/pagedjs/dist into this function -- exactly
// the same requirement render-pdf.ts already has for the PDF export
// route, just repeated here for a second consumer.
//
// Why a real script request instead of inlining this ~500KB of minified
// JS directly into the preview HTML's own <script> tag (which is what
// this route originally did, and the PDF export pipeline still does via
// Puppeteer's addScriptTag): confirmed by a real headless-browser
// reproduction (2026-09-11) that hand-splicing this specific file's text
// into a template-literal-built HTML string, then handing that whole
// string to a real browser to parse (via page.setContent() AND via a
// real <iframe srcdoc>, both), reliably threw "SyntaxError: Invalid or
// unexpected token" and pagination never ran -- some interaction between
// this bundle's raw text and the rest of the assembled document that
// wasn't worth chasing further once the fix was this simple: give the
// polyfill its own real script request (this route) instead of ever
// treating it as literal HTML/JS-string content. Puppeteer's
// addScriptTag doesn't hit this at all, since it sets the script
// element's content via the DOM directly, never by building or parsing
// an HTML string containing it.
import { NextResponse } from "next/server";
import { loadPagedPolyfillSource } from "@author-app/formatting-engine";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(loadPagedPolyfillSource(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // This route's content is fully determined by the pinned pagedjs
      // dependency -- never changes between requests, so it's safe (and
      // a meaningful load-time win, since it's ~500KB) to let browsers
      // cache it hard rather than refetching on every Page Preview click.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
