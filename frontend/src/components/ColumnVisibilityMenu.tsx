import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
}

export function ColumnVisibilityMenu({
  columns, visible, onChange,
}: {
  columns: ColumnDef[];
  visible: string[];
  onChange: (visible: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggle(key: string) {
    if (visible.includes(key)) onChange(visible.filter((k) => k !== key));
    else onChange([...visible, key]);
  }

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button type="button" className="btn secondary btn-icon" title="Choose which fields show in this list" onClick={() => setOpen((o) => !o)}>
        <Icon name="columns" size={14} /> Manage Fields
      </button>
      {open && (
        <div className="dropdown-menu column-visibility-menu">
          {columns.map((c) => (
            <label key={c.key} className="column-visibility-item">
              <input
                type="checkbox"
                checked={visible.includes(c.key)}
                disabled={c.required}
                onChange={() => toggle(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
