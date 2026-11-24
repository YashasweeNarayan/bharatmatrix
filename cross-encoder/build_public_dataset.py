#!/usr/bin/env python3
"""
Turns public financial-QA datasets into the same {"question", "passage",
"label"} JSONL the rest of this pipeline uses, so they can be mixed with
the app's own data by combine_and_split.py.

WHY PUBLIC DATA AT ALL: the app's own data (synthetic + real feedback) is
what teaches the model *your* documents, but a brand-new deployment has
very little of it. Public datasets of "finance question -> the passage in
a filing that answers it" give the model a head start on the general skill
(spotting the passage that answers a question about a financial report)
before it adapts to your specifics. See DATASETS.md for what each source
is, its licence, and why others were left out.

WHAT'S IN IT (only sources whose licence I could actually read):
  default      FinQA     earnings-report Q&A with annotated evidence
                         (CC BY 4.0 per its Hugging Face card, ibm/finqa)
  opt-in       TAT-QA    annual-report text+table Q&A, relevant-paragraph
                         labels (CC BY 4.0 per its card, next-tat/TAT-QA)
  opt-in       financial-qa-10K  10-K question + context. I could NOT read
                         its licence from the sources available to me —
                         read the dataset card yourself before enabling.

HONEST LIMITS:
  * All of these are US filings. None contain Indian-company annual
    reports (crore/lakh, Ind AS, SEBI/BSE/NSE disclosures). They teach the
    task, not the vocabulary — that part has to come from the app's own
    documents (generate_synthetic_data.py / real feedback).
  * Passages are rebuilt into chunks of at most 900 characters, the same
    size src/lib/chunk.ts produces, so the model trains on the same kind
    of passage it will rerank in production rather than on single
    sentences.
  * Written against each dataset's documented schema but NOT run against
    the real files (the build sandbox can't reach GitHub/Hugging Face).
    It validates as it goes and prints skip counts; if numbers look off,
    trust the printout over the training run.

Usage:
    python build_public_dataset.py                      # FinQA only
    python build_public_dataset.py --max-questions 4000
    python build_public_dataset.py --include-tatqa
    python build_public_dataset.py --finqa-zip FinQA-main.zip   # offline copy
Outputs public_train.jsonl and public_test.jsonl (the test file is built
from FinQA's *test* split, which is never trained on — train.ipynb uses it
to measure before/after ranking quality honestly).
"""

import argparse
import io
import json
import random
import sys
import urllib.request
import zipfile
from pathlib import Path

CHUNK_SIZE = 900  # keep equal to CHUNK_SIZE in src/lib/chunk.ts

FINQA_ZIP_URL = "https://github.com/czyssrs/FinQA/archive/refs/heads/main.zip"
TATQA_URL = (
    "https://raw.githubusercontent.com/NExTplusplus/TAT-QA/master/"
    "dataset_raw/tatqa_dataset_train.json"
)

Key = tuple[str, int]


# ----------------------------------------------------------------------------
# Shared helpers
# ----------------------------------------------------------------------------

def pack_chunks(units: list[tuple[Key, str]]) -> list[tuple[str, set[Key]]]:
    """
    Greedily packs consecutive units (sentences / table rows) into chunks of
    at most CHUNK_SIZE characters, remembering which unit keys each chunk
    contains so evidence labels can be mapped onto chunks.
    """
    chunks: list[tuple[str, set[Key]]] = []
    cur_text: list[str] = []
    cur_keys: set[Key] = set()
    cur_len = 0
    for key, text in units:
        text = text.strip()
        if len(text) < 3:
            continue
        text = text[:CHUNK_SIZE]
        extra = len(text) + (1 if cur_text else 0)
        if cur_text and cur_len + extra > CHUNK_SIZE:
            chunks.append(("\n".join(cur_text), cur_keys))
            cur_text, cur_keys, cur_len = [], set(), 0
            extra = len(text)
        cur_text.append(text)
        cur_keys.add(key)
        cur_len += extra
    if cur_text:
        chunks.append(("\n".join(cur_text), cur_keys))
    return chunks


def make_rows(
    question: str,
    chunks: list[tuple[str, set[Key]]],
    gold: set[Key],
    other_pool: list[tuple[int, str]],
    this_id: int,
    rng: random.Random,
    n_hard: int = 2,
    n_easy: int = 1,
) -> list[dict]:
    """
    Positive: up to 2 chunks containing gold evidence. Negatives: up to
    `n_hard` other chunks from the SAME report (topically close decoys — the
    hard kind) plus `n_easy` chunks from a different report.
    """
    positives = [c for c, keys in chunks if keys & gold][:2]
    if not positives:
        return []
    pos_set = set(positives)
    same_report = [c for c, keys in chunks if not (keys & gold) and c not in pos_set]
    rng.shuffle(same_report)

    rows = [{"question": question, "passage": p, "label": 1} for p in positives]
    for p in same_report[:n_hard]:
        rows.append({"question": question, "passage": p, "label": 0})
    for _ in range(n_easy):
        if not other_pool:
            break
        for _attempt in range(5):
            rid, text = rng.choice(other_pool)
            if rid != this_id:
                rows.append({"question": question, "passage": text, "label": 0})
                break
    return rows


