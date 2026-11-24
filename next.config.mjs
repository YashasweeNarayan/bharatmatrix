/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Clickjacking: nobody may embed this app in a frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Admin pages and APIs carry other people's data: never cache them.
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  // extract.ts builds the path to pdfjs-dist's standard_fonts directory
  // from process.cwd() at runtime (not a static require()/import), so
  // Vercel's file tracer can't discover it needs bundling with the
  // function just by analyzing the code. Without this, pdfjs-dist would
  // silently find the directory missing in the deployed function and
  // fall back to less accurate glyph metrics for any PDF using one of
  // the 14 standard fonts (Helvetica, Times, etc.) instead of failing
  // loudly, so this is worth declaring explicitly rather than debugging
  // a subtle text-extraction quality issue later.
  // On Next 14.2.18 this option only exists under `experimental` — it
  // wasn't stabilized to the top level until Next 15. Vercel's build
  // log flagged the top-level version as an unrecognized key (silently
  // ignored, not a build failure on its own) before this fix.
  // Same reasoning for pdf.worker.mjs: pdf.js loads it via a path built
  // at runtime (see extract.ts's GlobalWorkerOptions.workerSrc), so the
  // tracer needs telling explicitly or the deployed function simply
  // won't have the file ("Cannot find module '.../pdf.worker.mjs'").
  experimental: {
    outputFileTracingIncludes: {
      "/api/documents": [
        "node_modules/pdfjs-dist/standard_fonts/**",
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      ],
    },
  },
};

export default nextConfig;
