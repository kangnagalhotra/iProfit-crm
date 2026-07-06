import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Account, AccountStage, Lead, User,
} from '../api/types';
import {
  getAccount, updateAccount, createAccount, deleteAccount,
} from '../api/accounts';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listLeads } from '../api/leads';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { CompanyForm } from '../components/CompanyForm';
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

function websiteUrl(domain: string) {
  const bare = domain.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return `https://www.${bare}`;
}

function formatRevenue(value?: string) {
  if (!value) return undefined;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return undefined;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
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

export function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [account, setAccount] = useState<Account | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [associatedLeads, setAssociatedLeads] = useState<Lead[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  function loadAssociatedLeads() {
    if (!id) return;
    listLeads({ accountId: id, pageSize: 100 }).then((data) => setAssociatedLeads(data.data));
  }

  useEffect(() => {
    if (!id) return;
    getAccount(id).then(setAccount).catch(() => {});
    Promise.all([listUsers(), listStages('account_stages')])
      .then(([userRes, stageRes]) => { setUsers(userRes); setStages(stageRes as AccountStage[]); });
    loadAssociatedLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!account) return <p>Loading…</p>;

  async function saveField(data: Record<string, any>) {
    try {
      const updated = await updateAccount(account!.id, data);
      setAccount(updated);
      setEditingField(null);
      setActivityKey((k) => k + 1);
      toast.success('Company updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update company');
    }
  }

  async function duplicateRecord() {
    try {
      const payload: Record<string, any> = {
        name: `${account!.name} (Copy)`,
        domain: account!.domain,
        industry: account!.industry,
        sizeBucket: account!.sizeBucket,
        annualRevenue: account!.annualRevenue,
        companyType: account!.companyType,
        email: account!.email,
        phone: account!.phone,
        address: account!.address,
        description: account!.description,
        city: account!.city,
        state: account!.state,
        country: account!.country,
        ownerId: account!.owner?.id,
        stageId: account!.stage.id,
      };
      const cleaned = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== ''));
      const data = await createAccount(cleaned);
      toast.success('Company duplicated');
      navigate(`/companies/${data.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not duplicate company');
    }
  }

  async function deleteRecord() {
    const ok = await confirm(`Delete "${account!.name}"? This cannot be undone.`, { title: 'Delete company' });
    if (!ok) return;
    try {
      await deleteAccount(account!.id);
      toast.success('Company deleted');
      navigate('/companies');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete company');
    }
  }

  return (
    <div>
      <p><Link to="/companies">← Companies</Link></p>

      <div className="detail-page-layout">
      <div className="card detail-header-card">
        <div className="detail-header-top">
          <div className="detail-header">
            <div className="avatar">{initials(account.name)}</div>
            <div>
              <h2>{account.name}</h2>
              {account.domain && (
                <a href={websiteUrl(account.domain)} target="_blank" rel="noreferrer">
                  {websiteUrl(account.domain).replace(/^https:\/\//, '')}
                </a>
              )}
              <div className="detail-meta-row">
                <span className="record-type-badge">Company</span>
                <span className="chip" style={{ background: account.stage.color + '22', color: account.stage.color }}>{account.stage.name}</span>
                {account.owner && (
                  <span className="owner-chip">
                    <span className="avatar avatar-sm">{initials(account.owner.fullName)}</span>
                    {account.owner.fullName}
                  </span>
                )}
                <span className="detail-updated">Updated {timeAgo(account.updatedAt)}</span>
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
            className={`quick-action${account.email ? '' : ' disabled'}`}
            href={account.email ? `mailto:${account.email}` : undefined}
            aria-disabled={!account.email}
            tabIndex={account.email ? 0 : -1}
            title={account.email ? `Email ${account.email}` : 'No email on file'}
          >
            <span className="icon"><Icon name="mail" size={18} /></span>Email
          </a>
          <a
            className={`quick-action${account.phone ? '' : ' disabled'}`}
            href={account.phone ? `tel:${account.phone}` : undefined}
            aria-disabled={!account.phone}
            tabIndex={account.phone ? 0 : -1}
            title={account.phone ? `Call ${account.phone}` : 'No phone number on file'}
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
            label="Owner"
            value={account.owner?.fullName}
            editing={editingField === 'owner'}
            onStartEdit={() => setEditingField('owner')}
          >
            <SearchSelect
              options={users.map((u) => ({ value: u.id, label: u.fullName }))}
              value={account.owner?.id ?? ''}
              onChange={(v) => v && saveField({ ownerId: v })}
              placeholder="Search owner…"
            />
          </EditableRow>
          <Row label="Website" value={account.domain ? (
            <a href={websiteUrl(account.domain)} target="_blank" rel="noreferrer">
              {websiteUrl(account.domain).replace(/^https:\/\//, '')}
            </a>
          ) : undefined}
          onEmptyClick={() => setShowEditModal(true)}
          />
          <Row label="Industry" value={account.industry} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Company size" value={account.sizeBucket} onEmptyClick={() => setShowEditModal(true)} />
          <EditableRow
            label="Annual revenue"
            value={formatRevenue(account.annualRevenue)}
            editing={editingField === 'revenue'}
            onStartEdit={() => setEditingField('revenue')}
          >
            <input
              type="number"
              min="0"
              autoFocus
              defaultValue={account.annualRevenue ?? ''}
              placeholder="0.00"
              onBlur={(e) => saveField({ annualRevenue: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          </EditableRow>
          <Row label="Company type" value={account.companyType} onEmptyClick={() => setShowEditModal(true)} />
          <EditableRow
            label="Status"
            value={<span className="chip" style={{ background: account.stage.color + '22', color: account.stage.color }}>{account.stage.name}</span>}
            editing={editingField === 'stage'}
            onStartEdit={() => setEditingField('stage')}
          >
            <SearchSelect
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={account.stage.id}
              onChange={(v) => saveField({ stageId: v })}
              placeholder="Search status…"
            />
          </EditableRow>
          <Row label="Email" value={account.email} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Phone" value={account.phone} onEmptyClick={() => setShowEditModal(true)} />
          <Row
            label="Address"
            value={[account.address, account.city, account.state, account.country].filter(Boolean).join(', ') || undefined}
            onEmptyClick={() => setShowEditModal(true)}
          />
          <Row label="Associated Leads" value={associatedLeads.length} />
        </div>
        {account.description && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{account.description}</div>
          </div>
        )}
      </div>
      </div>

      <div className="detail-main">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Associated Leads ({associatedLeads.length})</h3>
        {associatedLeads.length === 0 ? (
          <div className="empty-state">
            <span className="icon"><Icon name="note" size={18} /></span>
            <p>No leads linked to this company yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Lead Name</th>
                <th>Owner</th>
                <th>Stage</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {associatedLeads.map((l) => {
                const leadName = l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead';
                return (
                  <tr key={l.id} className="clickable-row" onClick={() => navigate(`/leads/${l.id}`)}>
                    <td><Link to={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()}>{leadName}</Link></td>
                    <td>{l.owner?.fullName ?? '—'}</td>
                    <td><span className="chip" style={{ background: l.stage.color + '22', color: l.stage.color }}>{l.stage.name}</span></td>
                    <td>{l.email ?? '—'}</td>
                    <td>{l.phone ?? '—'}</td>
                    <td>{l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ActivityTimeline key={activityKey} accountId={account.id} />
      <TasksWidget accountId={account.id} />
      <NotesSection accountId={account.id} />
      </div>
      </div>

      {showEditModal && (
        <CompanyForm
          account={account}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setAccount(updated); setShowEditModal(false); setActivityKey((k) => k + 1); toast.success('Company updated');
          }}
        />
      )}
    </div>
  );
}
