import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { DealStage, Opportunity } from '../api/types';
import { listDeals, updateDeal, deleteDeal } from '../api/deals';
import { listStages, createStage } from '../api/stages';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { DealForm } from './DealForm';
import { Icon } from './Icon';
import { SkeletonKanban } from './Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { closedWonHandoverMessage } from '../utils/dealAutomation';

async function loadAllDeals(): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const data = await listDeals({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function formatValue(value?: string) {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function DealsKanban() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManageStages = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [editingDeal, setEditingDeal] = useState<Opportunity | null>(null);

  useEffect(() => {
    Promise.all([loadAllDeals(), listStages('deal_stages')])
      .then(([dealRows, stageRes]) => { setDeals(dealRows); setStages(stageRes as DealStage[]); })
      .finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((dealId: string, _from: string, toStageId: string) => {
    const prev = deals;
    const prevStage = prev.find((d) => d.id === dealId)?.stage;
    const newStage = stages.find((s) => s.id === toStageId)!;
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
    setError('');
    updateDeal(dealId, { stageId: toStageId }).then(() => {
      const msg = closedWonHandoverMessage(prevStage, newStage);
      if (msg) toast.success(msg);
    }).catch((e) => {
      setDeals(prev);
      setError(e.message ?? 'Could not update deal stage');
    });
  }, [deals, stages, toast]);

  async function handleDelete(deal: Opportunity) {
    const ok = await confirm(`Delete "${deal.name}"? This cannot be undone.`, { title: 'Delete deal' });
    if (!ok) return;
    try {
      await deleteDeal(deal.id);
      setDeals((ds) => ds.filter((d) => d.id !== deal.id));
      toast.success('Deal deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete deal');
    }
  }

  async function addStage() {
    const name = newStageName.trim();
    if (!name) { setAddingStage(false); return; }
    try {
      const data = await createStage('deal_stages', { name, color: '#6B7280' });
      setStages((s) => [...s, data as DealStage]);
      toast.success(`Added stage "${name}"`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add stage');
    } finally {
      setNewStageName('');
      setAddingStage(false);
    }
  }

  if (loading) return <SkeletonKanban columns={stages.length || 4} />;

  const stageIds = stages.map((s) => s.id);
  const columns: KanbanColumn<Opportunity>[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.name,
    items: deals.filter((d) => d.stage.id === stage.id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(deal) => deal.id}
        onDrop={handleDrop}
        renderColumnHeader={(col) => {
          const stage = stages.find((s) => s.id === col.id)!;
          const totalValue = col.items.reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);
          const weightedValue = col.items.reduce(
            (sum, d) => sum + (d.amount ? (parseFloat(d.amount) * stage.winProbability) / 100 : 0), 0,
          );
          return (
            <StageColumnHeader
              stage={stage}
              count={col.items.length}
              editable={canManageStages}
              table="deal_stages"
              allStageIds={stageIds}
              myIndex={stageIds.indexOf(stage.id)}
              onChanged={(updated) => setStages((s) => s.map((st) => (st.id === updated.id ? updated : st)))}
              onDeleted={(id) => setStages((s) => s.filter((st) => st.id !== id))}
              onReordered={setStages}
              subtitle={totalValue > 0 ? formatValue(String(totalValue)) ?? undefined : undefined}
              weightedSubtitle={totalValue > 0 ? formatValue(String(weightedValue)) ?? undefined : undefined}
            />
          );
        }}
        emptyState={() => (
          <div className="kanban-empty">
            <div className="icon"><Icon name="inbox" size={18} /></div>
            <p>No deals in this stage</p>
          </div>
        )}
        extraColumn={canManageStages ? (
          <div className="add-stage-col">
            {addingStage ? (
              <input
                autoFocus
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onBlur={addStage}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, width: '100%' }}
              />
            ) : (
              <button onClick={() => setAddingStage(true)}>+ Add stage</button>
            )}
          </div>
        ) : undefined}
        renderCard={(deal) => (
          <>
            <Link to={`/deals/${deal.id}`}>
              <div className="kanban-card-title">{deal.name}</div>
              {deal.account?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{deal.account.name}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                {formatValue(deal.amount) ? <span className="chip">{formatValue(deal.amount)}</span> : <span />}
                {deal.owner && <div className="avatar avatar-sm" title={deal.owner.fullName}>{initials(deal.owner.fullName)}</div>}
              </div>
              <div className="kanban-card-footer">
                <span className="kanban-card-badge">
                  <Icon name="calendar" size={11} /> {deal.closeDate ? `Closes ${new Date(deal.closeDate).toLocaleDateString()}` : `Updated ${new Date(deal.updatedAt).toLocaleDateString()}`}
                </span>
              </div>
            </Link>
            <div className="kanban-card-actions">
              <button
                title="View"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/deals/${deal.id}`); }}
              ><Icon name="eye" size={13} /></button>
              <button
                title="Edit"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingDeal(deal); }}
              ><Icon name="edit" size={13} /></button>
              <button
                className="danger"
                title="Delete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(deal); }}
              ><Icon name="trash" size={13} /></button>
            </div>
          </>
        )}
      />

      {editingDeal && (
        <DealForm
          deal={editingDeal}
          onClose={() => setEditingDeal(null)}
          onSaved={(saved) => {
            setEditingDeal(null);
            setDeals((ds) => ds.map((d) => (d.id === saved.id ? saved : d)));
            toast.success('Deal updated');
            const handoverMsg = closedWonHandoverMessage(editingDeal.stage, saved.stage);
            if (handoverMsg) toast.success(handoverMsg);
          }}
        />
      )}
    </div>
  );
}
