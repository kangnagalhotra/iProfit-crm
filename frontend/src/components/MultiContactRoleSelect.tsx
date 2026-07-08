import type { Contact, DealContactRole } from '../api/types';
import { SearchSelect } from './SearchSelect';
import { Icon } from './Icon';

const CONTACT_ROLES: DealContactRole[] = ['CHAMPION', 'DECISION_MAKER', 'INFLUENCER', 'BLOCKER'];

function contactLabel(c: Contact) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact';
}

export interface MultiContactRoleSelectProps {
  contacts: Contact[];
  excludeContactIds: string[];
  value: { contactId: string; role: DealContactRole }[];
  onChange: (value: { contactId: string; role: DealContactRole }[]) => void;
}

export function MultiContactRoleSelect({
  contacts, excludeContactIds, value, onChange,
}: MultiContactRoleSelectProps) {
  const available = contacts.filter((c) => !excludeContactIds.includes(c.id));
  const options = available.map((c) => ({ value: c.id, label: contactLabel(c) }));

  function addContact(contactId: string) {
    if (!contactId || value.some((v) => v.contactId === contactId)) return;
    onChange([...value, { contactId, role: 'CHAMPION' }]);
  }
  function setRole(contactId: string, role: DealContactRole) {
    onChange(value.map((v) => (v.contactId === contactId ? { ...v, role } : v)));
  }
  function remove(contactId: string) {
    onChange(value.filter((v) => v.contactId !== contactId));
  }

  return (
    <div>
      <SearchSelect options={options} value="" onChange={addContact} placeholder="Add a contact…" />
      {value.length > 0 && (
        <div className="multi-contact-rows">
          {value.map((row) => {
            const c = contacts.find((x) => x.id === row.contactId);
            const label = c ? contactLabel(c) : 'Unknown contact';
            return (
              <div className="multi-contact-row" key={row.contactId}>
                <span className="multi-contact-name">{label}</span>
                <select value={row.role} onChange={(e) => setRole(row.contactId, e.target.value as DealContactRole)}>
                  {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
                <button type="button" className="row-remove-btn" onClick={() => remove(row.contactId)} aria-label="Remove contact">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
