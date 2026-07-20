import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { Lead, LeadStage } from '../api/types';
import { listLeads, updateLead, deleteLead } from '../api/leads';
import { listStages, createStage } from '../api/stages';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { LeadForm } from './LeadForm';
import { ConvertToDealModal } from './ConvertToDealModal';
import { Icon } from './Icon';
import { SkeletonKanban } from './Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { isMqlReady, BANT_WARNING_MESSAGE } from '../utils/leadQualification';

async function loadAllLeads(): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  // Server caps pageSize at 100 — page through until every lead is fetched.
  for (;;) {
    const data = await listLeads({ page, pageSize: 100 });
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
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [qualifiedPromptLead, setQualifiedPromptLead] = useState<Lead | null>(null);

  useEffect(() => {
    Promise.all([loadAllLeads(), listStages('lead_stages')])
      .then(([leadRows, stageRes]) => { setLeads(leadRows); setStages(stageRes as LeadStage[]); })
      .finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback(async (leadId: string, _from: string, toStageId: string) => {
    const prevLead = leads.find((l) => l.id === leadId);
    const newStage = stages.find((s) => s.id === toStageId)!;
    const movingToQualified = newStage.isWon && prevLead && !prevLead.stage.isWon;
    if (movingToQualified && !isMqlReady(prevLead!)) {
      const ok = await confirm(BANT_WARNING_MESSAGE, { title: 'BANT/ICP not completed' });
      if (!ok) return;
    }
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l)));
    setError('');
    updateLead(leadId, { stageId: toStageId }).then((updated) => {
      setLeads((ls) => ls.map((l) => (l.id === leadId ? updated : l)));
      if (movingToQualified) setQualifiedPromptLead(updated);
    }).catch((e) => {
      setLeads(prev); // revert optimistic move
      setError(e.message ?? 'Could not update lead stage');
    });
  }, [leads, stages, confirm]);

  async function handleDelete(lead: Lead) {
    const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'this lead';
    const ok = await confirm(`Delete "${name}"? This cannot be undone.`, { title: 'Delete lead' });
    if (!ok) return;
    try {
      await deleteLead(lead.id);
      setLeads((ls) => ls.filter((l) => l.id !== lead.id));
      toast.success('Lead deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete lead');
    }
  }

  async function addStage() {
    const name = newStageName.trim();
    if (!name) { setAddingStage(false); return; }
    try {
      const data = await createStage('lead_stages', { name, color: '#6B7280' });
      setStages((s) => [...s, data as LeadStage]);
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
          const totalValue = col.items.reduce((sum, l) => sum + (l.value ? parseFloat(l.value) : 0), 0);
          return (
            <StageColumnHeader
              stage={stage}
              count={col.items.length}
              editable={canManageStages}
              table="lead_stages"
              allStageIds={stageIds}
              myIndex={stageIds.indexOf(stage.id)}
              onChanged={(updated) => setStages((s) => s.map((st) => (st.id === updated.id ? updated : st)))}
              onDeleted={(id) => setStages((s) => s.filter((st) => st.id !== id))}
              onReordered={setStages}
              subtitle={totalValue > 0 ? formatValue(String(totalValue)) ?? undefined : undefined}
            />
          );
        }}
        renderColumnActions={(col) => (
          <button className="kanban-add-btn" onClick={() => setFormState({ defaultStageId: col.id })}>+ Add lead</button>
        )}
        emptyState={(col) => (
          <div className="kanban-empty">
            <div className="icon"><Icon name="inbox" size={18} /></div>
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
                {lead.convertedAt && (
                  <span className="chip" style={{ background: '#16A34A22', color: '#16A34A', marginTop: 6 }} title="Already converted to a deal">
                    ✓ Converted
                  </span>
                )}
                <div className="kanban-card-footer">
                  <span className="kanban-card-badge"><Icon name="clock" size={11} /> Updated {new Date(lead.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
              <div className="kanban-card-actions">
                {lead.stage.isWon && !lead.convertedAt && (
                  <button
                    title="Convert to Deal"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConvertingLead(lead); }}
                  ><Icon name="check" size={13} /></button>
                )}
                <button
                  title="View"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/leads/${lead.id}`); }}
                ><Icon name="eye" size={13} /></button>
                <button
                  title="Edit"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormState({ lead }); }}
                ><Icon name="edit" size={13} /></button>
                <button
                  className="danger"
                  title="Delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(lead); }}
                ><Icon name="trash" size={13} /></button>
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

      {convertingLead && (
        <ConvertToDealModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConverted={(deal) => {
            setConvertingLead(null);
            toast.success('Converted to Deal');
            navigate(`/deals/${deal.id}`);
          }}
        />
      )}

      {qualifiedPromptLead && (
        <div className="modal-overlay" onClick={() => setQualifiedPromptLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Lead qualified</h3>
            <p>This lead is qualified — convert to a deal?</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={() => { setConvertingLead(qualifiedPromptLead); setQualifiedPromptLead(null); }}>Convert</button>
              <button className="btn secondary" onClick={() => setQualifiedPromptLead(null)}>Not now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
