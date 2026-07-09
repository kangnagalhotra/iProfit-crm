import { useState } from 'react';
import type { Lead } from '../api/types';
import { updateLead } from '../api/leads';
import { useToast } from '../context/ToastContext';

const CRITERIA: { key: 'budgetScore' | 'authorityScore' | 'needScore' | 'timelineScore'; label: string }[] = [
  { key: 'budgetScore', label: 'Budget' },
  { key: 'authorityScore', label: 'Authority' },
  { key: 'needScore', label: 'Need' },
  { key: 'timelineScore', label: 'Timeline' },
];

export function LeadQualificationCard({ lead, onSaved }: { lead: Lead; onSaved: (lead: Lead) => void }) {
  const toast = useToast();
  const [scores, setScores] = useState({
    budgetScore: lead.budgetScore ?? undefined,
    authorityScore: lead.authorityScore ?? undefined,
    needScore: lead.needScore ?? undefined,
    timelineScore: lead.timelineScore ?? undefined,
  });
  const [icpMatch, setIcpMatch] = useState(lead.icpMatch ?? false);
  const [notes, setNotes] = useState(lead.qualificationNotes ?? '');
  const [saving, setSaving] = useState(false);

  const total = CRITERIA.reduce((sum, c) => sum + (scores[c.key] ?? 0), 0);
  const mqlReady = icpMatch && scores.budgetScore != null && scores.authorityScore != null;

  function setScore(key: typeof CRITERIA[number]['key'], value: string) {
    const n = value === '' ? null : Math.max(0, Math.min(10, Number(value)));
    setScores((s) => ({ ...s, [key]: n }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await updateLead(lead.id, { ...scores, icpMatch, qualificationNotes: notes || null });
      onSaved(updated);
      toast.success('Qualification saved');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save qualification');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ marginTop: 0 }}>Qualification (BANT)</h3>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Score: <strong style={{ color: 'var(--ink)' }}>{total}/40</strong></span>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={icpMatch} onChange={(e) => setIcpMatch(e.target.checked)} />
          ICP Match
        </label>
        <div className="helper-text" style={{ marginTop: 4 }}>
          ICP Match + Budget + Authority are required before this lead can become an MQL and move to Qualified.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px', marginBottom: 14 }}>
        {CRITERIA.map((c) => (
          <div className="field" key={c.key} style={{ marginBottom: 0 }}>
            <label>{c.label} (0–10){c.key === 'budgetScore' || c.key === 'authorityScore' ? ' *' : ''}</label>
            <input
              type="number" min="0" max="10"
              value={scores[c.key] ?? ''}
              onChange={(e) => setScore(c.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      {!mqlReady && (
        <div className="helper-text" style={{ marginBottom: 14 }}>
          Not yet MQL-qualified — fill in ICP Match, Budget, and Authority to unlock the Qualified stage.
        </div>
      )}
      <div className="field">
        <label>Qualification notes</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
        />
      </div>
      <button className="btn secondary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Qualification'}</button>
    </div>
  );
}
