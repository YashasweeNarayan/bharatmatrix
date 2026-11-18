import { sql } from "@/lib/db";
import { rerankChunks } from "@/lib/gemini";

export type RetrievedChunk = {
  documentId: string;
  filename: string;
  pageLabel: string;
  content: string;
};

type Row = {
  document_id: string;
  filename: string;
  page_label: string;
  content: string;
};

/**
 * Hebbia-style hybrid retrieval: dense (vector) search + keyword
 * (lexical) search, merged by Reciprocal Rank Fusion, then narrowed by
 * an LLM-based reranker second pass. Replaces the old single
 * dense-only, per-document-windowed query that lived directly in
 * /api/ask and lib/eval.ts.
 *
 * Why combine two search types instead of just one:
 * - Dense (embedding cosine similarity) is good at paraphrase and
 *   concept matches ("profitability" finding a passage about "net
 *   margin") but can miss exact tokens — a specific ticker, defined
 *   term, acronym, or an exact figure — because the embedding space
 *   compresses away precise lexical detail.
 * - Keyword search (Postgres full-text, via content_tsv) is the
 *   opposite: it nails exact term matches but has no idea that
 *   "profitability" and "net margin" are related at all.
 * Hebbia (and most production RAG systems) run both and fuse the
 * results for exactly this reason — each covers the other's blind
 * spot.
 *
 * Why fuse by RANK (RRF) rather than by raw score: cosine distance
 * and ts_rank_cd aren't on the same scale and were never designed to
 * be compared numerically against each other. RRF sidesteps that by
 * only using each list's ORDER, not its score values. Standard
 * formula, k=60 (the usual default from the original RRF paper):
 *   score(doc) = sum over lists containing doc of 1 / (k + rank_in_list)
 */
const RRF_K = 60;

// Keep this generous — much larger than the reranker's final keep
// count — so RRF has enough raw material from BOTH search types
// before the reranker (which is slower/costlier) narrows it down.
// Per-document windowing is kept from the old dense-only query so one
// dominant document still can't crowd out every candidate before
// fusion even happens.
const PER_DOC_LIMIT = 6;
const CANDIDATE_POOL_LIMIT = 60;

// Final context size handed to the Analyst after reranking. Smaller
// than the old flat TOTAL_LIMIT=40 on purpose: a reranked, relevance-
// ordered top 20 is a tighter, more useful context window than 40
// candidates ordered only by raw similarity.
const FINAL_CONTEXT_SIZE = 20;

function fuseRRF(lists: Row[][]): RetrievedChunk[] {
  const keyOf = (r: Row) => `${r.document_id}::${r.page_label}`;
  const fused = new Map<string, { chunk: RetrievedChunk; score: number }>();

  for (const rows of lists) {
    rows.forEach((r, i) => {
      const key = keyOf(r);
      const rrfContribution = 1 / (RRF_K + i + 1);
      const existing = fused.get(key);
      if (existing) {
        existing.score += rrfContribution;
      } else {
        fused.set(key, {
          chunk: {
            documentId: r.document_id,
            filename: r.filename,
            pageLabel: r.page_label,
            content: r.content,
          },
          score: rrfContribution,
        });
      }
    });
  }

  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .map((f) => f.chunk);
}

