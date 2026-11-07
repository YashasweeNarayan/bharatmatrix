/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // extract.ts builds the path to pdfjs-dist's standard_fonts directory
  // from process.cwd() at runtime (not a static require()/import), so
  // Vercel's file tracer can't discover it needs bundling with the
  // function just by analyzing the code. Without this, pdfjs-dist would
  // silently find the directory missing in the deployed function and
  // fall back to less accurate glyph metrics for any PDF using one of
  // the 14 standard fonts (Helvetica, Times, etc.) instead of failing
  // loudly, so this is worth declaring explicitly rather than debugging
  // a subtle text-extraction quality issue later.
  outputFileTracingIncludes: {
    "/api/documents": ["node_modules/pdfjs-dist/standard_fonts/**"],
  },
};

export default nextConfig;
