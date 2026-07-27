import { useState } from 'react';
import type { ReactNode } from 'react';

export interface DetailTab { key: string; label: string; content: ReactNode; }

// Generic tab-strip + content-switcher for a detail page's center panel —
// distinct from AssociationsPanel (which renders a specific table-of-columns
// shape per group and stays nested one level down, inside a "Details" tab
// here). Each tab's content is arbitrary — an ActivityTimeline, a
// TasksWidget, the AssociationsPanel itself, whatever that page used to
// always show stacked in .detail-main.
//
// activeKey/onActiveKeyChange are optional — pass them when something
// outside this component needs to jump to a specific tab (e.g. the "Task"
// quick-action button switching to the Tasks tab, since only the active
// tab's content is ever mounted — id="tasks-section" doesn't exist in the
// DOM until that tab is selected, so a plain scrollIntoView can't reach it
// on its own). Uncontrolled (internal state) when omitted.
export function DetailTabs({
  tabs, activeKey, onActiveKeyChange,
}: {
  tabs: DetailTab[];
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
}) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.key);
  const active = activeKey ?? internalActive;
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!activeTab) return null;

  function select(key: string) {
    setInternalActive(key);
    onActiveKeyChange?.(key);
  }

  return (
    <div className="card detail-tabs-card">
      <div className="detail-tabs-strip">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`detail-tab${t.key === activeTab.key ? ' active' : ''}`}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="detail-tab-content">{activeTab.content}</div>
    </div>
  );
}
