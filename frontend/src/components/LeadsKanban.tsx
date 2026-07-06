import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Lead, LeadStage, Paginated } from '../api/types';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { LeadForm } from './LeadForm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

async function loadAllLeads(): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  // Server caps pageSize at 100 — page through until every lead is fetched.
  for (;;) {
    const { data } = await api.get<Paginated<Lead>>('/leads', { params: { page, pageSize: 100 } });
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

export function LeadsKanban() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManageStages = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [formState, setFormState] = useState<{ lead?: Lead; defaultStageId?: string } | null>(null);

  useEffect(() => {
    Promise.all([loadAllLeads(), api.get<LeadStage[]>('/lead-stages')])
      .then(([leadRows, stageRes]) => { setLeads(leadRows); setStages(stageRes.data); })
      .finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((leadId: string, _from: string, toStageId: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, stage: stages.find((s) => s.id === toStageId)! } : l)));
    setError('');
    api.patch(`/leads/${leadId}`, { stageId: toStageId }).catch((e) => {
      setLeads(prev); // revert optimistic move
      setError(e.response?.data?.message ?? 'Could not update lead stage');
    });
  }, [leads, stages]);

  async function handleDelete(lead: Lead) {
    const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'this lead';
    const ok = await confirm(`Delete "${name}"? This cannot be undone.`, { title: 'Delete lead' });
    if (!ok) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      setLeads((ls) => ls.filter((l) => l.id !== lead.id));
      toast.success('Lead deleted');
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not delete lead');
    }
  }

  async function addStage() {
    const name = newStageName.trim();
    if (!name) { setAddingStage(false); return; }
    try {
      const { data } = await api.post<LeadStage>('/lead-stages', { name, color: '#6B7280' });
      setStages((s) => [...s, data]);
      toast.success(`Added stage "${name}"`);
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not add stage');
    } finally {
      setNewStageName('');
      setAddingStage(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  const stageIds = stages.map((s) => s.id);
  const columns: KanbanColumn<Lead>[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.name,
    items: leads.filter((l) => l.stage.id === stage.id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(lead) => lead.id}
        onDrop={handleDrop}
        renderColumnHeader={(col) => {
          const stage = stages.find((s) => s.id === col.id)!;
          return (
            <StageColumnHeader
              stage={stage}
              count={col.items.length}
              editable={canManageStages}
              apiBase="/lead-stages"
              allStageIds={stageIds}
              myIndex={stageIds.indexOf(stage.id)}
              onChanged={(updated) => setStages((s) => s.map((st) => (st.id === updated.id ? updated : st)))}
              onDeleted={(id) => setStages((s) => s.filter((st) => st.id !== id))}
              onReordered={setStages}
            />
          );
        }}
        renderColumnActions={(col) => (
          <button className="kanban-add-btn" onClick={() => setFormState({ defaultStageId: col.id })}>+ Add lead</button>
        )}
        emptyState={(col) => (
          <div className="kanban-empty">
            <div className="icon">📭</div>
            <p>No leads in this stage</p>
            <button className="btn secondary" onClick={() => setFormState({ defaultStageId: col.id })}>+ Add lead</button>
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
        renderCard={(lead) => {
          const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead';
          return (
            <>
              <Link to={`/leads/${lead.id}`}>
                <div className="kanban-card-title">{name}</div>
                {lead.account?.name && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{lead.account.name}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  {formatValue(lead.value) ? <span className="chip">{formatValue(lead.value)}</span> : <span />}
                  {lead.owner && <div className="avatar avatar-sm" title={lead.owner.fullName}>{initials(lead.owner.fullName)}</div>}
                </div>
                <div className="kanban-card-footer">
                  <span className="kanban-card-badge">🕐 Updated {new Date(lead.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
              <div className="kanban-card-actions">
                <button
                  title="View"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/leads/${lead.id}`); }}
                >👁</button>
                <button
                  title="Edit"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormState({ lead }); }}
                >✎</button>
                <button
                  className="danger"
                  title="Delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(lead); }}
                >🗑</button>
              </div>
            </>
          );
        }}
      />

      {formState && (
        <LeadForm
          lead={formState.lead}
          defaultStageId={formState.defaultStageId}
          onClose={() => setFormState(null)}
          onSaved={(saved) => {
            setFormState(null);
            setLeads((ls) => (ls.some((l) => l.id === saved.id) ? ls.map((l) => (l.id === saved.id ? saved : l)) : [...ls, saved]));
            toast.success(formState.lead ? 'Lead updated' : 'Lead created');
          }}
        />
      )}
    </div>
  );
}
