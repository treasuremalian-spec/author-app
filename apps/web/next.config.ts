import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The print-PDF export route reads two things out of node_modules at
  // runtime via non-static paths that Next's build-time file tracer can
  // miss: @sparticuz/chromium's compressed Chromium binary, and the
  // pagedjs package's polyfill script (read via fs + require.resolve in
  // formatting-engine/render-pdf.ts). Without this, the route can work
  // fine locally (full node_modules present) and still 404/500 on Vercel
  // because the needed files never made it into the deployed function --
  // see project memory's environment-constraints section.
  outputFileTracingIncludes: {
    "/projects/\\[projectId\\]/export/pdf": [
      "../../node_modules/@sparticuz/chromium/**/*",
      "../../node_modules/pagedjs/dist/**/*",
    ],
  },
};

export default nextConfig;
