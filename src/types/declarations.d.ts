// `pdf-parse` and `mammoth` don't ship reliable bundled TypeScript types.
// These loose declarations keep the build from failing on missing types;
// the actual shapes we rely on are narrowed with local types in src/lib/extract.ts.
declare module "pdf-parse";
declare module "mammoth";
