#!/usr/bin/env python3
"""
Merges the two halves of the training set — synthetic.jsonl (from
generate_synthetic_data.py) and feedback.jsonl (from download_feedback.mjs,
real usage) — into one deduplicated, shuffled train/val split ready for
train.ipynb.

Real feedback rows win over a synthetic row making the same (question,
passage) claim, on the theory that a label grounded in an actual
Verifier check is worth more than one a generation model guessed at.

Optional --public (from build_public_dataset.py) adds public finance-QA
rows to the TRAINING side only, capped at --public-ratio x the number of
rows from your own data. They never go into val.jsonl: validation should
measure how well the model handles *your* documents, and a pile of US-filing
questions would drown that signal.

The split is by QUESTION, not by row. Each question appears in several rows
(one positive, a few negatives); an earlier version shuffled rows, so the
same question could sit in both train and val and flatter the validation
numbers. Now every question lives wholly on one side.

Usage:
    python combine_and_split.py \
        --synthetic synthetic.jsonl --feedback feedback.jsonl \
        [--public public_train.jsonl --public-ratio 3.0] \
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


def group_by_question(rows: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(r["question"], []).append(r)
    return groups


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--synthetic", default="synthetic.jsonl")
    parser.add_argument("--feedback", default="feedback.jsonl")
    parser.add_argument("--public", help="public_train.jsonl from build_public_dataset.py (train side only)")
    parser.add_argument("--public-ratio", type=float, default=3.0,
                        help="max public rows = ratio x your own rows (default 3.0)")
    parser.add_argument("--val-fraction", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", default=".")
    args = parser.parse_args()

    print("Loading source files…")
    synthetic = load_jsonl(args.synthetic, "synthetic")
    feedback = load_jsonl(args.feedback, "feedback")

    public = load_jsonl(args.public, "public") if args.public else []

    if not synthetic and not feedback and not public:
        sys.exit(
            "Nothing to combine — run generate_synthetic_data.py and/or "
            "download_feedback.mjs (and/or build_public_dataset.py) first."
        )

    # Real feedback rows take priority over a synthetic row claiming the
    # same (question, passage) pair.
    merged: dict[tuple[str, str], dict] = {}
    for row in synthetic:
        merged[(row["question"], row["passage"])] = row
    for row in feedback:
        merged[(row["question"], row["passage"])] = row
    own_rows = list(merged.values())

    rng = random.Random(args.seed)

    # Public rows: kept as whole questions so a question never loses its
    # positive while keeping its negatives.
    public_by_q = group_by_question(public)
    own_val_possible = len(own_rows) > 0
    if not own_val_possible and public_by_q:
        print(
            "\n[note] No data of your own yet — validating on a slice of public "
            "data. That tells you the pipeline works, not that the model suits "
            "your documents.",
            file=sys.stderr,
        )

    # --- split own data by question ---------------------------------------
    own_groups = list(group_by_question(own_rows).values())
    rng.shuffle(own_groups)
    n_val_groups = max(1, int(len(own_groups) * args.val_fraction)) if own_groups else 0
    val_groups = own_groups[:n_val_groups]
    train_groups = own_groups[n_val_groups:]

    # --- public rows: train side only, capped ------------------------------
    pub_groups = list(public_by_q.values())
    rng.shuffle(pub_groups)
    if own_rows:
        own_train_rows = sum(len(g) for g in train_groups)
        budget = int(own_train_rows * args.public_ratio)
        taken, used = [], 0
        for g in pub_groups:
            if used + len(g) > budget:
                break
            taken.append(g)
            used += len(g)
        pub_groups = taken
    else:
        n_val_pub = max(1, int(len(pub_groups) * args.val_fraction))
        val_groups = pub_groups[:n_val_pub]
        pub_groups = pub_groups[n_val_pub:]

    train_rows = [r for g in train_groups + pub_groups for r in g]
    val_rows = [r for g in val_groups for r in g]
    rng.shuffle(train_rows)
    rng.shuffle(val_rows)

    def counts(rows):
        pos = sum(1 for r in rows if int(r["label"]) == 1)
        return pos, len(rows) - pos

    tp, tn = counts(train_rows)
    vp, vn = counts(val_rows)
    n_pub_train = sum(len(g) for g in pub_groups)
    print(
        f"\nTrain: {len(train_rows)} rows ({tp} pos / {tn} neg) — "
        f"{len(train_rows) - n_pub_train} own, {n_pub_train} public"
        f"\nVal:   {len(val_rows)} rows ({vp} pos / {vn} neg) — "
        f"{'own data' if own_rows else 'public slice'}"
    )

    if len(own_rows) < 100:
        print(
            "\n[note] Fewer than 100 rows of your own data. The model will still "
            "train, but consider raising --limit in generate_synthetic_data.py "
            "and/or letting more real usage accumulate in rerank_feedback before "
            "training the model you intend to actually deploy.",
            file=sys.stderr,
        )

    out_dir = Path(args.out_dir)
    for name, rows in (("train.jsonl", train_rows), ("val.jsonl", val_rows)):
        with (out_dir / name).open("w", encoding="utf-8") as f:
            for row in rows:
                # Drop bookkeeping — train.ipynb only needs these three fields.
                f.write(json.dumps({
                    "question": row["question"],
                    "passage": row["passage"],
                    "label": int(row["label"]),
                }, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(train_rows)} rows to train.jsonl, {len(val_rows)} to val.jsonl")


if __name__ == "__main__":
    main()
