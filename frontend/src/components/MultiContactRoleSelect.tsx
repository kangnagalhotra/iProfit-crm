import type { Contact, DealContactRole } from '../api/types';
import { SearchSelect } from './SearchSelect';
import { SelectWithOther } from './SelectWithOther';
import { Icon } from './Icon';

const CONTACT_ROLE_OPTIONS = ['CHAMPION', 'DECISION_MAKER', 'INFLUENCER', 'BLOCKER', 'OTHER'].map((r) => ({ value: r, label: r.replace('_', ' ') }));

function contactLabel(c: Contact) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact';
}

export interface MultiContactRoleSelectProps {
  contacts: Contact[];
  excludeContactIds: string[];
  value: { contactId: string; role: DealContactRole; roleOther?: string }[];
  onChange: (value: { contactId: string; role: DealContactRole; roleOther?: string }[]) => void;
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
  function setRoleOther(contactId: string, roleOther: string) {
    onChange(value.map((v) => (v.contactId === contactId ? { ...v, roleOther } : v)));
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
                <SelectWithOther
                  options={CONTACT_ROLE_OPTIONS}
                  value={row.role}
                  onChange={(v) => setRole(row.contactId, v as DealContactRole)}
                  otherValue={row.roleOther ?? ''}
                  onOtherChange={(v) => setRoleOther(row.contactId, v)}
                  emptyLabel="Select role"
                />
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
