import { useState } from 'react';
import { SelectWithOther } from './SelectWithOther';

// Generic "why are you moving this to a terminal stage" prompt, reused for
// both Lead (Unqualified) and Deal (Closed Lost) stage changes made via the
// inline detail-page dropdown or a Kanban drag — the two interaction paths
// that used to bypass the existing LeadForm/DealForm-only enforcement
// entirely. Returns the raw selected value plus the typed "Other" text (if
// any) — callers decide how to map that back onto their own field shape
// (an enum code for Leads, a single collapsed free-text string for Deals).
export function DispositionReasonModal({
  title, helperText, options, otherTriggerValue = 'OTHER', onConfirm, onCancel,
}: {
  title: string;
  helperText?: string;
  options: { value: string; label: string }[];
  otherTriggerValue?: string;
  onConfirm: (value: string, otherText: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [other, setOther] = useState('');

  const canConfirm = value !== '' && (value !== otherTriggerValue || other.trim() !== '');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {helperText && <div className="helper-text" style={{ marginTop: -6, marginBottom: 10 }}>{helperText}</div>}
        <div className="field">
          <label>Reason*</label>
          <SelectWithOther
            options={options}
            value={value}
            onChange={setValue}
            otherValue={other}
            onOtherChange={setOther}
            otherTriggerValue={otherTriggerValue}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={() => onConfirm(value, other.trim())} disabled={!canConfirm}>Confirm</button>
          <button className="btn secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
