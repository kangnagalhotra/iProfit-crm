import { supabase } from '../lib/supabase';
import type { Activity, ActivityType } from './types';

const SELECT = '*, creator:profiles(id, full_name)';

function mapActivity(row: any): Activity {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    occurredAt: row.occurred_at,
    creator: { id: row.creator.id, fullName: row.creator.full_name },
  };
}

export interface ActivityParent {
  leadId?: string; accountId?: string; opportunityId?: string; taskId?: string;
  // Company-only: roll up activity from this account's associated leads/deals
  // too, so the account timeline shows the full customer history, not just
  // activities logged directly against the account itself.
  relatedLeadIds?: string[]; relatedOpportunityIds?: string[];
}

export async function listActivities(parent: ActivityParent): Promise<Activity[]> {
  let query = supabase.from('activities').select(SELECT).order('occurred_at', { ascending: false });
  if (parent.accountId && (parent.relatedLeadIds?.length || parent.relatedOpportunityIds?.length)) {
    const clauses = [`account_id.eq.${parent.accountId}`];
    if (parent.relatedLeadIds?.length) clauses.push(`lead_id.in.(${parent.relatedLeadIds.join(',')})`);
    if (parent.relatedOpportunityIds?.length) clauses.push(`opportunity_id.in.(${parent.relatedOpportunityIds.join(',')})`);
    query = query.or(clauses.join(','));
  } else if (parent.leadId) query = query.eq('lead_id', parent.leadId);
  else if (parent.accountId) query = query.eq('account_id', parent.accountId);
  else if (parent.opportunityId) query = query.eq('opportunity_id', parent.opportunityId);
  else if (parent.taskId) query = query.eq('task_id', parent.taskId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapActivity);
}

export async function createActivity(input: ActivityParent & { type: ActivityType; body: string }): Promise<Activity> {
  const currentUser = (await supabase.auth.getUser()).data.user;
  const row: Record<string, any> = {
    type: input.type, body: input.body, creator_id: currentUser?.id,
    lead_id: input.leadId, account_id: input.accountId, opportunity_id: input.opportunityId, task_id: input.taskId,
  };
  const { data, error } = await supabase.from('activities').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapActivity(data);
}

export async function updateActivity(id: string, body: string): Promise<Activity> {
  const { data, error } = await supabase.from('activities').update({ body }).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapActivity(data);
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
}
