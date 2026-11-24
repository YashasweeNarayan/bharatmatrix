---
title: BharatMatrix Cross Encoder
emoji: 🔎
colorFrom: yellow
colorTo: green
sdk: gradio
app_file: app.py
pinned: false
---

Cross-encoder reranker for BharatMatrix. `POST /` with
`{"question": "...", "passages": ["..."]}` returns `{"rankedIndexes": [...]}`.
Set the `MODEL_PATH` variable to your Hugging Face model repo id.
