export type DateGroup<T> = { label: string; items: T[] };

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Groups items (already sorted newest first) under date headings the way
 * chat apps do: Today, Yesterday, then one heading per older calendar day.
 * Uses the viewer's local time zone, so "Today" means their today.
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  now: Date = new Date(),
): DateGroup<T>[] {
  const today = dayStart(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const groups: DateGroup<T>[] = [];
  let currentKey: number | null = null;
  for (const item of items) {
    const d = new Date(getDate(item));
    const key = dayStart(d);
    let label: string;
    if (key === today) label = "Today";
    else if (key === today - dayMs) label = "Yesterday";
    else
      label = d.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    if (key !== currentKey) {
      groups.push({ label, items: [] });
      currentKey = key;
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}
