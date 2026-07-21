import { SearchSelect } from './SearchSelect';

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
        <div key={f.key} className="filter-bar-field">
          <SearchSelect
            options={f.options}
            value={values[f.key] ?? ''}
            onChange={(v) => onChange({ ...values, [f.key]: v })}
            placeholder={`${f.label}: All`}
          />
        </div>
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