export async function hybridRetrieve(
  question: string,
  queryEmbedding: number[],
  userId: string,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = JSON.stringify(queryEmbedding);

  const [denseRows, keywordRows] = await Promise.all([
    sql`
      with ranked as (
        select dc.document_id, d.filename, dc.page_label, dc.content,
               dc.embedding <=> ${vectorLiteral}::vector as distance,
               row_number() over (
                 partition by dc.document_id
                 order by dc.embedding <=> ${vectorLiteral}::vector asc
               ) as rank_in_doc
        from document_chunks dc
        join documents d on d.id = dc.document_id
        where d.status = 'ready' and dc.embedding is not null and d.user_id = ${userId}
      )
      select document_id, filename, page_label, content
      from ranked
      where rank_in_doc <= ${PER_DOC_LIMIT}
      order by distance asc
      limit ${CANDIDATE_POOL_LIMIT}
    ` as Promise<Row[]>,
    // Lexical half. websearch_to_tsquery handles free-text question
    // input gracefully (stray punctuation, quotes) the way plain
    // to_tsquery doesn't. Falls back to no rows (never throws) if the
    // question has no indexable tokens at all (e.g. pure numbers that
    // the 'english' dictionary strips) — websearch_to_tsquery just
    // returns an empty tsquery in that case, which matches nothing,
    // which is the correct behavior, not an error.
    sql`
      with ranked as (
        select dc.document_id, d.filename, dc.page_label, dc.content,
               ts_rank_cd(dc.content_tsv, websearch_to_tsquery('english', ${question})) as rank,
               row_number() over (
                 partition by dc.document_id
                 order by ts_rank_cd(dc.content_tsv, websearch_to_tsquery('english', ${question})) desc
               ) as rank_in_doc
        from document_chunks dc
        join documents d on d.id = dc.document_id
        where d.status = 'ready'
          and d.user_id = ${userId}
          and dc.content_tsv @@ websearch_to_tsquery('english', ${question})
      )
      select document_id, filename, page_label, content
      from ranked
      where rank_in_doc <= ${PER_DOC_LIMIT}
      order by rank desc
      limit ${CANDIDATE_POOL_LIMIT}
    `.catch((err: unknown) => {
      // Defensive: if content_tsv doesn't exist yet on this database
      // (ensureSchema's ALTER failed, e.g. older Postgres), keyword
      // search degrades to contributing nothing rather than taking
      // dense search down with it.
      console.warn(
        "[retrieve] Keyword search failed (content_tsv column may be " +
          "missing) — continuing with dense results only:",
        err instanceof Error ? err.message : err,
      );
      return [] as Row[];
    }) as Promise<Row[]>,
  ]);

  const candidatePool = fuseRRF([denseRows, keywordRows]);

  if (candidatePool.length === 0) return [];

  try {
    return await rerankChunks(question, candidatePool, FINAL_CONTEXT_SIZE);
  } catch (err) {
    console.warn(
      "[retrieve] Reranker call failed — falling back to the RRF-fused " +
        "order without reranking:",
      err instanceof Error ? err.message : err,
    );
    return candidatePool.slice(0, FINAL_CONTEXT_SIZE);
  }
}

// Matrix cells are scoped to one document already, so there's no
// cross-document crowd-out problem to fix with per-document windowing —
// these limits are just "how many candidates to pull from a single
// document" before fusing and reranking.
const DOC_CANDIDATE_LIMIT = 15;
const DOC_FINAL_CONTEXT_SIZE = 6; // matches the old flat `limit 6`

/**
 * Same hybrid dense+keyword+RRF+rerank pipeline as hybridRetrieve, scoped
 * to a single document — used by matrix.ts's computeCell instead of its
 * old dense-only top-6 query.
 *
 * Worth knowing before calling this somewhere new: a Matrix run computes
 * one cell per (document, question) pair, and this adds one extra Gemini
 * rerank call PER CELL — so a 10-document x 10-question matrix now costs
 * 100 extra Gemini calls it didn't before, on top of the existing
 * embed + Analyst calls per cell. On the free tier's daily request cap,
 * that's a real cost, not just a latency one.
 */
export async function hybridRetrieveSingleDocument(
  question: string,
  queryEmbedding: number[],
  documentId: string,
  filename: string,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = JSON.stringify(queryEmbedding);

  type DocRow = { document_id: string; page_label: string; content: string };

  const [denseRows, keywordRows] = await Promise.all([
    sql`
      select document_id, page_label, content
      from document_chunks
      where document_id = ${documentId} and embedding is not null
      order by embedding <=> ${vectorLiteral}::vector asc
      limit ${DOC_CANDIDATE_LIMIT}
    ` as Promise<DocRow[]>,
    sql`
      select document_id, page_label, content
      from document_chunks
      where document_id = ${documentId}
        and content_tsv @@ websearch_to_tsquery('english', ${question})
      order by ts_rank_cd(content_tsv, websearch_to_tsquery('english', ${question})) desc
      limit ${DOC_CANDIDATE_LIMIT}
    `.catch((err: unknown) => {
      console.warn(
        "[retrieve] Single-document keyword search failed — continuing " +
          "with dense results only:",
        err instanceof Error ? err.message : err,
      );
      return [] as DocRow[];
    }) as Promise<DocRow[]>,
  ]);

  // document_chunks has no filename column — the plain queries above
  // don't join `documents`, so fill it in here rather than paying for a
  // join on every call.
  const withFilename = (rows: DocRow[]): Row[] =>
    rows.map((r) => ({ ...r, filename }));

  const candidatePool = fuseRRF([
    withFilename(denseRows),
    withFilename(keywordRows),
  ]);

  if (candidatePool.length === 0) return [];

  try {
    return await rerankChunks(question, candidatePool, DOC_FINAL_CONTEXT_SIZE);
  } catch (err) {
    console.warn(
      "[retrieve] Single-document reranker call failed — falling back " +
        "to the RRF-fused order without reranking:",
      err instanceof Error ? err.message : err,
    );
    return candidatePool.slice(0, DOC_FINAL_CONTEXT_SIZE);
  }
}
