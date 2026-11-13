// `mammoth` doesn't ship reliable bundled TypeScript types, and
// pdfjs-dist's package "exports" map may not expose a matching .d.ts for
// the specific legacy Node subpath we import in extract.ts. These loose
// declarations keep the build from failing on missing/mismatched types;
// the actual shapes we rely on are narrowed with local types in
// src/lib/extract.ts.
declare module "pdfjs-dist/legacy/build/pdf.js";
declare module "mammoth";
// bcryptjs's bundled types have been inconsistent across versions with
// this project's moduleResolution setting; declaring it loosely here
// avoids a build break over a types mismatch rather than a real bug.
declare module "bcryptjs";
