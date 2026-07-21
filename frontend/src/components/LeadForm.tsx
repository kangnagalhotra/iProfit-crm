import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Account, Currency, Lead, LeadRating, LeadSourceOption, LeadStage, LeadUnqualifiedReason, RevenueBand, User,
} from '../api/types';
import {
  createLead, updateLead, checkDuplicateLead,
} from '../api/leads';
import type { DuplicateLeadMatch } from '../api/leads';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listLeadSourceOptions } from '../api/leadSourceOptions';
import { listAttachments, uploadAttachment, deleteAttachment } from '../api/leadAttachments';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { MultiEntitySelect } from './MultiEntitySelect';
import { SelectWithOther } from './SelectWithOther';
import { UNQUALIFIED_REASONS } from '../utils/leadUnqualifiedReasons';
import { SocialLinksEditor, validateSocialUrl } from './SocialLinksEditor';
import type { OtherSocialLink } from './SocialLinksEditor';
import { CreateUserModal } from './CreateUserModal';
import { CompanyForm } from './CompanyForm';
import { FormSection } from './FormSection';
import { TagsInput } from './TagsInput';
import { FileUploadList } from './FileUploadList';
import type { PendingOrUploadedFile } from './FileUploadList';
import { ConvertToDealModal } from './ConvertToDealModal';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { COUNTRIES } from '../constants/countries';
import { INDUSTRIES, COMPANY_SIZES, REVENUE_BANDS } from '../constants/companyOptions';
import { isMqlReady, BANT_WARNING_MESSAGE } from '../utils/leadQualification';
import {
  stripPhoneDigits, formatPhoneDisplay, isValidPhone, PHONE_ERROR_MESSAGE,
  stripEmailInput, isValidEmail, EMAIL_ERROR_MESSAGE,
} from '../utils/validation';

const RATINGS: LeadRating[] = ['HOT', 'WARM', 'COLD'];
const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'INR'];
const INDUSTRY_OPTIONS: SearchSelectOption[] = INDUSTRIES.map((v) => ({ value: v, label: v }));
const SIZE_OPTIONS: SearchSelectOption[] = COMPANY_SIZES.map((v) => ({ value: v, label: v }));

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

interface LeadFormState {
  firstName: string;
  lastName: string;
  email: string;
  emailOptIn: boolean;
  mobile: string;
  jobTitle: string;
  linkedinUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  accountId: string;
  companyName: string;
  industry: string;
  sizeBucket: string;
  annualRevenue: RevenueBand | '';
  currency: Currency;
  domain: string;
  address: string;
  addressCity: string;
  state: string;
  postalCode: string;
  country: string;
  sourceId: string;
  sourceDetails: string;
  ownerId: string;
  additionalOwnerIds: string[];
  stageId: string;
  rating: LeadRating | '';
  unqualifiedReason: LeadUnqualifiedReason | '';
  unqualifiedReasonOther: string;
  tags: string[];
  value: string;
  notes: string;
}

