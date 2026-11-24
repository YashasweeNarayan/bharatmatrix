# How to train the model on more data

More data helps only if the labels are right and the data looks like what
your app will see. Six ways to add it, easiest first. After any of them,
re-run `combine_and_split.py`, then `train.ipynb`, and compare the
"before" and "after" numbers.

## 0. Know what you have

| Source | Rows | Quality | Domain |
|---|---|---|---|
| Public (FinQA, TAT-QA) | thousands | human-labelled | US filings |
| Hand-made (`sample-data/`) | ~190 | checked by me, evidence verified | Indian-style, fictional |
| Synthetic (your uploaded PDFs) | as many as you generate | model-written, can be wrong | your documents |
| Real feedback (app usage) | grows daily | best | your documents |

A few hundred rows will not change a model much on their own. Treat
~190 rows as a **test set**, not a training set, unless you have little else.

## 1. Use the 5 new documents as a held-out Indian-style test (recommended)

```
python qa_to_training.py --out handmade_test.jsonl
```
Upload `handmade_test.jsonl` to Colab with the other files. The notebook
prints Recall@1 / MRR for it before and after training. Because these
documents are never trained on, a rise is evidence the model got better at
Indian-style reports, not that it memorised them.

## 2. Add your own PDFs (the biggest real gain)

1. Upload more PDFs in the app (Documents page) and wait until they show "ready".
2. Generate more synthetic pairs from them:
   ```
   export DATABASE_URL=...  GEMINI_API_KEY=...
   python generate_synthetic_data.py --limit 1000 --out synthetic.jsonl
   ```
3. `python combine_and_split.py --synthetic synthetic.jsonl --feedback feedback.jsonl --public public_train.jsonl`
4. Retrain in Colab.

Synthetic questions can be wrong, so skim 30 rows of `synthetic.jsonl` first.

## 3. Add real usage feedback

Use the app. Every answer logs which passage was cited (positive) and which
were not (negative); a nightly job exports it.
```
BLOB_READ_WRITE_TOKEN=... node download_feedback.mjs feedback.jsonl
```
Real feedback wins over synthetic rows in `combine_and_split.py`.

## 4. Add your own hand-written Q&A

1. Save the text of a document as `sample-data/docs/<name>.txt` (one paragraph or table row per line).
2. Add entries to `sample-data/qa/questions_and_answers.json`. The evidence
   must be copied **exactly** from the .txt:
   ```json
   {"question": "...", "answer": "...", "evidence": [{"doc": "<name>", "text": "exact text from the document"}]}
   ```
3. `python qa_to_training.py --chunk-size 900 --out my_docs.jsonl`
4. Pass it to `combine_and_split.py` as `--feedback my_docs.jsonl` (labels you wrote by hand outrank synthetic ones).

The script prints a warning and skips any question whose evidence text it can't find.

## 5. More public data

`python build_public_dataset.py --include-tatqa --max-questions 8000`
(see `DATASETS.md` for licences; check the file sizes after downloading).

## 6. Let Claude or Gemini write more questions for your PDFs

Paste a document's text and ask for question/answer pairs with the exact
supporting sentence quoted, in the JSON format above. Then run step 4.
Check a sample by hand before training. Model-written pairs without a quoted
supporting sentence are not safe to use as labels.

## Rules that keep the numbers honest

- Never train on a document you also test on. Keep test files separate.
- Keep roughly 3 parts public to 1 part your own data (the `--public-ratio` default).
- If "after" is not better than "before" on your own validation data, don't deploy the new model.
- Redeploy after retraining: push the new model to the same Hub repo and restart the Space (Settings → Factory reboot).
