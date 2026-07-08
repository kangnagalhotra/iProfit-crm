import { useEffect, useState } from 'react';
import type { DealStage, Lead } from '../api/types';
import { convertLeadToDeal } from '../api/leads';
import { listStages } from '../api/stages';

export function ConvertToDealModal({
  lead, onClose, onConverted,
}: { lead: Lead; onClose: () => void; onConverted: (deal: { id: string }) => void }) {
  const defaultName = `${lead.leadName || [lead.firstName, lead.lastName].filter(Boolean).join(' ')} - Deal`;
  const [name, setName] = useState(defaultName);
  const [value, setValue] = useState(lead.value ?? '');
  const [stageId, setStageId] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [stages, setStages] = useState<DealStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listStages('deal_stages').then((stageRes) => {
      const stagesTyped = stageRes as DealStage[];
      setStages(stagesTyped);
      const defaultStage = stagesTyped.find((s) => s.isDefault) ?? stagesTyped[0];
      if (defaultStage) setStageId(defaultStage.id);
    });
  }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true); setError('');
    try {
      const deal = await convertLeadToDeal(lead, trimmed, {
        value: value || undefined,
        stageId: stageId || undefined,
        closeDate: closeDate || undefined,
      });
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
          Creates a new Deal linked to this lead, carrying over the company, owner, notes, and activity history.
        </p>
        <div className="field">
          <label>Deal name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Value</label>
          <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
        </div>
        <div className="field">
          <label>Stage</label>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Closing date</label>
          <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
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
