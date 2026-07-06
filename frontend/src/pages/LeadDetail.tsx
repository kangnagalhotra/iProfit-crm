import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Lead, LeadStage, User } from '../api/types';
import {
  getLead, updateLead, createLead, deleteLead,
} from '../api/leads';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { LeadForm } from '../components/LeadForm';
import { AddActivityModal } from '../components/AddActivityModal';
import { Icon } from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { timeAgo } from '../utils/timeAgo';

function initials(lead: Lead) {
  const parts = [lead.firstName, lead.lastName].filter(Boolean) as string[];
  if (parts.length === 0) return (lead.email ?? '?')[0].toUpperCase();
  return parts.map((p) => p[0].toUpperCase()).join('');
}

function ownerInitials(name: string) {
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

function scrollToNotes() {
  document.getElementById('notes-section')?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToTasks() {
  document.getElementById('tasks-section')?.scrollIntoView({ behavior: 'smooth' });
}

function scrollToKeyInfo() {
  document.querySelector('.key-info')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [lead, setLead] = useState<Lead | null>(null);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  function load() {
    if (!id) return;
    getLead(id).then(setLead).catch(() => {});
  }

  useEffect(() => {
    load();
    Promise.all([listUsers(), listStages('lead_stages')])
      .then(([userRes, stageRes]) => { setUsers(userRes); setStages(stageRes as LeadStage[]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!lead) return <p>Loading…</p>;

  const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead';

  function copyEmail() {
    if (!lead!.email) return;
    navigator.clipboard.writeText(lead!.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveField(data: Record<string, any>) {
    try {
      const updated = await updateLead(lead!.id, data);
      setLead(updated);
      setEditingField(null);
      setActivityKey((k) => k + 1);
      toast.success('Lead updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update lead');
    }
  }

  async function duplicateRecord() {
    try {
      const payload: Record<string, any> = {
        firstName: lead!.firstName,
        lastName: lead!.lastName,
        phone: lead!.phone,
        companyName: lead!.account?.name,
        jobTitle: lead!.jobTitle,
        city: lead!.city,
        source: lead!.source,
        ownerId: lead!.owner?.id,
        stageId: lead!.stage.id,
        value: lead!.value,
        notes: lead!.notes,
      };
      const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== ''));
      const data = await createLead(cleaned);
      toast.success('Lead duplicated');
      navigate(`/leads/${data.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate lead');
    }
  }

  async function deleteRecord() {
    const ok = await confirm(`Delete "${name}"? This cannot be undone.`, { title: 'Delete lead' });
    if (!ok) return;
    try {
      await deleteLead(lead!.id);
      toast.success('Lead deleted');
      navigate('/leads');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete lead');
    }
  }

  return (
    <div>
      <p><Link to="/leads">← Leads</Link></p>

      <div className="detail-page-layout">
      <div className="card detail-header-card">
        <div className="detail-header-top">
          <div className="detail-header">
            <div className="avatar">{initials(lead)}</div>
            <div>
              <h2>{name}</h2>
              {lead.email && (
                <span>
                  <a href={`mailto:${lead.email}`}>{lead.email}</a>{' '}
                  <button className="copy-btn" onClick={copyEmail} title="Copy email">
                    <Icon name={copied ? 'check' : 'copy'} size={14} />
                  </button>
                </span>
              )}
              <div className="detail-meta-row">
                <span className="record-type-badge">Lead</span>
                <span className="chip" style={{ background: lead.stage.color + '22', color: lead.stage.color }}>{lead.stage.name}</span>
                {lead.owner && (
                  <span className="owner-chip">
                    <span className="avatar avatar-sm">{ownerInitials(lead.owner.fullName)}</span>
                    {lead.owner.fullName}
                  </span>
                )}
                <span className="detail-updated">Updated {timeAgo(lead.lastActivityAt ?? lead.updatedAt)}</span>
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
          <a
            className={`quick-action${lead.email ? '' : ' disabled'}`}
            href={lead.email ? `mailto:${lead.email}` : undefined}
            aria-disabled={!lead.email}
            tabIndex={lead.email ? 0 : -1}
            title={lead.email ? `Email ${lead.email}` : 'No email on file'}
          >
            <span className="icon"><Icon name="mail" size={18} /></span>Email
          </a>
          <a
            className={`quick-action${lead.phone ? '' : ' disabled'}`}
            href={lead.phone ? `tel:${lead.phone}` : undefined}
            aria-disabled={!lead.phone}
            tabIndex={lead.phone ? 0 : -1}
            title={lead.phone ? `Call ${lead.phone}` : 'No phone number on file'}
          >
            <span className="icon"><Icon name="phone" size={18} /></span>Call
          </a>
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
            label="Contact owner"
            value={lead.owner?.fullName}
            editing={editingField === 'owner'}
            onStartEdit={() => setEditingField('owner')}
          >
            <SearchSelect
              options={users.map((u) => ({ value: u.id, label: u.fullName }))}
              value={lead.owner?.id ?? ''}
              onChange={(v) => v && saveField({ ownerId: v })}
              placeholder="Search owner…"
            />
          </EditableRow>
          <Row label="Job Title" value={lead.jobTitle} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Phone Number" value={lead.phone} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Email" value={lead.email} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="City" value={lead.city} onEmptyClick={() => setShowEditModal(true)} />
          <EditableRow
            label="Stage"
            value={<span className="chip" style={{ background: lead.stage.color + '22', color: lead.stage.color }}>{lead.stage.name}</span>}
            editing={editingField === 'stage'}
            onStartEdit={() => setEditingField('stage')}
          >
            <SearchSelect
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={lead.stage.id}
              onChange={(v) => saveField({ stageId: v })}
              placeholder="Search stage…"
            />
          </EditableRow>
          <Row label="Lead Source" value={lead.source} onEmptyClick={() => setShowEditModal(true)} />
          <EditableRow
            label="Lead Value"
            value={lead.value ? parseFloat(lead.value).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : undefined}
            editing={editingField === 'value'}
            onStartEdit={() => setEditingField('value')}
          >
            <input
              type="number"
              min="0"
              autoFocus
              defaultValue={lead.value ?? ''}
              placeholder="0.00"
              onBlur={(e) => {
                if (Number(e.target.value) < 0) { toast.error('Lead value cannot be negative.'); return; }
                saveField({ value: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          </EditableRow>
          <Row label="Last Contacted" value={lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString() : undefined} />
          <EditableRow
            label="Company"
            value={lead.account ? <Link to={`/companies/${lead.account.id}`}>{lead.account.name}</Link> : undefined}
            editing={editingField === 'company'}
            onStartEdit={() => setEditingField('company')}
          >
            <input
              type="text"
              autoFocus
              defaultValue={lead.account?.name ?? ''}
              placeholder="Company name"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) saveField({ companyName: v }); else setEditingField(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          </EditableRow>
        </div>
        {lead.notes && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{lead.notes}</div>
          </div>
        )}
      </div>
      </div>

      <div className="detail-main">
      <ActivityTimeline key={activityKey} leadId={lead.id} />
      <TasksWidget leadId={lead.id} />
      <NotesSection leadId={lead.id} />
      </div>
      </div>

      {showEditModal && (
        <LeadForm
          lead={lead}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setLead(updated); setShowEditModal(false); setActivityKey((k) => k + 1); toast.success('Lead updated');
          }}
        />
      )}

      {showAddActivity && (
        <AddActivityModal
          leadId={lead.id}
          onClose={() => setShowAddActivity(false)}
          onSaved={() => { setShowAddActivity(false); setActivityKey((k) => k + 1); toast.success('Activity added'); }}
        />
      )}
    </div>
  );
}
