# Datasets for the cross-encoder

What was considered for training/evaluating the reranker, what is used, and
what was left out. Licences were read from each dataset's own card/README
at the time of writing (2026-11); **re-check before relying on this** —
cards change, and none of this is legal advice. For an M.Tech project the
safe rule is: use only what permits it, cite everything, and say so in the
report.

## What the model needs

Rows of `{question, passage, label}` where `passage` looks like what the
app actually reranks: a chunk of at most 900 characters from a financial
report, and `label` is 1 when the passage answers the question.

## Used

| Dataset | What it is | Licence | How it is used |
|---|---|---|---|
| **FinQA** (Chen et al., EMNLP 2021) — `czyssrs/FinQA`, mirrored as `ibm/finqa` | ~8k numerical-reasoning questions over S&P 500 earnings reports (text + tables), each with annotated evidence sentences/rows (`gold_inds`) | CC BY 4.0 (per the HF card) | Default. **train** split → `public_train.jsonl`; **test** split → `public_test.jsonl` (held-out, only used to measure) |
| **TAT-QA** (Zhu et al., ACL 2021) — `NExTplusplus/TAT-QA` | ~16k questions over annual-report text + tables, with relevant-paragraph labels | CC BY 4.0 (per the HF card `next-tat/TAT-QA`) | Opt-in: `--include-tatqa` |

The evidence annotations are what make these usable for a reranker: they say
*which* part of the report answers the question, so a positive is real, not
guessed. Reports are re-chunked to ≤900 characters, and negatives are other
chunks from the same report (the hard kind) plus one from a different
report.

## Opt-in, check the licence yourself

| Dataset | Why not on by default |
|---|---|
| `virattt/financial-qa-10K` (`--include-financial-qa-10k`) | Question + context pairs from 10-Ks, but I could not read a licence from the sources available to me. Look at its Hugging Face card; enable only if it permits your use. Its "context" is a short extract, so negatives are weaker. |
| **FinDER** | CC BY-NC 4.0 (non-commercial) and distributed by request; an academic project may qualify, but it is not downloaded automatically and is not wired in. |

## Evaluation only (never trained on)

| Dataset | Note |
|---|---|
| `mteb/FinQARetrieval` | MIT, but it only ships a *test* split — good as an independent retrieval benchmark, no training data. Not wired in; run it separately if you want a number for the report. |
| **FiQA** | Research-only licence and test-oriented; same treatment. |

## Excluded

| Dataset | Why |
|---|---|
| **IndFin-Bench** (Indian financial QA) | The only Indian-company set I found, but its licence prohibits training use, and it has no evidence passages — it cannot supply positives for a reranker anyway. |

## The gap to be honest about

Everything usable above is **US** filings (USD, GAAP, SEC 10-K/earnings
style). None are Indian annual reports (crore/lakh, Ind AS, SEBI/BSE/NSE
disclosures). So public data is a head start on the *task*; the Indian
domain has to come from your own documents — that is exactly what
`generate_synthetic_data.py` and the real-usage feedback log provide, and
why `combine_and_split.py` caps public rows at 3x your own and keeps
validation entirely your own data.

For the report: compare Recall@1/MRR *before* vs *after* fine-tuning on
`val` (your documents) and `public_test` (general finance QA) — `train.ipynb`
prints both.

## Known unverified points

- `build_public_dataset.py` has not run on the real downloads (no network
  path to GitHub/Hugging Face from where it was written). Its FinQA loader
  assumes `text_N` indexes `pre_text + post_text` in order and `table_N`
  indexes table rows; it checks this against the quoted evidence text and
  warns if more than 20% of keys don't match.
- Cross-encoder latency on a free CPU Space has not been measured.
