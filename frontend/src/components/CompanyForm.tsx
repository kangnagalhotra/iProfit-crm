import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Account, AccountStage, User } from '../api/types';
import type { DuplicateAccountMatch } from '../api/accounts';
import {
  createAccount, updateAccount, checkDuplicateAccount, getAccount,
} from '../api/accounts';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { CreateUserModal } from './CreateUserModal';
import { FormSection } from './FormSection';
import { useAuth } from '../context/AuthContext';
import {
  stripPhoneDigits, formatPhoneDisplay, isValidPhone, PHONE_ERROR_MESSAGE,
  stripEmailInput, isValidEmail, EMAIL_ERROR_MESSAGE,
} from '../utils/validation';
import { COMPANY_SIZES, INDUSTRIES } from '../constants/companyOptions';

const toOptions = (values: string[]): SearchSelectOption[] => values.map((v) => ({ value: v, label: v }));

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function stripWww(domain: string) {
  return domain.replace(/^www\./i, '');
}

function normalizeDomainInput(input: string) {
  return input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function CompanyForm({
  account, defaultStageId, onClose, onSaved,
}: {
  account?: Account;
  defaultStageId?: string;
  onClose: () => void;
  onSaved: (account: Account) => void;
}) {
  const { user: currentUser } = useAuth();
  const canAddOwner = currentUser?.role === 'ADMIN' || currentUser?.role === 'SALES_MANAGER';
  const isEdit = !!account;
  const [form, setForm] = useState({
    name: account?.name ?? '', domain: account?.domain ? stripWww(account.domain) : '', industry: account?.industry ?? '',
    sizeBucket: account?.sizeBucket ?? '', annualRevenue: account?.annualRevenue ?? '',
    email: account?.email ?? '', phone: stripPhoneDigits(account?.phone ?? ''),
    address: account?.address ?? '', description: account?.description ?? '',
    city: account?.city ?? '', state: account?.state ?? '', country: account?.country ?? '',
    ownerId: account?.owner?.id ?? '', stageId: account?.stage.id ?? defaultStageId ?? '',
  });
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [domainError, setDomainError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [expanded, setExpanded] = useState(isEdit);
  const [domainMatch, setDomainMatch] = useState<DuplicateAccountMatch | null>(null);
  const [nameMatch, setNameMatch] = useState<DuplicateAccountMatch | null>(null);
  const [nameMatchConfirmed, setNameMatchConfirmed] = useState(false);
  const [usingExisting, setUsingExisting] = useState(false);

  useEffect(() => {
    Promise.all([listStages('account_stages'), listUsers()])
      .then(([stageRes, userRes]) => {
        const stagesTyped = stageRes as AccountStage[];
        setStages(stagesTyped);
        setUsers(userRes);
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

  function validateDomain(raw: string): boolean {
    const domain = normalizeDomainInput(raw);
    if (!domain) { setDomainError(''); return true; }
    if (!DOMAIN_RE.test(domain)) { setDomainError('Enter a valid domain, e.g. companyname.com'); return false; }
    setDomainError('');
    return true;
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
    { value: '', label: 'Assign to me' },
    ...users.map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email })),
  ];
  const stageOptions: SearchSelectOption[] = stages.map((s) => ({ value: s.id, label: s.name }));

  // HubSpot-style duplicate detection. Domain is a hard signal — the same
  // website can't legitimately be two companies, so a domain match blocks
  // creation outright. Name is a soft signal — near-matches can be genuinely
  // different companies, so it only warns and requires explicit confirmation.
  async function runDuplicateCheck() {
    if (isEdit) return;
    try {
      const { domainMatch: dMatch, nameMatch: nMatch } = await checkDuplicateAccount({ name: form.name, domain: form.domain });
      setDomainMatch(dMatch ?? null);
      setNameMatch(nMatch ?? null);
      if (!nMatch) setNameMatchConfirmed(false);
    } catch {
      // advisory only — never block the form on failure
    }
  }

  async function selectExistingCompany(match: DuplicateAccountMatch) {
    setUsingExisting(true);
    try {
      const existing = await getAccount(match.id);
      onSaved(existing);
    } catch (e: any) {
      setError(e.message ?? 'Could not load the existing company');
    } finally {
      setUsingExisting(false);
    }
  }

  async function submit() {
    setError('');
    const trimmedEmail = form.email.trim();
    if (trimmedEmail !== form.email) set('email', trimmedEmail);
    if (!validateDomain(form.domain) || !validatePhone(form.phone) || !validateEmail(trimmedEmail)) return;
    if (!isEdit && domainMatch) { setError('A company with this website already exists — resolve the duplicate above before creating.'); return; }
    if (!isEdit && nameMatch && !nameMatchConfirmed) { setError('Confirm this is a different company before creating.'); return; }
    setSaving(true);
    try {
      const domain = normalizeDomainInput(form.domain);
      const payload = Object.fromEntries(
        Object.entries({ ...form, domain: domain ? `www.${domain}` : '', email: trimmedEmail }).filter(([, v]) => v !== ''),
      );
      const data = isEdit
        ? await updateAccount(account!.id, payload)
        : await createAccount(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save company');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit company' : 'Create company'}</h3>

        <div className="field"><label>Company name*</label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            onBlur={runDuplicateCheck}
          />
        </div>
        <div className="field">
          <label>Company Website</label>
          <div className="website-field-row">
            <span className="website-field-prefix">www.</span>
            <input
              value={form.domain}
              onChange={(e) => set('domain', e.target.value)}
              onBlur={(e) => { validateDomain(e.target.value); runDuplicateCheck(); }}
              placeholder="companyname.com"
            />
          </div>
          <div className="helper-text">Enter only the domain name.</div>
          {domainError && <div className="error" style={{ margin: '4px 0 0' }}>{domainError}</div>}
        </div>

        {domainMatch && (
          <div className="duplicate-warning blocking">
            A company with this domain already exists — <strong>{domainMatch.name}</strong>{' '}
            (<Link to={`/companies/${domainMatch.id}`} target="_blank" rel="noreferrer">view {domainMatch.name}</Link>).
            Creation is blocked; use the existing record instead.
            <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => selectExistingCompany(domainMatch)} disabled={usingExisting}>
              {usingExisting ? 'Loading…' : 'Use existing company'}
            </button>
          </div>
        )}

        {!domainMatch && nameMatch && (
          <div className="duplicate-warning">
            A similar company name already exists: <strong>{nameMatch.name}</strong>{nameMatch.domain ? ` (${nameMatch.domain})` : ''} —{' '}
            <Link to={`/companies/${nameMatch.id}`} target="_blank" rel="noreferrer">view company</Link>
            <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => selectExistingCompany(nameMatch)} disabled={usingExisting}>
              {usingExisting ? 'Loading…' : 'Use existing company'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={nameMatchConfirmed} onChange={(e) => setNameMatchConfirmed(e.target.checked)} />
              This is a different company — create anyway
            </label>
          </div>
        )}

        {!isEdit && (
          <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide extra fields' : 'Show more fields'}
          </button>
        )}

        {(isEdit || expanded) && (
          <>
            <FormSection title="Company Details">
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
              <div className="field"><label>Industry</label>
                <SearchSelect
                  options={toOptions(INDUSTRIES)}
                  value={form.industry}
                  onChange={(v) => set('industry', v)}
                  placeholder="Search industry…"
                  allowCustom
                />
              </div>
              <div className="field"><label>Number of employees</label>
                <SearchSelect
                  options={toOptions(COMPANY_SIZES)}
                  value={form.sizeBucket}
                  onChange={(v) => set('sizeBucket', v)}
                  placeholder="Search number of employees…"
                />
              </div>
              <div className="field"><label>Annual revenue</label>
                <input type="number" min="0" value={form.annualRevenue} onChange={(e) => set('annualRevenue', e.target.value)} /></div>
              <div className="field"><label>Lifecycle Stage</label>
                <SearchSelect
                  options={stageOptions}
                  value={form.stageId}
                  onChange={(v) => set('stageId', v)}
                  placeholder="Search lifecycle stage…"
                />
              </div>
            </FormSection>

            <FormSection title="Contact & Address">
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
              <div className="field"><label>Address</label>
                <input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
              <div className="field"><label>City</label>
                <input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
              <div className="field"><label>State</label>
                <input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
              <div className="field"><label>Country</label>
                <input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
            </FormSection>

            <FormSection title="Additional">
              <div className="field"><label>Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
            </FormSection>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || (!isEdit && !!domainMatch)}>
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
    </>
  );
}
