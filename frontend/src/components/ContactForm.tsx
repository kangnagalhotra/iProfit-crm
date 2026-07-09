import { useEffect, useState } from 'react';
import type { Account, Contact, User } from '../api/types';
import { createContact, updateContact } from '../api/contacts';
import { listAccounts } from '../api/accounts';
import { listLeads } from '../api/leads';
import { listUsers } from '../api/users';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { MultiEntitySelect } from './MultiEntitySelect';
import {
  stripPhoneDigits, formatPhoneDisplay, isValidPhone, PHONE_ERROR_MESSAGE,
} from '../utils/validation';

function leadLabel(l: { firstName?: string; lastName?: string; email?: string }) {
  return [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead';
}

export function ContactForm({
  contact, accountId, leadId, onClose, onSaved,
}: {
  contact?: Contact;
  accountId?: string;
  leadId?: string;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const isEdit = !!contact;
  const isScoped = !!accountId;
  const isLeadScoped = !!leadId;

  const [form, setForm] = useState({
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    mobile: stripPhoneDigits(contact?.mobile ?? ''),
    jobTitle: contact?.jobTitle ?? '',
    department: contact?.department ?? '',
    notes: contact?.notes ?? '',
    accountId: contact?.account?.id ?? accountId ?? '',
    ownerId: contact?.owner?.id ?? '',
  });
  const [leadIds, setLeadIds] = useState<string[]>(
    contact?.leads?.map((l) => l.id) ?? (leadId ? [leadId] : []),
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<{ id: string; firstName?: string; lastName?: string; email?: string }[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [mobileError, setMobileError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isScoped) listAccounts({ pageSize: 100 }).then((res) => setAccounts(res.data));
    if (!isLeadScoped) listLeads({ pageSize: 100 }).then((res) => setLeads(res.data));
    listUsers().then(setUsers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validateMobile(digits: string): boolean {
    if (digits && !isValidPhone(digits)) { setMobileError(PHONE_ERROR_MESSAGE); return false; }
    setMobileError('');
    return true;
  }

  const accountOptions: SearchSelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name }));
  const leadOptions: SearchSelectOption[] = leads.map((l) => ({ value: l.id, label: leadLabel(l), sublabel: l.email }));
  const ownerOptions: SearchSelectOption[] = [
    { value: '', label: 'Assign to me' },
    ...users.map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email })),
  ];

  async function submit() {
    setError('');
    if (!validateMobile(form.mobile)) return;
    if (!form.accountId) { setError('Company is required.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), leadIds };
      const data = isEdit
        ? await updateContact(contact!.id, payload)
        : await createContact(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save contact');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = (form.firstName.trim() || form.lastName.trim() || form.email.trim()) && !!form.accountId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit contact' : 'Add contact'}</h3>
        <div className="field"><label>First name</label>
          <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
        <div className="field"><label>Last name</label>
          <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        <div className="field"><label>Email</label>
          <input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="field"><label>Mobile Number</label>
          <input
            value={formatPhoneDisplay(form.mobile)}
            onChange={(e) => set('mobile', stripPhoneDigits(e.target.value))}
            onBlur={() => validateMobile(form.mobile)}
            placeholder="98765-43210"
            inputMode="numeric"
          />
          {mobileError && <div className="error" style={{ margin: '4px 0 0' }}>{mobileError}</div>}
        </div>
        <div className="field"><label>Designation</label>
          <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
        <div className="field"><label>Department</label>
          <input value={form.department} onChange={(e) => set('department', e.target.value)} /></div>
        {!isScoped && (
          <div className="field"><label>Company*</label>
            <SearchSelect options={accountOptions} value={form.accountId} onChange={(v) => set('accountId', v)} placeholder="Search company…" />
          </div>
        )}
        {!isLeadScoped && (
          <div className="field"><label>Linked Leads</label>
            <MultiEntitySelect options={leadOptions} value={leadIds} onChange={setLeadIds} placeholder="Add a lead…" />
          </div>
        )}
        <div className="field"><label>Contact owner*</label>
          <SearchSelect options={ownerOptions} value={form.ownerId} onChange={(v) => set('ownerId', v)} placeholder="Search owner…" />
        </div>
        <div className="field"><label>Notes</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
          />
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
