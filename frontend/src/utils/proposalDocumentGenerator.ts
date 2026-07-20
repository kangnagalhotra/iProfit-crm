import { jsPDF } from 'jspdf';
import { PROPOSAL_WIZARD_SECTIONS, CUSTOMER_FACING_SECTION_IDS } from './proposalWizardSchema';

// Plain, unbranded layout — a first working version, not a design pass.
// Renders every customer-facing section (Company Overview through
// Signature) from `content`; Section 9 (Internal Approvals) is never
// included here, it's CRM-internal only.
const MARGIN = 18;
const PAGE_HEIGHT = 297; // A4 mm
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_H = 6;

export function generateProposalPdf(content: Record<string, any>, fileName: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  function ensure(next: number) {
    if (y + next > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function write(str: string, opts: { size?: number; bold?: boolean; gapAfter?: number } = {}) {
    const { size = 10, bold = false, gapAfter = 3 } = opts;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(str, CONTENT_WIDTH) as string[];
    wrapped.forEach((wLine) => {
      ensure(LINE_H);
      doc.text(wLine, MARGIN, y);
      y += LINE_H;
    });
    y += gapAfter;
  }

  const info = content.info ?? {};
  write(`Proposal for ${info.customerName || 'Customer'}`, { size: 18, bold: true, gapAfter: 6 });
  if (info.preparedFor) write(`Prepared for: ${info.preparedFor}`);
  if (info.preparedBy) write(`Prepared by: ${info.preparedBy}`);
  if (info.dealName) write(`Deal: ${info.dealName}`);
  if (info.proposalDate) write(`Date: ${info.proposalDate}`);
  if (info.proposalVersion) write(`Version: ${info.proposalVersion}`);
  y += 4;

  const sectionsById = new Map(PROPOSAL_WIZARD_SECTIONS.map((s) => [s.id, s]));
  const bodySectionIds = CUSTOMER_FACING_SECTION_IDS.filter((id) => id !== 'info');

  bodySectionIds.forEach((sectionId, idx) => {
    const section = sectionsById.get(sectionId);
    if (!section) return;
    const sectionData: Record<string, any> = content[sectionId] ?? {};

    write(`${idx + 1}. ${section.title}`, {
      size: 13, bold: true, gapAfter: 4,
    });

    (section.fields ?? []).forEach((f) => {
      if (f.showIf && sectionData[f.showIf.field] !== f.showIf.value) return;
      const value = sectionData[f.k];
      if (!value) return;
      write(`${f.label}: ${value}`);
    });

    if (section.lineItems) {
      const rows: Record<string, string>[] = sectionData[section.lineItems.key] ?? [];
      const filledRows = rows.filter((row) => Object.values(row).some((v) => v));
      if (filledRows.length > 0) {
        write(section.lineItems.label, { bold: true, gapAfter: 2 });
        filledRows.forEach((row) => {
          const rowText = section.lineItems!.cols.map((c) => `${c.label}: ${row[c.k] || '—'}`).join('   ');
          write(`- ${rowText}`);
        });
      }
    }
    y += 4;
  });

  doc.save(fileName);
}

// Required-field validation for Sections 1-8, matching the prototype's
// submitForm() behaviour — collects missing labels rather than failing
// on the first one, and skips any field currently hidden by showIf.
export function findMissingRequiredFields(content: Record<string, any>): string[] {
  const missing: string[] = [];
  PROPOSAL_WIZARD_SECTIONS.forEach((section) => {
    if (!section.fields) return;
    const sectionData: Record<string, any> = content[section.id] ?? {};
    section.fields.forEach((f) => {
      if (!f.required) return;
      if (f.showIf && sectionData[f.showIf.field] !== f.showIf.value) return;
      if (!sectionData[f.k]) missing.push(f.label);
    });
  });
  return missing;
}
