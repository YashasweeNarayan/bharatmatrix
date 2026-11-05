// Shared matrix/report types — used by MatrixTable.tsx and ReportPanel.tsx.
// Pulled out of MatrixTable.tsx (Step 7) so the report panel doesn't need
// its own copy that could quietly drift out of sync with the grid's.

export type CellStatus = "pending" | "computing" | "ready" | "failed";

export type Citation = {
  documentId: string;
  pageLabel: string;
  quote: string;
};

export type Cell = {
  document_id: string;
  question_id: string;
  status: CellStatus;
  answer: string | null;
  grounded: boolean | null;
  citations: Citation[] | null;
  verification_note: string | null;
  error: string | null;
};

export type DocumentRow = { id: string; filename: string };
export type Question = { id: string; text: string };

export type ContradictionStatus = "pending" | "computing" | "ready" | "failed";

export type Contradiction = {
  question_id: string;
  status: ContradictionStatus;
  has_contradiction: boolean | null;
  explanation: string | null;
  error: string | null;
};

export type MatrixData = {
  documents: DocumentRow[];
  questions: Question[];
  cells: Cell[];
  contradictions: Contradiction[];
};

export function cellKey(documentId: string, questionId: string) {
  return `${documentId}::${questionId}`;
}

// citations comes from a Postgres jsonb column. It should already arrive as
// a parsed array, but this guards against it ever being a JSON string, a
// single object, or anything else malformed — rendering with `.map` on
// something that isn't an array is what crashed the whole page on click,
// back in Step 4.
export function citationsOf(cell: Cell | null | undefined): Citation[] {
  const raw = cell?.citations;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
