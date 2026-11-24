#!/usr/bin/env node
/**
 * Pulls down every nightly rerank_feedback export the cron job
 * (/api/cron/export-feedback) has written to Vercel Blob under the
 * "cross-encoder-training/" prefix, and concatenates them into one
 * JSONL file — the real, human-usage half of the training set
 * (generate_synthetic_data.py in this folder is the bootstrapping half).
 *
 * Uses the same @vercel/blob package the Next.js app itself depends on
 * (declared in this folder's own package.json so this script can run
 * standalone, anywhere — not just inside the app's node_modules).
 *
 * Usage:
 *   cd cross-encoder
 *   npm install
 *   BLOB_READ_WRITE_TOKEN=... node download_feedback.mjs feedback.jsonl
 *
 * BLOB_READ_WRITE_TOKEN is the same token Vercel already injects into
 * the app's own environment (Project Settings -> Environment Variables,
 * or `vercel env pull` if you have the Vercel CLI set up locally).
 */
import { list } from "@vercel/blob";
import { writeFileSync } from "node:fs";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error(
    "Set BLOB_READ_WRITE_TOKEN first (copy it from the Vercel project's " +
      "environment variables — it's the same one the app's own cron job uses).",
  );
  process.exit(1);
}

const outPath = process.argv[2] || "feedback.jsonl";

async function main() {
  let cursor;
  let allBlobs = [];
  do {
    const page = await list({
      prefix: "cross-encoder-training/",
      cursor,
      token,
    });
    allBlobs = allBlobs.concat(page.blobs);
    cursor = page.cursor;
  } while (cursor);

  if (allBlobs.length === 0) {
    console.error(
      "No exports found yet under cross-encoder-training/ — the nightly " +
        "cron job only writes one once at least one rerank_feedback row " +
        "has been logged (i.e. after at least one grounded Ask answer).",
    );
    process.exit(1);
  }

  console.log(`Found ${allBlobs.length} nightly export(s). Downloading…`);

  const lines = [];
  for (const blob of allBlobs) {
    const res = await fetch(blob.url);
    const text = await res.text();
    const fileLines = text.split("\n").filter((l) => l.trim().length > 0);
    lines.push(...fileLines);
    console.log(`  ${blob.pathname} — ${fileLines.length} rows`);
  }

  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${lines.length} total labeled rows to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