def download(url: str, what: str) -> bytes:
    print(f"Downloading {what} …")
    try:
        with urllib.request.urlopen(url, timeout=120) as resp:
            return resp.read()
    except Exception as e:  # noqa: BLE001
        sys.exit(
            f"Couldn't download {what} from {url}\n  ({e})\n"
            "Download it manually and pass the local path instead (see --help)."
        )


# ----------------------------------------------------------------------------
# FinQA
# ----------------------------------------------------------------------------

def load_finqa(zip_path: str | None) -> dict[str, list[dict]]:
    if zip_path:
        raw = Path(zip_path).read_bytes()
    else:
        raw = download(FINQA_ZIP_URL, "FinQA (czyssrs/FinQA)")
    out: dict[str, list[dict]] = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = zf.namelist()
        for split in ("train", "test"):
            match = [n for n in names if n.endswith(f"dataset/{split}.json")]
            if not match:
                sys.exit(f"FinQA archive has no dataset/{split}.json — layout changed?")
            out[split] = json.loads(zf.read(match[0]))
    return out


def finqa_rows(
    records: list[dict], max_questions: int, rng: random.Random, label: str
) -> list[dict]:
    pool: list[tuple[int, str]] = []
    prepared = []
    for rec_i, rec in enumerate(records):
        pre, post, table = rec.get("pre_text", []), rec.get("post_text", []), rec.get("table", [])
        text_all = list(pre) + list(post)
        units: list[tuple[Key, str]] = []
        units += [(("text", i), s) for i, s in enumerate(pre)]
        units += [(("table", r), " | ".join(str(c) for c in row)) for r, row in enumerate(table)]
        units += [(("text", len(pre) + j), s) for j, s in enumerate(post)]
        chunks = pack_chunks(units)
        pool += [(rec_i, c) for c, _ in chunks]
        prepared.append((rec, text_all, table, chunks))

    order = list(range(len(prepared)))
    rng.shuffle(order)

    rows: list[dict] = []
    used = skipped_no_gold = skipped_bad_index = text_checked = text_mismatch = 0
    for rec_i in order:
        if used >= max_questions:
            break
        rec, text_all, table, chunks = prepared[rec_i]
        qa = rec.get("qa") or {}
        question = (qa.get("question") or "").strip()
        gold_inds = qa.get("gold_inds") or {}
        if not question or not gold_inds:
            skipped_no_gold += 1
            continue

        gold: set[Key] = set()
        ok = True
        for key, val in gold_inds.items():
            try:
                kind, n = key.rsplit("_", 1)
                n = int(n)
            except ValueError:
                ok = False
                break
            if kind == "text":
                if n >= len(text_all):
                    ok = False
                    break
                # Self-check of my reading of the index scheme: a text_N key
                # should point at exactly the sentence it quotes.
                text_checked += 1
                if text_all[n].strip() != str(val).strip():
                    text_mismatch += 1
            elif kind == "table":
                if n >= len(table):
                    ok = False
                    break
            else:
                ok = False
                break
            gold.add((kind, n))
        if not ok:
            skipped_bad_index += 1
            continue

        new = make_rows(question, chunks, gold, pool, rec_i, rng)
        if new:
            rows += new
            used += 1

    print(
        f"  FinQA {label}: {used} questions -> {len(rows)} rows "
        f"(skipped {skipped_no_gold} without evidence, {skipped_bad_index} with unusable indexes)"
    )
    if text_checked and text_mismatch / text_checked > 0.2:
        print(
            f"  [WARNING] {text_mismatch}/{text_checked} text evidence keys did not "
            "match the sentence they point to — my reading of FinQA's indexing "
            "(text_N counts over pre_text + post_text) is probably wrong for this "
            "copy of the data. Positive labels may be misplaced; do not train on "
            "this output until that's resolved.",
            file=sys.stderr,
        )
    elif text_checked:
        print(f"  index self-check: {text_checked - text_mismatch}/{text_checked} text keys matched exactly")
    return rows


# ----------------------------------------------------------------------------
# TAT-QA
# ----------------------------------------------------------------------------

