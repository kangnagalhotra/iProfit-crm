import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Account, AccountStage, Contact, Lead, Opportunity, User,
} from '../api/types';
import {
  getAccount, updateAccount, createAccount, deleteAccount,
} from '../api/accounts';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listLeads } from '../api/leads';
import { listDeals } from '../api/deals';
import { listContacts } from '../api/contacts';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { SupportTicketsWidget } from '../components/SupportTicketsWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { CompanyForm } from '../components/CompanyForm';
import { ContactForm } from '../components/ContactForm';
import { MergeCompanyModal } from '../components/MergeCompanyModal';
import { AddActivityModal } from '../components/AddActivityModal';
import { ScheduleMeetingModal } from '../components/ScheduleMeetingModal';
import { Icon } from '../components/Icon';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { AssociationsPanel } from '../components/AssociationsPanel';
import type { AssociationGroup } from '../components/AssociationsPanel';
import { SkeletonDetailPage } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { timeAgo } from '../utils/timeAgo';
import { useRecordRecentlyViewed } from '../hooks/useRecentlyViewed';
import { REVENUE_BANDS } from '../constants/companyOptions';

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

function leadName(l: Lead) {
  return l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead';
}

function websiteUrl(domain: string) {
  const bare = domain.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  return `https://www.${bare}`;
}

function formatRevenue(value?: string) {
  if (!value) return undefined;
  return REVENUE_BANDS.find((b) => b.value === value)?.label ?? value;
}

