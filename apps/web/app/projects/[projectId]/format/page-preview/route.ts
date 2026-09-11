// Feeds the Format tab's "Page Preview" mode (author request, 2026-09-11:
// "each page of the novel should be its own page ... images should be
// shown as it will look on the actual pdf so background images should be
// placed correctly") -- unlike FormatPreview.tsx's always-on live preview
// (a fast CSS approximation, one continuous scroll, restyled instantly on
// every checkbox click with no server round-trip -- see that file's own
// comment for why it stays that way), this route is called on demand,
// from a single "Page Preview" button click, and returns something
// genuinely exact: the EXACT SAME HTML buildPrintHtml() produces for a
// real PDF export, wired up to fetch a real Paged.js polyfill and run
// it -- so what the author sees IS the real print layout (true page
// breaks, real background-image placement, real margins), just paginated
// by the visitor's own browser instead of a server-side headless
// Chromium.
//
// This deliberately reuses loadBookForExport() (real image bytes fetched
// and embedded as data URIs, same as a real PDF/EPUB export) rather than
// the live preview's lightweight passthrough-URL data -- a real network
// round trip, but a fine cost for a manual, occasional click, and the
// only way to genuinely match what buildPrintHtml()'s background-image
// CSS (which only knows how to embed pre-fetched bytes, see its own
// backgroundImageDataUri comment) will actually produce.
//
// No headless Chromium needed here at all (unlike export/pdf/route.ts) --
// Paged.js is designed to run in any real browser, so the visitor's own
// browser IS the "headless Chromium" this time. See
// app/vendor/paged-polyfill.js/route.ts for where the polyfill script
// itself actually comes from, and why it's fetched via a real <script
// src> rather than inlined here.
import { NextRequest, NextResponse } from "next/server";
import { buildPrintHtml } from "@author-app/formatting-engine";
import { loadBookForExport } from "@/lib/export-data";
import { parseTrimSize, parsePrintOptions } from "@/lib/print-options-query";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Wires the real Paged.js polyfill into buildPrintHtml()'s document so
 * it paginates itself as soon as the browser loads it -- mirrors
 * render-pdf.ts's own sequencing (PagedConfig.auto = false set BEFORE
 * the polyfill script runs, then an explicit, awaited
 * PagedPolyfill.preview() call -- see that file's long comment for why
 * getting this order right matters, confirmed against a real reproduced
 * failure mode).
 *
 * The polyfill is loaded via a real `<script src="/vendor/paged-
 * polyfill.js">` rather than inlined as literal text -- confirmed by a
 * real headless-browser reproduction (2026-09-11) that splicing this
 * ~500KB minified bundle's raw text directly into this hand-built HTML
 * string (the first version of this function) reliably made the
 * resulting document throw "SyntaxError: Invalid or unexpected token"
 * the moment a real browser tried to parse it, breaking pagination
 * entirely -- not worth chasing the exact interaction further once the
 * fix was this simple and, as a bonus, lets the browser cache that
 * ~500KB across every Page Preview click instead of re-downloading it
 * every time.
 *
 * The one addition beyond what render-pdf.ts needs: a `data-paged-ready`
 * marker on <body>, set only after preview() actually resolves, so the
 * iframe's parent (PagePreviewModal.tsx) can poll for "pagination is
 * really finished" without needing postMessage plumbing -- a same-origin
 * `srcDoc` iframe's contentDocument is directly readable from the
 * parent, so a plain poll is simpler and just as reliable. */
function withPagedJs(html: string): string {
  const withConfig = html.replace(
    "</head>",
    `<script>window.PagedConfig = { auto: false };</script>\n<script src="/vendor/paged-polyfill.js"></script>\n</head>`
  );
  const bootstrapScript = `<script>
(async function () {
  try {
    await window.PagedPolyfill.preview();
    document.querySelectorAll(".pagedjs_page").forEach(function (pageEl) {
      if (pageEl.querySelector(".pagedjs_area .chapter-start")) {
        pageEl.classList.add("pagedjs_page_chapter_start");
      }
    });
  } catch (err) {
    console.error("Page Preview pagination failed", err);
  } finally {
    document.body.setAttribute("data-paged-ready", "1");
  }
})();
</script>\n</body>`;
  return withConfig.replace("</body>", bootstrapScript);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const trimSize = parseTrimSize(request.nextUrl.searchParams.get("trim"));
  const printOptions = parsePrintOptions(request.nextUrl.searchParams);

  try {
    const book = await loadBookForExport(projectId);
    const { html, pageWidthIn, pageHeightIn } = buildPrintHtml({ ...book, trimSize }, printOptions);

    return NextResponse.json({
      html: withPagedJs(html),
      pageWidthIn,
      pageHeightIn,
    });
  } catch (error) {
    // Mirrors export/pdf/route.ts's own error handling -- see its comment
    // for why the client only gets the message, not the full stack.
    console.error("Page Preview failed for project", projectId, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Page Preview failed", message }, { status: 500 });
  }
}
