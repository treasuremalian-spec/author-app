// Locates and reads pagedjs's real client-side polyfill bundle
// (node_modules/pagedjs/dist/paged.polyfill.min.js) off disk, as raw JS
// source text -- pulled out of render-pdf.ts (2026-09-11, added for the
// Format tab's new "Page Preview" mode) so the exact same proven
// path-resolution logic backs BOTH consumers instead of drifting into two
// near-identical copies:
//   - render-pdf.ts: injects this source into a real headless Chromium
//     page (via Puppeteer's addScriptTag) to paginate a book before
//     printing it to a PDF buffer.
//   - apps/web's new page-preview Route Handler: sends this same source
//     text back to the BROWSER, to run inside a sandboxed iframe showing
//     the author a true, paginated on-screen preview (same real
//     buildPrintHtml() output, same real Paged.js engine, just running in
//     the visitor's own browser instead of a server-side headless one) --
//     see PrintOptions/FormatWorkspace.tsx's "Page Preview" button.
//
// See the long comment that used to live directly above this function in
// render-pdf.ts (preserved there in git history) for exactly why a plain
// `require.resolve("pagedjs/dist/...")` or even
// `require.resolve("pagedjs")` both fail under Next.js/Turbopack on
// Vercel -- the short version: pagedjs's own package.json "exports" map
// blocks the dist/ subpath, and Turbopack's bundling of require.resolve()
// for an externalized package returned a bare bundler module id (not a
// real path) in production. Walking up from process.cwd() with plain
// fs.existsSync checks sidesteps both failure modes entirely, since
// nothing here is visible to (or rewritable by) a bundler.
import fs from "node:fs";
import path from "node:path";

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

/** Reads pagedjs's minified browser polyfill as raw JS source text. Both
 * call sites inject it as a real <script> tag's content (never eval'd or
 * parsed by us) -- see the file comment above for why each needs its own
 * copy of the bytes rather than sharing one loaded instance (one runs
 * inside a headless-Chromium page, the other inside a sandboxed iframe in
 * the author's actual browser -- two separate JS realities). */
export function loadPagedPolyfillSource(): string {
  const packageRoot = findNodeModulesDir("pagedjs");
  const polyfillPath = path.join(packageRoot, "dist", "paged.polyfill.min.js");
  return fs.readFileSync(polyfillPath, "utf8");
}
