import { useState } from 'react';
import { api } from '../api/client';
import type { Account, AccountStatus } from '../api/types';

const STATUSES: AccountStatus[] = ['PROSPECT', 'ACTIVE_CUSTOMER', 'ON_HOLD', 'CHURNED'];

export function CompanyForm({ onClose, onSaved }: { onClose: () => void; onSaved: (account: Account) => void }) {
  const [form, setForm] = useState({
    name: '', domain: '', industry: '', city: '', state: '', country: '', status: 'PROSPECT' as AccountStatus,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      const { data } = await api.post<Account>('/accounts', payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Could not save company');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Create company</h3>
        <div className="field"><label>Name</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field"><label>Domain</label>
          <input value={form.domain} onChange={(e) => set('domain', e.target.value)} /></div>
        <div className="field"><label>Industry</label>
          <input value={form.industry} onChange={(e) => set('industry', e.target.value)} /></div>
        <div className="field"><label>City</label>
          <input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
        <div className="field"><label>State</label>
          <input value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
        <div className="field"><label>Country</label>
          <input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value as AccountStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
