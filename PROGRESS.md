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
- **2026-11-07 (real bug: concurrent PDF uploads corrupting each other's
  parse)** — Muawiyah uploaded the 10 finance PDFs twice; the same files
  failed both times but with DIFFERENT nonsensical parser errors each run
  ("bad XRef entry" vs "Invalid number: p" vs "Invalid number: -" on the
  identical file across two attempts) — the signature of a race
  condition, not genuinely malformed PDFs. Confirmed the files themselves
  were fine: `qpdf --check` and a modern pdfjs-dist both parsed every one
  without error. Root cause: `Workspace.tsx`'s `uploadFiles` sends all
  selected files to `POST /api/documents` via `Promise.all` (fully
  concurrent), and `extract.ts`'s `pdf-parse` 1.1.1 bundles an old,
  pre-worker pdf.js build with shared/global parsing state never designed
  for multiple concurrent `getDocument()`-equivalent calls in the same JS
  heap. When Vercel routed two of those concurrent upload requests onto
  the same warm instance, their `pdfParse()` calls interleaved and
  corrupted each other's in-flight parse state. Fixed in `extract.ts`: a
  simple in-process async queue (`runSerialized`) now wraps every
  `pdfParse()` call so only one ever runs at a time within a given
  server process, however many upload requests arrive concurrently — this
  makes the race impossible by construction rather than just less likely.
  Syntax-checked clean, pushed. Muawiyah should delete the failed document
  rows and re-upload the (already qpdf-normalized) PDF set once this
  deploys.
- **2026-11-07 (real fix: replaced pdf-parse with pdfjs-dist)** — The
  serialization-queue fix from the previous entry did NOT solve it:
  re-uploading the same 10-file set a third time produced yet another
  different scatter of errors on the same files ("bad XRef entry" vs
  "Invalid number: -" vs "Invalid number: p", changing per file between
  attempts). That ruled out pure request-level concurrency as the root
  cause — it pointed at pdf-parse 1.1.1's bundled pdf.js fork (frozen
  since ~2018) being unreliable on its own, not just unsafe when called
  concurrently. Replaced it outright: `extract.ts` now imports
  `pdfjs-dist` (pinned 4.9.155) directly — the actively maintained,
  official PDF.js package — via its Node-compatible `legacy/build` entry
  point, instead of pdf-parse's old copy of it. Verified locally before
  pushing: ran the new extraction logic against all 10 finance PDFs with
  the real pdfjs-dist package available on this machine, including 3
  rounds of fully concurrent (`Promise.all`) extraction of all 10 at
  once, matching Workspace.tsx's real upload pattern — zero failures
  across 30 total extractions. Also: `next.config.mjs` now declares
  `outputFileTracingIncludes` for pdfjs-dist's `standard_fonts/` data
  (needed for accurate glyph metrics on the 14 standard PDF fonts;
  Vercel's file tracer can't discover this directory on its own since
  the path is built from `process.cwd()` at runtime, not a static
  import). `pdf-parse` removed from package.json; its ambient type
  declaration swapped for one covering pdfjs-dist's legacy subpath
  instead. Syntax-checked clean, pushed. This should be the actual fix —
  the previous entry's queue is harmless but no longer the thing doing
  the protecting.