function formatMoney(n: number) {
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
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManageStatus = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [account, setAccount] = useState<Account | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [associatedLeads, setAssociatedLeads] = useState<Lead[]>([]);
  const [associatedDeals, setAssociatedDeals] = useState<Opportunity[]>([]);
  const [associatedContacts, setAssociatedContacts] = useState<Contact[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showScheduleMeeting, setShowScheduleMeeting] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);

  function loadAssociatedLeads() {
    if (!id) return;
    listLeads({ accountId: id, pageSize: 100 }).then((data) => setAssociatedLeads(data.data));
  }

  function loadAssociatedDeals() {
    if (!id) return;
    listDeals({ accountId: id, pageSize: 100 }).then((data) => setAssociatedDeals(data.data));
  }

  function loadAssociatedContacts() {
    if (!id) return;
    listContacts({ accountId: id, pageSize: 100 }).then((data) => setAssociatedContacts(data.data));
  }

  useEffect(() => {
    if (!id) return;
    getAccount(id).then(setAccount).catch(() => {});
    Promise.all([listUsers(), listStages('account_stages')])
      .then(([userRes, stageRes]) => { setUsers(userRes); setStages(stageRes as AccountStage[]); });
    loadAssociatedLeads();
    loadAssociatedDeals();
    loadAssociatedContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totalDealValue = associatedDeals.reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);
  const closedWonDeals = associatedDeals.filter((d) => d.stage.isClosedWon);
  const activeDeals = associatedDeals.filter((d) => !d.stage.isClosedWon && !d.stage.isClosedLost);
  const customerSince = closedWonDeals
    .map((d) => d.closedAt)
    .filter((d): d is string => !!d)
    .sort()[0];
  const mostRecentLead = associatedLeads.length
    ? [...associatedLeads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : undefined;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useRecordRecentlyViewed('company', account?.id, account?.name);

  if (!account) return <SkeletonDetailPage />;

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

  async function markStrategicAccount() {
    const target = stages.find((s) => s.name === 'Strategic Account');
    if (!target) { toast.error('Strategic Account stage not found'); return; }
    await saveField({ stageId: target.id });
  }

  async function markInactive() {
    const target = stages.find((s) => s.isInactiveStage);
    if (!target) { toast.error('Inactive stage not found'); return; }
    await saveField({ stageId: target.id });
  }

  async function duplicateRecord() {
    try {
      const payload: Record<string, any> = {
        name: `${account!.name} (Copy)`,
        domain: account!.domain,
        industry: account!.industry,
        sizeBucket: account!.sizeBucket,
        annualRevenue: account!.annualRevenue,
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
                {account.stage.isCustomerStage && account.stage.name !== 'Customer' && (
                  <span className="chip" style={{ background: '#16A34A22', color: '#16A34A' }}>Customer</span>
                )}
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
            <button className="btn secondary btn-icon" onClick={() => setShowScheduleMeeting(true)}><Icon name="calendar" size={14} /> Schedule Meeting</button>
            <div className="dropdown-wrap" ref={moreRef}>
              <button className="btn secondary btn-icon" onClick={() => setMoreOpen((o) => !o)}><Icon name="dots" size={14} /> More Actions</button>
              {moreOpen && (
                <div className="dropdown-menu">
                  <button onClick={() => { setMoreOpen(false); setShowEditModal(true); }}>Edit Details</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('owner'); scrollToKeyInfo(); }}>Change Owner</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('stage'); scrollToKeyInfo(); }}>Change Lifecycle Stage</button>
                  {canManageStatus && account.stage.name === 'Customer' && (
                    <button onClick={() => { setMoreOpen(false); markStrategicAccount(); }}>Mark Strategic Account</button>
                  )}
                  <button onClick={() => { setMoreOpen(false); scrollToNotes(); }}>Add Note</button>
                  <button onClick={() => { setMoreOpen(false); scrollToTasks(); }}>Add Task</button>
                  <button onClick={() => { setMoreOpen(false); setShowAddActivity(true); }}>Add Activity</button>
                  <button onClick={() => { setMoreOpen(false); setShowScheduleMeeting(true); }}>Schedule Meeting</button>
                  <button onClick={() => { setMoreOpen(false); duplicateRecord(); }}>Duplicate Record</button>
                  {canManageStatus && (
                    <button onClick={() => { setMoreOpen(false); setShowMergeModal(true); }}>Merge into…</button>
                  )}
                  <button onClick={() => { setMoreOpen(false); saveField({ archivedAt: account.archivedAt ? null : new Date().toISOString() }); }}>
                    {account.archivedAt ? 'Unarchive Record' : 'Archive Record'}
                  </button>
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
          <button className="quick-action" onClick={() => setShowScheduleMeeting(true)}>
            <span className="icon"><Icon name="calendar" size={18} /></span>Meeting
          </button>
        </div>
      </div>

      {account.lastInactivityAlertAt && !account.stage.isInactiveStage && (
        <div className="card" style={{ background: '#FEF3C7', border: '1px solid #F59E0B' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alert" size={14} />
              This company has been inactive for 180+ days. Recommended lifecycle stage: <strong>Inactive</strong>.
            </span>
            <button className="btn secondary" onClick={markInactive}>Mark as Inactive</button>
          </div>
        </div>
      )}

      <div className="detail-sidebar">
      <CollapsibleCard title="Key information" storageKey="collapsible:company:key-info">
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
          <Row label="Number of employees" value={account.sizeBucket} onEmptyClick={() => setShowEditModal(true)} />
          <EditableRow
            label="Annual revenue"
            value={formatRevenue(account.annualRevenue)}
            editing={editingField === 'revenue'}
            onStartEdit={() => setEditingField('revenue')}
          >
            <select
              autoFocus
              defaultValue={account.annualRevenue ?? ''}
              onChange={(e) => { saveField({ annualRevenue: e.target.value || null }); setEditingField(null); }}
              onBlur={() => setEditingField(null)}
            >
              <option value="">—</option>
              {REVENUE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </EditableRow>
          <EditableRow
            label="Lifecycle Stage"
            value={<span className="chip" style={{ background: account.stage.color + '22', color: account.stage.color }}>{account.stage.name}</span>}
            editing={editingField === 'stage'}
            onStartEdit={() => setEditingField('stage')}
          >
            <SearchSelect
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={account.stage.id}
              onChange={(v) => saveField({ stageId: v })}
              placeholder="Search lifecycle stage…"
            />
          </EditableRow>
          <Row
            label="Lead Status"
            value={mostRecentLead ? (
              <span className="chip" style={{ background: mostRecentLead.stage.color + '22', color: mostRecentLead.stage.color }}>
                {mostRecentLead.stage.name}
              </span>
            ) : undefined}
          />
          <Row label="Email" value={account.email} onEmptyClick={() => setShowEditModal(true)} />
          <Row label="Phone" value={account.phone} onEmptyClick={() => setShowEditModal(true)} />
          <Row
            label="Address"
            value={[account.address, account.city, account.state, account.country].filter(Boolean).join(', ') || undefined}
            onEmptyClick={() => setShowEditModal(true)}
          />
          <Row label="Associated Leads" value={associatedLeads.length} />
          <Row label="Associated Deals" value={associatedDeals.length} />
          <Row label="Active Contacts" value={associatedContacts.length} />
          {account.stage.isCustomerStage && (
            <Row label="Customer Since" value={customerSince ? new Date(customerSince).toLocaleDateString() : undefined} />
          )}
          <Row label="Total Deal Value" value={associatedDeals.length ? formatMoney(totalDealValue) : undefined} />
          <Row label="Active Deals" value={associatedDeals.length ? activeDeals.length : undefined} />
          <Row label="Closed Won Deals" value={associatedDeals.length ? closedWonDeals.length : undefined} />
        </div>
        {account.description && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{account.description}</div>
          </div>
        )}
      </CollapsibleCard>
      </div>

      <div className="detail-main">
      <AssociationsPanel
        groups={[
          {
            key: 'leads',
            label: `Leads (${associatedLeads.length})`,
            icon: 'person',
            emptyLabel: 'No leads linked to this company yet.',
            items: associatedLeads,
            onRowClick: (l: Lead) => navigate(`/leads/${l.id}`),
            columns: [
              { header: 'Lead Name', render: (l: Lead) => <Link to={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()}>{leadName(l)}</Link> },
              { header: 'Owner', render: (l: Lead) => l.owner?.fullName ?? '—' },
              { header: 'Stage', render: (l: Lead) => <span className="chip" style={{ background: l.stage.color + '22', color: l.stage.color }}>{l.stage.name}</span> },
              { header: 'Email', render: (l: Lead) => l.email ?? '—' },
              { header: 'Mobile Number', render: (l: Lead) => l.mobile ?? '—' },
              { header: 'Last Activity', render: (l: Lead) => (l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : '—') },
            ],
          },
          {
            key: 'deals',
            label: `Deals (${associatedDeals.length})`,
            icon: 'dollar',
            emptyLabel: 'No deals linked to this company yet.',
            items: associatedDeals,
            onRowClick: (d: Opportunity) => navigate(`/deals/${d.id}`),
            columns: [
              { header: 'Deal Name', render: (d: Opportunity) => <Link to={`/deals/${d.id}`} onClick={(e) => e.stopPropagation()}>{d.name}</Link> },
              { header: 'Owner', render: (d: Opportunity) => d.owner?.fullName ?? '—' },
              { header: 'Stage', render: (d: Opportunity) => <span className="chip" style={{ background: d.stage.color + '22', color: d.stage.color }}>{d.stage.name}</span> },
              { header: 'Amount', render: (d: Opportunity) => (d.amount ? formatMoney(parseFloat(d.amount)) : '—') },
              { header: 'Close Date', render: (d: Opportunity) => (d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '—') },
            ],
          },
          {
            key: 'contacts',
            label: `Contacts (${associatedContacts.length})`,
            icon: 'person',
            emptyLabel: 'No contacts linked to this company yet.',
            items: associatedContacts,
            addAction: { label: '+ Add Contact', onClick: () => setShowContactForm(true) },
            columns: [
              { header: 'Name', render: (c: Contact) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact' },
              { header: 'Email', render: (c: Contact) => c.email ?? '—' },
              { header: 'Job Title', render: (c: Contact) => c.jobTitle ?? '—' },
            ],
          },
        ] as AssociationGroup[]}
      />

      {/* Distinct key prefixes — sibling components sharing the same key value
          makes React reconciliation duplicate/omit cards on re-render. */}
      <ActivityTimeline
        key={`activity-${activityKey}`}
        accountId={account.id}
        relatedLeadIds={associatedLeads.map((l) => l.id)}
        relatedOpportunityIds={associatedDeals.map((d) => d.id)}
      />
      <TasksWidget key={`tasks-${activityKey}`} accountId={account.id} />
      <SupportTicketsWidget key={`tickets-${activityKey}`} accountId={account.id} />
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

      {showAddActivity && (
        <AddActivityModal
          accountId={account.id}
          onClose={() => setShowAddActivity(false)}
          onSaved={() => { setShowAddActivity(false); setActivityKey((k) => k + 1); toast.success('Activity added'); }}
        />
      )}

      {showScheduleMeeting && (
        <ScheduleMeetingModal
          accountId={account.id}
          defaultTitle={`Meeting with ${account.name}`}
          attendeeName={account.name}
          attendeeEmail={account.email}
          onClose={() => setShowScheduleMeeting(false)}
          onScheduled={() => {
            setShowScheduleMeeting(false);
            setActivityKey((k) => k + 1);
            toast.success('Meeting scheduled — invite downloaded');
          }}
        />
      )}

      {showContactForm && (
        <ContactForm
          accountId={account.id}
          onClose={() => setShowContactForm(false)}
          onSaved={() => { setShowContactForm(false); loadAssociatedContacts(); toast.success('Contact added'); }}
        />
      )}

      {showMergeModal && (
        <MergeCompanyModal
          source={account}
          onClose={() => setShowMergeModal(false)}
          onMerged={(targetId) => {
            setShowMergeModal(false);
            toast.success('Companies merged');
            navigate(`/companies/${targetId}`);
          }}
        />
      )}
    </div>
  );
}
