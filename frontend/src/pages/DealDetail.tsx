import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Account, ActivityType, Contact, DealContact, DealContactRole, DealStage, ForecastCategory, Opportunity, User,
} from '../api/types';
import {
  getDeal, updateDeal, createDeal, deleteDeal,
} from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listContacts } from '../api/contacts';
import { listDealContacts, replaceDealContacts } from '../api/dealContacts';
import { LinkContactsModal } from '../components/LinkContactsModal';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { DealForm } from '../components/DealForm';
import { QuickTaskModal } from '../components/QuickTaskModal';
import { AiAssistCard } from '../components/AiAssistCard';
import { EngagementScoreCell } from '../components/EngagementScoreCell';
import { DispositionReasonModal } from '../components/DispositionReasonModal';
import { DEAL_LOSS_REASONS, DEAL_LOSS_REASON_OTHER } from '../utils/dealLossReasons';
import { Icon } from '../components/Icon';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { AssociationsPanel } from '../components/AssociationsPanel';
import type { AssociationGroup } from '../components/AssociationsPanel';
import { SkeletonDetailPage } from '../components/Skeleton';
import { StageHistoryCard } from '../components/StageHistoryCard';
import { ProposalsCard } from '../components/ProposalsCard';
import { HealthRenewalCard } from '../components/HealthRenewalCard';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { timeAgo } from '../utils/timeAgo';
import { closedWonHandoverMessage } from '../utils/dealAutomation';
import { useRecordRecentlyViewed } from '../hooks/useRecentlyViewed';
import { evaluateStageAutomation } from '../utils/stageAutomation';
import {
  FORECAST_LABELS, FORECAST_ORDER, deriveForecastCategory, isMoreOptimistic,
} from '../utils/forecast';

const ROLE_LABELS: Record<DealContactRole, string> = {
  DECISION_MAKER: 'Decision Maker', CHAMPION: 'Champion', INFLUENCER: 'Influencer', BLOCKER: 'Blocker', OTHER: 'Other',
};
const ROLE_GROUP_ORDER: DealContactRole[] = ['DECISION_MAKER', 'CHAMPION', 'INFLUENCER', 'BLOCKER', 'OTHER'];

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