- **2026-11-07 (that wasn't it either — real fix: serialize uploads, not
  just extraction)** — Re-uploaded the same 10-file set after the
  pdfjs-dist deploy: still only 1/10 succeeded, same two errors ("bad
  XRef entry", "Invalid number: -"), and — tellingly — a *different*
  single file survived each time (06_cascade last attempt, 05_nimbus
  this one). Sent Muawiyah a zip of the files as a test of a
  file-transit-corruption theory; before hearing back, re-examined why
  every local verification kept passing 100% while production kept
  failing ~90% of the time on byte-identical files. The answer: every
  local test (both the pdf-parse-queue attempt and the pdfjs-dist
  rewrite) called `extractPdf()` directly on a buffer read straight off
  disk with `fs.readFileSync`. That never exercised the one thing
  actually different in production — `Workspace.tsx`'s `uploadFiles`
  sends all selected files to `POST /api/documents` at once via
  `Promise.all`, and when several of those concurrent requests land on
  the same warm Vercel instance, they race inside `req.formData()`'s
  multipart body parsing *before extraction ever runs*. That matches
  every symptom that didn't fit a pure extraction-library bug: corruption
  landing on structural byte offsets (the xref table) in a way no
  amount of fixing the parser downstream could prevent, a different
  file winning the race each batch, and the same file failing
  differently across attempts. Fix: `uploadFiles` now sends files to the
  server one at a time (a plain sequential loop) instead of
  `Promise.all`, removing the race at its source. Added a small
  server-side async lock in `/api/documents/route.ts` around the
  `formData()`-parse-and-buffer-read step as defense in depth, in case
  multiple browser tabs or people ever upload concurrently. Syntax-
  checked clean, pushed (`a4d36f5`). Muawiyah should delete the 9 failed
  rows and re-upload the same PDF set once this deploys — if this really
  is the root cause, all 10 should go to "ready" this time, no zip
  needed.
- **2026-11-13 (accounts + per-user data isolation)** — Requested:
  real login/sign-up, "production level," each user's own data private
  to their own account. Before this everything in the app — documents,
  questions, matrix cells, contradictions, eval results — was global:
  no login at all, so anyone hitting the site saw and could act on
  everyone else's data. Not a new RAG pipeline (the existing pgvector
  search already does that job); what was missing was an owner on
  every row and a login system to establish one.

  Added: `users` (bcrypt-hashed passwords, 12 rounds) and `sessions`
  tables; a random 32-byte session token handed to the browser as an
  httpOnly, secure (in production), sameSite=lax cookie —
  `lib/auth.ts`'s `getSessionUser`/`requireUser` resolve it on every
  API request, `getUserByToken` does the same for server components
  via `next/headers` cookies(). `/api/auth/signup`, `/login`,
  `/logout`, `/me`. Login failures return the same "Incorrect email or
  password" whether the email doesn't exist or the password is wrong —
  deliberate, so a failed attempt doesn't tell an attacker which half
  they got right. `/login` and `/signup` pages (`AuthForm.tsx`); the
  home page header now shows Log in/Sign up when logged out, or the
  account's email + a logout button when logged in
  (`HeaderAuthControls.tsx`); `/workspace` and `/matrix` are server
  components that redirect to `/login?next=...` if there's no valid
  session.

  Schema: `documents`, `questions` and `eval_questions` each got a
  nullable `user_id` column (additive — nothing deleted; see the note
  below on what this does to the existing test documents).
  `document_pages`/`document_chunks`, `matrix_cells`,
  `question_contradictions` and `eval_results` have no `user_id` of
  their own — they're scoped by joining back to the `documents`/
  `questions` row that owns them, same pattern used everywhere else in
  this codebase already.

  Every route touching the database now requires a session and
  filters by it — including ones that needed real auditing, not just
  a `where user_id = ...` tacked on:
  - `/api/matrix/step`, `/api/contradictions/step`, `/api/eval/step`
    (the one-cell/one-question-at-a-time drain loops) previously
    picked the globally oldest pending item across *every* user —
    fixed to only ever pick up the signed-in user's own pending work.
  - `/api/matrix/backfill`'s `cross join questions` was previously
    completely unscoped — it could insert a matrix cell pairing one
    user's document with a different user's question. Both sides of
    the join are now filtered to the same `user_id`.
  - `/api/matrix/recompute` takes a `documentId`/`questionId` straight
    from the request body — added an explicit ownership check on both
    before calling `computeCell`, so a crafted request can't force a
    recompute against another user's data.
  - `/api/documents/reembed` (the manual OpenRouter-vectors cleanup
    tool from the 2026-11-06 entry) was a blunt global reset — scoped
    to the caller's own documents only, since it's still reachable by
    any logged-in user.

  `computeCell` (matrix.ts) and `computeContradiction`
  (contradiction.ts) needed no changes themselves — both only ever
  operate on a single already-verified `document_id`/`question_id`
  pair, and matrix_cells rows are only ever created pairing a
  document and question that already belong to the same user (now
  enforced at both insertion points: `/api/questions` and
  `/api/matrix/backfill`). `computeEval` (eval.ts) did need a
  `userId` parameter added, since it runs its own cross-document
  vector search the same way `/api/ask` does.

  Syntax-checked clean across all ~30 touched/added files, pushed
  (`2d706c6`). **Note for Muawiyah**: the finance test documents and
  questions uploaded before this change have no owner — they're not
  deleted, but once this deploys they'll be invisible under any
  account (nothing will match `user_id = you`). Sign up, then
  re-upload the same PDF set and re-add the eval questions (Evaluate →
  Seed) under the new account.
