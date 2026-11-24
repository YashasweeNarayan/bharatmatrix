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

**This folder's contents (`app.py`, `Dockerfile`, `requirements.txt`,
this `README.md`) are exactly what you upload as a new Hugging Face
Space.** The rest of `cross-encoder/` (the data/training scripts,
`train.ipynb`) stays in the main repo — a Space only needs what's in
here.

## Deploying

1. Create a Space at huggingface.co/new-space — SDK: **Docker**,
   visibility either is fine (public is simpler, nothing secret lives
   here beyond the model weights).
2. Upload `app.py`, `Dockerfile`, `requirements.txt`, and this
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
# -> {"rankedIndexes": [0, 1]}
```