function initialState(lead?: Lead, defaultStageId?: string): LeadFormState {
  return {
    firstName: lead?.firstName ?? '',
    lastName: lead?.lastName ?? '',
    email: lead?.email ?? '',
    emailOptIn: lead?.emailOptIn ?? true,
    mobile: stripPhoneDigits(lead?.mobile ?? lead?.phone ?? ''),
    jobTitle: lead?.jobTitle ?? '',
    linkedinUrl: lead?.linkedinUrl ?? '',
    instagramUrl: lead?.instagramUrl ?? '',
    twitterUrl: lead?.twitterUrl ?? '',
    accountId: lead?.account?.id ?? '',
    companyName: '',
    industry: '',
    sizeBucket: '',
    annualRevenue: '',
    currency: 'USD',
    domain: '',
    address: '',
    addressCity: '',
    state: '',
    postalCode: '',
    country: '',
    sourceId: lead?.source?.id ?? '',
    sourceDetails: lead?.sourceDetails ?? '',
    ownerId: lead?.owner?.id ?? '',
    additionalOwnerIds: lead?.additionalOwners?.map((o) => o.id) ?? [],
    stageId: lead?.stage.id ?? defaultStageId ?? '',
    rating: lead?.rating ?? '',
    unqualifiedReason: lead?.unqualifiedReason ?? '',
    unqualifiedReasonOther: lead?.unqualifiedReasonOther ?? '',
    tags: lead?.tags ?? [],
    value: lead?.value ?? '',
    notes: lead?.notes ?? '',
  };
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
  const confirm = useConfirm();
  const isEdit = !!lead;
  const [form, setForm] = useState<LeadFormState>(() => initialState(lead, defaultStageId));
  const [expanded, setExpanded] = useState(isEdit);
  const [attachments, setAttachments] = useState<PendingOrUploadedFile[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sourceOptions, setSourceOptions] = useState<LeadSourceOption[]>([]);
  const [otherSocialLinks, setOtherSocialLinks] = useState<OtherSocialLink[]>(
    lead?.socialLinks?.map((l) => ({ platform: l.platform, url: l.url })) ?? [],
  );
  const [error, setError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [socialError, setSocialError] = useState('');
  const [dupMatch, setDupMatch] = useState<DuplicateLeadMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showQualifiedPrompt, setShowQualifiedPrompt] = useState(false);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);

  const canAddOwner = currentUser?.role === 'ADMIN' || currentUser?.role === 'SALES_MANAGER';
  const leadNamePreview = [form.firstName, form.lastName].filter(Boolean).join(' ');
  const selectedStage = stages.find((s) => s.id === form.stageId);

  useEffect(() => {
    Promise.all([
      listStages('lead_stages'),
      listUsers(),
      listAccounts({ pageSize: 100 }),
      listLeadSourceOptions(),
    ]).then(([stageRes, userRes, accountRes, sourceRes]) => {
      const stagesTyped = stageRes as LeadStage[];
      setStages(stagesTyped);
      setUsers(userRes);
      setAccounts(accountRes.data);
      setSourceOptions(sourceRes);
      if (!isEdit && !defaultStageId) {
        const defaultStage = stagesTyped.find((s) => s.isDefault) ?? stagesTyped[0];
        if (defaultStage) set('stageId', defaultStage.id);
      }
      if (!isEdit && !form.sourceId && sourceRes.length > 0) {
        const other = sourceRes.find((o) => o.name === 'Other') ?? sourceRes[0];
        set('sourceId', other.id);
      }
    });
    if (isEdit && lead) {
      listAttachments(lead.id).then((files) => {
        setAttachments(files.map((f) => ({ kind: 'uploaded', id: f.id, fileName: f.fileName, fileSize: f.fileSize })));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof LeadFormState>(k: K, v: LeadFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validateMobile(digits: string): boolean {
    if (digits && !isValidPhone(digits)) { setMobileError(PHONE_ERROR_MESSAGE); return false; }
    setMobileError('');
    return true;
  }

  function validateEmail(value: string): boolean {
    if (value && !isValidEmail(value)) { setEmailError(EMAIL_ERROR_MESSAGE); return false; }
    setEmailError('');
    return true;
  }

  function validateSocials(): boolean {
    const urls = [form.linkedinUrl, form.instagramUrl, form.twitterUrl, ...otherSocialLinks.map((l) => l.url)];
    if (urls.some((u) => u && !validateSocialUrl(u))) {
      setSocialError('Social links must start with http:// or https://');
      return false;
    }
    setSocialError('');
    return true;
  }

  async function runDuplicateCheck() {
    const companyName = form.companyName || accounts.find((a) => a.id === form.accountId)?.name;
    try {
      const result = await checkDuplicateLead({
        email: form.email || undefined,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        companyName,
        excludeId: lead?.id,
      });
      setDupMatch(result);
    } catch {
      // duplicate check is advisory only — never block the form on failure
    }
  }

  const ownerOptions: SearchSelectOption[] = [
    { value: '', label: 'Auto-assign' },
    ...users.map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email })),
  ];
  const additionalOwnerOptions: SearchSelectOption[] = users
    .filter((u) => u.id !== form.ownerId)
    .map((u) => ({ value: u.id, label: u.fullName, sublabel: u.email }));
  const companyOptions: SearchSelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name }));

  function setCompany(v: string) {
    const existing = accounts.find((a) => a.id === v);
    if (existing) {
      set('accountId', v); set('companyName', '');
      // Auto-populate the company enrichment fields from the selected
      // Company's existing data, but only where this lead's own fields are
      // still blank — never clobbers anything already typed, and every
      // field stays editable afterward in case something needs correcting.
      setForm((f) => ({
        ...f,
        industry: f.industry || existing.industry || '',
        sizeBucket: f.sizeBucket || existing.sizeBucket || '',
        annualRevenue: f.annualRevenue || existing.annualRevenue || '',
        currency: existing.currency ?? f.currency,
        domain: f.domain || existing.domain || '',
        address: f.address || existing.address || '',
        addressCity: f.addressCity || existing.city || '',
        state: f.state || existing.state || '',
        postalCode: f.postalCode || existing.postalCode || '',
        country: f.country || existing.country || '',
      }));
    } else {
      set('accountId', ''); set('companyName', v);
    }
  }

  async function onStageChange(newStageId: string) {
    const prevStage = stages.find((s) => s.id === form.stageId);
    const newStage = stages.find((s) => s.id === newStageId);
    const movingToQualified = newStage?.isWon && !prevStage?.isWon;
    if (movingToQualified && !isMqlReady(lead ?? ({} as Lead))) {
      const ok = await confirm(BANT_WARNING_MESSAGE, { title: 'BANT/ICP not completed' });
      if (!ok) return;
    }
    set('stageId', newStageId);
    if (movingToQualified) setShowQualifiedPrompt(true);
  }

  function validateForm(): boolean {
    const trimmedEmail = form.email.trim();
    if (trimmedEmail !== form.email) set('email', trimmedEmail);
    if (!form.firstName.trim()) { setError('First name is required.'); return false; }
    if (!form.accountId && !form.companyName.trim()) { setError('Company name is required.'); return false; }
    if (!form.mobile) { setError('Mobile number is required.'); return false; }
    if (!validateMobile(form.mobile) || !validateEmail(trimmedEmail)) return false;
    if (!validateSocials()) { setExpanded(true); return false; }
    if (selectedStage?.isLost && !form.unqualifiedReason) {
      setExpanded(true);
      setError('Unqualified reason is required for an unqualified lead.');
      return false;
    }
    if (form.value !== '' && Number(form.value) < 0) { setError('Lead value cannot be negative.'); return false; }
    setError('');
    return true;
  }

  async function doSave(): Promise<Lead> {
    const companyEnrichment = Object.fromEntries(
      Object.entries({
        industry: form.industry,
        sizeBucket: form.sizeBucket,
        annualRevenue: form.annualRevenue,
        currency: form.currency,
        domain: form.domain,
        address: form.address,
        city: form.addressCity,
        state: form.state,
        postalCode: form.postalCode,
        country: form.country,
      }).filter(([, v]) => v !== ''),
    );

    const payload: Record<string, any> = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
      emailOptIn: form.emailOptIn,
      mobile: form.mobile || undefined,
      jobTitle: form.jobTitle || undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      instagramUrl: form.instagramUrl || undefined,
      twitterUrl: form.twitterUrl || undefined,
      otherSocialLinks,
      accountId: form.accountId || undefined,
      companyName: form.companyName || undefined,
      companyEnrichment,
      sourceId: form.sourceId || undefined,
      sourceDetails: form.sourceDetails || undefined,
      ownerId: form.ownerId || undefined,
      additionalOwnerIds: form.additionalOwnerIds,
      stageId: form.stageId || undefined,
      rating: form.rating || undefined,
      unqualifiedReason: selectedStage?.isLost ? (form.unqualifiedReason || undefined) : undefined,
      unqualifiedReasonOther: selectedStage?.isLost ? (form.unqualifiedReasonOther || undefined) : undefined,
      tags: form.tags,
      value: form.value || undefined,
      notes: form.notes || undefined,
    };

    const data = isEdit ? await updateLead(lead!.id, payload) : await createLead(payload);

    const pendingFiles = attachments.filter((f) => f.kind === 'pending');
    if (!isEdit && pendingFiles.length > 0) {
      await Promise.allSettled(pendingFiles.map((f: any) => uploadAttachment(data.id, f.file)));
    }

    return data;
  }

  async function submit() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const data = await doSave();
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save lead');
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertFromPrompt() {
    setShowQualifiedPrompt(false);
    if (!validateForm()) return;
    setSaving(true);
    try {
      const data = await doSave();
      setConvertingLead(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit lead' : 'Create lead'}</h3>

          <div className="form-grid-2">
            <div className="field"><label>First name*</label>
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div className="field"><label>Last name</label>
              <input
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                onBlur={() => { if (form.lastName && (form.companyName || form.accountId)) runDuplicateCheck(); }}
              />
            </div>
            <div className="field field-span-2"><label>Company*</label>
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
            {leadNamePreview && (
              <div className="field field-span-2">
                <label>Lead name</label>
                <div className="helper-text" style={{ marginTop: 0 }}>{leadNamePreview}</div>
              </div>
            )}
            <div className="field"><label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', stripEmailInput(e.target.value))}
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  set('email', trimmed);
                  validateEmail(trimmed);
                  if (trimmed) runDuplicateCheck();
                }}
              />
              {emailError && <div className="error" style={{ margin: '4px 0 0' }}>{emailError}</div>}
            </div>
            <div className="field"><label>Mobile Number*</label>
              <input
                value={formatPhoneDisplay(form.mobile)}
                onChange={(e) => set('mobile', stripPhoneDigits(e.target.value))}
                onBlur={() => validateMobile(form.mobile)}
                placeholder="98765-43210"
                inputMode="numeric"
              />
              {mobileError && <div className="error" style={{ margin: '4px 0 0' }}>{mobileError}</div>}
            </div>
            <div className="field"><label>Lead value</label>
              <input type="number" min="0" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="0.00" /></div>
            <div className="field"><label>Lead source*</label>
              <SelectWithOther
                options={sourceOptions.map((s) => ({ value: s.id, label: s.name }))}
                value={form.sourceId}
                onChange={(v) => set('sourceId', v)}
                otherValue={form.sourceDetails}
                onOtherChange={(v) => set('sourceDetails', v)}
                otherTriggerValue={sourceOptions.find((s) => s.name.toLowerCase() === 'other')?.id ?? '__no_other__'}
                emptyLabel="Select source"
              />
            </div>
            <div className="field"><label>Status</label>
              <select value={form.stageId} onChange={(e) => onStageChange(e.target.value)}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Lead owner</label>
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
            <div className="field field-span-2"><label>Additional owners</label>
              <MultiEntitySelect
                options={additionalOwnerOptions}
                value={form.additionalOwnerIds}
                onChange={(ids) => set('additionalOwnerIds', ids)}
                placeholder="Add another owner…"
              />
            </div>
            <div className="field field-span-2"><label>Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {dupMatch && (
            <div className="duplicate-warning">
              Possible duplicate: <strong>{dupMatch.name}</strong> — <Link to={`/leads/${dupMatch.id}`} target="_blank" rel="noreferrer">view lead</Link>
              <button type="button" onClick={() => setDupMatch(null)} aria-label="Dismiss">×</button>
            </div>
          )}

          {!isEdit && (
            <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide extra fields' : 'Show more fields'}
            </button>
          )}

          {(isEdit || expanded) && (
            <>
              <FormSection title="Lead Information">
                <div className="form-grid-2">
                  <div className="field"><label>Job title</label>
                    <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                      <input type="checkbox" checked={form.emailOptIn} onChange={(e) => set('emailOptIn', e.target.checked)} />
                      Email opt-in
                    </label>
                  </div>
                </div>
                <SocialLinksEditor
                  linkedinUrl={form.linkedinUrl}
                  instagramUrl={form.instagramUrl}
                  twitterUrl={form.twitterUrl}
                  otherLinks={otherSocialLinks}
                  onChangeLinkedin={(v) => set('linkedinUrl', v)}
                  onChangeInstagram={(v) => set('instagramUrl', v)}
                  onChangeTwitter={(v) => set('twitterUrl', v)}
                  onChangeOtherLinks={setOtherSocialLinks}
                />
                {socialError && <div className="error" style={{ margin: '4px 0 0' }}>{socialError}</div>}
              </FormSection>

              <FormSection title="Company & Address">
                <div className="helper-text" style={{ marginTop: 0, marginBottom: 10 }}>
                  Fills in the company record only where information is still missing — existing company data is never overwritten.
                </div>
                <div className="form-grid-2">
                  <div className="field"><label>Industry</label>
                    <SearchSelect options={INDUSTRY_OPTIONS} value={form.industry} onChange={(v) => set('industry', v)} placeholder="Search industry…" allowCustom /></div>
                  <div className="field"><label>Company size</label>
                    <SearchSelect options={SIZE_OPTIONS} value={form.sizeBucket} onChange={(v) => set('sizeBucket', v)} placeholder="Search company size…" /></div>
                  <div className="field"><label>Annual revenue</label>
                    <select value={form.annualRevenue} onChange={(e) => set('annualRevenue', e.target.value as RevenueBand | '')}>
                      <option value="">—</option>
                      {REVENUE_BANDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Currency</label>
                    <select value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field field-span-2"><label>Website</label>
                    <input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="companyname.com" /></div>
                  <div className="field field-span-2"><label>Street</label>
                    <input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
                  <div className="field"><label>City</label>
                    <input value={form.addressCity} onChange={(e) => set('addressCity', e.target.value)} /></div>
                  <div className="field"><label>State</label>
                    <input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
                  <div className="field"><label>Postal code</label>
                    <input value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></div>
                  <div className="field"><label>Country</label>
                    <SearchSelect options={COUNTRIES} value={form.country} onChange={(v) => set('country', v)} placeholder="Search country…" /></div>
                </div>
              </FormSection>

              <FormSection title="Lead Details">
                <div className="form-grid-2">
                  <div className="field"><label>Rating</label>
                    <select value={form.rating} onChange={(e) => set('rating', e.target.value as LeadRating | '')}>
                      <option value="">—</option>
                      {RATINGS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                    </select>
                  </div>
                  {selectedStage?.isLost && (
                    <div className="field"><label>Unqualified reason*</label>
                      <SelectWithOther
                        options={UNQUALIFIED_REASONS}
                        value={form.unqualifiedReason}
                        onChange={(v) => set('unqualifiedReason', v as LeadUnqualifiedReason | '')}
                        otherValue={form.unqualifiedReasonOther}
                        onOtherChange={(v) => set('unqualifiedReasonOther', v)}
                      />
                    </div>
                  )}
                </div>
                <div className="field"><label>Tags</label>
                  <TagsInput value={form.tags} onChange={(v) => set('tags', v)} />
                </div>
              </FormSection>

              <FormSection title="Additional">
                <div className="field"><label>Attachments</label>
                  <FileUploadList
                    parentId={lead?.id}
                    value={attachments}
                    onChange={setAttachments}
                    uploadFn={uploadAttachment}
                    deleteFn={deleteAttachment}
                  />
                </div>
              </FormSection>
            </>
          )}

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

      {showQualifiedPrompt && (
        <div className="modal-overlay" onClick={() => setShowQualifiedPrompt(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Lead qualified</h3>
            <p>This lead is qualified — convert to a deal?</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={handleConvertFromPrompt} disabled={saving}>Convert</button>
              <button className="btn secondary" onClick={() => setShowQualifiedPrompt(false)}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {convertingLead && (
        <ConvertToDealModal
          lead={convertingLead}
          onClose={() => { onSaved(convertingLead); onClose(); }}
          onConverted={() => { onSaved(convertingLead); onClose(); }}
        />
      )}
    </>
  );
}
