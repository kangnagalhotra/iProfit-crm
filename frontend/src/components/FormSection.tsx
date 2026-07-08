import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function FormSection({
  title, defaultOpen = true, children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="form-section">
      <div className="form-section-header" onClick={() => setOpen((o) => !o)}>
        <h4>{title}</h4>
        <button
          type="button"
          className={`form-section-chevron${open ? '' : ' collapsed'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
      {open && <div className="form-section-body">{children}</div>}
    </div>
  );
}
