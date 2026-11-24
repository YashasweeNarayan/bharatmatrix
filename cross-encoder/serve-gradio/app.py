"""
Gradio-SDK cross-encoder service for FREE Hugging Face accounts, where the
only free Gradio hardware is ZeroGPU (CPU Basic and Docker need PRO).

Why it looks odd:
  * ZeroGPU refuses to start a Space that has no @spaces.GPU function, so
    `_gpu_probe` exists purely to satisfy that check. We never call it.
  * The model is pinned to device="cpu". ZeroGPU emulates CUDA at startup,
    and a model that lands on that emulated GPU breaks outside a GPU call.
    22M parameters scoring ~40 short passages is fine on CPU.
  * The endpoint is Gradio's own API (`api_name="rerank"`), not a custom
    POST /, because that's the route ZeroGPU supports. src/lib/crossEncoder.ts
    talks to it when CROSS_ENCODER_MODE=gradio.

Input : question (str), passages_json (str: JSON array of strings)
Output: JSON string {"rankedIndexes": [...], "scored": n, "ms": n}

NOT run where it was written (no torch/gradio there) — check the Space's
Logs tab on first start. Env: MODEL_PATH, MAX_RERANK (40), MAX_LENGTH (256).
"""

import json
import os
import time

import gradio as gr
from sentence_transformers import CrossEncoder

from ranking import rank_with_cap

try:
    import spaces  # preinstalled on ZeroGPU Spaces

    @spaces.GPU
    def _gpu_probe():
        return 0

except ImportError:  # running somewhere else (local test) — not needed
    pass

MODEL_PATH = os.environ.get("MODEL_PATH", "yashaswee22/bharatmatrix-cross-encoder")
MAX_RERANK = int(os.environ.get("MAX_RERANK", "40"))
MAX_LENGTH = int(os.environ.get("MAX_LENGTH", "256"))
MAX_PASSAGES_ACCEPTED = 300

print(f"Loading model: {MODEL_PATH} (cpu, max_length={MAX_LENGTH}) …")
model = CrossEncoder(MODEL_PATH, max_length=MAX_LENGTH, device="cpu")
print("Model loaded")


def rerank(question: str, passages_json: str) -> str:
    passages = json.loads(passages_json)
    if not isinstance(passages, list) or not passages or len(passages) > MAX_PASSAGES_ACCEPTED:
        raise gr.Error("passages must be a non-empty JSON array (max 300)")
    started = time.time()
    head = passages[:MAX_RERANK]
    scores = model.predict([(question, p) for p in head], show_progress_bar=False)
    ranked = rank_with_cap([float(s) for s in scores], len(passages))
    ms = int((time.time() - started) * 1000)
    print(f"reranked {len(head)}/{len(passages)} passages in {ms}ms")
    return json.dumps({"rankedIndexes": ranked, "scored": len(head), "ms": ms})


demo = gr.Interface(
    fn=rerank,
    inputs=[
        gr.Textbox(label="Question"),
        gr.Textbox(label='Passages as a JSON array, e.g. ["first", "second"]', lines=6),
    ],
    outputs=gr.Textbox(label="Result"),
    title=f"BharatMatrix cross-encoder — {MODEL_PATH}",
    api_name="rerank",
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.launch()
