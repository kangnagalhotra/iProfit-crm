import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentlyViewed } from '../hooks/useRecentlyViewed';
import type { RecentItem } from '../hooks/useRecentlyViewed';
import { Icon } from './Icon';

const TYPE_LABELS: Record<RecentItem['type'], string> = {
  lead: 'Lead', deal: 'Deal', company: 'Company', contact: 'Contact',
};

export function RecentlyViewedMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggle() {
    if (!open) setItems(getRecentlyViewed());
    setOpen((o) => !o);
  }

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button type="button" className="btn secondary btn-icon" title="Recently viewed records" onClick={toggle}>
        <Icon name="clock" size={14} /> Recent
      </button>
      {open && (
        <div className="dropdown-menu" style={{ minWidth: 260 }}>
          {items.length === 0 ? (
            <div className="search-select-empty">Nothing viewed yet</div>
          ) : items.map((r) => (
            <button key={`${r.type}-${r.id}`} type="button" onClick={() => { setOpen(false); navigate(r.to); }}>
              {r.label}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}> · {TYPE_LABELS[r.type]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
