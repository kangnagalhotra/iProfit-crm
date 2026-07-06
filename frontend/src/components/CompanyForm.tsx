import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Account, AccountStage, User } from '../api/types';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { CreateUserModal } from './CreateUserModal';
import { useAuth } from '../context/AuthContext';

const COMPANY_SIZES = ['1-10', '11-50', '51-100', '101-250', '251-500', '501-1000', '1001-5000', '5001-10000', '10000+'];
const COMPANY_TYPES = [
  'Prospect', 'Customer', 'Partner', 'Vendor', 'Reseller', 'Distributor', 'Investor', 'Consultant', 'Agency', 'Enterprise', 'Startup', 'Other',
];
const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing', 'Education', 'Real Estate', 'Hospitality',
  'Telecommunications', 'Media & Entertainment', 'Transportation & Logistics', 'Construction', 'Energy',
  'Agriculture', 'Government', 'Non-profit', 'Consulting', 'Other',
];

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
    companyType: account?.companyType ?? '', email: account?.email ?? '', phone: account?.phone ?? '',
    address: account?.address ?? '', description: account?.description ?? '',
    city: account?.city ?? '', state: account?.state ?? '', country: account?.country ?? '',
    ownerId: account?.owner?.id ?? '', stageId: account?.stage.id ?? defaultStageId ?? '',
  });
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [domainError, setDomainError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    Promise.all([api.get<AccountStage[]>('/account-stages'), api.get<User[]>('/users')])
      .then(([stageRes, userRes]) => {
        setStages(stageRes.data);
        setUsers(userRes.data);
        if (!isEdit && !defaultStageId) {
          const defaultStage = stageRes.data.find((s) => s.isDefault) ?? stageRes.data[0];
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

  const ownerOptions: SearchSelectOption[] = [
    { value: '', label: 'Assign to me' },
    ...users.map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email })),
  ];
  const stageOptions: SearchSelectOption[] = stages.map((s) => ({ value: s.id, label: s.name }));

  async function submit() {
    setError('');
    if (!validateDomain(form.domain)) return;
    setSaving(true);
    try {
      const domain = normalizeDomainInput(form.domain);
      const payload = Object.fromEntries(
        Object.entries({ ...form, domain: domain ? `www.${domain}` : '' }).filter(([, v]) => v !== ''),
      );
      const { data } = isEdit
        ? await api.patch<Account>(`/accounts/${account!.id}`, payload)
        : await api.post<Account>('/accounts', payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Could not save company');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit company' : 'Create company'}</h3>
        <div className="field"><label>Company name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
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
        <div className="field">
          <label>Website</label>
          <div className="website-field-row">
            <span className="website-field-prefix">www.</span>
            <input
              value={form.domain}
              onChange={(e) => set('domain', e.target.value)}
              onBlur={(e) => validateDomain(e.target.value)}
              placeholder="companyname.com"
            />
          </div>
          <div className="helper-text">Enter only the domain name.</div>
          {domainError && <div className="error" style={{ margin: '4px 0 0' }}>{domainError}</div>}
        </div>
        <div className="field"><label>Company size</label>
          <SearchSelect
            options={toOptions(COMPANY_SIZES)}
            value={form.sizeBucket}
            onChange={(v) => set('sizeBucket', v)}
            placeholder="Search company size…"
          />
        </div>
        <div className="field"><label>Annual revenue</label>
          <input type="number" min="0" value={form.annualRevenue} onChange={(e) => set('annualRevenue', e.target.value)} /></div>
        <div className="field"><label>Company type</label>
          <SearchSelect
            options={toOptions(COMPANY_TYPES)}
            value={form.companyType}
            onChange={(v) => set('companyType', v)}
            placeholder="Search company type…"
            allowCustom
          />
        </div>
        <div className="field"><label>Status</label>
          <SearchSelect
            options={stageOptions}
            value={form.stageId}
            onChange={(v) => set('stageId', v)}
            placeholder="Search status…"
          />
        </div>
        <div className="field"><label>Email</label>
          <input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="field"><label>Phone</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="field"><label>Address</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
        <div className="field"><label>City</label>
          <input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
        <div className="field"><label>State</label>
          <input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
        <div className="field"><label>Country</label>
          <input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
        <div className="field"><label>Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
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
    </>
  );
}
