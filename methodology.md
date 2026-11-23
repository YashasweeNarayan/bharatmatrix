# BharatMatrix — Methodology & Scope

Live at: https://bharatmatrix.vercel.app/
Repo: github.com/YashasweeNarayan/bharatmatrix

This file is the architectural reference for the project — what it does,
end to end, and what's actually in scope to build next. For a dated,
narrative log of every fix and why it was needed, see `PROGRESS.md`
instead; this file is the standing picture, not the history.

---

## 1. What this project is

BharatMatrix is a Hebbia-inspired AI document intelligence platform: upload
documents, ask questions answered only from what's actually in them (with
the exact source passage cited), and track those answers across many
documents at once in a spreadsheet-like "Matrix" grid. Built for an M.Tech
final-year project, deployed in production on Vercel with real multi-user
accounts.

---

## 2. End-to-end flow

### 2.1 Document ingestion
1. User uploads a file (PDF / DOCX / XLSX) through the Workspace page.
2. File is stored in Vercel Blob; a `documents` row is created
   (`status = 'processing'`).
3. `indexDocument()` (`lib/indexDocument.ts`) runs: extract text per page
   → chunk it → insert `document_pages` + `document_chunks` rows →
   embed each chunk (Gemini embeddings, `EMBEDDING_MODEL`) → mark
   `status = 'ready'` once every chunk has a vector (or `'failed'` with a
   stored error message if extraction itself never completed).
4. A chunk's embedding is retried independently of extraction — a
   document that failed mid-embedding resumes from where it left off; one
   that failed mid-extraction (zero chunks ever created) is fully
   re-run from the stored blob, not silently marked ready with nothing
   indexed.

### 2.2 Retrieval — hybrid dense + keyword + rerank
Used by Ask, Evaluation, Matrix, and the Telegram bot alike
(`lib/retrieve.ts`):

1. **Dense search** — pgvector cosine similarity over `document_chunks.embedding`,
   accelerated by an HNSW ANN index (same algorithm family Pinecone/Weaviate/
   Qdrant use by default).
2. **Keyword search** — Postgres full-text search over a generated
   `content_tsv` column (GIN-indexed), queried with
   `websearch_to_tsquery` / `ts_rank_cd`. Honest caveat: this is a
   TF-based rank, not literally the BM25 formula (no document-length
   normalization term, different IDF weighting) — it plays BM25's role
   (catching exact terms/figures embeddings miss) without being a
   drop-in BM25 engine.
3. **Fusion** — the two ranked lists are merged by Reciprocal Rank Fusion
   (RRF, k=60), combining by each list's *rank* rather than raw score,
   since cosine distance and `ts_rank_cd` aren't on comparable scales.
4. **Reranking** — the fused candidate pool is reranked by
   `rerankWithFallback()`:
   - Tries a self-hosted cross-encoder first (`CROSS_ENCODER_URL`, 2.5s
     timeout) — **not yet deployed**, so this path is currently always
     skipped.
   - Falls back to an LLM-based reranker (the existing Gemini chat model
     scoring question-vs-passage relevance) — this is the active path
     today. Honest caveat: this stands in for a real small cross-encoder
     model; it's heavier per call and shares Gemini's request quota.
   - Falls back once more to the plain RRF order if even that fails.
5. Two retrieval variants share this pipeline: `hybridRetrieve` (across
   every ready document a user owns — used by Ask/Eval/Telegram, with
   per-document windowing so one dominant document can't crowd out the
   candidate pool) and `hybridRetrieveSingleDocument` (scoped to one
   document — used by Matrix cells).

### 2.3 Grounded question answering
1. **Analyst** (`answerFromContext`) — Gemini answers the question from
   the retrieved chunks, with structured output (schema-validated answer
   + citations).
2. **Verifier** (`lib/verify.ts`) — deterministically re-checks every
   claimed citation's quote against the literal source chunk text before
   marking an answer "grounded." A citation the model claims but that
   doesn't actually appear in the source text is rejected, not trusted.
3. **Implicit feedback logging** — a grounded answer's cited chunk(s)
   become positive (question, passage) training examples; a few
   retrieved-but-uncited chunks become negatives; a not-grounded answer
   logs nothing (no confirmed label either way). Stored in
   `rerank_feedback`, exported nightly (see §2.7).

### 2.4 Matrix
A question × document grid. Each cell is computed independently
(`lib/matrix.ts`, `computeCell`) using the single-document hybrid
retrieval variant, then the same Analyst → Verifier flow as Ask. Adding a
question from the Ask panel to the Matrix is an explicit, opt-in action
("Move to Matrix" button) — the two features are otherwise fully
decoupled.

### 2.5 Evaluation
A growable ground-truth set (`eval_questions`: question + human-authored
expected answer, addable/removable from the Evaluation page — not locked
to a fixed hardcoded set anymore). Running eval re-answers each question
through the same Ask pipeline, then a separate LLM-judge call
(`judgeAnswer`) grades the answer against the expected one
(correct/partial/incorrect), stored in `eval_results`.

### 2.6 Multi-tenancy & auth
Session-based auth (`lib/auth.ts`): bcrypt-hashed passwords, random
32-byte session tokens stored server-side (`sessions` table), delivered
via an httpOnly/secure/sameSite cookie. Every owned entity
(`documents`, `questions`, `eval_questions`) carries `user_id`; child
tables are scoped by joining back to the owning row. Generic
"incorrect email or password" on login failure (no account enumeration).

