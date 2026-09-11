import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-core, @sparticuz/chromium, and pagedjs all contain native
  // binaries / non-JS assets and dynamic runtime requires that Next's
  // bundler shouldn't try to statically process -- left as plain runtime
  // requires from node_modules instead. Without this, the Vercel build
  // itself fails trying to bundle them (found this out the hard way on
  // the first deploy attempt of the PDF export route).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "pagedjs"],

  // Both routes below read files out of node_modules at runtime via
  // non-static paths that Next's build-time file tracer can miss --
  // without this, a route can work fine locally (full node_modules
  // present) and still 404/500 on Vercel because the needed files never
  // made it into the deployed function -- see project memory's
  // environment-constraints section.
  outputFileTracingIncludes: {
    // The print-PDF export route: @sparticuz/chromium's compressed
    // Chromium binary, and the pagedjs package's polyfill script (read
    // via fs + require.resolve in
    // formatting-engine/paged-polyfill-source.ts).
    "/projects/\\[projectId\\]/export/pdf": [
      "../../node_modules/@sparticuz/chromium/**/*",
      "../../node_modules/pagedjs/dist/**/*",
    ],
    // The polyfill script served to the Format tab's "Page Preview" mode
    // (2026-09-11) -- app/vendor/paged-polyfill.js/route.ts reads this
    // SAME pagedjs polyfill script (see paged-polyfill-source.ts's file
    // comment for why it's shared code, not a second copy) via fs at
    // request time. The page-preview route itself no longer touches
    // node_modules directly -- it just injects a <script src> pointing
    // at this route -- so this entry lives here instead.
    "/vendor/paged-polyfill.js": [
      "../../node_modules/pagedjs/dist/**/*",
    ],
  },
};

export default nextConfig;
