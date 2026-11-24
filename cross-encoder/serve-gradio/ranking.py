"""
Pure-Python ranking logic for the cross-encoder service, kept separate
from app.py (which needs torch/sentence-transformers to even import) so
it can be tested anywhere.

Why a cap exists: the app's hybrid retrieval hands the reranker its whole
fused candidate pool — up to 60 dense + 60 keyword rows, i.e. up to ~120
passages after fusion (CANDIDATE_POOL_LIMIT in src/lib/retrieve.ts) —
and only keeps the top 20 afterwards. Scoring all ~120 on a free-tier CPU
Space would regularly blow past the app's 2.5s timeout and make every
request fall back to Gemini anyway. The pool arrives in RRF order (best
first), so scoring only the first `max_rerank` and leaving the tail in
its original order costs very little ranking quality for a large, bounded
latency win.
"""

from typing import Sequence


def rank_with_cap(scores: Sequence[float], total: int) -> list[int]:
    """
    `scores` holds the model's scores for passages 0..len(scores)-1 (the
    head of the pool that was actually scored); `total` is the full number
    of passages received. Returns a complete permutation of range(total):
    the scored head sorted best-first, then the unscored tail in its
    original (RRF) order.
    """
    scored = len(scores)
    if scored > total:
        raise ValueError("more scores than passages")
    head = sorted(range(scored), key=lambda i: scores[i], reverse=True)
    tail = list(range(scored, total))
    return head + tail
