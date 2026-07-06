import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Account, DealStage, Lead, Opportunity, User,
} from '../api/types';
import {
  getDeal, updateDeal, createDeal, deleteDeal,
} from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listLeads } from '../api/leads';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { DealForm } from '../components/DealForm';
import { AddActivityModal } from '../components/AddActivityModal';
import { Icon } from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { timeAgo } from '../utils/timeAgo';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function Row({
  label, value, onEmptyClick, emptyLabel,
}: {
  label: string;
  value: React.ReactNode;
  onEmptyClick?: () => void;
  emptyLabel?: string;
}) {
  const isEmpty = value === undefined || value === null || value === '';
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="value">
        {isEmpty && onEmptyClick ? (
          <button type="button" className="add-value" onClick={onEmptyClick}>+ Add {emptyLabel ?? label}</button>
        ) : isEmpty ? (
          <span className="value-empty">Not provided</span>
        ) : value}
      </div>
    </div>
  );
}

function formatValue(value?: string) {
  if (!value) return undefined;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return undefined;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function contactName(deal: Opportunity) {
  if (!deal.lead) return undefined;
  return [deal.lead.firstName, deal.lead.lastName].filter(Boolean).join(' ') || deal.lead.email;
}

function scrollToNotes() {
  document.getElementById('notes-section')?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToTasks() {
  document.getElementById('tasks-section')?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToKeyInfo() {
  document.querySelector('.key-info')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [deal, setDeal] = useState<Opportunity | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getDeal(id).then(setDeal).catch(() => {});
    Promise.all([
      listUsers(),
      listStages('deal_stages'),
      listAccounts({ pageSize: 100 }),
      listLeads({ pageSize: 100 }),
    ]).then(([userRes, stageRes, accountRes, leadRes]) => {
      setUsers(userRes);
      setStages(stageRes as DealStage[]);
      setAccounts(accountRes.data);
      setLeads(leadRes.data);
    });
  }, [id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!deal) return <p>Loading…</p>;

  async function saveField(data: Record<string, any>) {
    try {
      const updated = await updateDeal(deal!.id, data);
      setDeal(updated);
      setEditingField(null);
      setActivityKey((k) => k + 1);
      toast.success('Deal updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update deal');
    }
  }

  async function duplicateRecord() {
    try {
      const payload: Record<string, any> = {
        name: `${deal!.name} (Copy)`,
        amount: deal!.amount,
        closeDate: deal!.closeDate,
        dealType: deal!.dealType,
        description: deal!.description,
        source: deal!.source,
        stageId: deal!.stage.id,
        ownerId: deal!.owner?.id,
        accountId: deal!.account?.id,
        leadId: deal!.lead?.id,
      };
      const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== ''));
      const data = await createDeal(cleaned);
      toast.success('Deal duplicated');
      navigate(`/deals/${data.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate deal');
    }
  }

  async function deleteRecord() {
    const ok = await confirm(`Delete "${deal!.name}"? This cannot be undone.`, { title: 'Delete deal' });
    if (!ok) return;
    try {
      await deleteDeal(deal!.id);
      toast.success('Deal deleted');
      navigate('/deals');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete deal');
    }
  }

  return (
    <div>
      <p><Link to="/deals">← Deals</Link></p>

      <div className="detail-page-layout">
      <div className="card detail-header-card">
        <div className="detail-header-top">
          <div className="detail-header">
            <div className="avatar">{initials(deal.name)}</div>
            <div>
              <h2>{deal.name}</h2>
              {formatValue(deal.amount) && <span style={{ fontWeight: 600 }}>{formatValue(deal.amount)}</span>}
              <div className="detail-meta-row">
                <span className="record-type-badge">Deal</span>
                <span className="chip" style={{ background: deal.stage.color + '22', color: deal.stage.color }}>{deal.stage.name}</span>
                {deal.owner && (
                  <span className="owner-chip">
                    <span className="avatar avatar-sm">{initials(deal.owner.fullName)}</span>
                    {deal.owner.fullName}
                  </span>
                )}
                <span className="detail-updated">Updated {timeAgo(deal.updatedAt)}</span>
              </div>
            </div>
          </div>
          <div className="detail-header-actions">
            <button className="btn btn-icon" onClick={() => setShowEditModal(true)}><Icon name="edit" size={14} /> Edit Details</button>
            <button className="btn secondary btn-icon" onClick={scrollToTasks}><Icon name="check" size={14} /> Add Task</button>
            <button className="btn secondary btn-icon" disabled title="Coming soon — Meeting scheduling not built yet"><Icon name="calendar" size={14} /> Schedule Meeting</button>
            <div className="dropdown-wrap" ref={moreRef}>
              <button className="btn secondary btn-icon" onClick={() => setMoreOpen((o) => !o)}><Icon name="dots" size={14} /> More Actions</button>
              {moreOpen && (
                <div className="dropdown-menu">
                  <button onClick={() => { setMoreOpen(false); setShowEditModal(true); }}>Edit Details</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('owner'); scrollToKeyInfo(); }}>Change Owner</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('stage'); scrollToKeyInfo(); }}>Change Status</button>
                  <button onClick={() => { setMoreOpen(false); scrollToNotes(); }}>Add Note</button>
                  <button onClick={() => { setMoreOpen(false); scrollToTasks(); }}>Add Task</button>
                  <button onClick={() => { setMoreOpen(false); setShowAddActivity(true); }}>Add Activity</button>
                  <button disabled title="Coming soon — Meeting scheduling not built yet">Schedule Meeting</button>
                  <button onClick={() => { setMoreOpen(false); duplicateRecord(); }}>Duplicate Record</button>
                  <button disabled title="Coming soon — Archiving not built yet">Archive Record</button>
                  <button style={{ color: '#DC2626' }} onClick={() => { setMoreOpen(false); deleteRecord(); }}>Delete Record</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="quick-actions">
          <button className="quick-action" onClick={scrollToNotes}>
            <span className="icon"><Icon name="note" size={18} /></span>Note
          </button>
          <button className="quick-action" onClick={scrollToTasks}>
            <span className="icon"><Icon name="check" size={18} /></span>Task
          </button>
          <button className="quick-action" disabled title="Coming soon — Meeting scheduling not built yet">
            <span className="icon"><Icon name="calendar" size={18} /></span>Meeting
          </button>
        </div>
      </div>

      <div className="detail-sidebar">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Key information</h3>
        <div className="key-info">
          <EditableRow
            label="Owner"
            value={deal.owner?.fullName}
            editing={editingField === 'owner'}
            onStartEdit={() => setEditingField('owner')}
          >
            <SearchSelect
              options={users.map((u) => ({ value: u.id, label: u.fullName }))}
              value={deal.owner?.id ?? ''}
              onChange={(v) => v && saveField({ ownerId: v })}
              placeholder="Search owner…"
            />
          </EditableRow>
          <EditableRow
            label="Company"
            value={deal.account ? <Link to={`/companies/${deal.account.id}`}>{deal.account.name}</Link> : undefined}
            editing={editingField === 'company'}
            onStartEdit={() => setEditingField('company')}
          >
            <SearchSelect
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={deal.account?.id ?? ''}
              onChange={(v) => saveField({ accountId: v })}
              placeholder="Search company…"
            />
          </EditableRow>
          <EditableRow
            label="Contact"
            value={deal.lead ? <Link to={`/leads/${deal.lead.id}`}>{contactName(deal)}</Link> : undefined}
            editing={editingField === 'contact'}
            onStartEdit={() => setEditingField('contact')}
          >
            <SearchSelect
              options={leads.map((l) => ({
                value: l.id, label: l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead',
              }))}
              value={deal.lead?.id ?? ''}
              onChange={(v) => saveField({ leadId: v })}
              placeholder="Search contact…"
            />
          </EditableRow>
          <Row label="Pipeline" value={deal.pipeline.name} />
          <EditableRow
            label="Stage"
            value={<span className="chip" style={{ background: deal.stage.color + '22', color: deal.stage.color }}>{deal.stage.name}</span>}
            editing={editingField === 'stage'}
            onStartEdit={() => setEditingField('stage')}
          >
            <SearchSelect
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={deal.stage.id}
              onChange={(v) => saveField({ stageId: v })}
              placeholder="Search stage…"
            />
          </EditableRow>
          <Row label="Probability" value={`${deal.stage.winProbability}%`} />
          <EditableRow
            label="Amount"
            value={formatValue(deal.amount)}
            editing={editingField === 'amount'}
            onStartEdit={() => setEditingField('amount')}
          >
            <input
              type="number"
              min="0"
              autoFocus
              defaultValue={deal.amount ?? ''}
              placeholder="0.00"
              onBlur={(e) => saveField({ amount: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          </EditableRow>
          <Row label="Deal type" value={deal.dealType.replace('_', ' ')} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Source" value={deal.source} onEmptyClick={() => setShowEditModal(true)} />
          <Row
            label="Closing date"
            value={deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : undefined}
            onEmptyClick={() => setShowEditModal(true)}
          />
        </div>
        {deal.description && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{deal.description}</div>
          </div>
        )}
      </div>
      </div>

      <div className="detail-main">
      <ActivityTimeline key={activityKey} opportunityId={deal.id} />
      <TasksWidget opportunityId={deal.id} />
      <NotesSection opportunityId={deal.id} />
      </div>
      </div>

      {showEditModal && (
        <DealForm
          deal={deal}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setDeal(updated); setShowEditModal(false); setActivityKey((k) => k + 1); toast.success('Deal updated');
          }}
        />
      )}

      {showAddActivity && (
        <AddActivityModal
          opportunityId={deal.id}
          onClose={() => setShowAddActivity(false)}
          onSaved={() => { setShowAddActivity(false); setActivityKey((k) => k + 1); toast.success('Activity added'); }}
        />
      )}
    </div>
  );
}
