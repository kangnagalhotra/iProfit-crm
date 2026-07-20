import { supabase } from '../lib/supabase';
import type { DealProposal } from './types';

function mapProposal(row: any): DealProposal {
  return {
    id: row.id,
    version: row.version,
    sentDate: row.sent_date,
    value: row.value !== null && row.value !== undefined ? String(row.value) : undefined,
    notes: row.notes ?? undefined,
    templateId: row.template_id ?? undefined,
    content: row.content ?? undefined,
    createdAt: row.created_at,
  };
}

export async function listProposals(opportunityId: string): Promise<DealProposal[]> {
  const { data, error } = await supabase.from('deal_proposals').select('*')
    .eq('opportunity_id', opportunityId).order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProposal);
}

// Versions are append-only (never overwritten) so the offer's evolution and
// proposal→close timing stay reportable. Next version = max + 1.
export async function addProposal(
  opportunityId: string,
  input: { sentDate: string; value?: string; notes?: string; templateId?: string },
): Promise<DealProposal> {
  const { data: latest } = await supabase.from('deal_proposals').select('version')
    .eq('opportunity_id', opportunityId).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const row: Record<string, any> = {
    opportunity_id: opportunityId,
    version,
    sent_date: input.sentDate,
    value: input.value || null,
    notes: input.notes || null,
  };
  // Only sent when a template was actually applied — keeps ordinary (no
  // template) proposal logging working even before phase-p's template_id
  // column has been migrated in.
  if (input.templateId) row.template_id = input.templateId;

  const { data, error } = await supabase.from('deal_proposals').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return mapProposal(data);
}

export async function deleteProposal(id: string): Promise<void> {
  const { error } = await supabase.from('deal_proposals').delete().eq('id', id);
  if (error) throw error;
}

// Creates a new versioned row for the Detailed Proposal Wizard — a genuine
// new version, same auto-increment as addProposal(). The wizard then edits
// this SAME row in place (see updateProposalContent) rather than creating
// another version on every save; only clicking "New Proposal" again from
// ProposalsCard creates the next version.
export async function createProposalDraft(
  opportunityId: string,
  templateId: string,
  content: Record<string, any>,
  extras: { sentDate: string; value?: string; notes?: string },
): Promise<DealProposal> {
  const { data: latest } = await supabase.from('deal_proposals').select('version')
    .eq('opportunity_id', opportunityId).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase.from('deal_proposals').insert({
    opportunity_id: opportunityId,
    version,
    sent_date: extras.sentDate,
    value: extras.value || null,
    notes: extras.notes || null,
    template_id: templateId,
    content,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return mapProposal(data);
}

// Plain in-place update — no version bump. This is what keeps the wizard's
// Section 9 (Approvals) editable indefinitely: there's no draft/final lock,
// saving just updates this same row's content whenever called.
export async function updateProposalContent(
  id: string,
  content: Record<string, any>,
  extras: { value?: string; notes?: string } = {},
): Promise<DealProposal> {
  const row: Record<string, any> = { content };
  if (extras.value !== undefined) row.value = extras.value || null;
  if (extras.notes !== undefined) row.notes = extras.notes || null;

  const { data, error } = await supabase.from('deal_proposals').update(row).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return mapProposal(data);
}

// For the Reports page: every proposal joined with its deal's outcome.
export interface ProposalWithOutcome {
  opportunityId: string;
  version: number;
  sentDate: string;
  closedAt?: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

export async function listAllProposalsWithOutcome(): Promise<ProposalWithOutcome[]> {
  const { data, error } = await supabase.from('deal_proposals')
    .select('opportunity_id, version, sent_date, opportunity:opportunities(closed_at, stage:deal_stages(is_closed_won, is_closed_lost))');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    opportunityId: row.opportunity_id,
    version: row.version,
    sentDate: row.sent_date,
    closedAt: row.opportunity?.closed_at ?? undefined,
    isClosedWon: row.opportunity?.stage?.is_closed_won ?? false,
    isClosedLost: row.opportunity?.stage?.is_closed_lost ?? false,
  }));
}
