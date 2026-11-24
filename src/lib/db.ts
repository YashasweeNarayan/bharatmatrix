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

      // Optional display name and a picture to show in the header/sidebar.
      // No uniqueness constraint on username — it's a display label here,
      // never used for lookup or login, so two people sharing one isn't a
      // conflict worth handling. avatar_url points at a Vercel Blob object
      // uploaded from Settings; there's no Google sign-in in this app, so
      // this is always a picture the user chose to upload, never pulled
      // automatically from a Gmail account.
      await sql`alter table users add column if not exists username text`;
      await sql`alter table users add column if not exists avatar_url text`;

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

      // Training data for the cross-encoder's feedback loop. This is
      // WEAK/IMPLICIT supervision, not explicit human labels: it reuses
      // the deterministic Verifier's grounded check (lib/verify.ts)
      // instead of asking users to rate answers. When a question comes
      // back grounded, the chunk(s) the Verifier actually confirmed
      // the quote came from are logged as positive (question, passage)
      // pairs, and the other chunks that were retrieved but NOT cited
      // are logged as negatives — free hard negatives, since they were
      // plausible enough to make the candidate pool but didn't end up
      // answering the question. A not-grounded result logs nothing: no
      // confirmed signal either way, so no label is honest to assign.
      await sql`
        create table if not exists rerank_feedback (
          id uuid primary key default gen_random_uuid(),
          user_id uuid references users(id) on delete set null,
          document_id uuid,
          question text not null,
          passage text not null,
          label smallint not null, -- 1 = relevant, 0 = not relevant
          used_in_training boolean not null default false,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists rerank_feedback_export_idx
        on rerank_feedback (used_in_training, created_at)
      `;

      // ---- Admin accounts, login hardening, chat history, file vault -----

      // role is 'user' or 'admin'. Admin status is never self-service: an
      // account only becomes admin through Google sign-in with a verified
      // email listed in ADMIN_EMAILS, or through the setup-key page (see
      // /api/admin/setup). Even then, a request is only treated as admin if
      // the SESSION was created through an admin login (sessions.is_admin)
      // AND the email is still listed in ADMIN_EMAILS — removing an email
      // from that env var revokes admin access immediately.
      await sql`alter table users alter column password_hash drop not null`;
      await sql`alter table users add column if not exists role text not null default 'user'`;
      await sql`alter table users add column if not exists last_login_at timestamptz`;
      await sql`alter table sessions add column if not exists is_admin boolean not null default false`;
      // 'password' or 'google'. A recent Google sign-in is what lets someone
      // who forgot their password set a new one without the old one.
      await sql`alter table sessions add column if not exists auth_method text not null default 'password'`;

      // Failed-login / signup counters for rate limiting. In the database
      // (not memory) because serverless instances don't share memory.
      await sql`
        create table if not exists auth_attempts (
          id bigserial primary key,
          bucket text not null,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists auth_attempts_bucket_idx
        on auth_attempts (bucket, created_at)
      `;

      // Saved chats, so "History (Personal)" works and admins can review
      // what users asked. Chats before this table existed were never stored.
      await sql`
        create table if not exists chat_conversations (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users(id) on delete cascade,
          title text not null,
          channel text not null default 'web',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists chat_conversations_user_idx
        on chat_conversations (user_id, updated_at desc)
      `;
      await sql`
        create table if not exists chat_turns (
          id uuid primary key default gen_random_uuid(),
          conversation_id uuid not null references chat_conversations(id) on delete cascade,
          user_id uuid not null references users(id) on delete cascade,
          question text not null,
          answer text not null,
          grounded boolean not null default false,
          citations jsonb not null default '[]'::jsonb,
          reranker text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists chat_turns_conversation_idx
        on chat_turns (conversation_id, created_at)
      `;

      // Two-admin rule for the "User files" section: each admin records an
      // approval here; files open only while enough admins hold an
      // unexpired approval (see lib/vaultLogic.ts).
      await sql`
        create table if not exists admin_vault_approvals (
          admin_id uuid primary key references users(id) on delete cascade,
          approved_at timestamptz not null default now()
        )
      `;

      // Who did what. admin_email is copied in so the trail survives an
      // admin account being deleted.
      await sql`
        create table if not exists admin_audit (
          id bigserial primary key,
          admin_id uuid references users(id) on delete set null,
          admin_email text not null,
          action text not null,
          target text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create index if not exists admin_audit_created_idx
        on admin_audit (created_at desc)
      `;
    })();
  }
  return schemaReady;
}
