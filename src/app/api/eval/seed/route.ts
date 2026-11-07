import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The 10 ground-truth question/expected-answer pairs for the synthetic
 * finance PDF eval set (see GROUND_TRUTH_QA.md delivered alongside the
 * 10 test PDFs). Hardcoded here rather than requiring manual entry in the
 * UI, since this is a fixed, known-good test fixture, not something a
 * user is expected to author from scratch. Q2 and Q8 are the deliberate
 * contradiction / negative-control cases across the three Orion documents.
 */
const SEED_CASES = [
  {
    question:
      "What was Orion Fintech Holdings' total revenue for Q3 FY2026, as reported in its earnings release?",
    expected_answer:
      "$412.6 million (Payments segment $268.1M + Lending segment $144.5M), up 18% year-over-year from $349.7M in Q3 FY2025.",
  },
  {
    question:
      "Does Orion Fintech Holdings report a consistent Q3 FY2026 revenue figure across its own documents?",
    expected_answer:
      "No — the Q3 earnings release states Q3 revenue of $412.6 million, while the FY2026 shareholder letter states Q3 revenue of $402.3 million for the same quarter, a $10.3 million discrepancy that neither document explains.",
  },
  {
    question:
      "What is the interest rate margin and SOFR floor on Meridian Capital Partners' Term Loan B?",
    expected_answer: "Term SOFR + 3.25%, subject to a 0.50% SOFR floor.",
  },
  {
    question:
      "At what total net leverage ratio does Meridian's Term Loan B require a 50% excess-cash-flow sweep?",
    expected_answer:
      "Greater than 3.75x total net leverage ratio (25% sweep between 3.00x and 3.75x; 0% at or below 3.00x).",
  },
  {
    question:
      "What was Vantage Retail Group's gross margin and comparable store sales growth for FY2026?",
    expected_answer:
      "Gross margin of 38.1% (up 90 bps from 37.2% in FY2025); comparable store sales growth of 3.8% (up from 2.9% in FY2025).",
  },
  {
    question:
      "What percentage of Nimbus Energy Corp's revenue is concentrated in its top three customers, and what risk does this create?",
    expected_answer:
      "Approximately 38% of FY2026 revenue; the risk is customer concentration — loss of or adverse payment-term changes with any of these customers could disproportionately affect revenue and cash flow.",
  },
  {
    question:
      "What is the per-share cash consideration and implied premium in Cascade Biotech's acquisition of Lattice Diagnostics?",
    expected_answer:
      "$18.50 per share, all cash, a 32% premium over Lattice's 30-day VWAP prior to announcement, implying an equity value of approximately $740 million.",
  },
  {
    question:
      "Did Orion Fintech's actual FY2026 revenue fall within the full-year guidance range it gave in its Q3 earnings release?",
    expected_answer:
      "Yes — guidance given alongside Q3 results was $1.58B-$1.61B, and actual FY2026 revenue reported in the full-year results press release was $1.593 billion, within that range.",
  },
  {
    question:
      "Was Summit Logistics Corp in compliance with its leverage and fixed charge coverage covenants in Q3 FY2026?",
    expected_answer:
      "Yes — total leverage ratio was 2.94x against a maximum of 3.50x; fixed charge coverage ratio was 1.61x against a minimum of 1.25x.",
  },
  {
    question:
      "What was Pinecrest REIT's estimated NAV per share and quarterly distribution for Q3 FY2026?",
    expected_answer:
      "Estimated NAV per share of $24.18 (up from $23.65 in Q2 FY2026); quarterly distribution declared of $0.265 per share, a 5.1% annualized yield on estimated NAV.",
  },
];

/**
 * Idempotent: only inserts the fixed seed set if eval_questions is
 * currently empty, so clicking it twice (or it firing from a stale
 * client state) doesn't duplicate the set. Each question gets a
 * matching eval_results row created up front with status='pending', so
 * /api/eval/step can drain them the same way embed-step drains chunks —
 * no separate "queue" call needed.
 */
export async function POST() {
  await ensureSchema();

  const [{ count }] = await sql`select count(*)::int as count from eval_questions`;
  if (count > 0) {
    return NextResponse.json({ inserted: 0, alreadySeeded: true });
  }

  for (let i = 0; i < SEED_CASES.length; i++) {
    const c = SEED_CASES[i];
    const [row] = await sql`
      insert into eval_questions (question, expected_answer, ordinal)
      values (${c.question}, ${c.expected_answer}, ${i})
      returning id
    `;
    await sql`
      insert into eval_results (eval_question_id, status)
      values (${row.id}, 'pending')
    `;
  }

  return NextResponse.json({ inserted: SEED_CASES.length, alreadySeeded: false });
}