### 2.7 Telegram bot
- QR-linked account access (`TelegramConnect.tsx` + `/api/telegram/link-code`):
  a short-lived, single-use code is minted by an authenticated web
  request and rendered as a QR code encoding a `t.me/<bot>?start=<code>`
  deep link. Scanning it opens Telegram directly into the bot's chat
  with the linking command pre-filled.
- `telegram_links` (chat_id → user_id) is upserted on every `/start`, so
  a fresh code each time the card is opened always resolves to the same
  account for that logged-in user.
- The webhook (`/api/telegram/webhook`) verifies a shared secret Telegram
  echoes back, then runs the exact same hybrid-retrieval + Analyst/
  Verifier pipeline as the web Ask panel, scoped to the asking user's own
  documents.
- **Status: code complete, not yet operational** — needs a bot actually
  created via @BotFather, three env vars set in Vercel
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`),
  and a one-time `setWebhook` call. This is the current in-progress item.

### 2.8 Feedback export (groundwork for cross-encoder fine-tuning)
A Vercel Cron job (`vercel.json`, 18:30 UTC = midnight IST) hits
`/api/cron/export-feedback` nightly: atomically claims every unexported
`rerank_feedback` row and writes it as a dated JSONL snapshot to Vercel
Blob. This only *prepares* the dataset — no training happens inside this
Next.js app (no GPU, no training framework in a serverless function).

---

### 2.9 Dashboard layout
A persistent sliding sidebar (`Sidebar.tsx` + `AppShell.tsx`) wraps every
page: Home, Matrix, Documents, Telegram Connect, Settings, Evaluations, and
Sign out. On desktop it pushes the page's content open/closed (normal flex
flow — closing it collapses to zero width and the content beside it
widens into the space, nothing is ever covered); on phone widths it
becomes a fixed drawer with a backdrop instead, since three columns
(sidebar + chat + documents) don't fit side by side that narrow.

The Home page (`/workspace`, label "Home" in the sidebar) is a two-column
dashboard: a Claude-style multi-turn chat thread (`ChatPanel.tsx`) in the
center, and a compact document list/uploader (`DocumentsPanel.tsx`) on the
right — the same component renders full-size on its own `/documents` page.
Telegram's QR-linking card and the account Settings page are each their
own dedicated route now rather than living inside Home.

---

## 3. Tech stack

Next.js 14 (App Router, TypeScript) · PostgreSQL + pgvector (HNSW index) ·
Google Gemini (embeddings + generation, structured output) · Vercel
(serverless functions, Blob storage, Cron) · Telegram Bot API ·
Tailwind CSS.

---

## 4. Scope — what's actually being built, in order

### 4.1 In progress right now
- **Telegram bot activation** — code is done; waiting on the user to
  create the bot via @BotFather and set the three env vars +
  `setWebhook` call. Nothing left to build; this is operational setup.

### 4.2 Next up (explicitly agreed, not started)
- **Train and deploy a real tiny cross-encoder reranker** to replace the
  Gemini-as-reranker fallback as the *primary* path (Gemini stays as the
  fallback when the cross-encoder is slow/unavailable — this fallback
  machinery is already built and live, just unused since
  `CROSS_ENCODER_URL` is unset):
  1. Generate training data from the project's own chunked documents
     (synthetic positive/negative question-passage pairs).
  2. Fine-tune a small pretrained model (e.g. TinyBERT/MiniLM family,
     ~15-30M params) using `sentence-transformers`' `CrossEncoder`
     trainer — runs on Google Colab's free GPU tier.
  3. Wrap it in a small FastAPI service, deploy it (HF Spaces / Render /
     Railway free tier — accepting the cold-start-on-idle trade-off, or
     a small paid always-on tier if demo reliability matters more).
  4. Point `CROSS_ENCODER_URL` at it.
- **Close the continuous fine-tuning loop**: once the cross-encoder is
  hosted, give *that* service its own scheduled job to pull the nightly
  `rerank_feedback` export and retrain the checkpoint — the export side
  (§2.8) is already built and running; only the retrain-and-reload side
  on the model host is still missing.

### 4.3 Explicitly deferred / accepted trade-offs (not gaps)
- Literal BM25 (vs. Postgres's TF-based `ts_rank_cd`) — would need a
  Postgres extension (e.g. `pg_search`/ParadeDB) not supported on the
  managed Postgres provider this project uses.
- A hosted rerank API (Cohere/Jina) was considered and explicitly
  declined in favor of self-training a cross-encoder, for a stronger
  "built it myself" story in interviews/viva.
- No real accuracy benchmark number exists yet — the Evaluation harness
  is wired up and growable, but hasn't been run against a real
  ground-truth set long enough to quote a number.

---

## 5. Known operational risks worth remembering

- **Vercel's free-plan practical request ceiling (~10s)** has already
  been hit once (why Matrix computes exactly one cell per request). Each
  reranked request (dense + keyword search + rerank + Analyst +
  Verifier, and for Matrix, one cell at a time) is sequential network
  calls stacking up against that ceiling — worth watching, especially
  once the cross-encoder path adds its own attempt-then-fallback latency
  on top.
- The cross-encoder fallback's "waiting → switching" indicator in the
  Ask UI is a client-side timer mirroring the server's known timeout
  value, not a live server-pushed status (no streaming connection
  exists for that yet).