- **2026-11-13 (build break from the accounts change: wrong pdfjs-dist
  entry point)** — The accounts commit above broke the actual Vercel
  build (`Module not found: Can't resolve
  'pdfjs-dist/legacy/build/pdf.js'`), caught from the build log
  Muawiyah pasted, not from local testing — this specific mistake was
  mine: the local verification done when pdfjs-dist first replaced
  pdf-parse (2026-11-07 entry above) ran against whatever pdfjs-dist
  version happened to be installed on this machine for testing
  (6.2.108), which has a completely different package layout — no
  `legacy/` build, no `exports` map at all — than the version actually
  pinned in package.json (4.9.155). The `.js` legacy entry point was
  never real for 4.9.155; only `pdf.mjs` is. Fixed: `extract.ts` and
  `declarations.d.ts` now import `pdfjs-dist/legacy/build/pdf.mjs`
  instead — a plain `import` statement (not `require()`) handles a
  `.mjs` file fine through Next's webpack bundler, so this isn't a
  workaround, it's the actually-correct path. Also fixed a config
  warning from the same build log: `outputFileTracingIncludes` was set
  at the top level of `next.config.mjs`, which Next 14.2.18 doesn't
  recognize there (it's under `experimental` until Next 15) — moved
  it. Syntax-checked clean, pushed (`3c55c2f`).
- **2026-11-13 (logged-in UI redesign)** — Requested: a better, "full
  area," production-level layout for the logged-in experience.
  Workspace was a single max-w-4xl column with the dropzone, document
  list and Ask panel all stacked vertically, and both `/workspace` and
  `/matrix` hand-rolled their own near-duplicate header (logo/nav/
  email/logout). New `AppShell.tsx` is a shared, persistent top bar —
  logo, Workspace/Matrix nav with an active-page indicator, account
  email, logout — used by both pages instead of each re-implementing
  it, over a 1400px-wide content container (full-bleed header, no more
  cramped column). Workspace itself is now a full-width two-column
  layout: a stat strip at the top (documents / ready / indexing /
  failed counts, so the state of your library is visible at a glance
  instead of only inferable from scrolling the list), the document
  list as its own card on the left, and the Ask panel as a sticky card
  alongside it on wide screens — previously it was buried below
  whatever the document list's current length happened to be. Document
  rows show relative upload time now ("3m ago"); the dropzone shrinks
  to a slim bar once documents exist instead of staying a large empty
  box competing with real content. AskPanel switched from a
  side-by-side input+button (needs width) to a stacked textarea+button
  (fits the ~380px sidebar column it now lives in). Matrix page now
  renders inside the same AppShell. Syntax-checked clean, pushed
  (`852ac7d`).
- **2026-11-13 (upload fix #2: pdf.js's worker file wasn't bundled)** —
  With the .mjs build-break fix deployed, uploads now failed
  deterministically on all 10/10 files (progress — no longer the old
  intermittent pattern) with: `Setting up fake worker failed: "Cannot
  find module '/var/task/.next/server/app/api/documents/pdf.worker.mjs'
  imported from .../route.js"`. pdf.js always routes parsing through
  its worker API, even in Node — with `GlobalWorkerOptions.workerSrc`
  unset, it falls back to a "fake worker" that still dynamically
  imports the real `pdf.worker.mjs` to run in-process, and it guessed a
  path sitting right next to the bundled route.js, which was never
  there. Exact same shape of problem as the `standard_fonts` path fixed
  in an earlier entry — pdf.js builds this path at runtime, so Vercel's
  file tracer can't discover the dependency from static analysis alone.
  Fixed the same way: `extract.ts` now explicitly sets
  `GlobalWorkerOptions.workerSrc` to the real on-disk location
  (`process.cwd()` + the known node_modules layout, same pattern as
  `STANDARD_FONT_DATA_URL`), and `next.config.mjs`'s
  `outputFileTracingIncludes` got a matching entry for
  `pdfjs-dist/legacy/build/pdf.worker.mjs` so the actual file ships
  with the function. Syntax-checked clean, pushed (`5cb1eae`).
- **2026-11-13 (upload fix #3: retry silently skipped extraction
  entirely)** — Reported symptom: all 10 documents showed status
  "ready" (no error, `page_count: null`) but Ask said "Nothing indexed
  yet." These were the same 10 documents that had failed on the
  pdf.worker.mjs bug fixed in the previous entry — they'd failed
  *during extraction itself*, before chunking ever ran, so
  `document_chunks` had zero rows for them. The retry endpoint (PATCH
  `/api/documents/[id]`) only ever asked "how many chunks still need
  an embedding" to decide 'embedding' vs 'ready'. With zero chunks
  total, that count is trivially zero, so it married these straight to
  'ready' and cleared the error, without ever re-running extraction or
  setting `page_count`. The status looked completely fine; there was
  just never anything indexed behind it — a genuinely different bug
  from the worker-path one, just surfacing through the same retry
  click. Fixed by distinguishing the two cases that were being
  conflated: chunks exist with some still unembedded -> resume
  embedding (unchanged); zero chunks exist at all -> extraction never
  completed, so re-fetch the file from its stored blob and re-run the
  full extract/chunk pipeline from scratch. Pulled the shared extract-
  chunk-and-set-status logic out into `lib/indexDocument.ts`, used by
  both the initial upload and this retry path now, so they can't drift
  apart again. The 10 documents already sitting in the broken state
  won't fix themselves retroactively (status is 'ready', not 'failed',
  so the UI doesn't even show a retry button for them) — Muawiyah
  needs to delete and re-upload them once this deploys. Syntax-checked
  clean, pushed (`3546406`).
- **2026-11-13 (cross-document retrieval fix + real ANN index)** —
  Everything finally indexed cleanly, then a deliberately tricky test
  question (one needing evidence from three of Orion's own filings at
  once — Q3 earnings release, FY results release, shareholder letter)
  came back "not found" on two sub-claims that were genuinely present
  in the documents. Root cause: `/api/ask` and `lib/eval.ts` both did
  one global "top 10 by cosine distance across every chunk from every
  ready document" search. With several unrelated companies' chunks all
  competing for the same 10 slots, whichever document happens to
  word-match the question most closely crowds out every other
  document's chunks entirely — a multi-document question silently
  loses the other evidence before it ever reaches the Analyst. The
  "not found" was an honest answer to an incomplete context, not a
  reasoning bug. Fixed by partitioning retrieval by `document_id` (a
  `row_number() over (partition by document_id order by distance)`
  window) and taking each ready document's own top 4 chunks before an
  overall cap of 40, instead of one undifferentiated global top-10 —
  every document now gets a fair shot at contributing its most
  relevant evidence. Applied identically to `/api/ask` and
  `lib/eval.ts` (which deliberately mirrors ask's retrieval).

  Separately, in the course of explaining the project's indexing
  approach: there was no index at all on `document_chunks.embedding` —
  every similarity search was an exact brute-force scan over every
  chunk, correct but not how real production vector search is built.
  Added an HNSW approximate-nearest-neighbor index
  (`vector_cosine_ops`) on that column, wrapped in a try/catch since it
  needs pgvector >= 0.5.0 — an older extension version on some Postgres
  host degrades to the exact scan instead of breaking every request
  through `ensureSchema()`. Syntax-checked clean, pushed (`1c38aff`).

- **2026-11-13 (hybrid retrieval: dense + keyword + reranker)** —
  Requested explicitly: retrieval upgraded to match the Hebbia-style
  architecture (dense + BM25/keyword search, with a reranker as a
  second pass), instead of dense-vector-only search.

  What changed, in `src/lib/retrieve.ts` (new, shared by `/api/ask`
  and `lib/eval.ts`):
  1. Dense search (unchanged: pgvector cosine distance over the HNSW
     index from the previous entry) and a new keyword/lexical search
     run in parallel. Keyword search uses a new generated `tsvector`
     column (`content_tsv`, auto-maintained by Postgres from
     `content`) plus a GIN index, queried with
     `websearch_to_tsquery`/`ts_rank_cd`.
  2. The two ranked lists are merged with Reciprocal Rank Fusion (RRF,
     k=60, the standard default) — fusing by each list's RANK rather
     than its raw score, since cosine distance and `ts_rank_cd` aren't
     on comparable scales and were never meant to be compared
     directly.
  3. The fused candidate pool (up to 60, drawn from both search types,
     still windowed per-document so one document can't crowd out the
     pool before fusion even happens) is reranked by a new
     `rerankChunks()` function in `gemini.ts` — one extra Gemini call
     that reads the real question against every candidate's real text
     and reorders by actual relevance, then trims to a final top 20
     for the Analyst. Fails soft: if the rerank call errors, the RRF
     order is used instead rather than losing the question.

  `src/lib/matrix.ts`'s single-document `computeCell()` retrieval was
  deliberately left unchanged — it's already scoped to one document
  at a time, so cross-document fusion has nothing to fix there.

  Syntax-checked clean, pushed (`15e1449`). Trade-offs explained to
  the user directly in the same reply (not just here): added latency
  from the extra rerank call, extra Gemini request/token cost per
  question, and two honesty caveats — Postgres's `ts_rank_cd` is a
  TF-based rank, not a literal BM25 formula, and the reranker is the
  existing Gemini chat model standing in for a dedicated small
  cross-encoder model, which is heavier per call and shares the same
  request quota as every other Gemini call in the pipeline.

- **2026-11-13 (Move to Matrix button)** — Ask and Matrix were fully
  decoupled (as explained to the user when they asked why their Ask
  question wasn't showing up in the Matrix grid) — Ask is a one-off
  Q&A with no persistence, Matrix only tracks questions explicitly
  added through its own "add question" input. Added an explicit
  bridge instead of auto-linking them: once an Ask question gets
  answered, a "Move to Matrix" button appears beside the Ask button.
  Clicking it calls the same `/api/questions` POST the Matrix page's
  input already uses (inserts the question row, seeds `matrix_cells`
  for every ready document) — so it's the user's deliberate choice,
  not automatic, and the Ask panel stays simple by default. Pushed
  (`1accac1`).

- **2026-11-15 (Telegram bot: QR-linked question answering)** —
  Added a new channel for asking BharatMatrix questions: Telegram.
  Requested by the user with a specific linking UX in mind — a
  personalized QR code in the user's own logged-in workspace that
  regenerates every time it's opened, but always resolves to the same
  linked account.

  How it works end to end:
  1. `telegram_link_codes` table — a short-lived (10 min), single-use
     code minted by an authenticated web request (`/api/telegram/
     link-code` POST), the only moment the system knows for certain
     which BharatMatrix user is doing the linking, since Telegram's
     webhook carries no session cookie at all.
  2. `TelegramConnect.tsx` renders that code as a QR code (deep link
     `https://t.me/<bot>?start=<code>`, via `react-qr-code`) in the
     Workspace sidebar. Scanning it opens Telegram with `/start
     <code>` pre-filled. The card auto-mints a new code when the old
     one expires, so it's never showing a dead QR.
  3. `telegram_links` table — `chat_id -> user_id`, upserted (not
     inserted) on every `/start`, which is what gives the "changes
     every time you open it, same account either way" behavior: a new
     code is a new one-time key, but it always unlocks the same
     account for that logged-in user.
  4. The webhook route (`/api/telegram/webhook`) verifies a shared
     secret Telegram echoes back on every call, looks up the asking
     chat's linked `user_id`, then runs the exact same pipeline as
     `/api/ask` — `embedText` → `hybridRetrieve` (dense + keyword +
     RRF + rerank, from the 2026-11-13 entry) → Analyst →
     deterministic Verifier — and replies with the grounded answer
     plus citations as plain text (deliberately not Telegram's
     MarkdownV2, since its escaping rules would break on ordinary
     punctuation in a real answer).

  Needs `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and
  `TELEGRAM_WEBHOOK_SECRET` set in Vercel plus a one-time `setWebhook`
  call against Telegram's API before it's live — not yet configured on
  this deployment, so the connect card currently falls back to showing
  the raw code. Syntax-checked clean, pushed (`6da503a`).

- **2026-11-18 (Evaluation wired in + growable ground truth; hybrid
  retrieval extended to Matrix)** — Two things fixed/extended after
  reviewing what was actually left.

  **Evaluation was never reachable from the UI.** `EvaluationPanel.tsx`
  and its API routes existed and worked, but nothing rendered the
  panel — no button, no page. Added `/evaluation` as a real page
  (new nav item in `AppShell`) with `EvaluationHost.tsx`, a thin
  client wrapper that gives the panel's close button somewhere to go.

  **Ground truth was a fixed, hardcoded 10-question seed set**, with
  no way to add your own cases short of editing code. Decided against
  a file-upload feature (wrong shape for a dataset you add to one case
  at a time) and instead added `POST`/`DELETE` on `/api/eval` so cases
  can be added or removed directly — the seed button is now one
  convenience option among several, not the only way in.

  **Hybrid retrieval (dense + keyword + RRF + rerank) extended to
  Matrix.** `matrix.ts`'s `computeCell` was still using the original
  dense-only top-6 query — called out explicitly as deliberately
  out of scope in the 2026-11-13 entry, now addressed. New
  `hybridRetrieveSingleDocument` in `retrieve.ts` (the RRF fusion
  logic factored into a shared `fuseRRF` helper, reused by both the
  cross-document and single-document paths) runs the same
  dense+keyword+rerank pipeline scoped to one document.

  **Real trade-off, flagged plainly**: this adds one extra Gemini
  rerank call per matrix cell — a 10x10 matrix now costs 100 more
  Gemini calls than before. `matrix/step` already computes exactly
  one cell per serverless request specifically because Vercel's
  free-plan ~10s real request cap was getting blown past before this
  extra round-trip existed — worth watching for matrix runs timing
  out now that each cell does one more network call.

  Syntax-checked clean (one isolated-file-check false positive on a
  `key` prop, expected without `@types/react` resolvable outside a
  real Next.js build — not a real error). Pushed (`2893cee`).

- **2026-11-21 (cross-encoder/Gemini hybrid fallback — groundwork)** —
  Requested: make the reranker itself hybrid — try a self-hosted
  cross-encoder first, and if it doesn't respond in a reasonable time
  (the known risk with free-tier hosting, which sleeps when idle),
  fall back to the existing Gemini reranker automatically, with a
  visible "waiting → switching" indicator in the Ask UI.

  Built: `src/lib/crossEncoder.ts` calls an env-configured
  `CROSS_ENCODER_URL` with a 2.5-second timeout (`AbortController`);
  `rerankWithFallback()` in `retrieve.ts` tries that first, falls back
  to the current Gemini-based `rerankChunks` on any failure (unset
  URL, non-2xx, bad response shape, or timeout), and falls back once
  more to the plain RRF order if even Gemini fails. `hybridRetrieve`
  and `hybridRetrieveSingleDocument` now return `{ chunks,
  rerankerUsed }` instead of a bare array, threaded through to
  `/api/ask`'s JSON response. `AskPanel.tsx` shows "Trying your
  cross-encoder reranker…" while waiting, switches its own wording to
  "switching to the Gemini reranker…" at the same 2.5s mark the server
  uses, and shows a small badge on the answer saying which reranker
  actually produced it. Worth being precise about what this is: a
  client-side timer that mirrors the server's known timeout value, not
  a live progress stream — there's no real-time channel telling the
  browser the exact moment the server gives up; building that for real
  would need Server-Sent Events, which this isn't.

  `CROSS_ENCODER_URL` is unset on this deployment, so this is pure
  groundwork right now — every request still falls straight through
  to Gemini, identical to before this change, until a real trained
  model is deployed somewhere and the env var is set. Syntax-checked
  clean, pushed (`3010a90`).

- **2026-11-21 (implicit feedback logging + nightly export, for the
  cross-encoder's future fine-tuning loop)** — Requested: keep
  improving the cross-encoder over time from real usage. Clarified
  this is "feedback-driven fine-tuning," not literal RLHF (no reward
  model, no PPO — that's a different, heavier technique mostly used
  for training chat models). Chosen signal source: implicit, reusing
  the deterministic Verifier's grounded check rather than adding a
  thumbs up/down UI.

  `rerank_feedback` table added; `logRerankFeedback()` in
  `feedback.ts` logs a grounded answer's cited chunk(s) as positive
  (question, passage) pairs and up to 5 other retrieved-but-uncited
  chunks as negatives, called fire-and-forget from `/api/ask` so a
  logging failure never touches the actual answer. A not-grounded
  result logs nothing — no confirmed label either way.

  A Vercel Cron job (`vercel.json`, 18:30 UTC = midnight IST, per the
  user's "end of the day" request) hits
  `/api/cron/export-feedback` nightly, atomically claims every
  unexported row, and writes a dated JSONL snapshot to Vercel Blob —
  protected by `CRON_SECRET`, which still needs to be added to
  Vercel's env vars for the cron's auth header to match.

  **Scope boundary, stated plainly**: this only prepares the dataset.
  There's no GPU or training framework inside a Next.js serverless
  function — actual fine-tuning happens wherever the cross-encoder
  itself gets hosted (not yet built), which would need its own
  scheduled job to pull this snapshot and retrain. Until that part
  exists, this just accumulates nightly snapshots for a human to feed
  into the training script manually on Colab. Syntax-checked clean,
  pushed (`c85ba73`).

## 2026-11-24 — Dashboard redesign: sliding sidebar, center chat, Claude-style layout

Requested: rebuild the main page as a proper dashboard — chat in the
center (Claude-style conversation), documents on the right, and a
sliding sidebar that *pushes* the rest of the layout open/closed
instead of covering it, with nav items Home / Matrix / Documents /
Telegram Connect / Settings / Evaluations / Sign out.

**Sidebar (`Sidebar.tsx`, rewritten `AppShell.tsx`)** — on desktop
(lg+) the sidebar sits in normal flex flow: closing it collapses its
own width to zero and the content beside it widens to fill the row,
so nothing the user was looking at ever disappears or gets covered.
Below that width there's no room to push three columns (sidebar +
chat + documents) without squeezing the chat into uselessness, so the
sidebar becomes a fixed drawer with a dimming backdrop on phones
instead — the one deliberate departure from "push," and only because
it genuinely doesn't fit. Sign out moved from the old top header into
the sidebar footer, next to the account email, per the requested nav
list.

**Chat (`ChatPanel.tsx`, replaces `AskPanel.tsx`)** — the old
single-question/single-answer panel is now a real multi-turn thread:
every question asked in a session stays visible above the next one
(Claude-style), with the input pinned to the bottom of the chat card
and the thread auto-scrolling to the newest turn. Each answer keeps
its own independent "Move to Matrix" button, reranker-used badge, and
citations — asking a question here still never adds it to the Matrix
on its own, same opt-in behavior as before, just per-turn now instead
of per-panel.

**Documents (`DocumentsPanel.tsx`, replaces the doc-list half of
`Workspace.tsx`)** — same upload/list/indexing logic as before
(upload, drag-drop, embed-step draining, retry/remove, expand to
preview extracted pages), now one component used two ways: `compact`
on the Home dashboard's right rail next to the chat, and full-size on
its own dedicated `/documents` page (new). Reports its document list
back up to the Home page via a callback so the chat panel's ready
count and citation filenames come from the same fetch instead of a
second one.

**New dedicated pages**: `/documents` (full document manager),
`/telegram` (the existing `TelegramConnect` QR-linking card, now its
own page instead of living inside Home), `/settings` (new — account
email, member-since date, document count, Telegram-connected status,
and sign out; reads `users.created_at` directly since nothing else in
the app needed it before now).

`/workspace` kept as the actual URL for "Home" — only the sidebar
label changed — so the existing login/signup redirect-after-auth
logic (`next=/workspace`) didn't need touching.

Syntax-checked clean across every new/changed file, committed, pushed.

## 2026-11-24 — Header profile cluster: username, avatar, light/dark theme

Requested: in the header's top-right corner, show the user's username
(falling back to their email if none is set), a minimalistic sun/moon
theme switch, and a profile picture (a real Gmail picture if available,
otherwise initials like "YN"); in Settings, add fields to set a
username, a profile picture, and change password/confirm password.

**Honest scope note on "profile pic as Gmail"**: this app has no
Google sign-in — accounts are email + password only. There's no OAuth
flow here to pull a real Gmail photo from automatically, and standing
one up (Google Cloud OAuth credentials, a consent screen, a second
login path) is a materially bigger, separate feature. What's built
instead, and actually works today: upload any picture in Settings
(stored in Vercel Blob, same mechanism documents already use), shown
everywhere the avatar appears; with no picture uploaded, a colored
circle with initials (from the username, or the email if no username
is set) — this is the real, live default for every account right now,
not a placeholder. Happy to build real Google sign-in as a follow-up
if wanted.

**Light/dark theme** — `ink-*` (surfaces) and `neutral-*` (text) in
`tailwind.config.ts` now resolve to CSS variables (`globals.css`)
instead of fixed hex, so one `data-theme` attribute swap re-colors
every existing `bg-ink-*`/`border-ink-*`/`text-neutral-*` class across
the whole app — no component had to change its classes one by one.
Light isn't an auto-invert filter; it's a deliberate second palette in
the same cool blue-gray hue, with each neutral text step re-paired to
whichever step gives it the same relative contrast against a light
background that it had against the dark one. One color was
deliberately left out of this system: button text sitting on the
saffron accent (`text-onaccent`, new, pinned near-black in both
themes) — the accent itself doesn't change with theme, so its text
shouldn't either; this used to double up with the page-background
color (`ink-950`), which would have gone invisible on light-mode
accent buttons once that shade started changing with theme.
`ThemeToggle.tsx` just flips `data-theme` + a localStorage key; an
inline script in `layout.tsx` applies the stored choice before first
paint so there's no flash back to dark on reload.

**Username & avatar** — `users` gained nullable `username` and
`avatar_url` columns (no uniqueness constraint — it's a display label
here, never used for login or lookup). `/api/account` (PATCH) sets the
username; `/api/account/avatar` (POST/DELETE) uploads or clears the
picture. `AppShell.tsx`'s header now shows the avatar + username (or
email) linking to Settings; `Sidebar.tsx`'s footer shows the same
instead of a bare email string, for consistency.

**Settings page** — new Profile card (avatar upload/remove, username
field) and Password card (current/new/confirm, server verifies the
current password via bcrypt before accepting a new one) added above
the existing account-info and sign-out cards.

Syntax-checked clean, committed, pushed.

## 2026-11-24 — Avatar initials, light-theme contrast fix, smoother upload reveal

**Avatar**: initials now show just the first letter (e.g. "M"), not
first+last — matches what was actually asked; the two-letter version
was my own assumption from the earlier "like YN" example.

**Light theme contrast bug, fixed**: the light palette shipped
earlier was built by mechanically mirroring the dark-mode ramp
(swapping neutral-50↔900's position, etc.), and that mirroring broke
down for the dimmer steps — `neutral-600`/`neutral-700` and the
`ink-700` border landed only a few RGB points off pure white, which
is effectively invisible on a light background even though the same
numeric "distance" looked fine against a near-black one. Replaced
with values picked directly for legibility against white rather than
reflected from the dark values. Also themed `saffron-400`/
`matrix-400`/`red-400` specifically (darker, more saturated versions
of the same hue in light mode) — these are the shades used for status
text like the "ready" badge and error messages, and the bright pastel
versions made for a dark background were genuinely hard to read on
white. `saffron-500/600` and `matrix-500/600` (solid buttons, icons)
stay fixed in both themes — those were never the problem.

**Document upload animation**: `DocumentsPanel.tsx`'s upload loop
used to call `refresh()` once after every file in a batch had
finished uploading, so several documents visually appeared all at
once after a short pause at the end — correct sequencing (uploads
stay one-at-a-time, see the comment in `/api/documents/route.ts`
for why), but a clunky reveal. Now it refreshes (and kicks off
indexing) after *each* file instead of once at the end, so documents
land one by one as they actually finish, and each new row fades/
slides in (`animate-fade-in-up`, a new Tailwind keyframe) instead of
popping in — keyed by document id, so only genuinely new rows play
the animation, not the whole list re-rendering on every refresh.

Syntax-checked clean, committed, pushed.

## 2026-11-24 — Cross-encoder training pipeline scaffolded (cross-encoder/)

Built everything from methodology.md §4.2's "next up" cross-encoder
item — the full pipeline from raw data to a deployable model, as a
runbook (`cross-encoder/README.md`) rather than something that runs on
its own, because the two steps that actually matter (fine-tuning on a
GPU, hosting the result) need your own Google/Hugging Face accounts;
nothing in this sandbox can do those for you.

- `generate_synthetic_data.py` — pulls ready document chunks straight
  from Postgres, asks Gemini to write one question each chunk actually
  answers, and pairs it with that chunk (positive) plus a wrong chunk
  from a different document and, when available, a harder same-
  document decoy (negatives) — all written in the same `{question,
  passage, label}` shape the real feedback export already uses, so the
  two can be concatenated directly.
- `download_feedback.mjs` — lists and downloads every nightly
  `rerank_feedback` export out of Vercel Blob (the real-usage half of
  the dataset, which will be thin until the app's had real traffic).
- `combine_and_split.py` — merges both (real feedback wins over a
  synthetic row making the same claim), dedupes, and splits into
  `train.jsonl`/`val.jsonl`.
- `train.ipynb` — a Colab notebook that fine-tunes
  `cross-encoder/ms-marco-MiniLM-L-6-v2` (a small, pretrained cross-
  encoder, ~22M params) on that data and pushes the result to the
  Hugging Face Hub. Documented honestly as *fine-tuning*, not training
  from scratch — a from-scratch model needs far more data/compute than
  a free Colab GPU session gives you, and this is the real, standard
  way a project this size gets "its own" model.
- `serve/` — a FastAPI app implementing `rerankWithCrossEncoder()`'s
  exact contract (`POST / {question, passages} -> {rankedIndexes}`),
  with a `Dockerfile` and HF-Spaces-ready `README.md` (front-matter and
  all) to deploy it as a free Hugging Face Space.

Once a Space is live, setting `CROSS_ENCODER_URL` in Vercel is the only
change needed in the deployed app — `rerankWithFallback()` was already
built to try it and fall back to Gemini, and nothing about that logic
needed to change for this.

methodology.md §4.2 updated to point at this; nothing here touches the
deployed Next.js app itself, so no redeploy needed from this commit —
only from setting `CROSS_ENCODER_URL` once a model exists.

## 2026-11-24 — Cross-checked the cross-encoder setup, fixed 3 bugs, added public training data

Asked to verify the cross-encoder scaffolding and find public data to
train on. **Limit up front:** this sandbox has no PyPI and cannot reach
Hugging Face or GitHub raw files, so torch / sentence-transformers code
could not be executed here. What I could do was syntax-check everything,
unit-test the pure-Python logic, and test the dataset converters against
small fake files shaped like the documented formats. The notebook and the
Space have never been run end to end.

**Bugs I found in my own earlier work (all fixed):**
1. *Serving would have rejected real traffic.* `serve/app.py` capped
   requests at 50 passages, but the app's candidate pool after fusion can
   be ~120. That would have been an HTTP 422 on essentially every
   request, which the app treats as "cross-encoder down", so it would
   have fallen back to Gemini forever while looking deployed. Now it
   accepts up to 300, scores only the first `MAX_RERANK` (40, RRF order)
   and appends the unscored tail (`serve/ranking.py`, unit-tested). Also
   `MAX_LENGTH` 256 (was the model default) and responses report
   `scored`/`ms`. Latency on a free CPU Space is still unmeasured.
2. *Dockerfile ran as root.* Hugging Face runs Spaces as uid 1000, so the
   model baked in at build time would not have been readable at runtime.
   Rewritten to the pattern in HF's Docker docs (user 1000, `--chown`).
3. *Validation leakage in `combine_and_split.py`.* It shuffled rows, but
   each question has several rows (1 positive + negatives), so the same
   question could land in both train and val and inflate validation
   scores. Now splits by question.
Plus: the notebook used `model.save_to_hub`, which I couldn't confirm
exists in the pinned library; replaced with `huggingface_hub.upload_folder`.
It also kept the last-epoch weights instead of the saved best checkpoint;
it now reloads from disk before evaluating/uploading, and uses
`max_length=256` to match the server.

**Added:**
- `build_public_dataset.py` — FinQA (CC BY 4.0, default) and TAT-QA
  (CC BY 4.0, opt-in) → `{question, passage, label}` with ≤900-char
  chunks, hard (same-report) + easy negatives. FinQA's test split goes to
  `public_test.jsonl` and is never trained on. It self-checks its reading
  of FinQA's evidence indexes and warns if they don't match.
  **Tested only on fake fixtures, not on the real downloads.**
- `combine_and_split.py --public --public-ratio` (public rows go to train
  only, capped at 3x own rows; val stays 100% own data).
- Notebook: Recall@1 / MRR on `val` and `public_test`, before vs after.
- `DATASETS.md`: what was considered and why. Excluded: IndFin-Bench
  (training prohibited, no evidence passages); FinDER (non-commercial,
  by request); FiQA and `mteb/FinQARetrieval` are test-only. The
  financial-qa-10K licence was not readable to me, so it is opt-in.
- Honest gap: all usable public data is US filings, nothing Indian.

No change to the deployed Next.js app; no redeploy needed.

## 2026-11-24 — Free-tier hosting: Gradio/ZeroGPU variant

Hugging Face's free tier offers only ZeroGPU for Gradio Spaces (CPU Basic
and Docker need PRO). `cross-encoder/serve-gradio/app.py` now: keeps a
dummy `@spaces.GPU` function (ZeroGPU won't start without one), pins the
model to CPU, and exposes Gradio's `api_name="rerank"`.
`src/lib/crossEncoder.ts` gained a `CROSS_ENCODER_MODE=gradio` path that
speaks Gradio's two-step HTTP call protocol (4s budget). Neither side was
run against a live Space — written from the documented protocol. The
earlier FastAPI-mount idea was dropped as unsupported on ZeroGPU. Unknowns:
ZeroGPU CPU speed and whether the dummy-decorator trick passes its startup
check; the Space logs will say.

- Space build failed (ResolutionImpossible on huggingface-hub): my
  `sentence-transformers>=3.3,<4` pin capped huggingface-hub below what the
  Space's Gradio 6.32 needs. Pin removed from serve-gradio/requirements.txt.
  Newer sentence-transformers may behave slightly differently (e.g. applies a
  sigmoid to scores) — ranking order is unaffected. Untested on a live Space.

## 2026-11-24 — Hand-made Indian-style documents and Q&A (cross-encoder/sample-data/)

Five fictional PDFs (₹ crore, Ind AS 109, SEBI LODR/ICDR, a credit-rating
rationale, a QIP term sheet) with 46 questions + 2 cross-document questions
and answers, each answer tied to an exact quoted evidence sentence. I
checked every evidence string against both the text and the rendered PDF,
and re-derived the arithmetic (sums, margins, growth rates). One deliberate
discrepancy (Kaveri revenue ₹1,284.6 vs ₹1,248.6 crore) and one negative
control are included for the contradiction feature. `qa_to_training.py`
converts these into training rows (189 rows from the 48 questions); the
notebook now also reports Recall@1/MRR on `handmade_test.jsonl`.
Everything is fictional; ~190 rows is a test set, not enough to move the
model by itself. `HOW_TO_TRAIN_MORE.md` lists six ways to add data.
The 10 earlier evaluation PDFs and their questions are copied to
`sample-data/existing-10/` (questions only; they have no evidence spans).

- Space went down after switching to the v2 model: the Space had a `MODEL_PATH`
  variable with an EMPTY value, and `os.environ.get("MODEL_PATH", default)`
  returns "" (not the default) when the variable exists but is empty, so
  CrossEncoder("") loaded nothing and every request raised. App fell back to
  Gemini meanwhile. Fixed with `os.environ.get(...) or default`; default now
  points at the -v2 model.