function priorityColor(p: Opportunity['priority']) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function contactName(deal: Opportunity) {
  if (!deal.contact) return undefined;
  return [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') || deal.contact.email;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dealContacts, setDealContacts] = useState<DealContact[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [quickTaskType, setQuickTaskType] = useState<'CALL' | 'EMAIL' | 'MEETING' | 'OTHER' | null>(null);
  const [pendingDealStageId, setPendingDealStageId] = useState<string | null>(null);
  const [forecastDraft, setForecastDraft] = useState<ForecastCategory | null>(null);
  const [forecastJustificationDraft, setForecastJustificationDraft] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const [showLinkContacts, setShowLinkContacts] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  function loadDealContacts() {
    if (!id) return;
    listDealContacts(id).then(setDealContacts).catch(() => {});
  }

  useEffect(() => {
    if (!id) return;
    getDeal(id).then(setDeal).catch(() => {});
    loadDealContacts();
    Promise.all([
      listUsers(),
      listStages('deal_stages'),
      listAccounts({ pageSize: 100 }),
      listContacts({ pageSize: 100 }),
    ]).then(([userRes, stageRes, accountRes, contactRes]) => {
      setUsers(userRes);
      setStages(stageRes as DealStage[]);
      setAccounts(accountRes.data);
      setContacts(contactRes.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useRecordRecentlyViewed('deal', deal?.id, deal?.name);

  if (!deal) return <SkeletonDetailPage />;

  async function saveField(data: Record<string, any>) {
    const prevStage = deal!.stage;
    try {
      const updated = await updateDeal(deal!.id, data);
      setDeal(updated);
      setEditingField(null);
      setActivityKey((k) => k + 1);
      toast.success('Deal updated');
      const handoverMsg = closedWonHandoverMessage(prevStage, updated.stage);
      if (handoverMsg) toast.success(handoverMsg);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update deal');
    }
  }

  function onInlineStageChange(newStageId: string) {
    const newStage = stages.find((s) => s.id === newStageId);
    if (newStage?.isClosedLost) {
      setPendingDealStageId(newStageId);
      return;
    }
    saveField({ stageId: newStageId });
  }

  function confirmLossReason(reason: string, other: string) {
    const stageId = pendingDealStageId;
    setPendingDealStageId(null);
    if (!stageId) return;
    const label = DEAL_LOSS_REASONS.find((r) => r.value === reason)?.label ?? reason;
    saveField({ stageId, lossReason: reason === DEAL_LOSS_REASON_OTHER ? other : label });
  }

  // Forecast override: picking something MORE optimistic than the
  // stage-derived default demands a short justification first (modal below);
  // equal-or-less optimistic picks save straight through.
  function selectForecast(value: ForecastCategory | '') {
    setEditingField(null);
    const derived = deriveForecastCategory(deal!.stage);
    if (value === '' || value === derived) {
      saveField({ forecastCategory: null, forecastJustification: null });
      return;
    }
    if (isMoreOptimistic(value, derived)) {
      setForecastDraft(value);
      setForecastJustificationDraft('');
      return;
    }
    saveField({ forecastCategory: value, forecastJustification: null });
  }

  async function onQuickTaskSaved(activityType: ActivityType, wasCompleted: boolean) {
    setQuickTaskType(null);
    setActivityKey((k) => k + 1);
    toast.success(wasCompleted ? 'Logged' : 'Task scheduled');
    // Activity-based stage advancement — only for things that already
    // happened, not a future scheduled task. Toast with Undo, never silent.
    if (!wasCompleted) return;
    const result = await evaluateStageAutomation(deal!, activityType);
    const refreshed = await getDeal(deal!.id).catch(() => null);
    if (refreshed) setDeal(refreshed);
    if (result) {
      toast.success(result.message, {
        label: 'Undo',
        onClick: () => {
          result.undo().then(() => getDeal(deal!.id).then(setDeal)).catch(() => toast.error('Could not undo stage change'));
        },
      });
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
        contactId: deal!.contact?.id,
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
            <button className="btn secondary btn-icon" onClick={() => setQuickTaskType('MEETING')}><Icon name="calendar" size={14} /> Schedule Meeting</button>
            <div className="dropdown-wrap" ref={moreRef}>
              <button className="btn secondary btn-icon" onClick={() => setMoreOpen((o) => !o)}><Icon name="dots" size={14} /> More Actions</button>
              {moreOpen && (
                <div className="dropdown-menu">
                  <button onClick={() => { setMoreOpen(false); setShowEditModal(true); }}>Edit Details</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('owner'); scrollToKeyInfo(); }}>Change Owner</button>
                  <button onClick={() => { setMoreOpen(false); setEditingField('stage'); scrollToKeyInfo(); }}>Change Status</button>
                  <button onClick={() => { setMoreOpen(false); scrollToNotes(); }}>Add Note</button>
                  <button onClick={() => { setMoreOpen(false); scrollToTasks(); }}>Add Task</button>
                  <button onClick={() => { setMoreOpen(false); setQuickTaskType('MEETING'); }}>Schedule Meeting</button>
                  <button onClick={() => { setMoreOpen(false); duplicateRecord(); }}>Duplicate Record</button>
                  <button onClick={() => { setMoreOpen(false); saveField({ archivedAt: deal.archivedAt ? null : new Date().toISOString() }); }}>
                    {deal.archivedAt ? 'Unarchive Record' : 'Archive Record'}
                  </button>
                  <button style={{ color: '#DC2626' }} onClick={() => { setMoreOpen(false); deleteRecord(); }}>Delete Record</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="quick-actions">
          <button
            type="button"
            className={`quick-action${deal.contact?.email ? '' : ' disabled'}`}
            disabled={!deal.contact?.email}
            title={deal.contact?.email ? `Log an email to ${deal.contact.email}` : 'No email on file'}
            onClick={() => setQuickTaskType('EMAIL')}
          >
            <span className="icon"><Icon name="mail" size={18} /></span>Email
          </button>
          <button
            type="button"
            className={`quick-action${deal.contact?.mobile ? '' : ' disabled'}`}
            disabled={!deal.contact?.mobile}
            title={deal.contact?.mobile ? `Log a call to ${deal.contact.mobile}` : 'No mobile number on file'}
            onClick={() => setQuickTaskType('CALL')}
          >
            <span className="icon"><Icon name="phone" size={18} /></span>Call
          </button>
          <button className="quick-action" onClick={scrollToNotes}>
            <span className="icon"><Icon name="note" size={18} /></span>Note
          </button>
          <button className="quick-action" onClick={scrollToTasks}>
            <span className="icon"><Icon name="check" size={18} /></span>Task
          </button>
          <button className="quick-action" onClick={() => setQuickTaskType('MEETING')}>
            <span className="icon"><Icon name="calendar" size={18} /></span>Meeting
          </button>
          <button className="quick-action" onClick={() => setQuickTaskType('OTHER')}>
            <span className="icon"><Icon name="dots" size={18} /></span>Other
          </button>
        </div>
      </div>

      <div className="detail-sidebar">
      <CollapsibleCard title="Key information" storageKey="collapsible:deal:key-info">
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
          {deal.additionalOwners && deal.additionalOwners.length > 0 && (
            <Row label="Additional Owners" value={deal.additionalOwners.map((o) => o.fullName).join(', ')} />
          )}
          <EditableRow
            label="Company"
            value={deal.account ? (
              <>
                <Link to={`/companies/${deal.account.id}`}>{deal.account.name}</Link>
                {deal.account.stage && (
                  <span className="chip" style={{ background: deal.account.stage.color + '22', color: deal.account.stage.color, marginLeft: 6 }}>
                    {deal.account.stage.name}
                  </span>
                )}
              </>
            ) : undefined}
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
            value={contactName(deal)}
            editing={editingField === 'contact'}
            onStartEdit={() => setEditingField('contact')}
          >
            <SearchSelect
              options={contacts.map((c) => ({
                value: c.id, label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact',
              }))}
              value={deal.contact?.id ?? ''}
              onChange={(v) => saveField({ contactId: v })}
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
              onChange={(v) => v && onInlineStageChange(v)}
              placeholder="Search stage…"
            />
          </EditableRow>
          <Row label="Probability" value={`${deal.stage.winProbability}%`} />
          <Row
            label="Expected Revenue"
            value={(
              <span>
                {formatValue(deal.expectedRevenue
                  ?? String((Number(deal.amount) || 0) * (deal.probabilityOverride ?? deal.stage.winProbability) / 100))}
                {!deal.expectedRevenue && <span style={{ color: 'var(--muted)', fontSize: 12 }}> (auto)</span>}
              </span>
            )}
          />
          <Row label="Engagement Score" value={<EngagementScoreCell kind="deal" id={deal.id} score={deal.score} />} />
          <EditableRow
            label="Forecast Category"
            value={(
              <span>
                {FORECAST_LABELS[deal.forecastCategory ?? deriveForecastCategory(deal.stage)]}
                {!deal.forecastCategory && <span style={{ color: 'var(--muted)', fontSize: 12 }}> (auto)</span>}
              </span>
            )}
            editing={editingField === 'forecast'}
            onStartEdit={() => setEditingField('forecast')}
          >
            <select
              autoFocus
              defaultValue={deal.forecastCategory ?? ''}
              onBlur={() => setEditingField(null)}
              onChange={(e) => selectForecast(e.target.value as ForecastCategory | '')}
            >
              <option value="">Auto ({FORECAST_LABELS[deriveForecastCategory(deal.stage)]})</option>
              {FORECAST_ORDER.map((c) => <option key={c} value={c}>{FORECAST_LABELS[c]}</option>)}
            </select>
          </EditableRow>
          {deal.forecastCategory && deal.forecastJustification && (
            <Row label="Forecast Justification" value={deal.forecastJustification} />
          )}
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
          <EditableRow
            label="Priority"
            value={<span className="chip" style={{ background: priorityColor(deal.priority) + '22', color: priorityColor(deal.priority) }}>{deal.priority}</span>}
            editing={editingField === 'priority'}
            onStartEdit={() => setEditingField('priority')}
          >
            <select
              autoFocus
              defaultValue={deal.priority}
              onBlur={() => setEditingField(null)}
              onChange={(e) => saveField({ priority: e.target.value })}
            >
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </EditableRow>
          {deal.stage.isClosedLost && (
            <EditableRow
              label="Closed lost reason"
              value={deal.lossReason}
              editing={editingField === 'lossReason'}
              onStartEdit={() => setEditingField('lossReason')}
            >
              <input
                autoFocus
                defaultValue={deal.lossReason ?? ''}
                onBlur={(e) => saveField({ lossReason: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingField(null);
                }}
              />
            </EditableRow>
          )}
          <Row label="Source" value={deal.source} />
          <Row
            label="Closing date"
            value={deal.closeDate ? new Date(deal.closeDate).toLocaleDateString() : undefined}
            onEmptyClick={() => setShowEditModal(true)}
          />
          <Row label="Last activity date" value={deal.lastActivityAt ? new Date(deal.lastActivityAt).toLocaleDateString() : undefined} />
          <Row label="Days in current stage" value={deal.daysInCurrentStage !== undefined ? String(deal.daysInCurrentStage) : undefined} />
        </div>
        {deal.description && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{deal.description}</div>
          </div>
        )}
      </CollapsibleCard>
      </div>

      <div className="detail-main">
      <AssociationsPanel
        groups={[
          {
            key: 'company',
            label: 'Company',
            icon: 'building',
            emptyLabel: 'Not linked to a company yet.',
            items: deal.account ? [deal.account] : [],
            onRowClick: (a: NonNullable<Opportunity['account']>) => navigate(`/companies/${a.id}`),
            columns: [
              {
                header: 'Company Name',
                render: (a: NonNullable<Opportunity['account']>) => (
                  <>
                    <Link to={`/companies/${a.id}`} onClick={(e) => e.stopPropagation()}>{a.name}</Link>
                    {a.stage && (
                      <span className="chip" style={{ background: a.stage.color + '22', color: a.stage.color, marginLeft: 6 }}>{a.stage.name}</span>
                    )}
                  </>
                ),
              },
            ],
          },
        ] as AssociationGroup[]}
      />

      <CollapsibleCard title={`Contacts by Role (${dealContacts.length + (deal.contact ? 1 : 0)})`} storageKey="collapsible:deal:contacts-by-role">
        <button className="btn secondary btn-icon" style={{ marginBottom: 12 }} onClick={() => setShowLinkContacts(true)}>
          <Icon name="person" size={13} /> Link Contact
        </button>
        {!deal.contact && dealContacts.length === 0 && (
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0 }}>No contacts linked to this deal yet.</p>
        )}
        {deal.contact && (
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Primary Contact</div>
            <div style={{ fontSize: 14 }}>
              <Link to={`/contacts/${deal.contact.id}`}>
                {[deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') || deal.contact.email || 'Untitled contact'}
              </Link>
              {deal.contact.email && <span style={{ color: 'var(--muted)' }}> — {deal.contact.email}</span>}
            </div>
          </div>
        )}
        {ROLE_GROUP_ORDER.map((role) => {
          const group = dealContacts.filter((dc) => dc.role === role && dc.contact);
          if (group.length === 0) return null;
          return (
            <div key={role} style={{ marginBottom: 14 }}>
              <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{ROLE_LABELS[role]}</div>
              {group.map((dc) => (
                <div key={dc.contactId} style={{ fontSize: 14, padding: '2px 0' }}>
                  <Link to={`/contacts/${dc.contact!.id}`}>
                    {[dc.contact!.firstName, dc.contact!.lastName].filter(Boolean).join(' ') || dc.contact!.email || 'Untitled contact'}
                  </Link>
                  {dc.contact!.email && <span style={{ color: 'var(--muted)' }}> — {dc.contact!.email}</span>}
                </div>
              ))}
            </div>
          );
        })}
        {!dealContacts.some((dc) => dc.role === 'DECISION_MAKER') && (deal.contact || dealContacts.length > 0) && (
          <div className="helper-text" style={{ color: '#DC2626' }}>
            ⚠ No Decision Maker identified on this deal — a known win-rate risk.
          </div>
        )}
      </CollapsibleCard>

      <ProposalsCard opportunityId={deal.id} deal={deal} />
      <AiAssistCard
        dealId={deal.id}
        contactName={deal.contact ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') : undefined}
        contactEmail={deal.contact?.email}
        contactPhone={deal.contact?.mobile}
      />
      {deal.stage.isClosedWon && <HealthRenewalCard deal={deal} onDealUpdated={setDeal} />}
      <StageHistoryCard opportunityId={deal.id} />
      {/* Distinct key prefixes — sibling components sharing the same key value
          makes React reconciliation duplicate/omit cards on re-render. */}
      <ActivityTimeline key={`activity-${activityKey}`} opportunityId={deal.id} />
      <TasksWidget key={`tasks-${activityKey}`} opportunityId={deal.id} onChanged={() => setActivityKey((k) => k + 1)} />
      <NotesSection opportunityId={deal.id} />
      </div>
      </div>

      {showEditModal && (
        <DealForm
          deal={deal}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setDeal(updated); setShowEditModal(false); setActivityKey((k) => k + 1); toast.success('Deal updated');
            const handoverMsg = closedWonHandoverMessage(deal.stage, updated.stage);
            if (handoverMsg) toast.success(handoverMsg);
          }}
        />
      )}

      {quickTaskType && (
        <QuickTaskModal
          type={quickTaskType}
          opportunityId={deal.id}
          contactId={deal.contact?.id}
          defaultTitle={`${quickTaskType === 'CALL' ? 'Call' : quickTaskType === 'EMAIL' ? 'Email' : quickTaskType === 'MEETING' ? 'Meeting' : 'Activity'} with ${deal.contact ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') || deal.contact.email : deal.name}`}
          contactName={deal.contact ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') : undefined}
          contactEmail={deal.contact?.email}
          contactPhone={deal.contact?.mobile}
          onClose={() => setQuickTaskType(null)}
          onSaved={onQuickTaskSaved}
        />
      )}

      {pendingDealStageId && (
        <DispositionReasonModal
          title="Why is this deal closed lost?"
          options={DEAL_LOSS_REASONS}
          otherTriggerValue={DEAL_LOSS_REASON_OTHER}
          onConfirm={confirmLossReason}
          onCancel={() => setPendingDealStageId(null)}
        />
      )}

      {showLinkContacts && (
        <LinkContactsModal
          currentContactIds={dealContacts.map((dc) => dc.contactId)}
          accountId={deal.account?.id}
          onClose={() => setShowLinkContacts(false)}
          onSave={async (contactIds) => {
            const roleByContact = new Map(dealContacts.map((dc) => [dc.contactId, dc.role]));
            await replaceDealContacts(deal.id, contactIds.map((contactId) => ({
              contactId, role: roleByContact.get(contactId) ?? 'OTHER',
            })));
            loadDealContacts();
            toast.success('Contacts updated');
          }}
        />
      )}

      {forecastDraft && (
        <div className="modal-overlay" onClick={() => setForecastDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Justify forecast override</h3>
            <p className="helper-text" style={{ marginTop: 0 }}>
              You're setting <strong>{FORECAST_LABELS[forecastDraft]}</strong> — more optimistic than the stage-derived{' '}
              <strong>{FORECAST_LABELS[deriveForecastCategory(deal.stage)]}</strong>. A short justification is required.
            </p>
            <div className="field"><label>Justification*</label>
              <textarea
                rows={3}
                autoFocus
                value={forecastJustificationDraft}
                onChange={(e) => setForecastJustificationDraft(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                className="btn"
                disabled={!forecastJustificationDraft.trim()}
                onClick={() => {
                  saveField({ forecastCategory: forecastDraft, forecastJustification: forecastJustificationDraft.trim() });
                  setForecastDraft(null);
                }}
              >
                Save override
              </button>
              <button className="btn secondary" onClick={() => setForecastDraft(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
