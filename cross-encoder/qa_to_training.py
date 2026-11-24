#!/usr/bin/env python3
"""
Turns hand-written question/answer files into {"question","passage","label"}
rows for the cross-encoder — the way to grow the training set with data whose
labels YOU have checked.

Input (see sample-data/):
  docs/<id>.txt                 plain text of each document (one paragraph or
                                table row per line)
  qa/questions_and_answers.json [{"question", "answer", "evidence":
                                  [{"doc": "<id>", "text": "<exact text from the doc>"}]}]

For each question: chunks that contain the evidence text are positives;
other chunks from the same document are hard negatives; a chunk from a
different document is an easy negative.

--chunk-size defaults to 450 (not the app's 900) because these sample
documents are only 1-2 pages: at 900 characters each would be 2-3 chunks and
ranking would be trivial. Smaller chunks give more candidates per document.
Use 900 for long, real documents.

Usage:
  python qa_to_training.py                                  # sample-data -> handmade.jsonl
  python qa_to_training.py --docs sample-data/docs --qa sample-data/qa/questions_and_answers.json --out handmade.jsonl
  python qa_to_training.py --chunk-size 900 --out my_docs.jsonl
"""

import argparse
import json
import random
import sys
from pathlib import Path


def chunk_lines(text: str, size: int) -> list[str]:
    chunks, cur, cur_len = [], [], 0
    for line in (l.strip() for l in text.splitlines()):
        if not line:
            continue
        line = line[:size]
        extra = len(line) + (1 if cur else 0)
        if cur and cur_len + extra > size:
            chunks.append("\n".join(cur))
            cur, cur_len, extra = [], 0, len(line)
        cur.append(line)
        cur_len += extra
    if cur:
        chunks.append("\n".join(cur))
    return chunks


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", default="sample-data/docs")
    ap.add_argument("--qa", default="sample-data/qa/questions_and_answers.json")
    ap.add_argument("--out", default="handmade.jsonl")
    ap.add_argument("--chunk-size", type=int, default=450)
    ap.add_argument("--hard-negatives", type=int, default=2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    chunks_by_doc = {
        p.stem: chunk_lines(p.read_text(encoding="utf-8"), args.chunk_size)
        for p in sorted(Path(args.docs).glob("*.txt"))
    }
    if not chunks_by_doc:
        sys.exit(f"No .txt documents found in {args.docs}")
    qa = json.loads(Path(args.qa).read_text(encoding="utf-8"))

    rows, skipped = [], 0
    for item in qa:
        q = item["question"].strip()
        pos, pos_docs = [], set()
        for ev in item["evidence"]:
            hits = [c for c in chunks_by_doc.get(ev["doc"], []) if ev["text"] in c]
            if not hits:
                print(f"[warn] evidence not found, skipping question: {q[:60]!r}", file=sys.stderr)
                pos = []
                break
            pos.append(hits[0])
            pos_docs.add(ev["doc"])
        if not pos:
            skipped += 1
            continue
        for c in dict.fromkeys(pos):
            rows.append({"question": q, "passage": c, "label": 1})
        for d in pos_docs:
            others = [c for c in chunks_by_doc[d] if c not in pos]
            rng.shuffle(others)
            for c in others[: args.hard_negatives]:
                rows.append({"question": q, "passage": c, "label": 0})
        other_docs = [d for d in chunks_by_doc if d not in pos_docs]
        if other_docs:
            rows.append({"question": q, "passage": rng.choice(chunks_by_doc[rng.choice(other_docs)]), "label": 0})

    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    n_pos = sum(r["label"] for r in rows)
    print(f"{len(qa) - skipped} questions -> {len(rows)} rows ({n_pos} positive / {len(rows) - n_pos} negative) in {args.out}")


if __name__ == "__main__":
    main()
