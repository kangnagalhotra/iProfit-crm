import { useState } from 'react';
import type { ActivityType } from '../api/types';
import { createActivity } from '../api/activities';

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'NOTE', label: 'Note' },
];

const textareaStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
};

export function AddActivityModal({
  leadId, accountId, opportunityId, onClose, onSaved,
}: {
  leadId?: string; accountId?: string; opportunityId?: string;
  onClose: () => void;
  // The logged activity type flows back so callers on a Deal can run
  // stage-automation rules (see utils/stageAutomation.ts) with an Undo toast.
  onSaved: (activityType: ActivityType) => void;
}) {
  const [type, setType] = useState<ActivityType>('CALL');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true); setError('');
    try {
      await createActivity({
        type, body: trimmed, leadId, accountId, opportunityId,
      });
      onSaved(type);
    } catch (e: any) {
      setError(e.message ?? 'Could not add activity');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add activity</h3>
        <div className="field">
          <label>Activity type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={4} autoFocus value={body} onChange={(e) => setBody(e.target.value)} style={textareaStyle} />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !body.trim()}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
