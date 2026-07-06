import { useState } from 'react';
import { api } from '../api/client';
import type { Role, User } from '../api/types';

const ROLES: { value: Role; label: string }[] = [
  { value: 'SALES_REP', label: 'Sales Rep' },
  { value: 'SALES_MANAGER', label: 'Sales Manager' },
];

export function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (user: User) => void }) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', role: 'SALES_REP' as Role,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      const { data } = await api.post<User>('/users', form);
      onCreated(data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Could not create user');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.fullName.trim() && form.email.trim() && form.password.length >= 10;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add new owner</h3>
        <div className="field"><label>Full name</label>
          <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
        <div className="field"><label>Email</label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="field"><label>Password</label>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <div className="helper-text">At least 10 characters, with a letter and a number.</div>
        </div>
        <div className="field"><label>Role</label>
          <select value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !canSubmit}>
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
