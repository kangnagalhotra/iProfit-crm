import { supabase } from '../lib/supabase';

// Additive co-owners for a Lead/Deal — purely a display/collaboration
// concept. The single owner_id column (and every RLS policy keyed on it)
// is untouched; these tables just record "who else is working this".
async function syncOwners(table: 'lead_additional_owners' | 'opportunity_additional_owners', fkColumn: string, parentId: string, userIds: string[]) {
  const { error: delError } = await supabase.from(table).delete().eq(fkColumn, parentId);
  if (delError) throw delError;
  if (userIds.length === 0) return;
  const { error: insError } = await supabase.from(table).insert(userIds.map((userId) => ({ [fkColumn]: parentId, user_id: userId })));
  if (insError) throw insError;
}

export async function setLeadAdditionalOwners(leadId: string, userIds: string[]): Promise<void> {
  return syncOwners('lead_additional_owners', 'lead_id', leadId, userIds);
}

export async function setOpportunityAdditionalOwners(opportunityId: string, userIds: string[]): Promise<void> {
  return syncOwners('opportunity_additional_owners', 'opportunity_id', opportunityId, userIds);
}
