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
    })();
  }
  return schemaReady;
}
