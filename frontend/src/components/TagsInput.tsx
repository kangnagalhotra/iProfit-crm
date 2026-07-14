import { useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface TagsInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

// Deterministic tag colors: the same tag text always hashes to the same hue,
// so "enterprise" is the same color on every lead/deal without any config.
const TAG_COLORS = ['#025ADF', '#16A34A', '#8B5CF6', '#F97316', '#DC2626', '#0891B2', '#DB2777', '#65A30D'];

export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export function TagsInput({ value, onChange, placeholder = 'Add a tag…' }: TagsInputProps) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const tag = raw.trim();
    if (!tag || value.some((t) => t.toLowerCase() === tag.toLowerCase())) { setDraft(''); return; }
    onChange([...value, tag]);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(draft); } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="tags-input">
        {value.map((tag) => {
          const color = tagColor(tag);
          return (
            <span className="tag-chip" key={tag} style={{ background: color + '1A', color, borderColor: color + '55' }}>
              <span className="tag-chip-dot" style={{ background: color }} />
              {tag}
              <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>×</button>
            </span>
          );
        })}
        <input
          className="tags-input-field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : '+ Add another…'}
        />
      </div>
      <div className="helper-text" style={{ marginTop: 4 }}>Press Enter or comma to add a tag; Backspace removes the last one.</div>
    </div>
  );
}
