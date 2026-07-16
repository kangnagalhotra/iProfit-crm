// Generic "pick from a list, but Other reveals a free-text box" pattern —
// used everywhere an enum-like field has an OTHER value that should let the
// user say what they actually mean, instead of the value being discarded.
export function SelectWithOther({
  options, value, onChange, otherValue, onOtherChange, onOtherBlur, otherTriggerValue = 'OTHER', emptyLabel = '—', disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
  onOtherBlur?: (v: string) => void;
  otherTriggerValue?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {value === otherTriggerValue && (
        <input
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          onBlur={onOtherBlur ? (e) => onOtherBlur(e.target.value) : undefined}
          placeholder="Please specify…"
          style={{ marginTop: 6 }}
        />
      )}
    </div>
  );
}
