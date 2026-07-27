// Same "visual-only formatting, raw value in state" pattern as
// formatPhoneDisplay/stripPhoneDigits in validation.ts — a money <input>
// can't be type="number" and show commas at the same time (browsers reject
// non-digit characters in those), so these swap it to a plain text input
// that displays Indian-grouped digits (1,00,000) while the form/DB value
// stays a raw numeric string underneath.

// Strips everything but digits and a single decimal point — used as the
// onChange handler so letters/extra dots/commas can never be typed or pasted in.
export function stripCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
}

// Visual-only Indian digit grouping (1,00,000.00); the underlying form/DB
// value stays the raw numeric string from stripCurrencyInput above.
export function formatCurrencyInput(raw: string): string {
  if (!raw) return '';
  const dotIdx = raw.indexOf('.');
  const intPart = dotIdx === -1 ? raw : raw.slice(0, dotIdx);
  const afterPoint = dotIdx === -1 ? '' : raw.slice(dotIdx);
  if (!intPart) return raw;
  let lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  if (otherNumbers !== '') lastThree = `,${lastThree}`;
  const grouped = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  return grouped + afterPoint;
}
