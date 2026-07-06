import { useState } from 'react';
import { createUser } from '../api/users';
import type { Role, User } from '../api/types';
import { stripEmailInput, isValidEmail, EMAIL_ERROR_MESSAGE } from '../utils/validation';

const ROLES: { value: Role; label: string }[] = [
  { value: 'SALES_REP', label: 'Sales Rep' },
  { value: 'SALES_MANAGER', label: 'Sales Manager' },
];

export function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (user: User) => void }) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', role: 'SALES_REP' as Role,
  });
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validateEmail(value: string): boolean {
    if (!value) { setEmailError(''); return false; }
    if (!isValidEmail(value)) { setEmailError(EMAIL_ERROR_MESSAGE); return false; }
    setEmailError('');
    return true;
  }

  async function submit() {
    setError('');
    const trimmedEmail = form.email.trim();
    if (trimmedEmail !== form.email) set('email', trimmedEmail);
    if (!validateEmail(trimmedEmail)) return;
    setSaving(true);
    try {
      const data = await createUser({ ...form, email: trimmedEmail } as { fullName: string; email: string; password: string; role: 'SALES_REP' | 'SALES_MANAGER' });
      onCreated(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not create user');
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
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', stripEmailInput(e.target.value))}
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              set('email', trimmed);
              if (trimmed) validateEmail(trimmed);
            }}
          />
          {emailError && <div className="error" style={{ margin: '4px 0 0' }}>{emailError}</div>}
        </div>
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
