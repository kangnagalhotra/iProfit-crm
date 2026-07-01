import { useState } from 'react';
import { api } from '../api/client';
import type { LeadStatus } from '../api/types';

const STATUSES: LeadStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'CONNECTED', 'UNQUALIFIED'];

export function LeadForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', jobTitle: '', status: 'NEW' as LeadStatus,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      // strip empty strings so backend optional validators pass
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      await api.post('/leads', payload);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Could not save lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Create lead</h3>
        <div className="field"><label>First name</label>
          <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
        <div className="field"><label>Last name</label>
          <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
        <div className="field"><label>Email</label>
          <input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="field"><label>Phone</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="field"><label>Job title</label>
          <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value as LeadStatus)}>
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
