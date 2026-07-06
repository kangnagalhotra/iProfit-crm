function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Zero-fills every day in [rangeStart, rangeEnd] so the chart's x-axis is
// continuous, not just the days that happen to have activity.
export function countByDay<T>(
  records: T[],
  dateField: (item: T) => string,
  rangeStart: Date,
  rangeEnd: Date,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = dayKey(new Date(dateField(record)));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days: { date: string; count: number }[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  while (cursor <= end) {
    const key = dayKey(cursor);
    days.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function countBy<T>(
  records: T[],
  keyFn: (item: T) => string,
): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = keyFn(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
