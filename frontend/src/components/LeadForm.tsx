import { useEffect, useState } from 'react';
import type {
  Account, Lead, LeadSource, LeadStage, User,
} from '../api/types';
import { createLead, updateLead } from '../api/leads';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { CreateUserModal } from './CreateUserModal';
import { CompanyForm } from './CompanyForm';
import { useAuth } from '../context/AuthContext';
import {
  stripPhoneDigits, formatPhoneDisplay, isValidPhone, PHONE_ERROR_MESSAGE,
  stripEmailInput, isValidEmail, EMAIL_ERROR_MESSAGE,
} from '../utils/validation';

const SOURCES: LeadSource[] = ['OUTREACH', 'EMAIL', 'CAMPAIGN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'PARTNER', 'OTHER'];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function LeadForm({
  lead, defaultStageId, onClose, onSaved,
}: {
  lead?: Lead;
  defaultStageId?: string;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}) {
  const { user: currentUser } = useAuth();
  const isEdit = !!lead;
  const [form, setForm] = useState({
    firstName: lead?.firstName ?? '', lastName: lead?.lastName ?? '', phone: stripPhoneDigits(lead?.phone ?? ''), email: lead?.email ?? '',
    accountId: lead?.account?.id ?? '', companyName: '', jobTitle: lead?.jobTitle ?? '', city: lead?.city ?? '',
    source: (lead?.source ?? 'OTHER') as LeadSource,
    ownerId: lead?.owner?.id ?? '', stageId: lead?.stage.id ?? defaultStageId ?? '',
    value: lead?.value ?? '', notes: lead?.notes ?? '',
  });
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);

  const canAddOwner = currentUser?.role === 'ADMIN' || currentUser?.role === 'SALES_MANAGER';
  const leadNamePreview = [form.firstName, form.lastName].filter(Boolean).join(' ');

  useEffect(() => {
    Promise.all([
      listStages('lead_stages'),
      listUsers(),
      listAccounts({ pageSize: 100 }),
    ]).then(([stageRes, userRes, accountRes]) => {
      const stagesTyped = stageRes as LeadStage[];
      setStages(stagesTyped);
      setUsers(userRes);
      setAccounts(accountRes.data);
      if (!isEdit && !defaultStageId) {
        const defaultStage = stagesTyped.find((s) => s.isDefault) ?? stagesTyped[0];
        if (defaultStage) set('stageId', defaultStage.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validatePhone(digits: string): boolean {
    if (digits && !isValidPhone(digits)) { setPhoneError(PHONE_ERROR_MESSAGE); return false; }
    setPhoneError('');
    return true;
  }

  function validateEmail(value: string): boolean {
    if (value && !isValidEmail(value)) { setEmailError(EMAIL_ERROR_MESSAGE); return false; }
    setEmailError('');
    return true;
  }

  const ownerOptions: SearchSelectOption[] = [
    { value: '', label: 'Auto-assign' },
    ...users.map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email })),
  ];
  const companyOptions: SearchSelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name }));

  function setCompany(v: string) {
    if (accounts.some((a) => a.id === v)) { set('accountId', v); set('companyName', ''); } else { set('accountId', ''); set('companyName', v); }
  }

  async function submit() {
    setError('');
    const trimmedEmail = form.email.trim();
    if (trimmedEmail !== form.email) set('email', trimmedEmail);
    if (!validatePhone(form.phone) || !validateEmail(trimmedEmail)) return;
    if (form.value !== '' && Number(form.value) < 0) {
      setError('Lead value cannot be negative.');
      return;
    }
    setSaving(true);
    try {
      // strip empty strings so optional fields don't overwrite with blanks
      const payload = Object.fromEntries(
        Object.entries({ ...form, email: trimmedEmail }).filter(([, v]) => v !== ''),
      );
      const data = isEdit
        ? await updateLead(lead!.id, payload)
        : await createLead(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit lead' : 'Create lead'}</h3>
          <div className="field"><label>First name</label>
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
          <div className="field"><label>Last name</label>
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
          <div className="field"><label>Phone</label>
            <input
              value={formatPhoneDisplay(form.phone)}
              onChange={(e) => set('phone', stripPhoneDigits(e.target.value))}
              onBlur={() => validatePhone(form.phone)}
              placeholder="98765-43210"
              inputMode="numeric"
            />
            {phoneError && <div className="error" style={{ margin: '4px 0 0' }}>{phoneError}</div>}
          </div>
          <div className="field"><label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', stripEmailInput(e.target.value))}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                set('email', trimmed);
                validateEmail(trimmed);
              }}
            />
            {emailError && <div className="error" style={{ margin: '4px 0 0' }}>{emailError}</div>}
          </div>

          {leadNamePreview && (
            <div className="field">
              <label>Lead name</label>
              <div className="helper-text" style={{ marginTop: 0 }}>{leadNamePreview}</div>
            </div>
          )}
          <div className="field"><label>Company</label>
            <SearchSelect
              options={companyOptions}
              value={form.accountId || form.companyName}
              onChange={setCompany}
              allowCustom
              placeholder="Search or type a new company…"
              onCreateNew={() => setShowCreateCompany(true)}
              createNewLabel="+ Add new company"
            />
          </div>
          <div className="field"><label>Job title</label>
            <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
          <div className="field"><label>City</label>
            <input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div className="field"><label>Lead source</label>
            <select value={form.source} onChange={(e) => set('source', e.target.value as LeadSource)}>
              {SOURCES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="field"><label>Owner</label>
            <SearchSelect
              options={ownerOptions}
              value={form.ownerId}
              onChange={(v) => set('ownerId', v)}
              placeholder="Search owner…"
              renderAvatar={(opt) => (opt.value ? <div className="avatar avatar-sm">{initials(opt.label)}</div> : undefined)}
              onCreateNew={canAddOwner ? () => setShowCreateUser(true) : undefined}
              createNewLabel="+ Add new owner"
            />
          </div>
          <div className="field"><label>Stage</label>
            <select value={form.stageId} onChange={(e) => set('stageId', e.target.value)}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Lead value</label>
            <input type="number" min="0" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="0.00" /></div>
          <div className="field"><label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
          </div>

          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
            <button className="btn secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>

      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={(newUser) => {
            setUsers((us) => [...us, newUser].sort((a, b) => a.fullName.localeCompare(b.fullName)));
            set('ownerId', newUser.id);
            setShowCreateUser(false);
          }}
        />
      )}

      {showCreateCompany && (
        <CompanyForm
          onClose={() => setShowCreateCompany(false)}
          onSaved={(newAccount) => {
            setAccounts((as) => [...as, newAccount].sort((a, b) => a.name.localeCompare(b.name)));
            setCompany(newAccount.id);
            setShowCreateCompany(false);
          }}
        />
      )}
    </>
  );
}
