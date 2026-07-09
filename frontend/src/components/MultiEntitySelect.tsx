import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { Icon } from './Icon';

// Generic multi-select-with-chips editor — add via search, remove via a row
// button. Used for many-to-many associations (Lead<->Contact) that don't
// need a per-row role, unlike MultiContactRoleSelect.
export function MultiEntitySelect({
  options, value, onChange, placeholder = 'Add…',
}: {
  options: SearchSelectOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const available = options.filter((o) => !value.includes(o.value));

  function add(id: string) {
    if (!id || value.includes(id)) return;
    onChange([...value, id]);
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div>
      <SearchSelect options={available} value="" onChange={add} placeholder={placeholder} />
      {value.length > 0 && (
        <div className="multi-contact-rows">
          {value.map((id) => {
            const opt = options.find((o) => o.value === id);
            return (
              <div className="multi-contact-row" key={id}>
                <span className="multi-contact-name">{opt?.label ?? 'Unknown'}</span>
                <button type="button" className="row-remove-btn" onClick={() => remove(id)} aria-label="Remove">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
