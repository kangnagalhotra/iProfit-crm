import { useEffect, useState } from 'react';
import type {
  Account, Contact, DealPriority, DealStage, DealType, Opportunity, User,
} from '../api/types';
import { createDeal, updateDeal } from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { listAccounts } from '../api/accounts';
import { listContacts } from '../api/contacts';

const DEAL_TYPES: DealType[] = ['NEW_BUSINESS', 'EXISTING_BUSINESS', 'RENEWAL'];
const DEAL_PRIORITIES: DealPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function DealForm({
  deal, defaultStageId, onClose, onSaved,
}: {
  deal?: Opportunity;
  defaultStageId?: string;
  onClose: () => void;
  onSaved: (deal: Opportunity) => void;
}) {
  const isEdit = !!deal;
  const [form, setForm] = useState({
    name: deal?.name ?? '',
    amount: deal?.amount ?? '',
    closeDate: deal?.closeDate ? deal.closeDate.slice(0, 10) : '',
    dealType: (deal?.dealType ?? 'NEW_BUSINESS') as DealType,
    priority: (deal?.priority ?? 'MEDIUM') as DealPriority,
    lossReason: deal?.lossReason ?? '',
    description: deal?.description ?? '',
    source: deal?.source ?? '',
    stageId: deal?.stage.id ?? defaultStageId ?? '',
    ownerId: deal?.owner?.id ?? '',
    accountId: deal?.account?.id ?? '',
    contactId: deal?.contact?.id ?? '',
  });
  const [stages, setStages] = useState<DealStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      listStages('deal_stages'),
      listUsers(),
      listAccounts({ pageSize: 100 }),
      listContacts({ pageSize: 100 }),
    ]).then(([stageRes, userRes, accountRes, contactRes]) => {
      const stagesTyped = stageRes as DealStage[];
      setStages(stagesTyped);
      setUsers(userRes);
      setAccounts(accountRes.data);
      setContacts(contactRes.data);
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

  const selectedStage = stages.find((s) => s.id === form.stageId);

  async function submit() {
    setError(''); setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      const data = isEdit
        ? await updateDeal(deal!.id, payload)
        : await createDeal(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save deal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit deal' : 'Create deal'}</h3>
        <div className="field"><label>Deal name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label>Value</label>
          <input type="number" min="0" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></div>
        <div className="field"><label>Owner</label>
          <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
            <option value="">Auto-assign</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="field"><label>Company</label>
          <select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Primary Contact</label>
          <select value={form.contactId} onChange={(e) => set('contactId', e.target.value)}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact'}
              </option>
            ))}
          </select>
        </div>
        <div className="field"><label>Stage</label>
          <select value={form.stageId} onChange={(e) => set('stageId', e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Closing date</label>
          <input type="date" value={form.closeDate} onChange={(e) => set('closeDate', e.target.value)} /></div>
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
        <div className="field"><label>Probability</label>
          <input value={selectedStage ? `${selectedStage.winProbability}%` : '—'} disabled />
        </div>
        {selectedStage?.isClosedLost && (
          <div className="field"><label>Closed lost reason</label>
            <input value={form.lossReason} onChange={(e) => set('lossReason', e.target.value)} /></div>
        )}
        <div className="field"><label>Source</label>
          <input value={form.source} onChange={(e) => set('source', e.target.value)} /></div>
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
  );
}
