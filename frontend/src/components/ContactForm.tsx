import { useEffect, useState } from 'react';
import type { Account, Contact } from '../api/types';
import { createContact, updateContact } from '../api/contacts';
import { listAccounts } from '../api/accounts';

export function ContactForm({
  contact, accountId, onClose, onSaved,
}: {
  contact?: Contact;
  accountId?: string;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const isEdit = !!contact;
  const isScoped = !!accountId;

  const [form, setForm] = useState({
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    jobTitle: contact?.jobTitle ?? '',
    accountId: contact?.account?.id ?? accountId ?? '',
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isScoped) listAccounts({ pageSize: 100 }).then((res) => setAccounts(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
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

  const canSubmit = (form.firstName.trim() || form.lastName.trim() || form.email.trim());

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
        <div className="field"><label>Phone</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="field"><label>Job title</label>
          <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
        {!isScoped && (
          <div className="field"><label>Company</label>
            <select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

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
