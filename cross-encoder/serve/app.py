"""
Serves the fine-tuned cross-encoder behind exactly the contract
src/lib/crossEncoder.ts expects:

    POST /   { "question": str, "passages": [str, ...] }
         ->  { "rankedIndexes": [int, ...] }   # 0-based, most to least relevant

Nothing else needs to change in the Next.js app once this is deployed —
just set CROSS_ENCODER_URL (in Vercel) to this Space's root URL.

MODEL_PATH can be a Hugging Face Hub repo id (e.g.
"yourname/bharatmatrix-cross-encoder", see ../train.ipynb) or a local
folder. It defaults to the untrained base checkpoint purely so the
service starts and answers *something* before you've pushed your own
fine-tuned model — GET / reports which model is actually loaded, so you
can confirm you're not accidentally serving the base one.

Env knobs:
  MAX_RERANK  how many passages (taken in the order received, which is the
              app's RRF order) to actually score; the rest are appended
              unscored. Default 40. See ranking.py for why.
  MAX_LENGTH  token limit per (question, passage) pair. Default 256 — the
              app's chunks are at most 900 characters (src/lib/chunk.ts),
              roughly 225 tokens, so 256 covers a chunk plus the question
              and is meaningfully faster than the model's usual 512.
              Keep it equal to the value used in train.ipynb.
"""

import os
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder

from ranking import rank_with_cap

MODEL_PATH = os.environ.get("MODEL_PATH", "cross-encoder/ms-marco-MiniLM-L-6-v2")
MAX_RERANK = int(os.environ.get("MAX_RERANK", "40"))
MAX_LENGTH = int(os.environ.get("MAX_LENGTH", "256"))
# Accepting a bigger payload than we score is deliberate: the app can send
# ~120 passages, and rejecting those (HTTP 422) would be treated as
# "cross-encoder unavailable" and silently route every request to Gemini.
MAX_PASSAGES_ACCEPTED = 300

app = FastAPI(title="BharatMatrix cross-encoder")

print(f"Loading model: {MODEL_PATH} (max_length={MAX_LENGTH}) …")
_load_started = time.time()
model = CrossEncoder(MODEL_PATH, max_length=MAX_LENGTH)
print(f"Model loaded in {time.time() - _load_started:.1f}s")


class RerankRequest(BaseModel):
    question: str = Field(min_length=1)
    passages: list[str] = Field(min_length=1, max_length=MAX_PASSAGES_ACCEPTED)


class RerankResponse(BaseModel):
    rankedIndexes: list[int]
    # Extra observability fields — the app only reads rankedIndexes, but
    # these let you check real latency from the Space's logs / a curl.
    scored: int
    ms: int


@app.get("/")
def health():
    return {
        "status": "ok",
        "model": MODEL_PATH,
        "max_rerank": MAX_RERANK,
        "max_length": MAX_LENGTH,
    }


@app.post("/", response_model=RerankResponse)
def rerank(req: RerankRequest):
    if not req.passages:
        raise HTTPException(400, "passages must not be empty")

    started = time.time()
    head = req.passages[:MAX_RERANK]
    scores = model.predict([(req.question, p) for p in head])
    ranked = rank_with_cap([float(s) for s in scores], len(req.passages))
    ms = int((time.time() - started) * 1000)
    print(f"reranked {len(head)}/{len(req.passages)} passages in {ms}ms")
    return RerankResponse(rankedIndexes=ranked, scored=len(head), ms=ms)
