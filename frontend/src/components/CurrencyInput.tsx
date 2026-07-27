import { useRef, useLayoutEffect } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { formatCurrencyInput, stripCurrencyInput } from '../utils/currencyInput';

// A money <input> that live-formats with Indian comma grouping as you type
// (see utils/currencyInput.ts) while keeping the caret where the user is
// actually typing — reformatting on every keystroke shifts comma positions,
// so a naive controlled input yanks the cursor to the end after the first
// mid-string edit. Fix: count digit/decimal characters (ignoring commas)
// before the caret in the pre-format string, then place the caret after the
// same count of digit/decimal characters in the freshly-formatted string —
// that count is invariant to where commas fall.
export function CurrencyInput({
  value, onChange, placeholder, autoFocus, style, onBlur, onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: CSSProperties;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const before = e.target.value;
    const caret = e.target.selectionStart ?? before.length;
    const digitsBeforeCaret = (before.slice(0, caret).match(/[\d.]/g) ?? []).length;

    const raw = stripCurrencyInput(before);
    const formatted = formatCurrencyInput(raw);

    let count = 0;
    let newCaret = formatted.length;
    if (digitsBeforeCaret === 0) {
      newCaret = 0;
    } else {
      for (let i = 0; i < formatted.length; i += 1) {
        if (/[\d.]/.test(formatted[i])) count += 1;
        if (count === digitsBeforeCaret) { newCaret = i + 1; break; }
      }
    }

    pendingCaret.current = newCaret;
    onChange(raw);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      value={formatCurrencyInput(value)}
      onChange={handleChange}
      placeholder={placeholder}
      style={style}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
