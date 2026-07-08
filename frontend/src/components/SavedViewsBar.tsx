import { useState } from 'react';
import { Icon } from './Icon';

export interface SavedViewSummary {
  id: string;
  name: string;
}

export function SavedViewsBar({
  views, activeViewId, isDirty, onSelect, onSave, onUpdate, onDelete,
}: {
  views: SavedViewSummary[];
  activeViewId: string | null;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
  onSave: (name: string) => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  function submitNew() {
    const trimmed = name.trim();
    setCreating(false);
    setName('');
    if (trimmed) onSave(trimmed);
  }

  return (
    <div className="quick-filter-chips saved-views-bar">
      <button type="button" className={`chip-filter${activeViewId === null ? ' active' : ''}`} onClick={() => onSelect(null)}>
        All
      </button>
      {views.map((v) => (
        <span key={v.id} className="saved-view-chip-wrap">
          <button
            type="button"
            className={`chip-filter${activeViewId === v.id ? ' active' : ''}`}
            onClick={() => onSelect(v.id)}
          >
            {v.name}
          </button>
          {activeViewId === v.id && (
            <span className="saved-view-actions">
              {isDirty && <button type="button" className="saved-view-action" onClick={onUpdate}>Update</button>}
              <button type="button" className="saved-view-action" title="Delete view" onClick={() => onDelete(v.id)}>
                <Icon name="trash" size={12} />
              </button>
            </span>
          )}
        </span>
      ))}
      {creating ? (
        <input
          autoFocus
          className="saved-view-new-input"
          value={name}
          placeholder="View name"
          onChange={(e) => setName(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setCreating(false); setName(''); }
          }}
        />
      ) : (
        <button type="button" className="chip-filter" onClick={() => setCreating(true)}>+ Save view</button>
      )}
    </div>
  );
}
