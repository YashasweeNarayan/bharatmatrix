---
title: BharatMatrix Cross Encoder
emoji: 🔎
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# BharatMatrix cross-encoder

Serves `rerankWithCrossEncoder()`'s contract (`src/lib/crossEncoder.ts`
in the main app): `POST /` with `{"question": str, "passages": [str]}`
returns `{"rankedIndexes": [int]}`.

**This folder's contents (`app.py`, `ranking.py`, `Dockerfile`,
`requirements.txt`, this `README.md`) are exactly what you upload as a new Hugging Face
Space.** The rest of `cross-encoder/` (the data/training scripts,
`train.ipynb`) stays in the main repo — a Space only needs what's in
here.

## Deploying

1. Create a Space at huggingface.co/new-space — SDK: **Docker**,
   visibility either is fine (public is simpler, nothing secret lives
   here beyond the model weights).
2. Upload `app.py`, `ranking.py`, `Dockerfile`, `requirements.txt`, and this
   `README.md` to the Space's repo (via the web UI's "Files" tab, or
   `git push` if you'd rather — a Space is a git repo).
3. In the Space's **Settings → Variables**, add `MODEL_PATH` set to
   your fine-tuned model's Hugging Face Hub repo id (whatever you used
   in `train.ipynb` step 5a, e.g. `yourname/bharatmatrix-cross-encoder`).
   Space variables are also passed as Docker build args, which is why
   the `Dockerfile` declares `ARG MODEL_PATH` — this is what makes
   the image bake in *your* model instead of the untrained base
   checkpoint it defaults to.
4. The Space builds and starts automatically. Once it shows "Running,"
   its URL (`https://<you>-<space-name>.hf.space`) is what you set as
   `CROSS_ENCODER_URL` in the main app's Vercel environment variables.

## Speed knobs (and what is NOT measured yet)

The app can send up to ~120 candidate passages per question. To keep a
free CPU Space inside the app's 2.5s budget, the service only *scores* the
first `MAX_RERANK` passages (default 40, in the app's RRF order, best
first) and appends the rest unscored. Token length per pair is capped by
`MAX_LENGTH` (default 256; keep equal to `MAX_LENGTH` in `train.ipynb`).
Both can be set as Space variables.

I could not time this on real hardware, so no latency figure is claimed.
Every response includes `scored` and `ms`, and each call prints a log
line, so after deploying run the curl below with ~40 passages and look at
`ms`. If it is routinely over ~2000, lower `MAX_RERANK` (or upgrade the
Space hardware) — otherwise the app will silently fall back to Gemini on
every request and the Space will look "unused".

## What to expect from the free tier

Free Spaces (CPU basic) sleep after a period of no traffic and take
some seconds to wake back up on the next request — the app's own
`rerankWithCrossEncoder()` only waits 2.5s before giving up and falling
back to the Gemini reranker (see the comment in `crossEncoder.ts` for
why that number specifically), so a cold Space will reliably fall back
on its first request after sleeping, then answer directly once it's
warm. That's the fallback machinery working as designed, not a bug —
see `rerankWithFallback` in `retrieve.ts`.

## Testing it directly

```bash
curl -X POST https://<you>-<space-name>.hf.space/ \
  -H "Content-Type: application/json" \
  -d '{"question": "What was the revenue in 2025?", "passages": ["Total revenue for fiscal year 2025 was 482 crore.", "The office relocated in 2024."]}'
# -> {"rankedIndexes": [0, 1], "scored": 2, "ms": 35}   (ms will vary)

curl https://<you>-<space-name>.hf.space/    # shows which model + knobs are loaded
```
