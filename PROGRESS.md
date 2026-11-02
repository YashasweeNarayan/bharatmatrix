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
- [ ] Connect repo to Vercel, confirm live deploy
- [ ] Set up Postgres (Neon or Supabase) + Vercel Blob storage, wire up env vars

### Step 2: Document ingestion (Reader agent)
- [ ] Upload UI (PDF/DOCX/XLSX, multi-file)
- [ ] Text + table + page-number extraction
- [ ] Test on 5 sample BSE/NSE annual reports

### Step 3: Search over documents
- [ ] Chunking + embeddings + vector search (pgvector)
- [ ] Basic question → answer over uploaded docs, with source reference

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
