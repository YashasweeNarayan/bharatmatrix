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
- [ ] Split "find the answer" (Analyst) from "check it against source text" (Verifier)
- [ ] Reject/flag ungrounded answers before they reach the UI

### Step 6: Contradiction detection
- [ ] Cross-document claim comparison
- [ ] Side-by-side conflict UI
- [ ] Evaluate against ContractNLI labeled data

### Step 7: Reports
- [ ] Floating report panel (sticky header + download, summary → table → citations)
- [ ] PDF export

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
