import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Runs nightly at midnight UTC (see the "crons" entry in vercel.json),
 * triggered by Vercel Cron. Packages every rerank_feedback row logged
 * since the last export into one JSONL snapshot in Blob storage, ready
 * for the cross-encoder's fine-tuning script to pick up.
 *
 * This endpoint only prepares the dataset — it does NOT run any
 * training itself. There's no GPU and no PyTorch here; this is a
 * Next.js serverless function. The actual fine-tuning happens wherever
 * the cross-encoder is hosted (not yet deployed as of this commit),
 * which would need its own scheduled job to fetch this file and
 * actually retrain. Until that piece exists, this just accumulates
 * dated snapshots for a human to run the training script against
 * manually on Colab.
 */
export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await ensureSchema();

  // UPDATE ... RETURNING in one statement, rather than a SELECT followed
  // by a separate UPDATE, so a row logged by a question answered mid-export
  // can never slip through unmarked but also unexported (or the reverse).
  const rows = await sql`
    update rerank_feedback
    set used_in_training = true
    where used_in_training = false
    returning question, passage, label
  `;

  if (rows.length === 0) {
    return NextResponse.json({ exported: 0 });
  }

  const jsonl = rows
    .map((r) => JSON.stringify({ question: r.question, passage: r.passage, label: r.label }))
    .join("\n");

  const dateStamp = new Date().toISOString().slice(0, 10);
  const blob = await put(
    `cross-encoder-training/feedback-${dateStamp}-${Date.now()}.jsonl`,
    jsonl,
    { access: "public", contentType: "application/jsonl" },
  );

  return NextResponse.json({ exported: rows.length, blobUrl: blob.url });
}
