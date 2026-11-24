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

### 2.9 Account: profile, avatar, theme
`users.username` and `users.avatar_url` are optional — a username
displays instead of the account's email wherever a name is shown (header,
sidebar footer), and an avatar replaces the initials-circle default once
uploaded. **There is no Google sign-in in this app**, so a profile picture
is always one the user uploaded (Vercel Blob) — nothing here pulls a photo
from Gmail automatically. Light/dark theme is a single `data-theme`
attribute on `<html>`, toggled by `ThemeToggle.tsx` and persisted to
localStorage; every surface/text color used by the authenticated app
(`ink-*`, `neutral-*` in `tailwind.config.ts`) is a CSS variable swapped
by that attribute, so no component needed theme-specific classes added.

### 2.10 Dashboard layout
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

### 4.2 Cross-encoder reranker: LIVE (v2), with honest limits
**Status (2026-11-25):** a fine-tuned cross-encoder (`yashaswee22/bharatmatrix-cross-encoder-v2`,
fine-tuned from `cross-encoder/ms-marco-MiniLM-L-6-v2`, epoch-1 checkpoint) is served from a
free Hugging Face Gradio/ZeroGPU Space (CPU inference, `serve-gradio/`) and used as the
primary reranker via `CROSS_ENCODER_URL` + `CROSS_ENCODER_MODE=gradio`; Gemini remains the
fallback when the Space is asleep or slow. Observed rerank time in the app: ~200 ms for
37 passages.

**Measured quality (Recall@1 / MRR, base -> v2):**
- Held-out public test, 500 questions (FinQA test split): 0.860 / 0.926 -> 0.888 / 0.943.
  A small gain; no significance test was run.
- Hand-made Indian-style test, 48 questions (fictional documents): 0.896 / 0.944 ->
  0.875 / 0.934. Within noise (one question). No evidence of improvement on Indian-style text.
- Own-data validation: only 10 questions (30 pairs); both models scored 1.000. Not informative.

**Main limitation:** training data was mostly public US-filing data (FinQA, TAT-QA) plus a
small amount of synthetic data from the app's own documents (1,103 training pairs in total).
Next real gain: upload more Indian-style PDFs, generate far more synthetic pairs, add real
usage feedback, retrain (see `cross-encoder/HOW_TO_TRAIN_MORE.md`).

**Operational caveats:** free Spaces sleep when idle (first request falls back to Gemini);
a Space variable `MODEL_PATH` that exists but is empty used to break loading (fixed in code).

**Original scaffolding notes (still accurate for reruns):**
- **Train and deploy a real tiny cross-encoder reranker** to replace the
  Gemini-as-reranker fallback as the *primary* path (Gemini stays as the
  fallback when the cross-encoder is slow/unavailable — this fallback
  machinery is already built and live, just unused since
  `CROSS_ENCODER_URL` is unset). Every script, the training notebook, and
  the serving app now exist in `cross-encoder/` — see
  `cross-encoder/README.md` for the full runbook — but the actual runs
  need your own Google account (Colab's GPU) and Hugging Face account
  (hosting the model/Space), so this step is a set of instructions for
  you to follow rather than something run automatically:
  1. `cross-encoder/generate_synthetic_data.py` — Gemini-generated
     question/passage pairs from the app's own ready document chunks
     (the bootstrapping half of the dataset, since real usage hasn't
     produced much `rerank_feedback` yet).
  2. `cross-encoder/download_feedback.mjs` — pulls every nightly
     `rerank_feedback` export (§2.8) out of Blob (the real-usage half).
  3. `cross-encoder/combine_and_split.py` — merges both into
     deduplicated `train.jsonl`/`val.jsonl`, split by question (no
     question on both sides). Optionally mixes in public finance-QA data
     (training side only, capped at 3x own rows; validation is always
     the project's own data) built by `cross-encoder/build_public_dataset.py`
     from FinQA (CC BY 4.0) and optionally TAT-QA (CC BY 4.0). Sources
     considered/excluded and their licences: `cross-encoder/DATASETS.md`.
     All usable public data is US filings — it teaches the task, not
     Indian-report vocabulary; that comes from the app's own documents.
  4. `cross-encoder/train.ipynb` (Colab, free GPU) — fine-tunes
     `cross-encoder/ms-marco-MiniLM-L-6-v2` (~22M params) on that data
     and pushes the result to the Hugging Face Hub. Honest framing:
     this fine-tunes a small pretrained checkpoint, not a model trained
     from random weights — the latter needs far more data/compute than
     a free GPU session gives you, and fine-tuning your own domain data
     into an existing small model is the real, standard way a project
     this size ends up with "its own" model. The notebook reports
     Recall@1/MRR before and after fine-tuning on the project's own
     validation set and on a held-out public test set, so "did it help"
     is a measured number, not an assumption.
  5. `cross-encoder/serve/` — a FastAPI app implementing
     `rerankWithCrossEncoder()`'s exact contract, ready to deploy as a
     Hugging Face Space (Docker SDK, free CPU tier). Scores only the first
     `MAX_RERANK` (40) of the app's ~120 candidates and caps tokens at
     256, to stay inside the app's 2.5s budget; real latency on the free
     tier has NOT been measured — responses carry `scored`/`ms` so it can
     be checked after deploy.
  6. Set `CROSS_ENCODER_URL` to the Space's URL in Vercel — nothing else
     in the app changes; `rerankWithFallback()` starts trying it
     immediately and falls back to Gemini exactly as it already does
     whenever the Space is cold/slow.
- **Close the continuous fine-tuning loop**: re-running the pipeline
  above periodically as more real `rerank_feedback` accumulates is the
  practical version of this for now; a fully automatic scheduled
  retrain-and-reload on the model host is a bigger, separate decision
  (needs its own always-on compute) not yet made.

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
