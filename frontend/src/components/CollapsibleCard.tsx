import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function CollapsibleCard({
  title, defaultOpen = true, storageKey, actions, children,
}: {
  title: string;
  defaultOpen?: boolean;
  storageKey?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) return stored === '1';
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, open ? '1' : '0');
  }, [open, storageKey]);

  return (
    <div className="card collapsible-card">
      <div className="collapsible-card-header" onClick={() => setOpen((o) => !o)}>
        <h3>{title}</h3>
        {actions && (
          <div className="collapsible-card-header-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
        <button
          type="button"
          className={`collapsible-card-chevron${open ? '' : ' collapsed'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevronDown" size={16} />
        </button>
      </div>
      {open && <div className="collapsible-card-body">{children}</div>}
    </div>
  );
}
