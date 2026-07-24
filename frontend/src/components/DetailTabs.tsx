import { useState } from 'react';
import type { ReactNode } from 'react';

export interface DetailTab { key: string; label: string; content: ReactNode; }

// Generic tab-strip + content-switcher for a detail page's center panel —
// distinct from AssociationsPanel (which renders a specific table-of-columns
// shape per group and stays nested one level down, inside a "Details" tab
// here). Each tab's content is arbitrary — an ActivityTimeline, a
// TasksWidget, the AssociationsPanel itself, whatever that page used to
// always show stacked in .detail-main.
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!activeTab) return null;

  return (
    <div className="card detail-tabs-card">
      <div className="detail-tabs-strip">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`detail-tab${t.key === activeTab.key ? ' active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="detail-tab-content">{activeTab.content}</div>
    </div>
  );
}
