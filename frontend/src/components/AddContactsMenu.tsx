import { useEffect, useRef, useState } from 'react';

export function AddContactsMenu({
  onCreateNew, onImport, label = 'Add leads',
}: { onCreateNew: () => void; onImport: () => void; label?: string }) {
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
      <button className="btn" onClick={() => setOpen((o) => !o)}>{label} ▾</button>
      {open && (
        <div className="dropdown-menu">
          <button onClick={() => { setOpen(false); onCreateNew(); }}>Create new</button>
          <button onClick={() => { setOpen(false); onImport(); }}>Import</button>
        </div>
      )}
    </div>
  );
}
