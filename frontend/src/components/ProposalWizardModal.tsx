import { useState } from 'react';
import type { DealProposal } from '../api/types';
import { updateProposalContent } from '../api/proposals';
import {
  PROPOSAL_WIZARD_SECTIONS, emptyLineItemState,
} from '../utils/proposalWizardSchema';
import type {
  ProposalField, ProposalLineItemSpec, ProposalApprovalBlock,
} from '../utils/proposalWizardSchema';
import { generateProposalPdf, findMissingRequiredFields } from '../utils/proposalDocumentGenerator';
import { Icon } from './Icon';
import { useToast } from '../context/ToastContext';

function fieldInput(field: ProposalField, value: string, onChange: (v: string) => void) {
  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
        }}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'choice') {
    return (
      <div className="wizard-choice-group">
        {(field.options ?? []).map((o) => (
          <button
            type="button"
            key={o}
            className={`wizard-choice-pill${value === o ? ' selected' : ''}`}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === 'date') return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === 'number') return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" />;
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function FieldRow({ field, value, onChange }: { field: ProposalField; value: string; onChange: (v: string) => void }) {
  return (
    <div className={`field${field.full ? ' field-span-2' : ''}`}>
      <label>
        {field.label}
        {field.required && <span style={{ color: '#DC2626' }}> *</span>}
        {field.hint && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> ({field.hint})</span>}
      </label>
      {fieldInput(field, value, onChange)}
    </div>
  );
}

function LineItemsEditor({
  spec, rows, onChange,
}: { spec: ProposalLineItemSpec; rows: Record<string, string>[]; onChange: (rows: Record<string, string>[]) => void }) {
  function updateRow(i: number, colKey: string, value: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [colKey]: value } : r)));
  }
  function addRow() { onChange([...rows, {}]); }
  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [{}]);
  }

  return (
    <div className="field field-span-2">
      <label>{spec.label}</label>
      <div className="wizard-line-items">
        {rows.map((row, i) => (
          <div className="wizard-line-item" key={i}>
            {spec.cols.map((c) => (
              <input
                key={c.k}
                type={c.type}
                placeholder={c.label}
                value={row[c.k] ?? ''}
                onChange={(e) => updateRow(i, c.k, e.target.value)}
              />
            ))}
            <button type="button" className="row-remove-btn" onClick={() => removeRow(i)} aria-label="Remove row">
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="wizard-add-line-btn" onClick={addRow}>{spec.addLabel}</button>
    </div>
  );
}

function ApprovalBlockCard({
  block, values, onChange,
}: { block: ProposalApprovalBlock; values: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className="wizard-approval-block">
      <h4>{block.title}</h4>
      <div className="form-grid-2">
        {block.fields.map((f) => (
          <FieldRow key={f.k} field={f} value={values[f.k] ?? ''} onChange={(v) => onChange(f.k, v)} />
        ))}
      </div>
    </div>
  );
}

export function ProposalWizardModal({
  proposal, onClose, onSaved,
}: {
  proposal: DealProposal;
  onClose: () => void;
  onSaved: (updated: DealProposal) => void;
}) {
  const toast = useToast();
  const [currentSection, setCurrentSection] = useState(0);
  const [content, setContent] = useState<Record<string, any>>(() => proposal.content ?? {});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);

  const section = PROPOSAL_WIZARD_SECTIONS[currentSection];
  const isLast = currentSection === PROPOSAL_WIZARD_SECTIONS.length - 1;

  function sectionData(id: string): Record<string, any> {
    return content[id] ?? {};
  }
  function setSectionField(sectionId: string, key: string, value: string) {
    setContent((c) => ({ ...c, [sectionId]: { ...(c[sectionId] ?? {}), [key]: value } }));
  }
  function setLineItemRows(sectionId: string, lineItemKey: string, rows: Record<string, string>[]) {
    setContent((c) => ({ ...c, [sectionId]: { ...(c[sectionId] ?? {}), [lineItemKey]: rows } }));
  }
  function setApprovalField(blockKey: string, key: string, value: string) {
    setContent((c) => ({
      ...c,
      approvals: { ...(c.approvals ?? {}), [blockKey]: { ...(c.approvals?.[blockKey] ?? {}), [key]: value } },
    }));
  }
  function setChecklistItem(index: number, checked: boolean) {
    setContent((c) => {
      const next = [...(c.checklist ?? [])];
      next[index] = checked;
      return { ...c, checklist: next };
    });
  }

  async function save(patchContent?: Record<string, any>) {
    const toSave = patchContent ?? content;
    setSaving(true);
    try {
      const updated = await updateProposalContent(proposal.id, toSave, {
        value: toSave.pricing?.totalValue || undefined,
        notes: toSave.info?.proposalTitle || undefined,
      });
      onSaved(updated);
      toast.success('Proposal saved');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save proposal');
    } finally {
      setSaving(false);
    }
  }

  async function generateDocument() {
    const missingFields = findMissingRequiredFields(content);
    if (!content.overallStatus) missingFields.push('Overall Approval Status');
    if (missingFields.length > 0) {
      setMissing(missingFields);
      setCurrentSection(0);
      return;
    }
    setMissing(null);
    setGenerating(true);
    try {
      const fileName = `${(content.info?.proposalTitle || 'proposal').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}.pdf`;
      generateProposalPdf(content, fileName);
      const stamped = { ...content, generatedAt: new Date().toISOString() };
      setContent(stamped);
      await save(stamped);
      toast.success('Proposal document generated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not generate the document');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-panel">
        <div className="wizard-header">
          <div>
            <h2 style={{ margin: '0 0 4px' }}>Proposal Creation Form</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13.5 }}>
              Collects everything needed to generate a customer-ready proposal document.
            </p>
          </div>
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
        </div>

        <div className="wizard-progress-track">
          <div
            className="wizard-progress-fill"
            style={{ width: `${Math.round(((currentSection + 1) / PROPOSAL_WIZARD_SECTIONS.length) * 100)}%` }}
          />
        </div>
        <div className="wizard-progress-label">
          Section {currentSection + 1} of {PROPOSAL_WIZARD_SECTIONS.length} — {section.title}
        </div>

        <div className="wizard-section-nav">
          {PROPOSAL_WIZARD_SECTIONS.map((s, i) => (
            <button
              type="button"
              key={s.id}
              className={`wizard-nav-pill${i === currentSection ? ' active' : ''}${i < currentSection ? ' done' : ''}`}
              onClick={() => setCurrentSection(i)}
            >
              {s.num} {s.title}
            </button>
          ))}
        </div>

        {missing && (
          <div className="wizard-banner error">
            <strong>{missing.length} required field(s) still missing:</strong> {missing.slice(0, 8).join(', ')}{missing.length > 8 ? '…' : ''}
          </div>
        )}

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 2 }}>{section.num} {section.title}</h3>
          <p className="helper-text" style={{ marginTop: 0 }}>{section.sub}</p>

          {section.fields && (
            <div className="form-grid-2">
              {section.fields.map((f) => {
                if (f.showIf && sectionData(section.id)[f.showIf.field] !== f.showIf.value) return null;
                return (
                  <FieldRow
                    key={f.k}
                    field={f}
                    value={sectionData(section.id)[f.k] ?? ''}
                    onChange={(v) => setSectionField(section.id, f.k, v)}
                  />
                );
              })}
            </div>
          )}

          {section.lineItems && (
            <LineItemsEditor
              spec={section.lineItems}
              rows={sectionData(section.id)[section.lineItems.key] ?? emptyLineItemState()[section.lineItems.key]}
              onChange={(rows) => setLineItemRows(section.id, section.lineItems!.key, rows)}
            />
          )}

          {section.approvalBlocks && (
            <>
              {section.approvalBlocks.map((block) => (
                <ApprovalBlockCard
                  key={block.key}
                  block={block}
                  values={content.approvals?.[block.key] ?? {}}
                  onChange={(k, v) => setApprovalField(block.key, k, v)}
                />
              ))}
              <div className="wizard-approval-block">
                <h4>Final Submission Readiness</h4>
                <div className="checklist-items">
                  {section.checklist!.map((item, i) => (
                    <label key={i} className="wizard-checklist-row">
                      <input
                        type="checkbox"
                        checked={!!content.checklist?.[i]}
                        onChange={(e) => setChecklistItem(i, e.target.checked)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>{section.finalStatus!.label} <span style={{ color: '#DC2626' }}>*</span></label>
                  <select value={content.overallStatus ?? ''} onChange={(e) => setContent((c) => ({ ...c, overallStatus: e.target.value }))}>
                    <option value="">Select…</option>
                    {section.finalStatus!.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-footer">
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => setCurrentSection((s) => Math.max(0, s - 1))} disabled={currentSection === 0}>
              Back
            </button>
            {!isLast && (
              <button className="btn secondary" onClick={() => setCurrentSection((s) => Math.min(PROPOSAL_WIZARD_SECTIONS.length - 1, s + 1))}>
                Next
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn" onClick={generateDocument} disabled={generating}>
              <Icon name="note" size={14} /> {generating ? 'Generating…' : 'Generate Proposal Document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
