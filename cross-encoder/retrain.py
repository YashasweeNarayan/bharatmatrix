#!/usr/bin/env python3
"""
Headless retraining run (used by .github/workflows/retrain.yml, also runnable
by hand). Expects train.jsonl / val.jsonl (and optionally public_test.jsonl,
handmade_test.jsonl) in the current folder — the workflow builds them first.

  1. Fine-tunes the BASE checkpoint on train.jsonl (plain PyTorch loop; CPU is
     fine for this small model, it just takes a while).
  2. Scores the candidate AND the model the Space currently serves on the same
     held-out sets.
  3. Applies retrain_gate.decide(). Only with --promote (or PROMOTE=true) AND a
     passing gate does it upload the candidate and point the Space at it;
     otherwise it just reports. Never prints question/passage text (CI logs of
     public repos are public).

NOT run end to end where it was written (no torch / Hugging Face there).
Training time on a GitHub CPU runner is unmeasured.

Env: HF_TOKEN (write access to your repos and Space)
"""

import argparse
import json
import math
import os
import random
import sys
from collections import defaultdict

from retrain_gate import decide

BASE = "cross-encoder/ms-marco-MiniLM-L-6-v2"
MAX_LENGTH = 256  # must match MAX_LENGTH in serve-gradio/app.py


def load_rows(path):
    return [json.loads(l) for l in open(path, encoding="utf-8")]


def ranking_metrics(model, path):
    groups = defaultdict(list)
    for r in load_rows(path):
        groups[r["question"]].append((r["passage"], int(r["label"])))
    hits = rr = n = 0
    for q, items in groups.items():
        if not any(l == 1 for _, l in items) or all(l == 1 for _, l in items):
            continue
        scores = model.predict([(q, p) for p, _ in items], show_progress_bar=False)
        order = sorted(range(len(items)), key=lambda i: scores[i], reverse=True)
        first = next(rk for rk, i in enumerate(order, 1) if items[i][1] == 1)
        hits += first == 1
        rr += 1 / first
        n += 1
    return (n, hits / max(n, 1), rr / max(n, 1))


def evaluate(model):
    out = {}
    for name, path in (("val", "val.jsonl"), ("public_test", "public_test.jsonl"),
                       ("handmade", "handmade_test.jsonl")):
        if os.path.exists(path):
            out[name] = ranking_metrics(model, path)
    return out


def fmt(m):
    return " | ".join(f"{k}: {v[0]}q R@1 {v[1]:.3f} MRR {v[2]:.3f}" for k, v in m.items())


def train(out_dir, epochs, batch_size, lr, max_rows):
    import torch
    from sentence_transformers import CrossEncoder
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    rows = load_rows("train.jsonl")
    random.seed(42); torch.manual_seed(42)
    if len(rows) > max_rows:
        random.shuffle(rows); rows = rows[:max_rows]
    print(f"Training on {len(rows)} pairs for {epochs} epochs")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(BASE)
    net = AutoModelForSequenceClassification.from_pretrained(BASE, num_labels=1).to(device)
    steps = math.ceil(len(rows) / batch_size) * epochs
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    lossf = torch.nn.BCEWithLogitsLoss()

    class Scorer:
        def predict(self, pairs, show_progress_bar=False):
            out = []
            with torch.no_grad():
                for i in range(0, len(pairs), 64):
                    b = pairs[i:i + 64]
                    enc = tok([q for q, _ in b], [p for _, p in b], truncation=True,
                              max_length=MAX_LENGTH, padding=True, return_tensors="pt").to(device)
                    out += net(**enc).logits.squeeze(-1).float().cpu().tolist()
            return out

    best = -1.0
    for ep in range(1, epochs + 1):
        net.train(); random.shuffle(rows); total = 0.0
        for i in range(0, len(rows), batch_size):
            b = rows[i:i + batch_size]
            enc = tok([r["question"] for r in b], [r["passage"] for r in b], truncation=True,
                      max_length=MAX_LENGTH, padding=True, return_tensors="pt").to(device)
            labels = torch.tensor([float(r["label"]) for r in b], device=device)
            loss = lossf(net(**enc).logits.squeeze(-1), labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad()
            total += loss.item() * len(b)
        net.eval()
        n, r1, mrr = ranking_metrics(Scorer(), "val.jsonl")
        print(f"epoch {ep}: loss {total/len(rows):.4f} | val {n}q R@1 {r1:.3f} MRR {mrr:.3f}", flush=True)
        if mrr > best:
            best = mrr
            net.save_pretrained(out_dir); tok.save_pretrained(out_dir)
            print("  saved (best so far)")
    return CrossEncoder(out_dir, max_length=MAX_LENGTH)


def upload(api, folder, repo):
    api.create_repo(repo, exist_ok=True)
    try:
        api.upload_folder(folder_path=folder, repo_id=repo, commit_message="Automatic retrain")
    except Exception as e:  # noqa: BLE001 - fall back to per-file upload
        print(f"upload_folder failed ({type(e).__name__}); uploading files one by one")
        for name in sorted(os.listdir(folder)):
            api.upload_file(path_or_fileobj=os.path.join(folder, name), path_in_repo=name,
                            repo_id=repo, commit_message="Automatic retrain")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", default="yashaswee22/bharatmatrix-cross-encoder", help="Space id to switch")
    ap.add_argument("--fallback-live", default="yashaswee22/bharatmatrix-cross-encoder-v2")
    ap.add_argument("--target-repo", default=None, help="default: <you>/bharatmatrix-cross-encoder-auto")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--max-train-rows", type=int, default=8000)
    ap.add_argument("--promote", action="store_true")
    args = ap.parse_args()
    promote = args.promote or os.environ.get("PROMOTE", "").lower() == "true"

    from huggingface_hub import HfApi
    from sentence_transformers import CrossEncoder

    token = os.environ.get("HF_TOKEN")
    api = HfApi(token=token)

    # Which model is live right now? Ask the Space (so repeated runs compare
    # against the latest promoted model), falling back to the known repo.
    try:
        live_repo = api.get_space_variables(args.space)["MODEL_PATH"].value or args.fallback_live
    except Exception:  # noqa: BLE001
        live_repo = args.fallback_live
    print(f"Live model: {live_repo}")

    cand = train("output/candidate", args.epochs, args.batch_size, args.lr, args.max_train_rows)
    cand_m = evaluate(cand)
    live_m = evaluate(CrossEncoder(live_repo, max_length=MAX_LENGTH))
    print("LIVE      ", fmt(live_m))
    print("CANDIDATE ", fmt(cand_m))

    ok, reasons = decide(live_m, cand_m)
    lines = ["## Automatic retrain", f"- live model: `{live_repo}`",
             f"- live: {fmt(live_m)}", f"- candidate: {fmt(cand_m)}",
             f"- decision: **{'PROMOTE' if ok else 'KEEP LIVE MODEL'}**"] + [f"  - {r}" for r in reasons]
    print("\n".join(lines))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    if not ok:
        return
    if not promote:
        print("Gate passed, but promotion is off (dry run). Nothing uploaded.")
        return
    if not token:
        sys.exit("HF_TOKEN is not set; cannot promote.")
    target = args.target_repo or f"{api.whoami()['name']}/bharatmatrix-cross-encoder-auto"
    upload(api, "output/candidate", target)
    api.add_space_variable(args.space, "MODEL_PATH", target)
    api.restart_space(args.space)
    print(f"Promoted: Space {args.space} now uses {target} (restarting). "
          f"Previous model {live_repo} is untouched, roll back by setting MODEL_PATH to it.")


if __name__ == "__main__":
    main()
