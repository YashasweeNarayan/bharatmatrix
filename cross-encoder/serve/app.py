"""
Serves the fine-tuned cross-encoder behind exactly the contract
src/lib/crossEncoder.ts expects:

    POST /   { "question": str, "passages": [str, ...] }
         ->  { "rankedIndexes": [int, ...] }   # 0-based, most to least relevant

Nothing else needs to change in the Next.js app once this is deployed —
just set CROSS_ENCODER_URL (in Vercel) to this Space's root URL.

MODEL_PATH can be a Hugging Face Hub repo id (e.g.
"yourname/bharatmatrix-cross-encoder", the easiest path — see
../train.ipynb step 5a) or a local folder baked into the Docker image.
Defaults to the untrained base checkpoint purely so this starts up and
answers *something* even before you've pushed your own fine-tuned model —
swap MODEL_PATH as soon as you have one, since the base model was never
fine-tuned on BharatMatrix's own data.
"""

import os
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder

MODEL_PATH = os.environ.get("MODEL_PATH", "cross-encoder/ms-marco-MiniLM-L-6-v2")
MAX_PASSAGES = 50  # generous for this app's rerank pool sizes; a hard cap against abuse

app = FastAPI(title="BharatMatrix cross-encoder")

print(f"Loading model: {MODEL_PATH} …")
_load_started = time.time()
model = CrossEncoder(MODEL_PATH)
print(f"Model loaded in {time.time() - _load_started:.1f}s")


class RerankRequest(BaseModel):
    question: str = Field(min_length=1)
    passages: list[str] = Field(min_length=1, max_length=MAX_PASSAGES)


class RerankResponse(BaseModel):
    rankedIndexes: list[int]


@app.get("/")
def health():
    # HF Spaces (and anything else) can hit this to check the Space is
    # awake; the app's own rerankWithCrossEncoder() only ever POSTs.
    return {"status": "ok", "model": MODEL_PATH}


@app.post("/", response_model=RerankResponse)
def rerank(req: RerankRequest):
    if not req.passages:
        raise HTTPException(400, "passages must not be empty")

    pairs = [(req.question, passage) for passage in req.passages]
    scores = model.predict(pairs)

    ranked = sorted(range(len(req.passages)), key=lambda i: scores[i], reverse=True)
    return RerankResponse(rankedIndexes=ranked)
