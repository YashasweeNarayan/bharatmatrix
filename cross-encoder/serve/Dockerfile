# Hugging Face Spaces (Docker SDK) builds and runs this directly — see
# README.md in this folder for the step-by-step Space setup. Port 7860
# is the port HF Spaces expects a Docker Space to listen on.

FROM python:3.11-slim

WORKDIR /app

# Keeps the image smaller — no need for pip's own cache layer, and CPU
# torch (no CUDA) is already the default on PyPI for this platform/
# version combination, which is all a free HF Spaces CPU instance needs.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Downloads/caches the model at build time instead of on every cold
# start — trades a slower image build for a faster first request.
# MODEL_PATH defaults to the base (not fine-tuned) checkpoint; pass
# --build-arg MODEL_PATH=... (or just rely on the runtime env var below)
# once you have your own model on the Hub.
ARG MODEL_PATH=cross-encoder/ms-marco-MiniLM-L-6-v2
ENV MODEL_PATH=${MODEL_PATH}
RUN python -c "from sentence_transformers import CrossEncoder; CrossEncoder('${MODEL_PATH}')"

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
