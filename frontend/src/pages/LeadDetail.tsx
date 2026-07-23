import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { DealContactRole, Lead, LeadStage, User } from '../api/types';
import {
  getLead, updateLead, createLead, deleteLead, getConvertedDeal,
} from '../api/leads';
import {
  listLeadContacts, replaceLeadContacts, setLeadContactRole,
} from '../api/leadContacts';
import type { LeadContact } from '../api/leadContacts';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { NotesSection } from '../components/NotesSection';
import { TasksWidget } from '../components/TasksWidget';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import { LeadForm } from '../components/LeadForm';
import { QuickTaskModal } from '../components/QuickTaskModal';
import { AiAssistCard } from '../components/AiAssistCard';
import { EngagementScoreCell } from '../components/EngagementScoreCell';
import { DispositionReasonModal } from '../components/DispositionReasonModal';
import { UNQUALIFIED_REASONS } from '../utils/leadUnqualifiedReasons';
import { LeadQualificationCard } from '../components/LeadQualificationCard';
import { ConvertToDealModal } from '../components/ConvertToDealModal';
import { LinkContactsModal } from '../components/LinkContactsModal';
import { SelectWithOther } from '../components/SelectWithOther';
import { Icon } from '../components/Icon';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { AssociationsPanel } from '../components/AssociationsPanel';
import type { AssociationGroup } from '../components/AssociationsPanel';
import { SkeletonDetailPage } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../utils/timeAgo';
import { evaluateLeadAutomation } from '../utils/leadAutomation';
import { isMqlReady, BANT_WARNING_MESSAGE } from '../utils/leadQualification';
import { useRecordRecentlyViewed } from '../hooks/useRecentlyViewed';

const RATING_LABELS: Record<string, string> = { HOT: 'Hot', WARM: 'Warm', COLD: 'Cold' };
const UNQUALIFIED_REASON_LABELS: Record<string, string> = {
  NO_BUDGET: 'No Budget', NOT_A_FIT: 'Not a Fit', NO_RESPONSE: 'No Response', COMPETITOR: 'Competitor', BAD_DATA: 'Bad Data', OTHER: 'Other',
};
const CONTACT_ROLE_OPTIONS = ['DECISION_MAKER', 'CHAMPION', 'INFLUENCER', 'BLOCKER', 'OTHER'].map((r) => ({ value: r, label: r.replace('_', ' ') }));