def tatqa_rows(path_or_url: str | None, max_questions: int, rng: random.Random) -> list[dict]:
    if path_or_url and Path(path_or_url).exists():
        data = json.loads(Path(path_or_url).read_text(encoding="utf-8"))
    else:
        data = json.loads(download(path_or_url or TATQA_URL, "TAT-QA train split"))

    pool: list[tuple[int, str]] = []
    prepared = []
    for rec_i, rec in enumerate(data):
        paras = sorted(rec.get("paragraphs", []), key=lambda p: p.get("order", 0))
        units: list[tuple[Key, str]] = [
            (("para", int(p["order"])), p.get("text", "")) for p in paras
        ]
        units += [
            (("table", r), " | ".join(str(c) for c in row))
            for r, row in enumerate((rec.get("table") or {}).get("table", []))
        ]
        chunks = pack_chunks(units)
        pool += [(rec_i, c) for c, _ in chunks]
        prepared.append((rec, chunks))

    order = list(range(len(prepared)))
    rng.shuffle(order)
    rows: list[dict] = []
    used = 0
    for rec_i in order:
        if used >= max_questions:
            break
        rec, chunks = prepared[rec_i]
        for q in rec.get("questions", []):
            if used >= max_questions:
                break
            rel = q.get("rel_paragraphs") or []
            question = (q.get("question") or "").strip()
            if not question or not rel:
                continue
            try:
                gold = {("para", int(r)) for r in rel}
            except (TypeError, ValueError):
                continue
            new = make_rows(question, chunks, gold, pool, rec_i, rng)
            if new:
                rows += new
                used += 1
    print(f"  TAT-QA: {used} questions -> {len(rows)} rows")
    return rows


# ----------------------------------------------------------------------------
# virattt/financial-qa-10K
# ----------------------------------------------------------------------------

def fin10k_rows(max_questions: int, rng: random.Random) -> list[dict]:
    try:
        from datasets import load_dataset
    except ImportError:
        sys.exit("pip install datasets   (needed for --include-financial-qa-10k)")
    ds = load_dataset("virattt/financial-qa-10K", split="train")
    items = [
        (r["question"].strip(), r["context"].strip(), f'{r.get("ticker")}|{r.get("filing")}')
        for r in ds
        if r.get("question") and r.get("context") and len(r["context"].strip()) >= 100
    ]
    rng.shuffle(items)
    by_filing: dict[str, list[str]] = {}
    for _, ctx, f in items:
        by_filing.setdefault(f, []).append(ctx)
    all_ctx = [c for _, c, _ in items]

    rows: list[dict] = []
    used = 0
    for q, ctx, f in items:
        if used >= max_questions:
            break
        rows.append({"question": q, "passage": ctx[:CHUNK_SIZE], "label": 1})
        same = [c for c in by_filing[f] if c != ctx]
        if same:
            rows.append({"question": q, "passage": rng.choice(same)[:CHUNK_SIZE], "label": 0})
        other = rng.choice(all_ctx)
        if other != ctx:
            rows.append({"question": q, "passage": other[:CHUNK_SIZE], "label": 0})
        used += 1
    print(f"  financial-qa-10K: {used} questions -> {len(rows)} rows")
    return rows


# ----------------------------------------------------------------------------

def write_jsonl(path: str, rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    pos = sum(r["label"] for r in rows)
    print(f"Wrote {len(rows)} rows ({pos} positive / {len(rows) - pos} negative) to {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public_train.jsonl")
    ap.add_argument("--test-out", default="public_test.jsonl")
    ap.add_argument("--max-questions", type=int, default=3000, help="per source, for training")
    ap.add_argument("--max-test-questions", type=int, default=500)
    ap.add_argument("--finqa-zip", help="local copy of the FinQA GitHub archive (skips download)")
    ap.add_argument("--include-tatqa", action="store_true")
    ap.add_argument("--tatqa-json", help="local path or URL of tatqa_dataset_train.json")
    ap.add_argument("--include-financial-qa-10k", action="store_true",
                    help="check the dataset's licence on its Hugging Face card first")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    finqa = load_finqa(args.finqa_zip)

    print("Building training rows …")
    train_rows = finqa_rows(finqa["train"], args.max_questions, rng, "train")
    if args.include_tatqa:
        train_rows += tatqa_rows(args.tatqa_json, args.max_questions, rng)
    if args.include_financial_qa_10k:
        train_rows += fin10k_rows(args.max_questions, rng)

    print("Building held-out test rows (FinQA test split — never trained on) …")
    test_rows = finqa_rows(finqa["test"], args.max_test_questions, rng, "test")

    if not train_rows:
        sys.exit("No training rows produced — see the warnings above.")
    write_jsonl(args.out, train_rows)
    write_jsonl(args.test_out, test_rows)


if __name__ == "__main__":
    main()
