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
- [ ] **Action needed:** add a `GEMINI_API_KEY` env var in Vercel (free key
      at aistudio.google.com/apikey) — see `.env.example`. Until that's set,
      uploads will fail at the embedding step (extraction still works, but
      the doc will show "failed").
- [ ] Not yet tested against real documents — waiting on the API key

### Step 4: Matrix grid UI
- [ ] Spreadsheet grid: rows = documents, columns = questions
- [ ] Click-a-cell → source/evidence side panel

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
