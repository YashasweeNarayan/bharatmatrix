"""
Gradio-SDK version of the cross-encoder service, for Hugging Face accounts
where the Docker SDK isn't available. Same contract as serve/app.py:

    POST /  { "question": str, "passages": [str, ...] }
         -> { "rankedIndexes": [int, ...], "scored": int, "ms": int }

Gradio Spaces run `python app.py` and expose port 7860. We start our own
FastAPI server there (so POST / works exactly as the Next.js app expects)
and mount a tiny Gradio page on /ui so the Space still has a working UI.

Env (Space variables): MODEL_PATH, MAX_RERANK (default 40), MAX_LENGTH (256).
NOT run in the sandbox this was written in (no torch/gradio available) —
check the Space's Logs tab on first start.
"""

import os
import time

import gradio as gr
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import CrossEncoder

from ranking import rank_with_cap

MODEL_PATH = os.environ.get("MODEL_PATH", "yashaswee22/bharatmatrix-cross-encoder")
MAX_RERANK = int(os.environ.get("MAX_RERANK", "40"))
MAX_LENGTH = int(os.environ.get("MAX_LENGTH", "256"))
MAX_PASSAGES_ACCEPTED = 300

print(f"Loading model: {MODEL_PATH} (max_length={MAX_LENGTH}) …")
model = CrossEncoder(MODEL_PATH, max_length=MAX_LENGTH)
print("Model loaded")

app = FastAPI(title="BharatMatrix cross-encoder")


class RerankRequest(BaseModel):
    question: str = Field(min_length=1)
    passages: list[str] = Field(min_length=1, max_length=MAX_PASSAGES_ACCEPTED)


def do_rank(question: str, passages: list[str]):
    started = time.time()
    head = passages[:MAX_RERANK]
    scores = model.predict([(question, p) for p in head])
    ranked = rank_with_cap([float(s) for s in scores], len(passages))
    ms = int((time.time() - started) * 1000)
    print(f"reranked {len(head)}/{len(passages)} passages in {ms}ms")
    return ranked, len(head), ms


@app.post("/")
def rerank(req: RerankRequest):
    if not req.passages:
        raise HTTPException(400, "passages must not be empty")
    ranked, scored, ms = do_rank(req.question, req.passages)
    return {"rankedIndexes": ranked, "scored": scored, "ms": ms}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH, "max_rerank": MAX_RERANK, "max_length": MAX_LENGTH}


def ui_fn(question: str, passages_text: str):
    passages = [p.strip() for p in passages_text.split("\n") if p.strip()]
    if not question.strip() or not passages:
        return "Enter a question and one passage per line."
    ranked, _, ms = do_rank(question, passages)
    return f"{ms} ms\n" + "\n".join(f"{n + 1}. {passages[i]}" for n, i in enumerate(ranked))


demo = gr.Interface(
    fn=ui_fn,
    inputs=[gr.Textbox(label="Question"), gr.Textbox(label="Passages (one per line)", lines=6)],
    outputs=gr.Textbox(label="Ranked"),
    title=f"BharatMatrix cross-encoder ({MODEL_PATH})",
    flagging_mode="never",
)
app = gr.mount_gradio_app(app, demo, path="/ui")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
