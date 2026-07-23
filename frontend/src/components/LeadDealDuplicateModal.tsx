import { useState } from 'react';
import type { Lead } from '../api/types';
import type { OpenDealMatch } from '../api/deals';
import { mergeLeadIntoDeal } from '../api/leads';

// B1/B2 — shown right after a new Lead is saved, when the company already
// has an open Deal for the same Product. Same-department is a likely
// genuine duplicate (strong wording); different/unknown department is a
// softer heads-up, since large orgs can have genuinely independent
// departments buying the same product — either way, the rep decides.
export function LeadDealDuplicateModal({
  lead, match, sameDepartment, onClose, onMerged,
}: {
  lead: Lead;
  match: OpenDealMatch;
  sameDepartment: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const companyName = lead.account?.name ?? 'This company';
  const productName = lead.productInterest?.name ?? 'this product';
  const departmentLabel = match.department || 'not specified';

  async function handleMerge() {
    setSaving(true); setError('');
    try {
      await mergeLeadIntoDeal(lead, match.id);
      onMerged();
    } catch (e: any) {
      setError(e.message ?? 'Could not merge lead');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{sameDepartment ? 'Possible duplicate deal' : 'Related deal at this company'}</h3>
        <p className="helper-text" style={{ marginTop: 0 }}>
          {sameDepartment
            ? `${companyName} (${lead.department || 'this department'}) already has an open deal for ${productName}. Add this person as a Contact on that deal instead of creating a separate lead?`
            : `${companyName} has another open deal for ${productName} (Department: ${departmentLabel}). Same initiative, or a different department?`}
        </p>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={handleMerge} disabled={saving}>
            {saving ? 'Merging…' : 'Add as Contact on that Deal'}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={saving}>Keep as separate Lead</button>
        </div>
      </div>
    </div>
  );
}
