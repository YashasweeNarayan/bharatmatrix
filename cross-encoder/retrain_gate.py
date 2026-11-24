"""
The promote / don't-promote decision for automatic retraining, kept free of
torch so it can be tested anywhere. A candidate model replaces the live one
only if EVERY rule below passes. Each metric is (n_questions, recall@1, mrr).

Why these rules:
  * The own-data validation set must be big enough to mean something
    (MIN_VAL_QUESTIONS). With 10 questions a score of 1.000 says nothing.
  * The candidate must beat the live model on your own validation data by a
    margin (it is the check that matters for your documents)...
  * ...without getting worse on the independent public test set or the
    hand-made Indian-style set (small allowances for noise).
Caveat: the training loop picks its best epoch using the own validation set,
so that number is slightly optimistic; the other two sets are independent.
"""

MIN_VAL_QUESTIONS = 50
VAL_MARGIN = 0.01          # candidate MRR must exceed live MRR by this on own val
PUBLIC_TOLERANCE = 0.005   # allowed MRR drop on public_test (500 questions)
HANDMADE_TOLERANCE = 0.02  # allowed MRR drop on handmade (only ~48 questions)


def decide(live: dict, cand: dict) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    ok = True

    val_live, val_cand = live.get("val"), cand.get("val")
    if not val_live or not val_cand or val_cand[0] < MIN_VAL_QUESTIONS:
        n = val_cand[0] if val_cand else 0
        return False, [f"own validation set has {n} questions; need at least {MIN_VAL_QUESTIONS} to decide"]

    if val_cand[2] >= val_live[2] + VAL_MARGIN:
        reasons.append(f"val MRR {val_live[2]:.3f} -> {val_cand[2]:.3f}: improved by the required margin")
    else:
        ok = False
        reasons.append(f"val MRR {val_live[2]:.3f} -> {val_cand[2]:.3f}: not improved by {VAL_MARGIN}")

    for name, tol in (("public_test", PUBLIC_TOLERANCE), ("handmade", HANDMADE_TOLERANCE)):
        a, b = live.get(name), cand.get(name)
        if not a or not b:
            reasons.append(f"{name}: not available, skipped")
            continue
        if b[2] >= a[2] - tol:
            reasons.append(f"{name} MRR {a[2]:.3f} -> {b[2]:.3f}: no regression")
        else:
            ok = False
            reasons.append(f"{name} MRR {a[2]:.3f} -> {b[2]:.3f}: regressed by more than {tol}")
    return ok, reasons
