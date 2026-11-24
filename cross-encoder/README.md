# Training BharatMatrix's own cross-encoder

Everything in this folder is run **outside** the deployed Next.js app —
on your own machine and in Google Colab — since there's no GPU and no
training framework inside a Vercel serverless function (see
`/api/cron/export-feedback/route.ts`'s own comment for why that nightly
job only *exports* data instead of training anything itself).

This is the "next up" item from `methodology.md` §4.2, now fully
scaffolded: every script, the notebook, and the serving app are ready to
run. What's left is work only you can do — running a Colab GPU session
under your own Google account and creating a Hugging Face Space under
your own account — which is why this is a runbook for you to follow
rather than something run automatically.

## The pipeline, end to end

```
 generate_synthetic_data.py ──┐
   download_feedback.mjs  ────┼──> combine_and_split.py ──> train.jsonl, val.jsonl
 build_public_dataset.py ─────┘      (public data: train only)       │
   (optional; also writes public_test.jsonl)                         │
                                                                     v
                                                              train.ipynb (Colab)
                                                                     │
                                                      fine-tuned model, pushed to
                                                         Hugging Face Hub
                                                                     │
                                                                     v
                                                    serve/ deployed as an HF Space
                                                                     │
                                                                     v
                                          CROSS_ENCODER_URL set in Vercel — done
```

## Step by step

### 1. Generate the bootstrapping dataset

```bash
cd cross-encoder
pip install "psycopg[binary]" requests
export DATABASE_URL=...     # same value as the main app's Vercel env var
export GEMINI_API_KEY=...   # same value as the main app's Vercel env var
python generate_synthetic_data.py --limit 250 --out synthetic.jsonl
```

This asks Gemini to write one question per sampled document chunk, then
pairs it with that chunk (positive) and a couple of wrong chunks
(negative) — see the comment at the top of the script for the honest
caveat on what synthetic data like this is and isn't good for.

### 2. Pull down real usage data (optional, but use it once you have it)

```bash
npm install
BLOB_READ_WRITE_TOKEN=... node download_feedback.mjs feedback.jsonl
```

This is the human-usage half of the dataset — every grounded Ask answer
quietly logs its cited chunk as a positive and a couple of retrieved-
but-not-cited chunks as negatives (see `src/lib/feedback.ts`), exported
nightly by Vercel Cron. It'll be empty/small until the app has had real
use; that's fine, run step 1 alone until then.

### 2b. Add public finance-QA data (optional, recommended while your own data is small)

```bash
python build_public_dataset.py                 # FinQA only (CC BY 4.0)
python build_public_dataset.py --include-tatqa # + TAT-QA (CC BY 4.0)
```

Downloads FinQA from GitHub on your machine (the build sandbox I work in
cannot reach it, so **this script has been tested only on small fake files
that mimic the documented format, never on the real download** — read its
printed skip counts and the "index self-check" line; it warns loudly if
its reading of FinQA's evidence indexes looks wrong). It writes
`public_train.jsonl` and `public_test.jsonl` (FinQA's *test* split, never
trained on). What each source is, its licence, and what was deliberately
left out is in `DATASETS.md`. These are US filings: they teach the
*skill* of finding the answering passage, not Indian-report vocabulary.

### 3. Combine into train/val splits

```bash
python combine_and_split.py --synthetic synthetic.jsonl --feedback feedback.jsonl \
    --public public_train.jsonl --public-ratio 3.0     # --public lines optional
```

Prints how many pairs you ended up with and the own/public split — worth
actually reading before you spend a Colab session on it. Validation is
always your own data (never public), and the split is by question so no
question appears on both sides.

### 4. Fine-tune in Colab

Upload `train.ipynb` to https://colab.research.google.com (File → Upload
notebook), switch to a GPU runtime, and run it top to bottom — it'll ask
you to upload `train.jsonl`/`val.jsonl` (and `public_test.jsonl` if you built it) partway through, measures ranking quality (Recall@1 / MRR) before training, then walks
through fine-tuning `cross-encoder/ms-marco-MiniLM-L-6-v2` on them and
re-measures with the best saved checkpoint so you can see whether it
really improved, and pushes the result to your Hugging Face account.

### 5. Deploy the model behind an API

Follow `serve/README.md` — create a Hugging Face Space (Docker SDK),
upload the five files in `serve/`, point its `MODEL_PATH` variable at
the model you just pushed.

### 6. Wire it into the app

Set `CROSS_ENCODER_URL` in the Vercel project's environment variables to
the Space's URL, redeploy. `rerankWithFallback()` (`src/lib/retrieve.ts`)
starts trying it on every request from then on, falling back to the
Gemini reranker exactly as it already does today whenever the Space is
asleep or slow — nothing else in the app needs to change.

## Automatic retraining (GitHub Actions)

`.github/workflows/retrain.yml` re-runs the whole pipeline every Monday
at 03:17 UTC, i.e. 08:47 IST (and on demand): pull feedback, generate synthetic pairs, build public
data, combine, train, then **compare the new model with the one the Space serves**.
`retrain_gate.py` promotes the new model only if it passes every rule:
- your own validation set has at least 50 questions (otherwise it never promotes),
- MRR on your own validation set improves by at least 0.01,
- no regression on the public test set (more than 0.005) or the hand-made set (more than 0.02).

If it promotes, it uploads to `<you>/bharatmatrix-cross-encoder-auto`, sets the Space's
`MODEL_PATH` to it and restarts the Space. The old model is never deleted: roll back by
setting `MODEL_PATH` back. Otherwise nothing changes and the result is in the run's summary.

**One-time setup**
1. GitHub repo → Settings → Secrets and variables → Actions → New repository secret. Add four:
   `DATABASE_URL`, `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `HF_TOKEN` (a *Write* token).
2. Actions tab → "Retrain cross-encoder" → Run workflow. Leave "promote" unticked for the
   first run (dry run), and read the summary.
3. When the dry run looks sensible, later weekly runs are allowed to promote on their own.

**Limits (unmeasured / unverified):** never run end to end; the first run may need fixes.
GitHub's runners have no GPU, so training runs on CPU (time unknown; the job times out at
5 hours). Logs of a public repo are public: the scripts print counts and scores only,
never document text. The gate is only as good as its test sets: with little own data it
will mostly answer "not enough validation data".

## More data

See `HOW_TO_TRAIN_MORE.md` — hand-made Indian-style test documents and questions are in `sample-data/` (`QUESTIONS.md`), converted to rows with `qa_to_training.py`.

## Re-training later

Once `CROSS_ENCODER_URL` is live, real usage keeps feeding
`rerank_feedback` every day. Re-running steps 1–6 periodically (monthly,
or whenever enough new feedback has piled up) with a higher real-to-
synthetic ratio each time is the "closing the loop" item still open in
`methodology.md` §4.2 — there's no scheduled job that does this
automatically yet, since that would need its own always-on compute to
retrain on, which is a bigger decision (cost, cadence) worth making
deliberately rather than defaulting into.
