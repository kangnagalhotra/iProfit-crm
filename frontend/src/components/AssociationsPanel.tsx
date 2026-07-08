import { useState } from 'react';
import type { ReactNode } from 'react';
import type { IconName } from './Icon';
import { CollapsibleCard } from './CollapsibleCard';
import { EmptyState } from './EmptyState';

export interface AssociationColumn<T> {
  header: string;
  render: (item: T) => ReactNode;
}

export interface AssociationGroup<T = any> {
  key: string;
  label: string;
  icon: IconName;
  emptyLabel: string;
  columns: AssociationColumn<T>[];
  items: T[];
  onRowClick?: (item: T) => void;
  addAction?: { label: string; onClick: () => void };
}

export function AssociationsPanel({ groups }: { groups: AssociationGroup[] }) {
  const [activeTab, setActiveTab] = useState(groups[0]?.key);
  const active = groups.find((g) => g.key === activeTab) ?? groups[0];
  if (!active) return null;

  return (
    <CollapsibleCard title="Associations" storageKey="collapsible:associations">
      <div className="associations-tabs">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className={`associations-tab${g.key === active.key ? ' active' : ''}`}
            onClick={() => setActiveTab(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>
      {active.addAction && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn secondary" onClick={active.addAction.onClick}>{active.addAction.label}</button>
        </div>
      )}
      {active.items.length === 0 ? (
        <EmptyState icon={active.icon} description={active.emptyLabel} size="sm" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>{active.columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {active.items.map((item, i) => (
                <tr
                  key={item.id ?? i}
                  className={active.onRowClick ? 'clickable-row' : undefined}
                  onClick={() => active.onRowClick?.(item)}
                >
                  {active.columns.map((c) => <td key={c.header}>{c.render(item)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleCard>
  );
}
