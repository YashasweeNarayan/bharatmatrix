# Hugging Face Spaces (Docker SDK) builds and runs this directly — see
# README.md in this folder for the step-by-step Space setup.
#
# Follows the pattern in HF's own Docker Spaces docs: Spaces run the
# container as user ID 1000, so everything (pip installs, the model cache,
# the app files) has to belong to a user with that ID, not root. An
# earlier version of this file downloaded the model as root, which would
# have put the cache somewhere the runtime user can't see — meaning a
# full re-download (or a PermissionError) on every cold start.

FROM python:3.11-slim

RUN useradd -m -u 1000 user
USER user

ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user app.py ranking.py ./

# Space *variables* are passed to the build as build args (HF docs), which
# is how setting MODEL_PATH in the Space's settings reaches this line. It
# bakes the model into the image so a cold start doesn't also have to
# download it. Defaults to the untrained base checkpoint — GET / on the
# running Space reports which model it actually loaded.
ARG MODEL_PATH=cross-encoder/ms-marco-MiniLM-L-6-v2
ENV MODEL_PATH=${MODEL_PATH}
RUN python -c "import os; from sentence_transformers import CrossEncoder; CrossEncoder(os.environ['MODEL_PATH'])"

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
