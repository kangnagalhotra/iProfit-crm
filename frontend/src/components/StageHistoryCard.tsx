import { useEffect, useState } from 'react';
import type { StageHistoryEntry } from '../api/types';
import { listStageHistory } from '../api/dealStageHistory';
import { CollapsibleCard } from './CollapsibleCard';
import { EmptyState } from './EmptyState';

export function StageHistoryCard({ opportunityId }: { opportunityId: string }) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);

  useEffect(() => { listStageHistory(opportunityId).then(setHistory).catch(() => {}); }, [opportunityId]);

  return (
    <CollapsibleCard title="Stage history" storageKey="collapsible:deal:stage-history" defaultOpen={false}>
      {history.length === 0 ? (
        <EmptyState icon="clock" description="No stage changes yet." size="sm" />
      ) : (
        <div className="stage-history-list">
          {history.map((h) => (
            <div className="stage-history-row" key={h.id}>
              <span className="chip" style={{ background: h.stage.color + '22', color: h.stage.color }}>{h.stage.name}</span>
              <span className="stage-history-meta">{new Date(h.changedAt).toLocaleString()} · {h.changedBy?.fullName ?? 'System'}</span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
