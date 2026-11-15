import postgres from "postgres";
import { EMBEDDING_DIMENSIONS } from "@/lib/gemini";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

if (!connectionString) {
  // Not throwing here: we want the app to boot and show a clear error on the
  // specific request that needs the database, rather than crashing the whole
  // server on import.
  console.warn(
    "[db] No DATABASE_URL / POSTGRES_URL set. Document storage will fail " +
      "until a Postgres connection string is added in Vercel's env vars.",
  );
}

export const sql = postgres(connectionString, {
  ssl: connectionString ? "require" : undefined,
  max: 5,
});

let schemaReady: Promise<void> | null = null;

/** Idempotent — safe to call on every request. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`create extension if not exists pgcrypto`;
      await sql`create extension if not exists vector`;

      // Accounts. password_hash is a bcrypt hash — the real password is
      // never stored anywhere.
      await sql`
        create table if not exists users (
          id uuid primary key default gen_random_uuid(),
          email text not null unique,
          password_hash text not null,
          created_at timestamptz not null default now()
        )
      `;

      // A session is a random, unguessable token handed to the browser as
      // an httpOnly cookie. The cookie itself carries no information other
      // than the token — who it belongs to and whether it's still valid
      // lives here, server-side, so a session can be revoked (logout,
      // expiry) just by deleting or not finding its row.
      await sql`
        create table if not exists sessions (
          token text primary key,
          user_id uuid not null references users(id) on delete cascade,
          created_at timestamptz not null default now(),
          expires_at timestamptz not null
        )
      `;
      await sql`
        create index if not exists sessions_user_id_idx on sessions (user_id)
      `;

      await sql`
        create table if not exists documents (
          id uuid primary key default gen_random_uuid(),
          filename text not null,
          mime_type text not null,
          blob_url text not null,
          status text not null default 'processing',
          page_count int,
          error text,
          created_at timestamptz not null default now()
        )
      `;

      // Multi-tenancy: added after documents already existed in
      // production, so this is nullable rather than backfilled — any
      // pre-auth rows just become permanently invisible once every query
      // below filters by user_id (never deleted, just orphaned). See
      // PROGRESS.md for the note on why.
      await sql`
        alter table documents add column if not exists user_id uuid references users(id) on delete cascade
      `;
      await sql`
        create index if not exists documents_user_id_idx on documents (user_id)
      `;

      await sql`
        create table if not exists document_pages (
          id uuid primary key default gen_random_uuid(),
          document_id uuid not null references documents(id) on delete cascade,
          ordinal int not null,
          page_label text not null,
          content text not null
        )
      `;

      await sql`
        create index if not exists document_pages_document_id_idx
        on document_pages (document_id)
      `;

      await sql`
        create table if not exists document_chunks (
          id uuid primary key default gen_random_uuid(),
          document_id uuid not null references documents(id) on delete cascade,
          ordinal int not null,
          page_label text not null,
          content text not null,
          embedding vector(${sql.unsafe(String(EMBEDDING_DIMENSIONS))}) not null
        )
      `;

      await sql`
        create index if not exists document_chunks_document_id_idx
        on document_chunks (document_id)
      `;

      // Lexical/keyword half of hybrid retrieval. A generated column
      // (Postgres keeps it in sync automatically, no app-side writes
      // needed) holding the tsvector for full-text search, plus a GIN
      // index on it — this is what websearch_to_tsquery/ts_rank_cd in
      // retrieve.ts searches against. Worth being honest about what
      // this is NOT: Postgres's ts_rank_cd is a TF-based rank, not a
      // literal BM25 implementation (no document-length normalization
      // term, no IDF tuned the BM25 way) — it plays the same role in
      // this pipeline (exact keyword/term matching, which embeddings
      // are bad at — exact figures, tickers, defined terms, acronyms)
      // but isn't the same formula a real BM25 engine like
      // Elasticsearch would use. Added defensively in case this column
      // doesn't exist yet on an already-provisioned document_chunks
      // table (generated columns can't be added with a plain ALTER in
      // every Postgres version, so this is wrapped too).
      try {
        await sql`
          alter table document_chunks
          add column if not exists content_tsv tsvector
          generated always as (to_tsvector('english', content)) stored
        `;
        await sql`
          create index if not exists document_chunks_content_tsv_idx
          on document_chunks using gin (content_tsv)
        `;
      } catch (err) {
        console.warn(
          "[db] Couldn't add the full-text search column/index — " +
            "keyword search will fall back to a plain ILIKE scan:",
          err instanceof Error ? err.message : err,
        );
      }

      // An approximate-nearest-neighbor index on the embedding column
      // itself — without this, every similarity search (the `<=>`
      // cosine-distance queries in ask/route.ts, eval.ts, matrix.ts) is
      // an exact brute-force scan over every chunk with a non-null
      // embedding. That's fine and in fact exact (no recall loss) at
      // this project's scale (tens to low hundreds of chunks), but it's
      // the one piece of this pipeline that doesn't resemble how a real
      // production vector search is built, so it's worth having for
      // real rather than leaving unaddressed. HNSW (the modern default
      // over the older IVFFlat) needs pgvector >= 0.5.0; wrapped in a
      // try/catch so an older extension version on some Postgres host
      // degrades to the exact brute-force scan instead of breaking
      // every request that calls ensureSchema().
      try {
        await sql`
          create index if not exists document_chunks_embedding_hnsw_idx
          on document_chunks using hnsw (embedding vector_cosine_ops)
        `;
      } catch (err) {
        console.warn(
          "[db] Couldn't create the HNSW vector index (pgvector may be " +
            "older than 0.5.0 on this host) — similarity search will " +
            "still work, just as an exact scan instead of approximate:",
          err instanceof Error ? err.message : err,
        );
      }

      // Chunks are now inserted text-first with no embedding yet, and
      // embedded afterwards in small batches (see /api/documents/embed-step)
      // instead of inside the upload request — a single request trying to
      // embed every chunk of a 100+ page 10-K at once is what both timed
      // out and tripped Gemini's per-minute rate limit.
      await sql`
        alter table document_chunks alter column embedding drop not null
      `;
      await sql`
        create index if not exists document_chunks_unembedded_idx
        on document_chunks (document_id) where embedding is null
      `;

      // Step 4: the Matrix grid. A question is a column; a cell is one
      // document's answer to one question.
      await sql`
        create table if not exists questions (
          id uuid primary key default gen_random_uuid(),
          text text not null,
          ordinal int not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        alter table questions add column if not exists user_id uuid references users(id) on delete cascade
      `;
      await sql`
        create index if not exists questions_user_id_idx on questions (user_id)
      `;

      await sql`
        create table if not exists matrix_cells (
          id uuid primary key default gen_random_uuid(),
          document_id uuid not null references documents(id) on delete cascade,
          question_id uuid not null references questions(id) on delete cascade,
          status text not null default 'pending',
          answer text,
          grounded boolean,
          citations jsonb,
          error text,
          updated_at timestamptz not null default now(),
          unique (document_id, question_id)
        )
      `;

      await sql`
        create index if not exists matrix_cells_question_id_idx
        on matrix_cells (question_id)
      `;

      // Step 5: the deterministic Verifier can downgrade an answer the
      // Analyst claimed was grounded — this records why, for transparency.
      await sql`
        alter table matrix_cells add column if not exists verification_note text
      `;

      // Step 6: contradiction detection. One row per question — compares
      // that question's grounded answers across every ready document.
      await sql`
        create table if not exists question_contradictions (
          question_id uuid primary key references questions(id) on delete cascade,
          status text not null default 'pending',
          has_contradiction boolean,
          explanation text,
          error text,
          updated_at timestamptz not null default now()
        )
      `;

      // Step 8: evaluation harness. A fixed set of question/expected-answer
      // pairs (ground truth), run through the same ask pipeline the UI
      // uses (embed -> vector search across ready documents -> Analyst ->
      // Verifier), then judged against the expected answer by a separate
      // Gemini call. One row per question (not per run) — re-running
      // overwrites the previous result, same pattern as question_contradictions.
      await sql`
        create table if not exists eval_questions (
          id uuid primary key default gen_random_uuid(),
          question text not null,
          expected_answer text not null,
          ordinal int not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        alter table eval_questions add column if not exists user_id uuid references users(id) on delete cascade
      `;
      await sql`
        create index if not exists eval_questions_user_id_idx on eval_questions (user_id)
      `;

      await sql`
        create table if not exists eval_results (
          eval_question_id uuid primary key references eval_questions(id) on delete cascade,
          status text not null default 'pending',
          actual_answer text,
          grounded boolean,
          citations jsonb,
          verdict text,
          judge_explanation text,
          error text,
          updated_at timestamptz not null default now()
        )
      `;

      // Telegram bot. Two tables: a short-lived one-time code (minted by
      // the authenticated web app, where we know which user is asking)
      // that the bot exchanges for a permanent chat_id -> user_id link
      // the first time that Telegram chat sends /start <code>. The
      // webhook request itself carries no BharatMatrix session cookie —
      // Telegram has no concept of one — so this linking step is the
      // only way the bot ever finds out which user's documents a given
      // chat is allowed to search.
      await sql`
        create table if not exists telegram_link_codes (
          code text primary key,
          user_id uuid not null references users(id) on delete cascade,
          created_at timestamptz not null default now(),
          expires_at timestamptz not null
        )
      `;

      await sql`
        create table if not exists telegram_links (
          chat_id text primary key,
          user_id uuid not null references users(id) on delete cascade,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists telegram_links_user_id_idx
        on telegram_links (user_id)
      `;
    })();
  }
  return schemaReady;
}
