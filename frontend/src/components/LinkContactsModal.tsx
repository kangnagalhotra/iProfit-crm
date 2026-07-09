import { useEffect, useState } from 'react';
import type { Contact } from '../api/types';
import { listContacts } from '../api/contacts';
import { MultiEntitySelect } from './MultiEntitySelect';
import type { SearchSelectOption } from './SearchSelect';

function contactLabel(c: Contact) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact';
}

// Lets a Lead pick up multiple existing Contacts (the Lead side of the
// Lead<->Contact many-to-many) — defaults the candidate list to contacts at
// the Lead's own Company, since a Lead's contacts are expected to be
// stakeholders at that same company.
export function LinkContactsModal({
  currentContactIds, accountId, onClose, onSave,
}: {
  currentContactIds: string[];
  accountId?: string;
  onClose: () => void;
  onSave: (contactIds: string[]) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>(currentContactIds);
  const [showAll, setShowAll] = useState(!accountId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listContacts({ pageSize: 200, accountId: showAll ? undefined : accountId }).then((res) => setContacts(res.data));
  }, [accountId, showAll]);

  const options: SearchSelectOption[] = contacts.map((c) => ({ value: c.id, label: contactLabel(c), sublabel: c.email }));

  async function save() {
    setSaving(true); setError('');
    try {
      await onSave(selected);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not link contacts');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Link contacts</h3>
        {accountId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show contacts from all companies (default: same company only)
          </label>
        )}
        <div className="field">
          <MultiEntitySelect options={options} value={selected} onChange={setSelected} placeholder="Search contacts…" />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
