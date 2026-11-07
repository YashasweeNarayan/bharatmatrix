# BharatMatrix — Progress Tracker

M.Tech final-year project: Hebbia-inspired AI document-intelligence platform for
business/enterprise documents. Matrix-grid UI, evidence-grounded answers,
cross-document contradiction detection. Built by Claude, tested by Muawiyah.

**Workflow:** Claude builds step by step. After Muawiyah tests a change and
replies "Good go", this file is updated to reflect what's confirmed working
and what's next.

---

## Environment note (2026-11-02)

This sandbox cannot run `npm install` or `pip install` (package-registry
access is blocked for this session) and has no GitHub account linked. Fix:
Muawiyah is connecting GitHub to the Claude account so code can be pushed
directly from here; Vercel will do the actual `npm install` on its own build
servers when deploying, so this has no effect on the deployed app. Until
GitHub is connected, all project code is being hand-written straight to
disk here, and will be pushed in one go once the connection is live.

---

## Phase 1 — Core web app

### Step 1: Project skeleton + Vercel deploy
- [x] Next.js (TypeScript + Tailwind + App Router) project hand-written —
      landing page with an animated "Matrix" grid hero (docs × questions,
      cells resolving live with source refs + a contradiction flag), ink/
      saffron/teal visual identity
- [x] Push to GitHub — https://github.com/YashasweeNarayan/bharatmatrix
- [x] Connect repo to Vercel, confirm live deploy — https://bharatmatrix.vercel.app/
- [ ] Set up Postgres (Neon) + Vercel Blob storage — **action needed from Muawiyah,
      see below**

### Step 2: Document ingestion (Reader agent) — DONE, confirmed working
- [x] Upload UI (PDF/DOCX/XLSX, multi-file, drag-and-drop) at `/workspace`
- [x] Text + page/sheet-label extraction (PDF page-by-page, DOCX whole-doc,
      XLSX one entry per sheet)
- [x] Neon (Postgres) + Vercel Blob connected, confirmed on real PDF uploads
      (status → "ready", correct page counts, readable extracted text)

### Step 3: Search over documents
- [x] Chunking (900 chars, 150 overlap, page-label preserved per chunk)
- [x] Embeddings via Gemini (`gemini-embedding-2`, 768-dim) + pgvector
      cosine search in Postgres
- [x] Q&A box on `/workspace`: asks `gemini-3.8-flash` over the top-10
      matching chunks, forced to answer only from those passages and return
      exact quotes as citations (this is the Analyst+Verifier logic, still
      combined in one call — splitting them into two separate steps is
      Step 5)
- [x] Confirmed working end-to-end by Muawiyah ("Good go") — grounded
      cross-document answer with correct citations from two different
      documents

### Step 4: Matrix grid UI
- [x] `questions` + `matrix_cells` tables (one row per document×question,
      status pending/computing/ready/failed)
