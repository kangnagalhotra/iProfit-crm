import { useEffect, useState } from 'react';
import type {
  Account, Contact, Currency, DealPriority, DealStage, DealType, DecisionTimeframe, LineItem, Opportunity, Product, User,
} from '../api/types';
import { updateDeal } from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listContacts } from '../api/contacts';
import { listPipelines } from '../api/pipelines';
import { listProducts } from '../api/products';
import type { Pipeline } from '../api/pipelines';
import { listDealContacts, replaceDealContacts } from '../api/dealContacts';
import { listLineItems, replaceLineItems } from '../api/dealLineItems';
import { listAttachments, uploadAttachment, deleteAttachment } from '../api/dealAttachments';
import { SearchSelect } from './SearchSelect';
import { CompanyForm } from './CompanyForm';
import { FormSection } from './FormSection';
import { MultiContactRoleSelect } from './MultiContactRoleSelect';
import { LineItemsEditor } from './LineItemsEditor';
import { TagsInput } from './TagsInput';
import { FileUploadList } from './FileUploadList';
import type { PendingOrUploadedFile } from './FileUploadList';

const DEAL_TYPES: DealType[] = ['NEW_BUSINESS', 'EXISTING_BUSINESS', 'RENEWAL', 'UPSELL'];
const DEAL_PRIORITIES: DealPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'INR'];
const SOURCES = ['Website', 'Referral', 'Cold Outreach', 'Event', 'Partner', 'Other'];
const LOST_REASONS = ['Price', 'Competitor', 'No Budget', 'Bad Timing', 'No Decision'];
const DECISION_TIMEFRAMES: { value: DecisionTimeframe; label: string }[] = [
  { value: 'LESS_THAN_1_MONTH', label: '< 1 month' },
  { value: 'ONE_TO_3_MONTHS', label: '1–3 months' },
  { value: 'THREE_TO_6_MONTHS', label: '3–6 months' },
  { value: 'SIX_PLUS_MONTHS', label: '6+ months' },
];

interface DealFormState {
  name: string;
  amount: string;
  accountId: string;
  contactId: string;
  stageId: string;
  closeDate: string;
  ownerId: string;
  pipelineId: string;
  currency: Currency;
  probability: number | '';
  dealType: DealType;
  priority: DealPriority;
  source: string;
  additionalContacts: { contactId: string; role: import('../api/types').DealContactRole }[];
  partnerAccountId: string;
  nextStep: string;
  nextActivityDate: string;
  competitor: string;
  lossReason: string;
  lineItems: LineItem[];
  budgetConfirmed: '' | 'YES' | 'NO';
  decisionTimeframe: string;
  painPoint: string;
  tags: string[];
  description: string;
}

function initialState(deal: Opportunity): DealFormState {
  return {
    name: deal.name ?? '',
    amount: deal.amount ?? '',
    accountId: deal.account?.id ?? '',
    contactId: deal.contact?.id ?? '',
    stageId: deal.stage.id ?? '',
    closeDate: deal.closeDate ? deal.closeDate.slice(0, 10) : '',
    ownerId: deal.owner?.id ?? '',
    pipelineId: deal.pipeline.id ?? '',
    currency: deal.currency ?? 'USD',
    probability: deal.probabilityOverride ?? deal.stage.winProbability ?? '',
    dealType: deal.dealType ?? 'NEW_BUSINESS',
    priority: (deal.priority === 'CRITICAL' ? 'HIGH' : deal.priority) ?? 'MEDIUM',
    source: deal.source ?? '',
    additionalContacts: [],
    partnerAccountId: deal.partnerAccount?.id ?? '',
    nextStep: deal.nextStep ?? '',
    nextActivityDate: deal.nextActivityDate ? deal.nextActivityDate.slice(0, 10) : '',
    competitor: deal.competitor ?? '',
    lossReason: deal.lossReason ?? '',
    lineItems: [],
    budgetConfirmed: deal.budgetConfirmed === true ? 'YES' : deal.budgetConfirmed === false ? 'NO' : '',
    decisionTimeframe: deal.decisionTimeframe ?? '',
    painPoint: deal.painPoint ?? '',
    tags: deal.tags ?? [],
    description: deal.description ?? '',
  };
}

