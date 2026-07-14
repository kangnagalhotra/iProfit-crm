import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export function SearchSelect({
  options, value, onChange, placeholder = 'Select…', allowCustom = false, renderAvatar, onCreateNew, createNewLabel = '+ Add new',
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  renderAvatar?: (opt: SearchSelectOption) => ReactNode;
  onCreateNew?: () => void;
  createNewLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  // Falls back to the raw stored value (not just for allowCustom fields) so pre-existing
  // free-text data that doesn't match a fixed option list still displays instead of going blank.
  const selectedLabel = selected ? selected.label : value;

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const customRowVisible = !!(allowCustom && query.trim()
    && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()));
  const itemCount = filtered.length + (customRowVisible ? 1 : 0);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  function openMenu() {
    setOpen(true);
    setHighlight(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { openMenu(); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { setHighlight((h) => Math.min(h + 1, itemCount - 1)); e.preventDefault(); } else if (e.key === 'ArrowUp') { setHighlight((h) => Math.max(h - 1, 0)); e.preventDefault(); } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < filtered.length && filtered[highlight]) commit(filtered[highlight].value);
      else if (customRowVisible) commit(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery('');
      inputRef.current?.blur();
    }
  }

  return (
    <div className="search-select" ref={ref}>
      <div className="search-select-control" onClick={openMenu}>
        {!open && selected && renderAvatar && renderAvatar(selected)}
        <input
          ref={inputRef}
          className="search-select-input"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {value && (
          <button
            type="button"
            className="search-select-clear"
            onClick={(e) => { e.stopPropagation(); commit(''); }}
            title="Clear"
          >×
          </button>
        )}
        <span className="search-select-caret">▾</span>
      </div>
      {open && (
        <div className="search-select-menu">
          {onCreateNew && (
            <button
              type="button"
              className="search-select-option search-select-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); setQuery(''); onCreateNew(); }}
            >
              {createNewLabel}
            </button>
          )}
          {filtered.map((o, i) => (
            <button
              type="button"
              key={o.value}
              className={`search-select-option${i === highlight ? ' highlight' : ''}${o.value === value ? ' selected' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o.value)}
              onMouseEnter={() => setHighlight(i)}
            >
              {renderAvatar && renderAvatar(o)}
              <span>{o.label}</span>
              {o.sublabel && <span className="search-select-sublabel">{o.sublabel}</span>}
            </button>
          ))}
          {customRowVisible && (
            <button
              type="button"
              className={`search-select-option${highlight === filtered.length ? ' highlight' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(query.trim())}
            >
              Add "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && !customRowVisible && !onCreateNew && (
            <div className="search-select-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
