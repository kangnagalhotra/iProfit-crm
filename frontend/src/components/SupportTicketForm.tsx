import { useEffect, useState } from 'react';
import type {
  Account, Contact, SupportTicket, TicketPriority, TicketStatus, User,
} from '../api/types';
import { createTicket, updateTicket } from '../api/supportTickets';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listContacts } from '../api/contacts';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function SupportTicketForm({
  ticket, accountId, onClose, onSaved,
}: {
  ticket?: SupportTicket;
  accountId?: string;
  onClose: () => void;
  onSaved: (ticket: SupportTicket) => void;
}) {
  const isEdit = !!ticket;
  const isScoped = !!accountId;

  const [form, setForm] = useState({
    subject: ticket?.subject ?? '',
    description: ticket?.description ?? '',
    status: (ticket?.status ?? 'OPEN') as TicketStatus,
    priority: (ticket?.priority ?? 'MEDIUM') as TicketPriority,
    dueAt: ticket?.dueAt ? ticket.dueAt.slice(0, 10) : '',
    accountId: ticket?.account?.id ?? accountId ?? '',
    contactId: ticket?.contact?.id ?? '',
    assigneeId: ticket?.assignee?.id ?? '',
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listUsers().then(setUsers);
    if (!isScoped) listAccounts({ pageSize: 100 }).then((res) => setAccounts(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.accountId) listContacts({ accountId: form.accountId, pageSize: 100 }).then((res) => setContacts(res.data));
    else setContacts([]);
  }, [form.accountId]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      const data = isEdit
        ? await updateTicket(ticket!.id, payload)
        : await createTicket(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save ticket');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.subject.trim() && form.accountId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit ticket' : 'New support ticket'}</h3>
        <div className="field"><label>Subject</label>
          <input value={form.subject} onChange={(e) => set('subject', e.target.value)} /></div>
        {!isScoped && (
          <div className="field"><label>Company</label>
            <select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label>Contact</label>
          <select value={form.contactId} onChange={(e) => set('contactId', e.target.value)} disabled={!form.accountId}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact'}
              </option>
            ))}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value as TicketStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={form.priority} onChange={(e) => set('priority', e.target.value as TicketPriority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Assignee</label>
          <select value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="field"><label>Due date</label>
          <input type="date" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} /></div>
        <div className="field"><label>Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
        </div>

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !canSubmit}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