- [x] `src/lib/matrix.ts`: `computeCell()` — per-document-scoped vector
      search (top-6 chunks from *that document only*, unlike the Ask
      panel's cross-document top-10) + grounded answer, bounded-concurrency
      `computeCells()` batch runner
- [x] API routes: `POST/GET /api/questions` (add column, computes it for
      every ready doc), `DELETE /api/questions/[id]`, `GET /api/matrix`
      (cheap DB-only fetch for the grid — safe to poll), `POST
      /api/matrix/recompute` (retry one failed cell), `POST
      /api/matrix/backfill` (fill cells for docs uploaded after questions
      already existed)
- [x] `MatrixTable.tsx` + `/matrix` page: add-question input, delete-column
      button, grid with per-cell status (queued/reading/answer/failed),
      click a filled cell to open an evidence panel below with the full
      answer + exact quoted passages, "Fill N missing cells" button, retry
      on failed cells. Nav links added both ways between `/workspace` and
      `/matrix`.
- [x] Deliberately cost-conscious: the grid only polls `GET /api/matrix`
      (no LLM call, just a DB read) — a Gemini call only happens when
      Muawiyah clicks Add column, Retry, or Fill missing cells, given the
      free tier's tight daily quota
- [x] Confirmed tested on the live site, found a real bug, fixed (see log)
- [x] Muawiyah confirmed "Good go" — Step 4 done

### Step 5: Analyst + Verifier agents
- [x] Split "find the answer" (Analyst, `gemini.ts`) from "check it against
      source text" (Verifier, new `src/lib/verify.ts`)
- [x] Verifier is deterministic, not a second LLM call — it does an exact
      (whitespace/quote-normalized) substring check of each claimed quote
      against the real chunk text it says it came from, matched by
      document + page. No extra Gemini quota spent; actually fixes the
      thing the project exists to fix (a model confidently citing a quote
      that was never really there)
- [x] An answer is only ever stored/shown as `grounded: true` once the
      Verifier has confirmed at least one citation for real; unconfirmed
      citations are dropped before they reach the UI, never just hidden
      behind a trust-me flag
- [x] `verification_note` surfaced in both the Matrix evidence panel and
      the Ask panel whenever the Verifier downgraded or trimmed the
      Analyst's claim, so it's visible when it actually happens
- [x] Wired into both call sites: `computeCell` (Matrix) and `/api/ask`
      (free-form Q&A)
- [ ] Not yet tested on the live site

### Step 6: Contradiction detection
- [x] `question_contradictions` table (one row per question, same
      pending/computing/ready/failed pattern as matrix_cells)
- [x] `src/lib/contradiction.ts`: `computeContradiction()` — gathers that
      question's grounded, Verifier-confirmed answers across every ready
      document and asks Gemini to judge whether they genuinely conflict
      (one call per question, not per document pair). Conservative by
      instruction: different wording, different detail level, or
      different reporting periods are NOT contradictions, only a real
      factual disagreement is
- [x] `POST /api/contradictions/queue` (fast — marks eligible questions
      pending) + `POST /api/contradictions/step` (one question per call) —
      same split as Step 4's fix, to avoid the same ~10s timeout trap
- [x] UI: "Check contradictions" button, a ⚠ flag on any column header
      with a confirmed conflict, and a Contradictions panel below Evidence
      listing each flagged question with the explanation
- [ ] Evaluate against ContractNLI labeled data — deferred; no dataset
      access from the sandbox, would need Muawiyah to supply it
- [ ] Not yet tested on the live site

### Step 7: Reports
- [x] Floating report panel (sticky header + download, summary → table → citations)
- [x] PDF export
- [ ] Not yet tested on the live site

### Step 8: Polish + evaluation
- [ ] Loading states, animations, Agent Monitor feed
- [ ] Evaluate against FinQA + ContractNLI, compare vs plain RAG-chatbot baseline

## Phase 2 — Telegram integration (after Phase 1 is fully done)
- [ ] User login
- [ ] Per-user QR code → Telegram deep link (`/start <code>`) → account linking webhook
- [ ] Telegram bot: query results via chat
- [ ] Personal QR code per generated report

---

## Log

- **2026-11-02** — Kicked off build. Hit sandbox network restriction (no npm/pip
  registry access, no GitHub linked). Asked Muawiyah how to proceed; he chose
  to connect GitHub to the Claude account so Claude can push directly.
  Hand-wrote the full Next.js skeleton (config files + landing page + animated
  Matrix-grid hero component) and syntax-checked every file with a
  pre-installed `tsc` (no real errors — only "module not found" from missing
  `node_modules`, which Vercel resolves on its own build servers). Repo isn't
  pushed yet — waiting on the GitHub connection to land.
- **2026-11-02** — GitHub connected (account: YashasweeNarayan). Pushed Step 1,
  confirmed live on Vercel. Built Step 2 (document upload + extraction) and
  pushed it. Muawiyah connected Neon (Postgres) and Blob storage to the Vercel
  project. First deploy of Step 2 failed to build — a stray
  `eslint-disable-next-line @typescript-eslint/no-var-requires` comment in
  `extract.ts` referenced a rule not present in this project's ESLint config,
  which Next.js treats as a lint error during `next build`. Fixed by switching
  that `require("pdf-parse")` to a plain ES import; pushed the fix.
  Second build failure: pdf-parse's package entry file (`index.js`) runs
  debug code at module-load time that reads a test PDF bundled with the
  package — that file gets stripped by Next.js's serverless bundler, so the
  build crashed with `ENOENT` while collecting page data for `/api/documents`.
  Fixed by importing `pdf-parse/lib/pdf-parse.js` directly instead of the
  package root, which skips that debug code. Pushed. Build succeeded, but
  upload still failed with 500 — turned out the Blob store's "Add a
  read-write token env var" checkbox hadn't been ticked when it was first
  created, so `BLOB_READ_WRITE_TOKEN` never existed. Recreated the Blob store
  with that box checked, redeployed, confirmed working: uploaded real PDFs,
  both showed "ready" with correct page counts and readable extracted text.
  Muawiyah confirmed "Good go" — Step 2 done. Starting Step 3 (search/Q&A).
- **2026-11-02** — Built Step 3 (chunking, Gemini embeddings, pgvector search,
  grounded Q&A), using `client.interactions.create` (the Interactions API,
  Google's newest chat surface). First build failure: its TS types don't
  include `output_text` (docs show it; the published `.d.ts` hadn't caught
  up) — worked around by reading the response defensively. That build
  succeeded, but the actual API call then failed at runtime: "The legacy
  Interactions API schema is no longer supported" — Google shipped a
  breaking change to this API in May 2026, and the pinned `@google/genai`
  version was resolving to a pre-break release. Given this API has broken
  twice in one afternoon of it being brand new, switched away from it
  entirely to `generateContent` — the older, long-stable method with the
  same request/response shape for years (`config.systemInstruction`,
  `config.responseSchema`, reading `response.text`). Added retry-with-backoff
  for transient 503 "high demand" errors. Then hit a hard wall: `gemini-3.8-
  flash` (the flagship model) is capped at 20 requests/day on the free tier —
  a 429 RESOURCE_EXHAUSTED confirmed it. Switched the chat model to
  `gemini-3.5-flash-lite`, which should have a more generous free-tier daily
  quota (Muawiyah chose staying on the free tier over enabling billing, for
  now). Embeddings stay on `gemini-embedding-2` — that quota wasn't the one
  that got hit. **Not yet confirmed whether the lite model's quota is
  actually enough; if it also gets exhausted quickly, the real fix is
  enabling billing in Google AI Studio (cheap at this project's scale, as
  budgeted earlier).**
- **2026-11-03** — Muawiyah confirmed "Good go" on Step 3 (screenshot showed a
  correctly grounded answer citing two different documents). Built Step 4
  (Matrix grid). Added `questions` and `matrix_cells` tables, a `matrix.ts`
  helper doing per-document-scoped retrieval + grounded answers for one
  cell (separate from the Ask panel's cross-document search — a cell only
  ever searches its own document), and five API routes for creating
  questions, deleting them, reading the grid, retrying a failed cell, and
  backfilling cells for documents added after questions already existed.
  Built the `MatrixTable` grid UI with an evidence panel below it (click a
  filled cell to see the exact quoted passage), wired into a new `/matrix`
  page, with nav links added both ways between Workspace and Matrix. Kept
  the 20-requests/day quota scare from Step 3 in mind: the grid polls a
  cheap DB-only endpoint for live status, and nothing fires a real Gemini
  call except an explicit click (add a question, retry, or backfill).
  Syntax-checked clean, pushed. Waiting on Muawiyah to test on the live
  site before calling Step 4 done.
- **2026-11-03** — Muawiyah tested: the matrix page itself loaded fine, but
  adding a question didn't create a column. Root cause: `POST
  /api/questions` (and `/api/matrix/backfill`) awaited a real Gemini call
  for every ready document before responding — fine locally, but Vercel's
  free/Hobby plan hard-caps a serverless request at ~10s no matter what
  `maxDuration` says in code, so with any real retry/backoff in the mix
  that request reliably got killed mid-flight. The question row itself did
  get inserted (it commits immediately), but the HTTP response never came
  back, and the frontend had no error handling around that `fetch`, so it
  failed completely silently — no error, no refresh, the new column just
  never appeared. Fixed by splitting the work in two: `POST /api/questions`
  and `POST /api/matrix/backfill` now only insert the pending rows and
  return immediately (fast, no Gemini calls in the request path at all);
  a new `POST /api/matrix/step` computes exactly one pending cell per call
  and reports how many remain. The UI now drives a drain loop — call
  `/step`, refresh the grid, repeat until none remain — right after Add
  question or Backfill, so cells fill in live one at a time instead of one
  request trying to do all of them. The drain also auto-resumes on load if
  it finds cells already stuck pending/computing (e.g. from before this
  fix), and `/step` treats a cell stuck in 'computing' for over 2 minutes
  as eligible again. Also added proper error surfacing in the UI (a
  dismissable banner) for every action that talks to the server, so a
  future failure is never silent again. Syntax-checked clean, pushed.
- **2026-11-03** — Muawiyah tested again and sent the actual Network tab
  payloads, which nailed down two real bugs:
  1. Clicking a filled cell crashed the whole page ("Application error: a
     client-side exception"). The payload showed why: `citations` comes
     back as a JSON **string** (`"[{\"documentId\":...}]"`), not a parsed
     array — Postgres's jsonb round-trips fine, but calling `.map()`
     directly on a string blew up. Fixed with a `citationsOf()` helper
     that parses it defensively before rendering.
  2. "Add column" looked broken, but the payload showed it was actually
     working on the server the whole time — Muawiyah just never saw the
     new column appear, so he kept retrying, which created duplicate
     questions in the DB. The real bug: `GET /api/matrix` (and
     `/api/documents`) are plain Route Handlers with no dynamic request
     data, which Next.js can treat as eligible for its Full Route Cache —
     so after a mutation, the client's `refresh()` call could keep getting
     served a stale cached snapshot instead of hitting the database again.
     Added `export const dynamic = "force-dynamic"` to every GET route
     (`/api/matrix`, `/api/questions`, `/api/documents`,
     `/api/documents/[id]`) and `cache: "no-store"` on the client-side
     fetches to them, to kill caching at both the server and browser
     layer. Syntax-checked clean, pushed.
  **Follow-up needed:** Muawiyah has a few duplicate questions sitting in
  his matrix now from the repeated retries — safe to delete via each
  column's × button once the fix is confirmed live.
- **2026-11-03** — Muawiyah confirmed "Good go" — Step 4 (Matrix grid) done
  end-to-end: adding a question creates a column live, cells fill in one
  by one with evidence, clicking a cell shows the source quote without
  crashing. Starting Step 5 (split the single Analyst+Verifier call used
  everywhere so far into two separate steps, and reject/flag ungrounded
  answers before they ever reach the UI).
- **2026-11-03** — Built Step 5. Decided against a second Gemini call for
  the Verifier: an LLM grading its own (or another LLM's) citation is
  still just another model's opinion, and doubling the Gemini calls would
  hit the free tier's daily cap twice as fast. Instead wrote a
  deterministic Verifier (`src/lib/verify.ts`) — normalizes whitespace and
  quote characters, then checks whether the Analyst's claimed quote is an
  actual substring of the specific document+page chunk it says it came
  from. `grounded: true` now means "we found this exact text in the
  source," not "the model said so." Citations that don't verify are
  dropped before they're ever stored or shown; if none survive, the
  answer is downgraded to not-grounded regardless of what the Analyst
  claimed. Added a `verification_note` column to `matrix_cells` and
  surfaced it in both the Matrix evidence panel and the Ask panel so a
  downgrade is visible, not silent. Wired into `computeCell` and
  `/api/ask`. Syntax-checked clean, pushed. Waiting on Muawiyah to test —
  worth specifically trying a question the documents don't actually
  answer, to see the Verifier catch it.
- **2026-11-03** — Muawiyah said he'd discuss the Verifier later and to
  keep going, so moved straight to Step 6 (contradiction detection) rather
  than waiting on "Good go" for Step 5. Built it on top of the same
  pending→computing→ready/failed + queue/step pattern used for the Matrix
  grid, for the same reason: one request trying to run several Gemini
  calls before responding is what broke "Add column" earlier. A "Check
  contradictions" button queues every question that has a grounded answer
  from 2+ documents, then one Gemini call per question judges whether
  those answers genuinely conflict (not just worded differently) —
  flagged questions get a ⚠ on their column header and show up with an
  explanation in a new Contradictions panel under Evidence. Left the
  ContractNLI evaluation unstarted — no dataset access from the sandbox,
  that one needs Muawiyah to supply the data. Syntax-checked clean,
  pushed. Not yet tested.
- **2026-11-05** — Muawiyah started testing with real, large documents for
  the first time (4 years of 3M's actual 10-Ks, 100+ pages each) and hit a
  real bug: `429 RESOURCE_EXHAUSTED` from Gemini's embedding endpoint —
  "Embed content requests per minute limit exceeded... limit: 100." Asked
  whether to switch to NVIDIA Nemotron or Grok instead; checked both and
  said no — Grok has no confirmed free tier or embeddings endpoint at all,
  and NVIDIA NIM's free tier is a worse 30 req/min with no SLA, so
  switching providers wouldn't actually fix anything.
  The real bug: document upload (`POST /api/documents`) ran extract +
  chunk + embed *every* chunk inside one request — this had never
  actually been stress-tested with a large document before (every prior
  test PDF was 1 page). A 100+ page 10-K produces 150+ chunks, and
  embedding them all in one burst both risked the platform's request time
  limit and tripped Gemini's 100/minute embedding cap on its own.
  Fixed two ways:
  1. `withRetry` (gemini.ts) now also retries on 429/RESOURCE_EXHAUSTED,
     parsing Gemini's own suggested `retryDelay` out of the error instead
     of guessing — it was already telling us "retry in 51s."
  2. Restructured upload so it never embeds inside the upload request at
     all: `document_chunks.embedding` is now nullable, upload inserts
     chunk text only and sets `documents.status = 'embedding'`, and a new
     `POST /api/documents/embed-step` embeds one batch (20 chunks) of one
     document per call — same fast-insert-then-drain pattern as Matrix
     cells and contradiction checks. Workspace.tsx drains it automatically
     after upload and shows an "indexing" badge while it runs. A document
     only reaches `'ready'` (searchable) once every chunk is embedded.
  Syntax-checked clean, pushed. Should hold up against the AMD/3M/Boeing
  FinanceBench-style large-10-K testing going forward.
- **2026-11-05 (follow-up, same day)** — That fix was incomplete. Muawiyah's
  screenshot showed 3 of the 4 3M 10-Ks still stuck "indexing" and one
  (`3M_2015_10K.pdf`, 158 pages) permanently `failed`, with the raw error
  displayed in the UI: `"retryDelay":"0s"` and "Please retry in
  345.14512ms." Two real bugs, both in how the first fix handled a 429:
  1. `extractRetryDelayMs` trusted Gemini's suggested delay literally —
     but under a sustained per-minute burst Gemini itself was suggesting
     a near-zero wait (0s / 345ms), which just re-hit the same still-full
     bucket instantly, burning all retry attempts in under a second.
     Fixed: Gemini's suggestion is now a floor, combined with (never
     below) our own 2s-doubling backoff (2s, 4s, 8s) — a per-minute quota
     that's full needs real seconds to drain, not milliseconds.
  2. `embed-step`'s catch block marked the *whole document* permanently
     `failed` for what is actually a transient, self-clearing rate limit
     — architecturally wrong, since the next call would've succeeded
     fine once the minute rolled over. Fixed: a rate-limit error now
     returns a distinct `429 {rateLimited: true}` response and leaves the
     document's status as `'embedding'` (untouched) instead of writing
     `failed` — the next `/embed-step` call just tries again.
  Also: `Workspace.tsx`'s `drainEmbeddings()` no longer treats a
  rate-limited step as a hard stop — it paces (growing wait, capped at
  20s) and keeps draining, only surfacing an error after 15+ consecutive
  rate-limited responses. Added a retry affordance (↺ icon) on any
  `failed` document — new `PATCH /api/documents/[id]` resumes embedding
  from wherever it left off (already-embedded chunks keep their vectors;
  only the still-null ones get retried) rather than requiring a
  re-upload. Also lowered `embed-step`'s `BATCH_SIZE` from 20 to 10
  chunks per call, to shrink the burst size that can trip the limit in
  the first place. Syntax-checked clean, pushed. Muawiyah should hit
  retry (↺) on the failed `3M_2015_10K.pdf` and let the other three
  finish draining — this time a rate limit should show up as patient
  retrying, not a permanent failure.
- **2026-11-05 (second follow-up, same day)** — That fix *also* had a bug,
  self-inflicted by the fix itself this time: Muawiyah's next screenshot
  showed all 4 documents still stuck "indexing" with a banner reading
  "Indexing failed (504)." A 504 is a raw platform gateway timeout, not an
  app-level error — `/api/documents/embed-step` itself was running out of
  time mid-request. Root cause: the previous fix made `withRetry` wait
  out a 429 in place with a 2s/4s/8s backoff — but this project already
  established (back in Step 4) that Vercel's free/Hobby plan hard-caps
  serverless function duration around ~10s regardless of the
  `maxDuration` export in code. 2s+4s+8s alone is 14s — comfortably
  enough, on its own, to blow that cap and come back as an opaque 504
  instead of a clean response. Fixed by changing strategy entirely: a 429
  is no longer retried in place at all. `withRetry` now throws it
  immediately, `embed-step` turns that into the same distinct `429
  {rateLimited: true}` response as before, and the client's existing
  drain-loop pacing (added in the previous fix) is what actually waits
  out the limit — between requests, not inside one. Only a 503 "high
  demand" still gets a couple of quick, small retries (400ms/800ms),
  since that one usually clears almost immediately and isn't the kind of
  limit that needs real seconds to drain. Also lowered `embed-step`'s
  `BATCH_SIZE` again, 10 -> 6, for extra margin against the ~10s cap.
  Syntax-checked clean, pushed. Muawiyah should retry the 3M documents
  once more; if any still 504, the next lead is whether `ensureSchema()`
  or the per-chunk `sql` writes are themselves slow, not Gemini.
- **2026-11-05 (third follow-up, same day — the actual fix)** — Every
  round so far had been tuning *how* to survive hitting the rate limit
  (retry timing, failure handling, backoff pacing). Muawiyah pushed back
  and asked for the real optimization instead: is there a way to avoid
  tripping the limit in the first place, mathematically, rather than just
  handling it better. He was right — and the answer was sitting in the
  architecture the whole time. The free tier's quota
  (`embed_content_free_tier_requests`, 100/minute) is metered per API
  *request*, not per text embedded. `embedTexts` had been calling
  `embedContent` once per chunk the entire project — so a single 150-chunk
  10-K alone needed ~150 requests, blowing the *entire* per-minute budget
  on its own before any other document got a turn. That's the actual root
  cause behind every 429 and the 504 that followed from trying to out-wait
  it. The real fix: Gemini's `embedContent` accepts an array of texts as
  `contents` and returns one embedding per text in a single response —
  confirmed via Gemini API docs and SDK reference. Rewrote `embedTexts` to
  pack chunks into batches (up to 50 texts or 60k characters, whichever
  comes first) and send each batch as ONE request instead of one request
  per chunk. For a 150-chunk document this drops request count from ~150
  to ~3 — comfortably inside the per-minute budget even across all 4 3M
  filings at once. Raised `embed-step`'s `BATCH_SIZE` back up to 50 to
  match (now usually a single Gemini request per step call, not several
  sequential ones, so no new duration-cap risk). The earlier fail-fast/
  no-retry-in-place 429 handling, the non-terminal `failed` fix, and the
  drain-loop pacing all stay as the backstop for whatever residual rate
  limiting still happens — but they should now rarely if ever fire.
  Syntax-checked clean, pushed. This is the one that should actually hold.
- **2026-11-05 (fourth follow-up, same day)** — Even after batching,
  Muawiyah hit the same generic "stuck behind rate limit" banner again.
  At 50 chunks/batch × ~900 chars/chunk (chunk.ts's `CHUNK_SIZE`), a batch
  comfortably fits under `EMBED_BATCH_MAX_CHARS` (60k) in one Gemini
  request — so this genuinely shouldn't still be a request-count problem
  at this scale, and I don't have a way to inspect Gemini's real quota
  state or Vercel's function logs from the sandbox to confirm what's
  actually happening server-side. Rather than guess at a fourth theory,
  made two honest, verifiable changes: (1) the error banner now includes
  Gemini's actual raw error text in parentheses when it gives up, not
  just the generic sentence — next time this fires, the literal quota
  name/limit from Gemini's response will be visible instead of guessed
  at; lowered the give-up threshold from 15 to 8 so that detail surfaces
  sooner. (2) added a flat 1.2s pace between successful (non-rate-limited)
  steps too, as cheap defensive insurance in case steps were firing
  faster than assumed — not evidence batching is broken, just a safety
  margin while the real signal (the detailed error text) gets collected.
  Syntax-checked clean, pushed. Next time this happens, the banner's
  parenthetical text is the actual diagnostic — that's what determines
  whether this is really still a per-minute request problem or something
  else entirely (e.g. a daily cap, or quota tracked differently than
  assumed).
- **2026-11-05 (fifth follow-up, same day — the real diagnosis)** —
  Muawiyah got the real error text and asked a sharper question: is there
  an actual optimization/mathematics here, not just better error
  handling? He was right to push, and the raw text answered both open
  questions from the previous entry at once:
  1. `"Embed content requests per day limit exceeded on Free Tier"`,
     `quotaId: EmbedContentRequestsPerDayPerProjectPerModel-FreeTier`,
     `limit: 1000`, retry in ~19h42m. It's a DAILY cap (1000/project/
     model/day), separate from the 100/minute one — all of today's
     per-minute tuning was chasing the wrong clock. This key is locked
     out until roughly 1:30 PM IST tomorrow; no code change fixes that
     today.
  2. A second error — `"Batch embedding returned 1 vectors for 50
     texts"` — proved the "batch chunks into one request" fix from
     earlier today was actually broken the whole time: the `@google/genai`
     JS SDK does NOT route a `contents` array through Gemini's real batch
     endpoint the way the (unverified, docs-suggested) assumption held —
     it treats the array as multiple *parts of one content* and returns a
     single combined embedding, not one per text. The SDK source isn't
     browsable from this sandbox (no registry/GitHub raw access) so this
     was never actually confirmed before shipping it, and it was wrong.
  Reverted `embedTexts` back to one `embedContent` call per chunk — the
  only shape confirmed to return one correct vector per input. Added
  `isDailyQuotaError()` alongside the existing `isRateLimitError()` so a
  daily-cap 429 is distinguished from a per-minute one: `embed-step` now
  returns a `dailyLimit` flag, and `Workspace.tsx`'s drain loop stops
  immediately with a clear "resets in ~24h, will resume automatically"
  message instead of burning ~90s retrying something that can't clear for
  hours. The document stays `'embedding'` (not `'failed'`) either way, so
  reopening the page tomorrow just resumes draining on its own.
  Honest bottom line, told to Muawiyah directly: the per-chunk request
  cost can't be shrunk by request-shaping alone (confirmed — batching
  doesn't work with this SDK), so a 150-chunk document genuinely costs
  ~150 of the 1000-request daily budget. If that's still too tight once
  the quota resets, the real lever is sharding across multiple free
  Gemini API keys/projects (each gets its own independent 1000/day
  bucket) — not cleverer batching of one key, which doesn't reduce how
  many chunks need embedding. Left that decision to Muawiyah rather than
  building it speculatively. Syntax-checked clean, pushed.
- **2026-11-05 (Step 7: Reports)** — With the embedding issue diagnosed
  and the daily quota dead for the day anyway, Muawiyah asked to move on
  to other work; confirmed it meant the next roadmap item. Built the
  report panel: a `src/lib/types.ts` now holds the Cell/Question/
  Contradiction/MatrixData types shared between `MatrixTable.tsx` and the
  new `ReportPanel.tsx` (pulled out of MatrixTable so the two don't drift
  out of sync). The panel opens from a new "Report" button next to "Check
  contradictions" and shows: a deterministic summary (document/question
  counts, grounded-answer ratio, conflicts flagged — computed from data
  the grid already has, zero new Gemini calls, deliberately, given how
  tight the free tier's daily quota turned out to be today), the full
  answer set per question across every document (not the grid's truncated
  preview), and a citations appendix grouped by document with page labels
  and exact quotes. "PDF export" uses the browser's own print-to-PDF
  (`window.print()`) rather than adding a client-side PDF library —
  nothing to install sight-unseen from this sandbox (no way to test an
  `npm install` here before Vercel's own build does it), and print-to-PDF
  is a feature every real browser already has reliably. New `@media
  print` rules in `globals.css` scope the printed output to just the
  report panel and force it to a light/black palette instead of the
  app's dark theme bleeding into the PDF. Syntax-checked clean (caught
  and fixed one real bug along the way — a missing `Contradiction` import
  in `MatrixTable.tsx` after the types refactor — plus made a couple of
  `Map` constructions explicitly typed rather than relying on inference),
  pushed. Not yet tested on the live site.
- **2026-11-05 (temporary OpenRouter/Nemotron swap — on standby, NOT
  active)** — Built, but did not activate, a second embedding provider so
  Muawiyah can test today without waiting for tomorrow's Gemini reset,
  switchable with one edit: `src/lib/embeddings.ts` is now the single
  place every embedding call site (`embed-step`, `/api/ask`,
  `matrix.ts`, `db.ts`) imports from, instead of importing `embedText`/
  `embedTexts`/`EMBEDDING_DIMENSIONS` straight from `@/lib/gemini` —
  currently it re-exports Gemini's versions unchanged, so nothing
  behaves differently yet. `src/lib/embed-openrouter.ts` is the
  alternate implementation: calls OpenRouter's documented
  OpenAI-compatible `POST /api/v1/embeddings` with
  `nvidia/nemotron-3.5-embed-1b:free`, batches many texts per request
  (OpenRouter's docs confirm real array-input batching — unlike the
  Gemini SDK, which silently didn't), and truncates Nemotron's native
  2048-dim output down to 768 to match the existing pgvector column
  with zero schema change (Nemotron's embeddings are Matryoshka-style,
  so truncation is a documented, valid way to shrink them). Also added
  `POST /api/documents/reembed` — nulls every chunk's stored embedding
  and resets every document back to `'embedding'` status, needed after
  ANY provider switch (in either direction) since two providers'
  vectors aren't comparable even at the same dimension; not called by
  anything automatically, a deliberate manual step tied to the swap.
  To actually switch: edit the export line in `embeddings.ts` to point
  at `embed-openrouter` instead of `gemini`, set `OPENROUTER_API_KEY` in
  Vercel, redeploy, then call `/api/documents/reembed` once. To revert:
  same edit back, redeploy, reembed again. Syntax-checked clean, pushed
  — left inactive pending Muawiyah's go-ahead either way.
- **2026-11-05 (switched ON)** — Muawiyah confirmed `OPENROUTER_API_KEY`
  is set in Vercel, so flipped `src/lib/embeddings.ts`'s export to
  `embed-openrouter` (Gemini's export line kept commented directly below
  it for a fast revert later). Embedding is now live on OpenRouter +
  `nvidia/nemotron-3.5-embed-1b:free`. Syntax-checked clean, pushed.
  **Still needed before this does anything useful**: Muawiyah needs to
  call `POST /api/documents/reembed` once (browser console snippet given
  earlier) to clear the old Gemini-vector chunks and let Nemotron
  re-index everything — without that step the documents stay marked
  'ready' with stale, now-uncomparable Gemini vectors and nothing will
  actually re-embed.
- **2026-11-05 (real build failure, caught by Vercel, not by my sandbox
  check)** — The "switched ON" deploy above actually failed to build.
  Vercel's `npm run build` (with real `node_modules`, so it fully
  type-checks across files) errored: `embed-step/route.ts:80` calls
  `isDailyQuotaError(err)` — one argument — but
  `embed-openrouter.ts`'s version of that function took zero. `gemini.ts`
  took one (`err: unknown`). The two providers' interfaces were never
  checked against each other for parity before the switch-point design
  went live, and my `tsc --noResolve` sandbox check can't catch a
  cross-file interface mismatch like this — it can't fully resolve
  imports the way Next.js's real build does, which is exactly why this
  slipped through twice (once in the design, once in my own check)
  before Vercel's actual build caught it. Fixed: changed
  `embed-openrouter.ts`'s `isDailyQuotaError()` to
  `isDailyQuotaError(_err: unknown)`, matching `gemini.ts`'s signature
  exactly. Also re-verified every other export the two providers share
  (`embedText`, `embedTexts`, `EMBEDDING_DIMENSIONS`, `isRateLimitError`)
  — all match. Syntax-checked clean, pushed. This is the first time the
  OpenRouter switch has actually deployed successfully — Muawiyah should
  now run the `/api/documents/reembed` POST once the new deploy finishes.
- **2026-11-05 (free Nemotron backend is flaky — added retry + treat as
  transient, not a hard failure)** — After the build fix deployed and
  reembed ran, got a real failure: `502: HTTP 500:
  {"message":"service inference failed"}` — OpenRouter's gateway
  reporting its own upstream (the free, no-SLA Nemotron instance)
  errored on inference. This isn't a code bug, it's the free tier doing
  exactly what its own terms warn about ("not for production", no SLA).
  Since `embed-openrouter.ts` had no retry at all for this, it threw
  immediately and `embed-step` — not recognizing it as rate-limiting —
  marked the document `'failed'`. Fixed two ways: (1) `callOpenRouter`
  now retries up to twice (400ms, 1000ms) on a 500/502/503/504 before
  giving up, since a single transient inference blip is the common case
  and this is cheap and safe within Vercel's duration cap (embed-step
  only makes one call per invocation); (2) if it still fails after
  retries, `isRateLimitError` for this provider now also recognizes
  these transient 5xx shapes (not just 429s) and treats them the same
  way — document stays `'embedding'`, not `'failed'`, and the client's
  existing backoff loop in `Workspace.tsx` just retries later instead of
  needing a manual recovery. Syntax-checked clean, pushed. Worth
  watching: if this keeps happening often, the free Nemotron tier's
  reliability (not just its rate limit) may be the real ceiling on using
  it for anything beyond a stopgap.
- **2026-11-06 (OpenRouter removed — Gemini only, for good)** — Muawiyah
  decided to stop here rather than keep fighting the free Nemotron
  backend's flakiness: sticking to Gemini only. Deleted
  `src/lib/embed-openrouter.ts` and the `src/lib/embeddings.ts`
  switch-point entirely (that abstraction existed only to make swapping
  providers a one-line edit, and is exactly what caused both build
  failures this week via interface drift between the two providers —
  with only one provider left, it's pure risk with no upside now).
  Every call site (`embed-step/route.ts`, `/api/ask`, `matrix.ts`,
  `db.ts`) now imports `embedText`/`embedTexts`/`EMBEDDING_DIMENSIONS`/
  `isRateLimitError`/`isDailyQuotaError` straight from `@/lib/gemini`
  again, same as before this whole provider-swap detour started.
  `OPENROUTER_API_KEY` in Vercel is now unused and can be removed (not
  required, just dead weight). Syntax-checked clean, pushed. Calling
  `/api/documents/reembed` once more clears out the Nemotron vectors
  that got written while the switch was briefly live, so Gemini
  re-indexes everything cleanly instead of mixing vector spaces.
  **Net effect of this whole detour**: no functional change from where
  things stood before the swap — Gemini embedding, same daily-quota
  ceiling as always (1000/day free tier, resets ~24h after being hit) —
  but the daily-vs-per-minute quota distinction, the 504 duration-cap
  fix, and Step 7 (Reports) all remain in place and were genuine
  progress.
- **2026-11-07 (Step 8 started: evaluation harness)** — Built a real
  evaluation feature rather than just eyeballing answers against
  GROUND_TRUTH_QA.md by hand. New "Evaluate" button (next to Report) opens
  a panel that: (1) seeds the 10 ground-truth question/expected-answer
  pairs from the synthetic finance PDF set with one click
  (`POST /api/eval/seed`, hardcoded and idempotent — only inserts if the
  table is empty); (2) runs each question through the *exact same* ask
  pipeline `/api/ask` uses — embed the question, vector search top 10
  chunks across ready documents, Analyst answer, Verifier check — via a
  one-at-a-time drain (`/api/eval/step`), same pattern as
  `/api/matrix/step` and `/api/contradictions/step`; (3) grades each
  verified answer against its expected answer with a new `judgeAnswer()`
  call in `gemini.ts` (separate from the Analyst, so the model that
  answered isn't also the one grading itself), returning
  correct/partial/incorrect plus a one-line explanation. Results show per
  question with expected vs. actual side by side, grounded/ungrounded,
  verdict badge, and a running correct/partial/incorrect + grounded-ratio
  summary. New tables `eval_questions` and `eval_results` (one row per
  question, like `question_contradictions`); `/api/eval/reset` requeues
  everything for a re-run. Rate-limit handling mirrors embed-step: a 429
  leaves the row `pending` (not `failed`) and tells the client whether
  it's the daily cap so it doesn't waste time retrying short backoffs.
  Syntax-checked clean, pushed. Ready to test end to end against the 10
  finance PDFs sent earlier today.
