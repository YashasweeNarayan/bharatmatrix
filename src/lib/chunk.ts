export type Chunk = {
  pageLabel: string;
  ordinal: number;
  content: string;
};

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

/**
 * Splits extracted pages into overlapping chunks small enough to embed
 * cleanly and specific enough to cite precisely. Every chunk keeps the
 * page/sheet label of the page it came from, so a citation can always
 * point back to a real location in the source document.
 */
export function chunkPages(
  pages: { label: string; content: string }[],
): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const page of pages) {
    const text = page.content.trim();
    if (text.length === 0) continue;

    if (text.length <= CHUNK_SIZE) {
      chunks.push({ pageLabel: page.label, ordinal: ordinal++, content: text });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const slice = text.slice(start, end).trim();
      if (slice) {
        chunks.push({
          pageLabel: page.label,
          ordinal: ordinal++,
          content: slice,
        });
      }
      if (end === text.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }

  return chunks;
}
