import { supabase } from '../lib/supabase';
import type { DealProposal } from './types';

function mapProposal(row: any): DealProposal {
  return {
    id: row.id,
    version: row.version,
    sentDate: row.sent_date,
    value: row.value !== null && row.value !== undefined ? String(row.value) : undefined,
    notes: row.notes ?? undefined,
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
  input: { sentDate: string; value?: string; notes?: string },
): Promise<DealProposal> {
  const { data: latest } = await supabase.from('deal_proposals').select('version')
    .eq('opportunity_id', opportunityId).order('version', { ascending: false }).limit(1).maybeSingle();
  const version = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase.from('deal_proposals').insert({
    opportunity_id: opportunityId,
    version,
    sent_date: input.sentDate,
    value: input.value || null,
    notes: input.notes || null,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return mapProposal(data);
}

export async function deleteProposal(id: string): Promise<void> {
  const { error } = await supabase.from('deal_proposals').delete().eq('id', id);
  if (error) throw error;
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
