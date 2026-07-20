import { supabase } from '../lib/supabase';
import type { ProposalTemplate } from './types';

function mapTemplate(row: any): ProposalTemplate {
  return {
    id: row.id, name: row.name, body: row.body, kind: row.kind ?? 'TEXT', isDefault: row.is_default,
  };
}

export async function listProposalTemplates(): Promise<ProposalTemplate[]> {
  const { data, error } = await supabase.from('proposal_templates').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

export async function getDefaultProposalTemplate(): Promise<ProposalTemplate | null> {
  const { data, error } = await supabase.from('proposal_templates').select('*').eq('is_default', true).limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapTemplate(data) : null;
}

// The single "Detailed Form" wizard template (see proposalWizardSchema.ts
// for its actual section/field structure, which lives in code, not here).
export async function getWizardProposalTemplate(): Promise<ProposalTemplate | null> {
  const { data, error } = await supabase.from('proposal_templates').select('*').eq('kind', 'WIZARD').limit(1).maybeSingle();
  if (error) throw error;
  return data ? mapTemplate(data) : null;
}

// Fills {{deal_name}}, {{account_name}}, {{amount}}, {{owner_name}} from the
// current deal — anything not available just renders as an empty string
// rather than leaving the raw token in place.
export function fillProposalTemplate(body: string, values: {
  dealName?: string; accountName?: string; amount?: string; ownerName?: string;
}): string {
  return body
    .replace(/\{\{deal_name\}\}/g, values.dealName ?? '')
    .replace(/\{\{account_name\}\}/g, values.accountName ?? '')
    .replace(/\{\{amount\}\}/g, values.amount ?? '')
    .replace(/\{\{owner_name\}\}/g, values.ownerName ?? '');
}
