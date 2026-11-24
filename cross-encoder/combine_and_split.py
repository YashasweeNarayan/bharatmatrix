#!/usr/bin/env python3
"""
Merges the two halves of the training set — synthetic.jsonl (from
generate_synthetic_data.py) and feedback.jsonl (from download_feedback.mjs,
real usage) — into one deduplicated, shuffled train/val split ready for
train.ipynb.

Real feedback rows win over a synthetic row making the same (question,
passage) claim, on the theory that a label grounded in an actual
Verifier check is worth more than one a generation model guessed at.

Usage:
    python combine_and_split.py \
        --synthetic synthetic.jsonl --feedback feedback.jsonl \
        --val-fraction 0.1 --seed 42
"""

import argparse
import json
import random
import sys
from pathlib import Path


def load_jsonl(path: str, source: str) -> list[dict]:
    p = Path(path)
    if not p.exists():
        print(f"  (skipping {path} — not found)")
        return []
    rows = []
    with p.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                print(f"  [warn] {path}:{line_no} — bad JSON, skipped", file=sys.stderr)
                continue
            if not {"question", "passage", "label"} <= row.keys():
                print(f"  [warn] {path}:{line_no} — missing a field, skipped", file=sys.stderr)
                continue
            row["_source"] = source
            rows.append(row)
    print(f"  {path}: {len(rows)} rows")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", default="synthetic.jsonl")
    parser.add_argument("--feedback", default="feedback.jsonl")
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", default=".")
    args = parser.parse_args()

    print("Loading source files…")
    synthetic = load_jsonl(args.synthetic, "synthetic")
    feedback = load_jsonl(args.feedback, "feedback")

    if not synthetic and not feedback:
        sys.exit(
            "Nothing to combine — run generate_synthetic_data.py and/or "
            "download_feedback.mjs first."
        )

    # Real feedback rows take priority over a synthetic row claiming the
    # same (question, passage) pair.
    merged: dict[tuple[str, str], dict] = {}
    for row in synthetic:
        merged[(row["question"], row["passage"])] = row
    for row in feedback:
        merged[(row["question"], row["passage"])] = row

    all_rows = list(merged.values())
    n_pos = sum(1 for r in all_rows if int(r["label"]) == 1)
    n_neg = len(all_rows) - n_pos
    n_synthetic = sum(1 for r in all_rows if r["_source"] == "synthetic")
    n_feedback = len(all_rows) - n_synthetic

    print(
        f"\nCombined: {len(all_rows)} unique pairs "
        f"({n_pos} positive / {n_neg} negative, "
        f"{n_synthetic} synthetic / {n_feedback} real feedback)"
    )

    if len(all_rows) < 100:
        print(
            "\n[note] That's a small dataset for fine-tuning a cross-encoder. "
            "It'll still run and learn *something*, but consider raising "
            "--limit in generate_synthetic_data.py and/or letting more real "
            "usage accumulate in rerank_feedback before training the model "
            "you intend to actually deploy.",
            file=sys.stderr,
        )

    random.seed(args.seed)
    random.shuffle(all_rows)

    n_val = max(1, int(len(all_rows) * args.val_fraction))
    val_rows = all_rows[:n_val]
    train_rows = all_rows[n_val:]

    out_dir = Path(args.out_dir)
    for name, rows in (("train.jsonl", train_rows), ("val.jsonl", val_rows)):
        with (out_dir / name).open("w", encoding="utf-8") as f:
            for row in rows:
                # Drop the bookkeeping field — train.ipynb only needs the
                # three fields the model actually trains on.
                f.write(json.dumps({
                    "question": row["question"],
                    "passage": row["passage"],
                    "label": int(row["label"]),
                }) + "\n")

    print(f"\nWrote {len(train_rows)} rows to train.jsonl, {len(val_rows)} to val.jsonl")


if __name__ == "__main__":
    main()
