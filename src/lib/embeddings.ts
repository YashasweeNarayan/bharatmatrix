// Single switch point for which embedding provider is active. Every
// embedding call site in the app (src/app/api/documents/embed-step,
// src/app/api/ask, src/lib/matrix.ts, src/lib/db.ts) imports from THIS
// file, never directly from a provider file — so swapping providers is
// one edit here, not four scattered ones.
//
// Normally points at Gemini. To temporarily switch to OpenRouter +
// Nemotron (e.g. while Gemini's free-tier daily quota is exhausted — see
// PROGRESS.md's 2026-11-05 log), change the export line below to:
//
//   export { embedText, embedTexts, EMBEDDING_DIMENSIONS, isRateLimitError, isDailyQuotaError } from "@/lib/embed-openrouter";
//
// and set OPENROUTER_API_KEY in Vercel. Switch it back to the line below
// once Gemini is usable again.
//
// IMPORTANT: switching providers makes every already-stored embedding
// invalid, even though both providers' vectors are sized to the same 768
// dimensions to fit the same pgvector column — same dimension does NOT
// mean same vector space, a Gemini vector and a (truncated) Nemotron
// vector for the same text are not comparable. After switching, call
// POST /api/documents/reembed once (see that route's comment) to reset
// every document back to 'embedding' status so the active provider
// re-indexes everything from scratch, instead of silently mixing two
// providers' vectors in search results.

export {
  embedText,
  embedTexts,
  EMBEDDING_DIMENSIONS,
  isRateLimitError,
  isDailyQuotaError,
} from "@/lib/gemini";