function LeadContactRoleCell({ contact, onSave }: { contact: LeadContact; onSave: (role: DealContactRole, roleOther?: string) => void }) {
  const [roleOther, setRoleOther] = useState(contact.roleOther ?? '');
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <SelectWithOther
        options={CONTACT_ROLE_OPTIONS}
        value={contact.role}
        onChange={(v) => onSave(v as DealContactRole, roleOther)}
        otherValue={roleOther}
        onOtherChange={setRoleOther}
        onOtherBlur={(v) => onSave('OTHER', v)}
      />
    </div>
  );
}

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
  const { user: currentUser } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [quickTaskType, setQuickTaskType] = useState<'CALL' | 'EMAIL' | 'MEETING' | 'OTHER' | null>(null);
  const [pendingLeadStageId, setPendingLeadStageId] = useState<string | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showQualifiedPrompt, setShowQualifiedPrompt] = useState(false);
  const [convertedDeal, setConvertedDeal] = useState<{ id: string; name: string } | null>(null);
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [showLinkContacts, setShowLinkContacts] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityKey, setActivityKey] = useState(0);
  const [overrideEdit, setOverrideEdit] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const canOverride = currentUser?.role === 'ADMIN' || currentUser?.role === 'SALES_MANAGER';

  function loadContacts() {
    if (!id) return;
    listLeadContacts(id).then(setContacts).catch(() => {});
  }

  function load() {
    if (!id) return;
    getLead(id).then(setLead).catch(() => {});
    getConvertedDeal(id).then(setConvertedDeal).catch(() => {});
    loadContacts();
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

  useRecordRecentlyViewed('lead', lead?.id, lead
    ? (lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead')
    : undefined);

  if (!lead) return <SkeletonDetailPage />;

  const name = lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead';
  const locked = !!lead.convertedAt;
  const canEdit = !locked || overrideEdit;

  async function onInlineStageChange(newStageId: string) {
    const prevStage = lead!.stage;
    const newStage = stages.find((s) => s.id === newStageId);
    const movingToQualified = newStage?.isWon && !prevStage.isWon;
    if (movingToQualified && !isMqlReady(lead!)) {
      const ok = await confirm(BANT_WARNING_MESSAGE, { title: 'BANT/ICP not completed' });
      if (!ok) return;
    }
    if (newStage?.isLost) {
      setPendingLeadStageId(newStageId);
      return;
    }
    await saveField({ stageId: newStageId });
    if (movingToQualified) setShowQualifiedPrompt(true);
  }

  async function confirmUnqualifiedReason(reason: string, other: string) {
    const stageId = pendingLeadStageId;
    setPendingLeadStageId(null);
    if (!stageId) return;
    await saveField({
      stageId, unqualifiedReason: reason, unqualifiedReasonOther: reason === 'OTHER' ? other : undefined,
    });
  }

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

  async function onQuickTaskSaved(activityType: import('../api/types').ActivityType, wasCompleted: boolean) {
    setQuickTaskType(null);
    setActivityKey((k) => k + 1);
    toast.success(wasCompleted ? 'Logged' : 'Task scheduled');
    // Lead progression automation (New -> Attempted Contact -> Contacted) —
    // only for things that already happened, not a future scheduled task.
    // Toast with Undo, never silent; Qualified stays gated behind MQL.
    if (!wasCompleted) return;
    const result = await evaluateLeadAutomation(lead!, activityType, stages);
    const refreshed = await getLead(lead!.id).catch(() => null);
    if (refreshed) setLead(refreshed);
    if (result) {
      toast.success(result.message, {
        label: 'Undo',
        onClick: () => {
          result.undo().then(() => getLead(lead!.id).then(setLead)).catch(() => toast.error('Could not undo stage change'));
        },
      });
    }
  }

  async function duplicateRecord() {
    try {
      const payload: Record<string, any> = {
        firstName: lead!.firstName,
        lastName: lead!.lastName,
        mobile: lead!.mobile,
        companyName: lead!.account?.name,
        jobTitle: lead!.jobTitle,
        city: lead!.city,
        sourceId: lead!.source?.id,
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
                {locked && <span className="chip lead-locked-badge">Converted — locked</span>}
                {lead.owner && (
                  <span className="owner-chip">
                    <span className="avatar avatar-sm">{ownerInitials(lead.owner.fullName)}</span>
                    {lead.owner.fullName}
                  </span>
                )}
                <span className="detail-updated">Updated {timeAgo(lead.lastActivityAt ?? lead.updatedAt)}</span>
              </div>
              {locked && canOverride && !overrideEdit && (
                <button type="button" className="link-btn" onClick={() => setOverrideEdit(true)}>Edit anyway (admin)</button>
              )}
            </div>
          </div>
          <div className="detail-header-actions">
            {canEdit && (
              <button className="btn btn-icon" onClick={() => setShowEditModal(true)}><Icon name="edit" size={14} /> Edit Details</button>
            )}
            {!lead.convertedAt && (
              <button
                className="btn btn-icon"
                style={{ background: lead.stage.isWon ? '#16A34A' : undefined }}
                onClick={() => setShowConvertModal(true)}
                disabled={!lead.stage.isWon}
                title={lead.stage.isWon ? undefined : 'Available once this lead is marked Qualified'}
              >
                <Icon name="check" size={14} /> Convert to Deal
              </button>
            )}
            <button className="btn secondary btn-icon" onClick={scrollToTasks}><Icon name="check" size={14} /> Add Task</button>
            <button className="btn secondary btn-icon" onClick={() => setQuickTaskType('MEETING')}><Icon name="calendar" size={14} /> Schedule Meeting</button>
            <div className="dropdown-wrap" ref={moreRef}>
              <button className="btn secondary btn-icon" onClick={() => setMoreOpen((o) => !o)}><Icon name="dots" size={14} /> More Actions</button>
              {moreOpen && (
                <div className="dropdown-menu">
                  {canEdit && <button onClick={() => { setMoreOpen(false); setShowEditModal(true); }}>Edit Details</button>}
                  {canEdit && <button onClick={() => { setMoreOpen(false); setEditingField('owner'); scrollToKeyInfo(); }}>Change Owner</button>}
                  {canEdit && <button onClick={() => { setMoreOpen(false); setEditingField('stage'); scrollToKeyInfo(); }}>Change Status</button>}
                  <button onClick={() => { setMoreOpen(false); scrollToNotes(); }}>Add Note</button>
                  <button onClick={() => { setMoreOpen(false); scrollToTasks(); }}>Add Task</button>
                  <button onClick={() => { setMoreOpen(false); setQuickTaskType('MEETING'); }}>Schedule Meeting</button>
                  <button onClick={() => { setMoreOpen(false); duplicateRecord(); }}>Duplicate Record</button>
                  <button onClick={() => { setMoreOpen(false); saveField({ archivedAt: lead.archivedAt ? null : new Date().toISOString() }); }}>
                    {lead.archivedAt ? 'Unarchive Record' : 'Archive Record'}
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
            className="quick-action"
            title={lead.email ? `Log an email to ${lead.email}` : 'Log an email'}
            onClick={() => setQuickTaskType('EMAIL')}
          >
            <span className="icon"><Icon name="mail" size={18} /></span>Email
          </button>
          <button
            type="button"
            className="quick-action"
            title={lead.mobile ? `Log a call to ${lead.mobile}` : 'Log a call'}
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
      <CollapsibleCard title="Key information" storageKey="collapsible:lead:key-info">
        <div className="key-info">
          <EditableRow
            label="Lead owner"
            value={lead.owner?.fullName}
            editing={editingField === 'owner'}
            onStartEdit={() => setEditingField('owner')}
            editable={canEdit}
          >
            <SearchSelect
              options={users.map((u) => ({ value: u.id, label: u.fullName }))}
              value={lead.owner?.id ?? ''}
              onChange={(v) => v && saveField({ ownerId: v })}
              placeholder="Search owner…"
            />
          </EditableRow>
          {lead.additionalOwners && lead.additionalOwners.length > 0 && (
            <Row label="Additional Owners" value={lead.additionalOwners.map((o) => o.fullName).join(', ')} />
          )}
          <Row label="Job Title" value={lead.jobTitle} onEmptyClick={canEdit ? () => setShowEditModal(true) : undefined} />
          <Row label="Mobile Number" value={lead.mobile} onEmptyClick={canEdit ? () => setShowEditModal(true) : undefined} />
          <Row label="Email" value={lead.email} onEmptyClick={canEdit ? () => setShowEditModal(true) : undefined} />
          <EditableRow
            label="Stage"
            value={<span className="chip" style={{ background: lead.stage.color + '22', color: lead.stage.color }}>{lead.stage.name}</span>}
            editing={editingField === 'stage'}
            onStartEdit={() => setEditingField('stage')}
            editable={canEdit}
          >
            <SearchSelect
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={lead.stage.id}
              onChange={(v) => v && onInlineStageChange(v)}
              placeholder="Search stage…"
            />
          </EditableRow>
          <Row label="Engagement Score" value={<EngagementScoreCell kind="lead" id={lead.id} score={lead.score} />} />
          <Row label="Lead Source" value={lead.source?.name} onEmptyClick={canEdit ? () => setShowEditModal(true) : undefined} />
          <Row label="Rating" value={lead.rating ? RATING_LABELS[lead.rating] : undefined} onEmptyClick={canEdit ? () => setShowEditModal(true) : undefined} />
          {lead.unqualifiedReason && (
            <Row
              label="Unqualified Reason"
              value={lead.unqualifiedReason === 'OTHER' && lead.unqualifiedReasonOther
                ? `Other — ${lead.unqualifiedReasonOther}`
                : UNQUALIFIED_REASON_LABELS[lead.unqualifiedReason]}
            />
          )}
          <EditableRow
            label="Lead Value"
            value={lead.value ? parseFloat(lead.value).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : undefined}
            editing={editingField === 'value'}
            onStartEdit={() => setEditingField('value')}
            editable={canEdit}
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
            editable={canEdit}
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
          {convertedDeal && (
            <Row label="Converted to Deal" value={<Link to={`/deals/${convertedDeal.id}`}>{convertedDeal.name}</Link>} />
          )}
          <Row label="Created By" value={lead.createdBy?.fullName} />
          <Row label="Created" value={new Date(lead.createdAt).toLocaleDateString()} />
        </div>
        {lead.notes && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{lead.notes}</div>
          </div>
        )}
      </CollapsibleCard>
      <LeadQualificationCard lead={lead} onSaved={setLead} />
      </div>

      <div className="detail-main">
      <AssociationsPanel
        groups={[
          {
            key: 'company',
            label: 'Company',
            icon: 'building',
            emptyLabel: 'Not linked to a company yet.',
            items: lead.account ? [lead.account] : [],
            onRowClick: (a: { id: string; name: string }) => navigate(`/companies/${a.id}`),
            columns: [
              { header: 'Company Name', render: (a: { id: string; name: string }) => <Link to={`/companies/${a.id}`} onClick={(e) => e.stopPropagation()}>{a.name}</Link> },
            ],
          },
          {
            key: 'deal',
            label: 'Deal',
            icon: 'dollar',
            emptyLabel: 'Not converted to a deal yet.',
            items: convertedDeal ? [convertedDeal] : [],
            onRowClick: (d: { id: string; name: string }) => navigate(`/deals/${d.id}`),
            columns: [
              { header: 'Deal Name', render: (d: { id: string; name: string }) => <Link to={`/deals/${d.id}`} onClick={(e) => e.stopPropagation()}>{d.name}</Link> },
            ],
          },
          {
            key: 'contacts',
            label: `Contacts (${contacts.length})`,
            icon: 'person',
            emptyLabel: 'No contacts linked to this lead yet.',
            items: contacts,
            addAction: { label: '+ Link Contact', onClick: () => setShowLinkContacts(true) },
            onRowClick: (c: LeadContact) => navigate(`/contacts/${c.id}`),
            columns: [
              { header: 'Name', render: (c: LeadContact) => <Link to={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact'}</Link> },
              { header: 'Email', render: (c: LeadContact) => c.email ?? '—' },
              { header: 'Designation', render: (c: LeadContact) => c.jobTitle ?? '—' },
              {
                header: 'Role',
                render: (c: LeadContact) => (
                  <LeadContactRoleCell
                    contact={c}
                    onSave={(role, roleOther) => {
                      setLeadContactRole(lead!.id, c.id, role, roleOther)
                        .then(() => { loadContacts(); toast.success('Contact role updated'); })
                        .catch((err) => toast.error(err.message ?? 'Could not update role'));
                    }}
                  />
                ),
              },
            ],
          },
        ] as AssociationGroup[]}
      />
      <AiAssistCard leadId={lead.id} contactName={name} contactEmail={lead.email} contactPhone={lead.mobile} />
      {/* Distinct key prefixes — sibling components sharing the same key value
          makes React reconciliation duplicate/omit cards on re-render. */}
      <ActivityTimeline key={`activity-${activityKey}`} leadId={lead.id} />
      <TasksWidget key={`tasks-${activityKey}`} leadId={lead.id} onChanged={() => setActivityKey((k) => k + 1)} />
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

      {pendingLeadStageId && (
        <DispositionReasonModal
          title="Why is this lead unqualified?"
          options={UNQUALIFIED_REASONS}
          onConfirm={confirmUnqualifiedReason}
          onCancel={() => setPendingLeadStageId(null)}
        />
      )}

      {quickTaskType && (
        <QuickTaskModal
          type={quickTaskType}
          leadId={lead.id}
          defaultTitle={`${quickTaskType === 'CALL' ? 'Call' : quickTaskType === 'EMAIL' ? 'Email' : quickTaskType === 'MEETING' ? 'Meeting' : 'Activity'} with ${name}`}
          contactName={name}
          contactEmail={lead.email}
          contactPhone={lead.mobile}
          onClose={() => setQuickTaskType(null)}
          onSaved={onQuickTaskSaved}
        />
      )}

      {showConvertModal && (
        <ConvertToDealModal
          lead={lead}
          onClose={() => setShowConvertModal(false)}
          onConverted={(deal) => {
            setShowConvertModal(false);
            toast.success('Converted to Deal');
            navigate(`/deals/${deal.id}`);
          }}
        />
      )}

      {showLinkContacts && (
        <LinkContactsModal
          currentContactIds={contacts.map((c) => c.id)}
          accountId={lead.account?.id}
          onClose={() => setShowLinkContacts(false)}
          onSave={async (contactIds) => {
            // Preserve roles already assigned; newly linked contacts start as OTHER.
            const roleByContact = new Map(contacts.map((c) => [c.id, c.role]));
            await replaceLeadContacts(lead.id, contactIds.map((contactId) => ({
              contactId, role: roleByContact.get(contactId) ?? 'OTHER',
            })));
            loadContacts();
            toast.success('Contacts updated');
          }}
        />
      )}

      {showQualifiedPrompt && (
        <div className="modal-overlay" onClick={() => setShowQualifiedPrompt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Lead qualified</h3>
            <p>This lead is qualified — convert to a deal?</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={() => { setShowQualifiedPrompt(false); setShowConvertModal(true); }}>Convert</button>
              <button className="btn secondary" onClick={() => setShowQualifiedPrompt(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
