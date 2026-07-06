export function formatChange(
  label: string,
  oldVal: string | number | null | undefined,
  newVal: string | number | null | undefined,
): string | null {
  const oldStr = oldVal === null || oldVal === undefined || oldVal === '' ? '—' : String(oldVal);
  const newStr = newVal === null || newVal === undefined || newVal === '' ? '—' : String(newVal);
  if (oldStr === newStr) return null;
  return `${label} changed: ${oldStr} → ${newStr}`;
}
