import { useEffect, useRef, useState } from 'react';

export type ListView = 'board' | 'kanban';

const LABELS: Record<ListView, string> = { board: 'Board view', kanban: 'Kanban view' };

export function ViewToggle({ value, onChange }: { value: ListView; onChange: (v: ListView) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button className="btn secondary" onClick={() => setOpen((o) => !o)}>{LABELS[value]} ▾</button>
      {open && (
        <div className="dropdown-menu">
          {(Object.keys(LABELS) as ListView[]).map((v) => (
            <button key={v} onClick={() => { setOpen(false); onChange(v); }}>{LABELS[v]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
