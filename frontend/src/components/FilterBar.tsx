export interface FilterFieldOption {
  value: string;
  label: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: FilterFieldOption[];
}

export function FilterBar({
  fields, values, onChange,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const hasActive = Object.values(values).some(Boolean);

  return (
    <div className="filter-bar">
      {fields.map((f) => (
        <select
          key={f.key}
          value={values[f.key] ?? ''}
          onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {hasActive && (
        <button
          type="button"
          className="btn secondary"
          onClick={() => onChange(Object.fromEntries(fields.map((f) => [f.key, ''])))}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
