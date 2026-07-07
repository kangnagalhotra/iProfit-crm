import { useState } from 'react';
import type { Lead } from '../api/types';
import { convertLeadToDeal } from '../api/leads';

export function ConvertToDealModal({
  lead, onClose, onConverted,
}: { lead: Lead; onClose: () => void; onConverted: (deal: { id: string }) => void }) {
  const defaultName = `${lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ')} - Deal`;
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true); setError('');
    try {
      const deal = await convertLeadToDeal(lead, trimmed);
      onConverted(deal);
    } catch (e: any) {
      setError(e.message ?? 'Could not convert lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Convert to Deal</h3>
        <p className="helper-text" style={{ marginTop: 0 }}>
          Creates a new Deal linked to this lead, carrying over the company, owner, value, notes, and activity history.
        </p>
        <div className="field">
          <label>Deal name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !name.trim()}>{saving ? 'Converting…' : 'Convert'}</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
