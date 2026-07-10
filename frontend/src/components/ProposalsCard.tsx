import { useEffect, useState } from 'react';
import type { DealProposal } from '../api/types';
import { listProposals, addProposal, deleteProposal } from '../api/proposals';
import { CollapsibleCard } from './CollapsibleCard';
import { Icon } from './Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

// Versioned proposal/quote history for a deal — append-only so the offer's
// evolution stays visible (v1 → v2 → …), never overwritten.
export function ProposalsCard({ opportunityId }: { opportunityId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [proposals, setProposals] = useState<DealProposal[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ sentDate: new Date().toISOString().slice(0, 10), value: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProposals(opportunityId).then(setProposals).catch(() => {});
  }, [opportunityId]);

  async function submit() {
    if (!form.sentDate) return;
    if (form.value !== '' && Number(form.value) < 0) { toast.error('Proposal value cannot be negative.'); return; }
    setSaving(true);
    try {
      const created = await addProposal(opportunityId, {
        sentDate: form.sentDate, value: form.value || undefined, notes: form.notes || undefined,
      });
      setProposals((ps) => [created, ...ps]);
      setAdding(false);
      setForm({ sentDate: new Date().toISOString().slice(0, 10), value: '', notes: '' });
      toast.success(`Proposal v${created.version} logged`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not log proposal');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: DealProposal) {
    const ok = await confirm(`Delete proposal v${p.version}? This cannot be undone.`, { title: 'Delete proposal' });
    if (!ok) return;
    try {
      await deleteProposal(p.id);
      setProposals((ps) => ps.filter((x) => x.id !== p.id));
      toast.success('Proposal deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete proposal');
    }
  }

  return (
    <CollapsibleCard title={`Proposals (${proposals.length})`} storageKey="collapsible:deal:proposals">
      {proposals.length === 0 && !adding && (
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0 }}>No proposals sent yet.</p>
      )}
      {proposals.length > 0 && (
        <table>
          <thead>
            <tr><th>Version</th><th>Sent</th><th>Value</th><th>Notes</th><th /></tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>v{p.version}</td>
                <td>{new Date(p.sentDate).toLocaleDateString()}</td>
                <td>{formatValue(p.value)}</td>
                <td>{p.notes ?? '—'}</td>
                <td>
                  <button type="button" className="row-remove-btn" onClick={() => remove(p)} aria-label="Delete proposal">
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? (
        <div style={{ marginTop: 12 }}>
          <div className="form-grid-2">
            <div className="field"><label>Sent date*</label>
              <input type="date" value={form.sentDate} onChange={(e) => setForm((f) => ({ ...f, sentDate: e.target.value }))} /></div>
            <div className="field"><label>Proposal value</label>
              <input type="number" min="0" value={form.value} placeholder="0.00"
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} /></div>
          </div>
          <div className="field"><label>Notes</label>
            <input value={form.notes} placeholder="What changed in this version…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={submit} disabled={saving || !form.sentDate}>
              {saving ? 'Saving…' : `Log v${(proposals[0]?.version ?? 0) + 1}`}
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn secondary btn-icon" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Log proposal version
        </button>
      )}
    </CollapsibleCard>
  );
}
