import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Account, Contact, User } from '../api/types';
import { getContact, updateContact, deleteContact } from '../api/contacts';
import { listAccounts } from '../api/accounts';
import { listLeads } from '../api/leads';
import { listUsers } from '../api/users';
import { EditableRow } from '../components/EditableRow';
import { SearchSelect } from '../components/SearchSelect';
import type { SearchSelectOption } from '../components/SearchSelect';
import { MultiEntitySelect } from '../components/MultiEntitySelect';
import { ContactForm } from '../components/ContactForm';
import { QuickTaskModal } from '../components/QuickTaskModal';
import { Icon } from '../components/Icon';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { SkeletonDetailPage } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { timeAgo } from '../utils/timeAgo';
import { useRecordRecentlyViewed } from '../hooks/useRecentlyViewed';

function initials(c: Contact) {
  const parts = [c.firstName, c.lastName].filter(Boolean) as string[];
  if (parts.length === 0) return (c.email ?? '?')[0].toUpperCase();
  return parts.map((p) => p[0].toUpperCase()).join('');
}

function contactName(c: Contact) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact';
}

function leadLabel(l: { firstName?: string; lastName?: string; email?: string }) {
  return [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead';
}

export function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [contact, setContact] = useState<Contact | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<{ id: string; firstName?: string; lastName?: string; email?: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [quickTaskType, setQuickTaskType] = useState<'CALL' | 'EMAIL' | 'MEETING' | null>(null);

  useEffect(() => {
    if (!id) return;
    getContact(id).then(setContact).catch(() => {});
    Promise.all([listAccounts({ pageSize: 100 }), listLeads({ pageSize: 100 }), listUsers()])
      .then(([accountRes, leadRes, userRes]) => {
        setAccounts(accountRes.data);
        setLeads(leadRes.data);
        setUsers(userRes);
      });
  }, [id]);

  useRecordRecentlyViewed('contact', contact?.id, contact
    ? ([contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Untitled contact')
    : undefined);

  if (!contact) return <SkeletonDetailPage />;

  const accountOptions: SearchSelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name }));
  const leadOptions: SearchSelectOption[] = leads.map((l) => ({ value: l.id, label: leadLabel(l), sublabel: l.email }));
  const ownerOptions: SearchSelectOption[] = users.map((u) => ({ value: u.id, label: u.fullName }));

  async function saveField(data: Record<string, any>) {
    try {
      const updated = await updateContact(contact!.id, data);
      setContact(updated);
      setEditingField(null);
      toast.success('Contact updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update contact');
    }
  }

  // Doesn't close the editor after each change — Linked Leads is a
  // multi-select where the user typically adds/removes several in a row.
  async function saveLeadIds(leadIds: string[]) {
    try {
      const updated = await updateContact(contact!.id, { leadIds });
      setContact(updated);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update contact');
    }
  }

  async function deleteRecord() {
    const ok = await confirm(`Delete "${contactName(contact!)}"? This cannot be undone.`, { title: 'Delete contact' });
    if (!ok) return;
    try {
      await deleteContact(contact!.id);
      toast.success('Contact deleted');
      navigate('/contacts');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete contact');
    }
  }

  return (
    <div>
      <p><Link to="/contacts">← Contacts</Link></p>

      <div className="detail-page-layout">
        <div className="card detail-header-card">
          <div className="detail-header-top">
            <div className="detail-header">
              <div className="avatar">{initials(contact)}</div>
              <div>
                <h2>{contactName(contact)}</h2>
                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                <div className="detail-meta-row">
                  <span className="record-type-badge">Contact</span>
                  {contact.owner && (
                    <span className="owner-chip">
                      <span className="avatar avatar-sm">{contact.owner.fullName[0]?.toUpperCase()}</span>
                      {contact.owner.fullName}
                    </span>
                  )}
                  <span className="detail-updated">Updated {timeAgo(contact.updatedAt)}</span>
                </div>
              </div>
            </div>
            <div className="detail-header-actions">
              <button className="btn btn-icon" onClick={() => setShowEditModal(true)}><Icon name="edit" size={14} /> Edit Details</button>
              <button className="btn secondary btn-icon" style={{ color: '#DC2626' }} onClick={deleteRecord}><Icon name="dots" size={14} /> Delete</button>
            </div>
          </div>

          <div className="quick-actions">
            <button
              type="button"
              className={`quick-action${contact.email ? '' : ' disabled'}`}
              disabled={!contact.email}
              title={contact.email ? `Log an email to ${contact.email}` : 'No email on file'}
              onClick={() => setQuickTaskType('EMAIL')}
            >
              <span className="icon"><Icon name="mail" size={18} /></span>Email
            </button>
            <button
              type="button"
              className={`quick-action${contact.mobile ? '' : ' disabled'}`}
              disabled={!contact.mobile}
              title={contact.mobile ? `Log a call to ${contact.mobile}` : 'No mobile number on file'}
              onClick={() => setQuickTaskType('CALL')}
            >
              <span className="icon"><Icon name="phone" size={18} /></span>Call
            </button>
            <button className="quick-action" onClick={() => setQuickTaskType('MEETING')}>
              <span className="icon"><Icon name="calendar" size={18} /></span>Meeting
            </button>
          </div>
        </div>

        <div className="detail-sidebar">
          <CollapsibleCard title="Key information" storageKey="collapsible:contact:key-info">
            <div className="key-info">
              <EditableRow
                label="Designation"
                value={contact.jobTitle}
                editing={editingField === 'jobTitle'}
                onStartEdit={() => setEditingField('jobTitle')}
              >
                <input
                  autoFocus
                  defaultValue={contact.jobTitle ?? ''}
                  onBlur={(e) => saveField({ jobTitle: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null); }}
                />
              </EditableRow>
              <EditableRow
                label="Department"
                value={contact.department}
                editing={editingField === 'department'}
                onStartEdit={() => setEditingField('department')}
              >
                <input
                  autoFocus
                  defaultValue={contact.department ?? ''}
                  onBlur={(e) => saveField({ department: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null); }}
                />
              </EditableRow>
              <EditableRow
                label="Mobile Number"
                value={contact.mobile}
                editing={editingField === 'mobile'}
                onStartEdit={() => setEditingField('mobile')}
              >
                <input
                  autoFocus
                  defaultValue={contact.mobile ?? ''}
                  onBlur={(e) => saveField({ mobile: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null); }}
                />
              </EditableRow>
              <EditableRow
                label="Email"
                value={contact.email}
                editing={editingField === 'email'}
                onStartEdit={() => setEditingField('email')}
              >
                <input
                  autoFocus
                  type="email"
                  defaultValue={contact.email ?? ''}
                  onBlur={(e) => saveField({ email: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null); }}
                />
              </EditableRow>
              <EditableRow
                label="Company"
                value={contact.account ? <Link to={`/companies/${contact.account.id}`}>{contact.account.name}</Link> : undefined}
                editing={editingField === 'account'}
                onStartEdit={() => setEditingField('account')}
              >
                <SearchSelect
                  options={accountOptions}
                  value={contact.account?.id ?? ''}
                  onChange={(v) => v && saveField({ accountId: v })}
                  placeholder="Search company…"
                />
              </EditableRow>
              <EditableRow
                label="Linked Leads"
                value={contact.leads && contact.leads.length > 0 ? (
                  <>
                    {contact.leads.map((l, i) => (
                      <span key={l.id}>
                        {i > 0 && ', '}
                        <Link to={`/leads/${l.id}`}>{leadLabel(l)}</Link>
                      </span>
                    ))}
                  </>
                ) : undefined}
                editing={editingField === 'leads'}
                onStartEdit={() => setEditingField('leads')}
              >
                <MultiEntitySelect
                  options={leadOptions}
                  value={contact.leads?.map((l) => l.id) ?? []}
                  onChange={saveLeadIds}
                  placeholder="Add a lead…"
                />
              </EditableRow>
              <EditableRow
                label="Contact Owner"
                value={contact.owner?.fullName}
                editing={editingField === 'owner'}
                onStartEdit={() => setEditingField('owner')}
              >
                <SearchSelect
                  options={ownerOptions}
                  value={contact.owner?.id ?? ''}
                  onChange={(v) => v && saveField({ ownerId: v })}
                  placeholder="Search owner…"
                />
              </EditableRow>
            </div>
            {contact.notes && (
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
                <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
              </div>
            )}
          </CollapsibleCard>
        </div>

        <div className="detail-main" />
      </div>

      {showEditModal && (
        <ContactForm
          contact={contact}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => { setContact(updated); setShowEditModal(false); toast.success('Contact updated'); }}
        />
      )}

      {quickTaskType && (
        <QuickTaskModal
          type={quickTaskType}
          contactId={contact.id}
          defaultTitle={`${quickTaskType === 'CALL' ? 'Call' : quickTaskType === 'EMAIL' ? 'Email' : 'Meeting'} with ${contactName(contact)}`}
          contactName={contactName(contact)}
          contactEmail={contact.email}
          contactPhone={contact.mobile}
          onClose={() => setQuickTaskType(null)}
          onSaved={(task) => {
            setQuickTaskType(null);
            toast.success(task.status === 'COMPLETED' ? 'Logged' : 'Task scheduled');
          }}
        />
      )}
    </div>
  );
}
