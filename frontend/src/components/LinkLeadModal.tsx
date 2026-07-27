import { useEffect, useState } from 'react';
import type { Lead } from '../api/types';
import { listLeads, linkLeadToDeal } from '../api/leads';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';
import { LeadForm } from './LeadForm';

function leadLabel(l: Lead) {
  return l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead';
}

// Lets a rep manually link an existing Lead to this Deal — or create a
// brand-new one inline — instead of waiting for the automatic duplicate
// check at Lead-creation time. Reuses linkLeadToDeal (api/leads.ts), which
// shares its underlying "link the Lead's Contact(s) to this Deal, mark the
// Lead merged" logic with the automatic flow's mergeLeadIntoDeal.
export function LinkLeadModal({
  dealId, accountId, onClose, onLinked,
}: {
  dealId: string;
  accountId?: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAll, setShowAll] = useState(!accountId);
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreateLead, setShowCreateLead] = useState(false);

  useEffect(() => {
    listLeads({ pageSize: 200, accountId: showAll ? undefined : accountId }).then((res) => setLeads(res.data));
  }, [accountId, showAll]);

  // Already-converted or already-merged leads have nothing left to link.
  const options: SearchSelectOption[] = leads
    .filter((l) => !l.convertedAt && !l.mergedAt)
    .map((l) => ({ value: l.id, label: leadLabel(l), sublabel: l.email }));

  async function link() {
    const lead = leads.find((l) => l.id === selectedId);
    if (!lead) return;
    setSaving(true); setError('');
    try {
      await linkLeadToDeal(lead, dealId);
      onLinked();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Could not link lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginTop: 0 }}>Link a lead</h3>
          <p className="helper-text" style={{ marginTop: 0 }}>
            Links the lead&apos;s contact to this deal and marks the lead as merged into it — same outcome as the automatic duplicate-detection flow, just started manually.
          </p>
          {accountId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show leads from all companies (default: same company only)
            </label>
          )}
          <div className="field">
            <SearchSelect
              options={options}
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Search leads…"
              onCreateNew={() => setShowCreateLead(true)}
              createNewLabel="+ Add new lead"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={link} disabled={saving || !selectedId}>
              {saving ? 'Linking…' : 'Link lead'}
            </button>
            <button className="btn secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>

      {showCreateLead && (
        <LeadForm
          defaultAccountId={accountId}
          onClose={() => setShowCreateLead(false)}
          onSaved={(newLead) => {
            setLeads((ls) => [newLead, ...ls]);
            setSelectedId(newLead.id);
            setShowCreateLead(false);
          }}
        />
      )}
    </>
  );
}
