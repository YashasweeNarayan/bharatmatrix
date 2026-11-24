# BharatMatrix Evaluation Set — Ground Truth Q&A

10 synthetic, market-style finance PDFs (fictional companies, ~4 pages each) and
10 test questions with ground-truth answers, for exercising the Ask / Matrix /
Contradiction-detection pipeline end to end.

## Documents

| # | File | Company (fictional) | Document type |
|---|------|----------------------|----------------|
| 1 | `01_orion_q3_earnings_release.pdf` | Orion Fintech Holdings, Inc. | Q3 FY2026 earnings release |
| 2 | `02_orion_shareholder_letter.pdf` | Orion Fintech Holdings, Inc. | FY2026 shareholder letter |
| 3 | `03_meridian_term_loan_b_summary.pdf` | Meridian Capital Partners | Term Loan B credit agreement summary |
| 4 | `04_vantage_retail_annual_report.pdf` | Vantage Retail Group, Inc. | FY2026 annual report |
| 5 | `05_nimbus_energy_risk_factors.pdf` | Nimbus Energy Corp | 10-K Item 1A risk factors excerpt |
| 6 | `06_cascade_biotech_merger_term_sheet.pdf` | Cascade Biotech, Inc. | Merger term sheet (acquiring Lattice Diagnostics) |
| 7 | `07_orion_fy_results_press_release.pdf` | Orion Fintech Holdings, Inc. | FY2026 full-year results press release |
| 8 | `08_blueharbor_statutory_summary.pdf` | Blue Harbor Insurance Group | FY2026 statutory financial summary |
| 9 | `09_summit_logistics_covenant_cert.pdf` | Summit Logistics Corp | Q3 FY2026 debt covenant compliance certificate |
| 10 | `10_pinecrest_reit_nav_report.pdf` | Pinecrest REIT | Q3 FY2026 NAV & distribution report |

All entities, tickers, and figures are fictional, generated for testing only.
Docs 1, 2, and 7 are three *different* documents about the same company (Orion),
on purpose — they let you test the Matrix grid and contradiction detection
across documents that reference one another, including one deliberate,
unreconciled discrepancy (Q2 below).

---

## Questions and ground truth

**Q1.** What was Orion Fintech Holdings' total revenue for Q3 FY2026, as reported
in its earnings release?
**Ground truth:** $412.6 million (Payments segment $268.1M + Lending segment
$144.5M), up 18% year-over-year from $349.7M in Q3 FY2025.
**Source doc:** `01_orion_q3_earnings_release.pdf`

**Q2. (contradiction test)** Does Orion Fintech Holdings report a consistent Q3
FY2026 revenue figure across its own documents?
**Ground truth:** No. The Q3 earnings release (`01`) states Q3 revenue of
$412.6 million, while the FY2026 shareholder letter (`02`) states Q3 revenue of
$402.3 million for the same quarter — a $10.3 million discrepancy that neither
document explains or reconciles. This is a deliberate test case for the
contradiction-detection feature; a correct system should flag it rather than
silently picking one figure.
**Source docs:** `01_orion_q3_earnings_release.pdf`,
`02_orion_shareholder_letter.pdf`

**Q3.** What is the interest rate margin and SOFR floor on Meridian Capital
Partners' Term Loan B?
**Ground truth:** Term SOFR + 3.25%, subject to a 0.50% SOFR floor.
**Source doc:** `03_meridian_term_loan_b_summary.pdf`

**Q4.** At what total net leverage ratio does Meridian's Term Loan B require a
50% excess-cash-flow sweep?
**Ground truth:** Greater than 3.75x total net leverage ratio triggers a 50%
excess cash flow sweep (25% between 3.00x and 3.75x; 0% at or below 3.00x).
**Source doc:** `03_meridian_term_loan_b_summary.pdf`

**Q5.** What was Vantage Retail Group's gross margin and comparable store sales
growth for FY2026?
**Ground truth:** Gross margin of 38.1% (up 90 bps from 37.2% in FY2025);
comparable store sales growth of 3.8% (up from 2.9% in FY2025).
**Source doc:** `04_vantage_retail_annual_report.pdf`

**Q6.** What percentage of Nimbus Energy Corp's revenue is concentrated in its
top three customers, and what risk does this create?
**Ground truth:** Approximately 38% of FY2026 revenue was concentrated among
Nimbus's three largest offtake customers; the risk factor is customer
concentration — loss of or adverse payment-term changes with any of these
customers could disproportionately affect revenue and cash flow.
**Source doc:** `05_nimbus_energy_risk_factors.pdf`

**Q7.** What is the per-share cash consideration and implied premium in Cascade
Biotech's acquisition of Lattice Diagnostics?
**Ground truth:** $18.50 per share, all cash, implying a 32% premium over
Lattice's 30-day volume-weighted average price (VWAP) prior to announcement,
and an implied equity value of approximately $740 million.
**Source doc:** `06_cascade_biotech_merger_term_sheet.pdf`

**Q8. (cross-doc consistency check — should NOT be flagged as a contradiction)**
Did Orion Fintech's actual FY2026 revenue fall within the full-year guidance
range it gave in its Q3 earnings release?
**Ground truth:** Yes. The Q3 earnings release (`01`) raised full-year FY2026
guidance to $1.58B–$1.61B. The full-year results press release (`07`) reports
actual FY2026 revenue of $1.593 billion, which falls within that guided range.
This is a good negative control: the system should recognize this as
consistent, not flag it as a contradiction.
**Source docs:** `01_orion_q3_earnings_release.pdf`,
`07_orion_fy_results_press_release.pdf`

**Q9.** Was Summit Logistics Corp in compliance with its leverage and fixed
charge coverage covenants in Q3 FY2026?
**Ground truth:** Yes. Total leverage ratio was 2.94x against a maximum of
3.50x; fixed charge coverage ratio was 1.61x against a minimum of 1.25x. Both
covenants were in compliance, certified by the CFO (Daniel Osei).
**Source doc:** `09_summit_logistics_covenant_cert.pdf`

**Q10.** What was Pinecrest REIT's estimated NAV per share and quarterly
distribution for Q3 FY2026?
**Ground truth:** Estimated NAV per share of $24.18 (up from $23.65 in Q2
FY2026); quarterly distribution declared of $0.265 per share, an annualized
yield of 5.1% on estimated NAV.
**Source doc:** `10_pinecrest_reit_nav_report.pdf`

---

## Suggested test workflow

1. Upload all 10 PDFs and let indexing/embedding complete.
2. Ask questions Q1, Q3–Q7, Q9, Q10 individually via the Ask feature — single-document,
   straightforward factual grounding; check the answer and citation against the
   ground truth and source page above.
3. Add all 10 questions as Matrix columns across all 10 documents, to check the
   grid handles irrelevant document/question pairs gracefully (e.g. asking Q3's
   loan-covenant question against the REIT document should come back ungrounded,
   not hallucinated).
4. Run contradiction detection on a question like "What was Orion's Q3 FY2026
   revenue?" across documents 1, 2, and 7 — this is the one case that **should**
   surface a flagged contradiction (Q2 above). Then run it on a guidance/actual
   comparison across documents 1 and 7 — this is the negative control that
   **should not** be flagged (Q8 above).