// Deals can only be created by converting a Qualified lead (see
// convertLeadToDeal() in api/leads.ts and the DB-level guard_deal_creation
// trigger) — this form is edit-only, reachable only from an existing deal.
export function DealForm({
  deal, onClose, onSaved,
}: {
  deal: Opportunity;
  onClose: () => void;
  onSaved: (deal: Opportunity) => void;
}) {
  const [form, setForm] = useState<DealFormState>(() => initialState(deal));
  const [probabilityTouched, setProbabilityTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [attachments, setAttachments] = useState<PendingOrUploadedFile[]>([]);
  const [showCreateCompany, setShowCreateCompany] = useState(false);

  const [stages, setStages] = useState<DealStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      listStages('deal_stages'),
      listUsers(),
      listAccounts({ pageSize: 100 }),
      listContacts({ pageSize: 100 }),
      listPipelines(),
      listProducts(),
    ]).then(([stageRes, userRes, accountRes, contactRes, pipelineRes, productRes]) => {
      const stagesTyped = stageRes as DealStage[];
      setStages(stagesTyped);
      setUsers(userRes);
      setAccounts(accountRes.data);
      setProducts(productRes);
      setContacts(contactRes.data);
      setPipelines(pipelineRes);
    });
    Promise.all([listDealContacts(deal.id), listLineItems(deal.id), listAttachments(deal.id)]).then(
      ([dealContacts, lineItems, files]) => {
        set('additionalContacts', dealContacts.map((dc) => ({ contactId: dc.contactId, role: dc.role })));
        set('lineItems', lineItems);
        if (lineItems.length > 0) setAmountTouched(true);
        setAttachments(files.map((f) => ({ kind: 'uploaded', id: f.id, fileName: f.fileName, fileSize: f.fileSize })));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof DealFormState>(k: K, v: DealFormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const selectedStage = stages.find((s) => s.id === form.stageId);

  // Auto-sync Probability from the selected stage, unless the user has
  // manually edited it this session (one-way latch — never re-syncs after).
  useEffect(() => {
    if (probabilityTouched) return;
    if (selectedStage) set('probability', selectedStage.winProbability);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.stageId, stages]);

  // Auto-sync Value from the line-items sum, unless the user has manually
  // edited Value this session (identical one-way-latch pattern).
  useEffect(() => {
    if (amountTouched || form.lineItems.length === 0) return;
    const sum = form.lineItems.reduce((acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);
    set('amount', String(sum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lineItems]);

  const expectedRevenue = (Number(form.amount) || 0) * (Number(form.probability) || 0) / 100;

  async function submit() {
    setError('');
    if (!form.name.trim()) { setError('Deal name is required.'); return; }
    if (Number(form.amount) < 0) { setError('Value cannot be negative.'); return; }
    if (selectedStage?.isClosedLost && !form.lossReason.trim()) {
      setError('Lost reason is required for a closed-lost stage.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name,
        amount: form.amount || undefined,
        accountId: form.accountId || undefined,
        contactId: form.contactId || undefined,
        stageId: form.stageId || undefined,
        closeDate: form.closeDate || undefined,
        ownerId: form.ownerId || undefined,
        pipelineId: form.pipelineId || undefined,
        currency: form.currency,
        probabilityOverride: probabilityTouched && form.probability !== '' ? Number(form.probability) : undefined,
        dealType: form.dealType,
        priority: form.priority,
        source: form.source || undefined,
        partnerAccountId: form.partnerAccountId || undefined,
        nextStep: form.nextStep || undefined,
        nextActivityDate: form.nextActivityDate || undefined,
        competitor: form.competitor || undefined,
        lossReason: selectedStage?.isClosedLost ? form.lossReason : undefined,
        budgetConfirmed: form.budgetConfirmed === '' ? undefined : form.budgetConfirmed === 'YES',
        decisionTimeframe: form.decisionTimeframe || undefined,
        painPoint: form.painPoint || undefined,
        tags: form.tags,
        description: form.description || undefined,
      };

      const data = await updateDeal(deal.id, payload);

      const results = await Promise.allSettled([
        replaceDealContacts(data.id, form.additionalContacts),
        replaceLineItems(data.id, form.lineItems),
      ]);
      if (results.some((r) => r.status === 'rejected')) {
        // eslint-disable-next-line no-console
        console.error('Some deal sub-records failed to save', results);
      }

      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save deal');
    } finally {
      setSaving(false);
    }
  }

  const availableContactsForCompany = form.accountId ? contacts.filter((c) => c.account?.id === form.accountId) : contacts;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Edit deal</h3>

        <div className="form-grid-2">
          <div className="field field-span-2"><label>Deal name*</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label>Value</label>
            <input type="number" min="0" value={form.amount}
              onChange={(e) => { setAmountTouched(true); set('amount', e.target.value); }} placeholder="0.00" /></div>
          <div className="field"><label>Company</label>
            <SearchSelect
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={form.accountId}
              onChange={(v) => set('accountId', v)}
              placeholder="Search company…"
              onCreateNew={() => setShowCreateCompany(true)}
              createNewLabel="+ Add new company"
            />
          </div>
          <div className="field"><label>Primary contact</label>
            <SearchSelect
              options={availableContactsForCompany.map((c) => ({
                value: c.id, label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact',
              }))}
              value={form.contactId}
              onChange={(v) => set('contactId', v)}
              placeholder="Search contact…"
            />
          </div>
          <div className="field"><label>Stage</label>
            <select value={form.stageId} onChange={(e) => set('stageId', e.target.value)}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Closing date</label>
            <input type="date" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} /></div>
          <div className="field"><label>Owner</label>
            <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
              <option value="">Auto-assign</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
        </div>

        <>
            <FormSection title="Deal Basics">
              <div className="form-grid-2">
                <div className="field"><label>Pipeline</label>
                  <select value={form.pipelineId} onChange={(e) => set('pipelineId', e.target.value)}>
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Currency</label>
                  <select value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field"><label>Probability</label>
                  <input
                    type="number" min="0" max="100"
                    value={form.probability}
                    onChange={(e) => { setProbabilityTouched(true); set('probability', e.target.value === '' ? '' : Number(e.target.value)); }}
                  />
                </div>
                <div className="field"><label>Expected revenue</label>
                  <input value={expectedRevenue.toLocaleString(undefined, { style: 'currency', currency: form.currency })} disabled />
                </div>
                <div className="field"><label>Deal type</label>
                  <select value={form.dealType} onChange={(e) => set('dealType', e.target.value as DealType)}>
                    {DEAL_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="field"><label>Priority</label>
                  <select value={form.priority} onChange={(e) => set('priority', e.target.value as DealPriority)}>
                    {DEAL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field"><label>Source</label>
                  <select value={form.source} onChange={(e) => set('source', e.target.value)}>
                    <option value="">—</option>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </FormSection>

            <FormSection title="Relationships">
              <div className="field"><label>Additional contacts</label>
                <MultiContactRoleSelect
                  contacts={contacts}
                  excludeContactIds={[form.contactId, ...form.additionalContacts.map((r) => r.contactId)].filter(Boolean)}
                  value={form.additionalContacts}
                  onChange={(v) => set('additionalContacts', v)}
                />
              </div>
              <div className="field"><label>Partner / Referrer</label>
                <SearchSelect
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  value={form.partnerAccountId}
                  onChange={(v) => set('partnerAccountId', v)}
                  placeholder="Search company…"
                />
              </div>
            </FormSection>

            <FormSection title="Sales Process">
              <div className="form-grid-2">
                <div className="field"><label>Next step</label>
                  <input value={form.nextStep} onChange={(e) => set('nextStep', e.target.value)} /></div>
                <div className="field"><label>Next activity date</label>
                  <input type="date" value={form.nextActivityDate} onChange={(e) => set('nextActivityDate', e.target.value)} /></div>
                <div className="field field-span-2"><label>Competitor</label>
                  <input value={form.competitor} onChange={(e) => set('competitor', e.target.value)} /></div>
                {selectedStage?.isClosedLost && (
                  <div className="field field-span-2"><label>Lost reason*</label>
                    <select value={form.lossReason} onChange={(e) => set('lossReason', e.target.value)}>
                      <option value="">—</option>
                      {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="field"><label>Products / line items</label>
                <LineItemsEditor value={form.lineItems} onChange={(v) => set('lineItems', v)} products={products} />
              </div>
            </FormSection>

            <FormSection title="Qualification">
              <div className="form-grid-2">
                <div className="field"><label>Budget confirmed</label>
                  <select value={form.budgetConfirmed} onChange={(e) => set('budgetConfirmed', e.target.value as '' | 'YES' | 'NO')}>
                    <option value="">—</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </select>
                </div>
                <div className="field"><label>Decision timeframe</label>
                  <select value={form.decisionTimeframe} onChange={(e) => set('decisionTimeframe', e.target.value)}>
                    <option value="">—</option>
                    {DECISION_TIMEFRAMES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Pain point / need</label>
                <textarea rows={3} value={form.painPoint} onChange={(e) => set('painPoint', e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
            </FormSection>

            <FormSection title="Additional Info">
              <div className="field"><label>Tags</label>
                <TagsInput value={form.tags} onChange={(v) => set('tags', v)} />
              </div>
              <div className="field"><label>Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
              </div>
              <div className="field"><label>Attachments</label>
                <FileUploadList
                  parentId={deal.id}
                  value={attachments}
                  onChange={setAttachments}
                  uploadFn={uploadAttachment}
                  deleteFn={deleteAttachment}
                />
              </div>
            </FormSection>
        </>

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>

      {showCreateCompany && (
        <CompanyForm
          onClose={() => setShowCreateCompany(false)}
          onSaved={(account) => {
            setAccounts((as) => [...as, account]);
            set('accountId', account.id);
            setShowCreateCompany(false);
          }}
        />
      )}
    </div>
  );
}
