import { useEffect, useState } from 'react';
import type { DealProposal, Opportunity, ProposalTemplate } from '../api/types';
import {
  listProposals, addProposal, deleteProposal, createProposalDraft,
} from '../api/proposals';
import {
  getDefaultProposalTemplate, fillProposalTemplate, getWizardProposalTemplate,
  getExternalProposalTemplate, saveExternalProposalTemplate,
} from '../api/proposalTemplates';
import { CollapsibleCard } from './CollapsibleCard';
import { TypeformEmbed, extractTypeformId } from './TypeformEmbed';
import { ProposalWizardModal } from './ProposalWizardModal';
import { buildProposalHiddenFields } from '../utils/proposalFormPrefill';
import { Icon } from './Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

// Versioned proposal/quote history for a deal — append-only so the offer's
// evolution stays visible (v1 → v2 → …), never overwritten.
export function ProposalsCard({ opportunityId, deal }: { opportunityId: string; deal?: Opportunity }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [proposals, setProposals] = useState<DealProposal[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    sentDate: new Date().toISOString().slice(0, 10), value: '', notes: '', templateId: '',
  });
  const [saving, setSaving] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);
  const [creatingWizard, setCreatingWizard] = useState(false);
  const [wizardProposal, setWizardProposal] = useState<DealProposal | null>(null);
  const [externalTemplate, setExternalTemplate] = useState<ProposalTemplate | null>(null);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [editingImportUrl, setEditingImportUrl] = useState(false);
  const [importUrlDraft, setImportUrlDraft] = useState('');
  const [savingImport, setSavingImport] = useState(false);

  useEffect(() => {
    listProposals(opportunityId).then(setProposals).catch(() => {});
  }, [opportunityId]);

  useEffect(() => {
    getExternalProposalTemplate().then(setExternalTemplate).catch(() => {});
  }, []);

  async function saveImportUrl() {
    const url = importUrlDraft.trim();
    if (!url) return;
    setSavingImport(true);
    try {
      const saved = await saveExternalProposalTemplate(url);
      setExternalTemplate(saved);
      setEditingImportUrl(false);
      setShowExternalForm(true);
      toast.success('Form imported');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save that form URL');
    } finally {
      setSavingImport(false);
    }
  }

  async function markProposalSent() {
    setMarkingSent(true);
    try {
      const created = await addProposal(opportunityId, {
        sentDate: new Date().toISOString().slice(0, 10),
        notes: 'Sent via the proposal form',
      });
      setProposals((ps) => [created, ...ps]);
      toast.success(`Proposal v${created.version} marked as sent`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not log the proposal');
    } finally {
      setMarkingSent(false);
    }
  }

  async function applyTemplate() {
    try {
      const template = await getDefaultProposalTemplate();
      if (!template) { toast.error('No proposal template is set up yet.'); return; }
      const filled = fillProposalTemplate(template.body, {
        dealName: deal?.name,
        accountName: deal?.account?.name,
        amount: deal?.amount ? `${deal.currency} ${deal.amount}` : undefined,
        ownerName: deal?.owner?.fullName,
      });
      setAdding(true);
      setForm((f) => ({ ...f, notes: filled, templateId: template.id }));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not load the proposal template');
    }
  }

  // Prefill mapping for the Detailed Proposal Wizard — everything the CRM
  // already knows about this deal; anything it doesn't store (e.g. company
  // "years in business") is deliberately left blank rather than guessed.
  async function newWizardProposal() {
    setCreatingWizard(true);
    try {
      const template = await getWizardProposalTemplate();
      if (!template) { toast.error('The Detailed Form template is not set up yet.'); return; }

      const contactName = deal?.contact ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ') : '';
      const nextVersion = (proposals[0]?.version ?? 0) + 1;
      const content = {
        info: {
          proposalTitle: deal?.account?.name ? `Proposal for ${deal.account.name}` : '',
          customerName: deal?.account?.name ?? '',
          preparedFor: contactName,
          preparedBy: user?.fullName ?? deal?.owner?.fullName ?? '',
          dealName: deal?.name ?? '',
          proposalDate: new Date().toISOString().slice(0, 10),
          proposalVersion: `v${nextVersion}.0`,
        },
        company: {
          companyName: deal?.account?.name ?? '',
          companyDesc: deal?.account?.description ?? '',
        },
        pricing: {
          totalValue: deal?.amount ?? '',
          currency: deal?.currency ?? '',
        },
      };

      const created = await createProposalDraft(opportunityId, template.id, content, {
        sentDate: new Date().toISOString().slice(0, 10),
        value: deal?.amount,
        notes: content.info.proposalTitle,
      });
      setProposals((ps) => [created, ...ps]);
      setWizardProposal(created);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not start a new proposal');
    } finally {
      setCreatingWizard(false);
    }
  }

  function handleWizardSaved(updated: DealProposal) {
    setProposals((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    setWizardProposal(updated);
  }

  async function submit() {
    if (!form.sentDate) return;
    if (form.value !== '' && Number(form.value) < 0) { toast.error('Proposal value cannot be negative.'); return; }
    setSaving(true);
    try {
      const created = await addProposal(opportunityId, {
        sentDate: form.sentDate, value: form.value || undefined, notes: form.notes || undefined, templateId: form.templateId || undefined,
      });
      setProposals((ps) => [created, ...ps]);
      setAdding(false);
      setForm({
        sentDate: new Date().toISOString().slice(0, 10), value: '', notes: '', templateId: '',
      });
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
    <>
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
                <td style={{ maxWidth: 260 }} title={p.notes}>
                  {p.notes ? `${p.notes.slice(0, 80)}${p.notes.length > 80 ? '…' : ''}` : '—'}
                </td>
                <td style={{ display: 'flex', gap: 4 }}>
                  {p.content && (
                    <button type="button" className="row-remove-btn" onClick={() => setWizardProposal(p)} aria-label="Edit proposal" title="Edit">
                      <Icon name="edit" size={14} />
                    </button>
                  )}
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
            <textarea rows={form.templateId ? 12 : 3} value={form.notes} placeholder="What changed in this version…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={submit} disabled={saving || !form.sentDate}>
              {saving ? 'Saving…' : `Log v${(proposals[0]?.version ?? 0) + 1}`}
            </button>
            <button className="btn secondary" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-icon" onClick={newWizardProposal} disabled={creatingWizard} title="Template: Standard Proposal (Detailed Form)">
            <Icon name="note" size={14} /> {creatingWizard ? 'Starting…' : 'Open proposal form'}
          </button>
          <button className="btn secondary btn-icon" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} /> Add new proposal (manual)
          </button>
          <button className="btn secondary btn-icon" onClick={applyTemplate}>
            <Icon name="copy" size={14} /> Apply template
          </button>
          {externalTemplate ? (
            <button className="btn secondary btn-icon" onClick={() => setShowExternalForm((v) => !v)}>
              <Icon name="inbox" size={14} /> {showExternalForm ? 'Hide imported form' : 'Open imported form'}
            </button>
          ) : (
            <button className="btn secondary btn-icon" onClick={() => { setEditingImportUrl(true); setShowExternalForm(true); }}>
              <Icon name="inbox" size={14} /> Import form
            </button>
          )}
        </div>
      )}

      {showExternalForm && !adding && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          {editingImportUrl || !externalTemplate ? (
            <div>
              <div className="helper-text" style={{ marginTop: 0, marginBottom: 8 }}>
                Paste the link to your own form — Typeform, Google Forms, JotForm, Microsoft Forms, or any other
                provider. If it's a Typeform link it gets the richer native embed; otherwise it's shown in an
                iframe with a fallback link to open it directly.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  placeholder="https://…"
                  value={importUrlDraft}
                  onChange={(e) => setImportUrlDraft(e.target.value)}
                  style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14 }}
                />
                <button className="btn" onClick={saveImportUrl} disabled={savingImport || !importUrlDraft.trim()}>
                  {savingImport ? 'Saving…' : 'Save'}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setEditingImportUrl(false);
                    setImportUrlDraft('');
                    if (!externalTemplate) setShowExternalForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="helper-text" style={{ marginTop: 0, marginBottom: 10 }}>
                Fills in what it can from this deal (company, contact, value, owner) when supported. Submissions are
                recorded on the form provider's side — click "Mark proposal as sent" below once you've sent it to
                log it here too.
              </div>
              {extractTypeformId(externalTemplate.body) ? (
                <TypeformEmbed
                  formId={extractTypeformId(externalTemplate.body)!}
                  hiddenFields={deal ? buildProposalHiddenFields(deal) : undefined}
                />
              ) : (
                <iframe
                  src={externalTemplate.body}
                  title="Imported proposal form"
                  style={{ width: '100%', height: 600, border: '1px solid var(--line)', borderRadius: 8 }}
                />
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn secondary btn-icon" onClick={markProposalSent} disabled={markingSent}>
                  <Icon name="check" size={14} /> {markingSent ? 'Logging…' : 'Mark proposal as sent'}
                </button>
                <a className="btn secondary btn-icon" href={externalTemplate.body} target="_blank" rel="noreferrer">
                  <Icon name="external-link" size={14} /> Open in new tab
                </a>
                <button
                  className="btn secondary btn-icon"
                  onClick={() => { setImportUrlDraft(externalTemplate.body); setEditingImportUrl(true); }}
                >
                  <Icon name="edit" size={14} /> Change form
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>

    {wizardProposal && (
      <ProposalWizardModal
        proposal={wizardProposal}
        onClose={() => setWizardProposal(null)}
        onSaved={handleWizardSaved}
      />
    )}
    </>
  );
}
