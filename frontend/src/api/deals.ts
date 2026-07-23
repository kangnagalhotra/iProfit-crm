import { supabase } from '../lib/supabase';
import type { DealPriority, Opportunity, Paginated } from './types';
import { listStageHistory } from './dealStageHistory';
import { setOpportunityAdditionalOwners } from './additionalOwners';

const SELECT = `*, pipeline:pipelines(id, name), stage:deal_stages(*), owner:profiles!opportunities_owner_id_fkey(id, full_name),
  account:accounts!opportunities_account_id_fkey(id, name, description, stage:account_stages(name, color)),
  lead:leads!opportunities_lead_id_fkey(id, first_name, last_name, email),
  contact:contacts(id, first_name, last_name, email, mobile, phone),
  partner_account:accounts!opportunities_partner_account_id_fkey(id, name),
  additionalOwnersRows:opportunity_additional_owners(user:profiles(id, full_name))`;

const SORT_COLUMN: Record<string, string> = {
  name: 'name', amount: 'amount', closeDate: 'close_date', updatedAt: 'updated_at', createdAt: 'created_at', score: 'score',
};

function mapDeal(row: any): Opportunity {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount !== null && row.amount !== undefined ? String(row.amount) : undefined,
    closeDate: row.close_date ?? undefined,
    closedAt: row.closed_at ?? undefined,
    dealType: row.deal_type,
    priority: row.priority,
    lossReason: row.loss_reason ?? undefined,
    description: row.description ?? undefined,
    source: row.source ?? undefined,
    currency: row.currency,
    probabilityOverride: row.probability_override ?? undefined,
    nextStep: row.next_step ?? undefined,
    nextActivityDate: row.next_activity_date ?? undefined,
    competitor: row.competitor ?? undefined,
    budgetConfirmed: row.budget_confirmed ?? undefined,
    decisionTimeframe: row.decision_timeframe ?? undefined,
    painPoint: row.pain_point ?? undefined,
    tags: row.tags ?? [],
    partnerAccount: row.partner_account ? { id: row.partner_account.id, name: row.partner_account.name } : undefined,
    forecastCategory: row.forecast_category ?? undefined,
    forecastJustification: row.forecast_justification ?? undefined,
    expectedRevenue: row.expected_revenue !== null && row.expected_revenue !== undefined ? String(row.expected_revenue) : undefined,
    score: row.score ?? 0,
    lastActivityAt: row.last_activity_at ?? undefined,
    renewalDate: row.renewal_date ?? undefined,
    pipeline: { id: row.pipeline.id, name: row.pipeline.name },
    stage: {
      id: row.stage.id, name: row.stage.name, order: row.stage.order, color: row.stage.color,
      isDefault: row.stage.is_default, winProbability: row.stage.win_probability,
      isClosedWon: row.stage.is_closed_won, isClosedLost: row.stage.is_closed_lost,
    },
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : undefined,
    additionalOwners: (row.additionalOwnersRows ?? [])
      .filter((r: any) => r.user)
      .map((r: any) => ({ id: r.user.id, fullName: r.user.full_name })),
    account: row.account ? {
      id: row.account.id, name: row.account.name, description: row.account.description ?? undefined,
      stage: row.account.stage ? { name: row.account.stage.name, color: row.account.stage.color } : undefined,
    } : undefined,
    lead: row.lead ? {
      id: row.lead.id, firstName: row.lead.first_name ?? undefined, lastName: row.lead.last_name ?? undefined, email: row.lead.email ?? undefined,
    } : undefined,
    contact: row.contact ? {
      id: row.contact.id,
      firstName: row.contact.first_name ?? undefined,
      lastName: row.contact.last_name ?? undefined,
      email: row.contact.email ?? undefined,
      mobile: row.contact.mobile ?? undefined,
      phone: row.contact.phone ?? undefined,
    } : undefined,
    archivedAt: row.archived_at ?? undefined,
    mergedIntoOpportunityId: row.merged_into_opportunity_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface OpenDealMatch { id: string; name: string; department?: string; }

// Duplicate-lead detection (B1): does this Company already have an open Deal
// for this Product? Deals themselves carry no department — the closest
// available signal for "which department this Deal belongs to" is its
// originating Lead's department, falling back to its primary Contact's.
export async function findOpenDealMatch(accountId: string, productId: string): Promise<OpenDealMatch | null> {
  const { data, error } = await supabase
    .from('deal_line_items')
    .select(`opportunity:opportunities!inner(id, name, archived_at,
      stage:deal_stages(is_closed_won, is_closed_lost),
      lead:leads!opportunities_lead_id_fkey(department), contact:contacts(department))`)
    .eq('product_id', productId)
    .eq('opportunity.account_id', accountId);
  if (error) throw error;

  const match = (data ?? [])
    .map((r: any) => r.opportunity)
    .find((o: any) => o && !o.archived_at && !o.stage?.is_closed_won && !o.stage?.is_closed_lost);
  if (!match) return null;

  return {
    id: match.id,
    name: match.name,
    department: match.lead?.department ?? match.contact?.department ?? undefined,
  };
}

export interface ListDealsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; stageId?: string; ownerId?: string; accountId?: string; contactId?: string; createdAfter?: string;
  priority?: DealPriority; includeArchived?: boolean;
}

export async function listDeals(params: ListDealsParams = {}): Promise<Paginated<Opportunity>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('opportunities').select(SELECT, { count: 'exact' });

  if (!params.includeArchived) query = query.is('archived_at', null);
  if (params.contactId) query = query.eq('contact_id', params.contactId);
  if (params.stageId) query = query.eq('stage_id', params.stageId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.accountId) query = query.eq('account_id', params.accountId);
  if (params.createdAfter) query = query.gte('created_at', params.createdAfter);
  if (params.priority) query = query.eq('priority', params.priority);
  if (params.search) query = query.ilike('name', `%${params.search}%`);

  if (params.sortBy === 'stage') {
    query = query.order('order', { foreignTable: 'deal_stages', ascending: params.sortDir !== 'desc' });
  } else {
    const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'updated_at';
    query = query.order(column, { ascending: params.sortDir === 'asc' });
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapDeal), page, pageSize, total: count ?? 0,
  };
}

export async function getDeal(id: string): Promise<Opportunity> {
  const { data, error } = await supabase.from('opportunities').select(SELECT).eq('id', id).single();
  if (error) throw error;
  const deal = mapDeal(data);

  // lastActivityAt now comes straight off the row (opportunities.last_activity_at,
  // maintained by the engagement trigger) — only stage history needs a lookup.
  const history = await listStageHistory(id);
  if (history.length > 0) {
    deal.daysInCurrentStage = Math.floor((Date.now() - new Date(history[0].changedAt).getTime()) / 86400000);
  }
  return deal;
}

async function resolveCompany(companyName: string, ownerId?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('resolve-company', { body: { companyName, ownerId } });
  if (error) throw error;
  return data.id;
}

async function defaultPipeline(): Promise<{ id: string }> {
  const { data, error } = await supabase.from('pipelines').select('id').eq('is_default', true).single();
  if (error) throw error;
  return data;
}

async function defaultDealStageId(pipelineId: string): Promise<string> {
  const { data, error } = await supabase.from('deal_stages').select('id').eq('pipeline_id', pipelineId).eq('is_default', true).single();
  if (error) throw error;
  return data.id;
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    name: input.name, amount: input.amount, deal_type: input.dealType, priority: input.priority, description: input.description,
    source: input.source, owner_id: input.ownerId, stage_id: input.stageId, account_id: input.accountId, lead_id: input.leadId,
    contact_id: input.contactId, close_date: input.closeDate, archived_at: input.archivedAt, loss_reason: input.lossReason,
    currency: input.currency, probability_override: input.probabilityOverride, next_step: input.nextStep,
    next_activity_date: input.nextActivityDate, competitor: input.competitor, budget_confirmed: input.budgetConfirmed,
    decision_timeframe: input.decisionTimeframe, pain_point: input.painPoint, tags: input.tags,
    partner_account_id: input.partnerAccountId,
    forecast_category: input.forecastCategory, forecast_justification: input.forecastJustification,
    expected_revenue: input.expectedRevenue,
    renewal_date: input.renewalDate,
    merged_into_opportunity_id: input.mergedIntoOpportunityId,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createDeal(input: Record<string, any>): Promise<Opportunity> {
  const { companyName, ...rest } = input;
  const currentUser = (await supabase.auth.getUser()).data.user;
  const ownerId = rest.ownerId ?? currentUser?.id;
  const accountId = rest.accountId ?? (companyName ? await resolveCompany(companyName, ownerId) : undefined);
  const pipeline = await defaultPipeline();
  const stageId = rest.stageId ?? (await defaultDealStageId(pipeline.id));

  const row = toRow({
    ...rest, ownerId, accountId, stageId,
  });
  row.pipeline_id = pipeline.id;

  const { data, error } = await supabase.from('opportunities').insert(row).select('id').single();
  if (error) throw new Error(error.message);

  if (rest.additionalOwnerIds) await setOpportunityAdditionalOwners(data.id, rest.additionalOwnerIds);

  return getDeal(data.id);
}

export async function updateDeal(id: string, input: Record<string, any>): Promise<Opportunity> {
  const { companyName, ...rest } = input;
  let accountId = rest.accountId;
  if (accountId === undefined && companyName) {
    const { data: current } = await supabase.from('opportunities').select('owner_id').eq('id', id).single();
    accountId = await resolveCompany(companyName, current?.owner_id);
  }
  const row = toRow({ ...rest, accountId });
  const { error } = await supabase.from('opportunities').update(row).eq('id', id);
  if (error) throw new Error(error.message);

  if (rest.additionalOwnerIds) await setOpportunityAdditionalOwners(id, rest.additionalOwnerIds);

  return getDeal(id);
}

// Section C — manual merge of two open Deals at the same company (always
// available, no restriction on stage/age). The rep picks which deal
// survives; the other is archived and pointed at the survivor via
// merged_into_opportunity_id, never deleted — still viewable for audit.
export async function mergeDeals(
  dealAId: string,
  dealBId: string,
  resolution: { survivorId: string; stageId: string; amount?: string; ownerId: string },
): Promise<Opportunity> {
  const { survivorId } = resolution;
  const loserId = survivorId === dealAId ? dealBId : dealAId;
  const [survivor, loser] = await Promise.all([getDeal(survivorId), getDeal(loserId)]);

  await updateDeal(survivorId, { stageId: resolution.stageId, amount: resolution.amount, ownerId: resolution.ownerId });

  // Consolidate Contacts: the loser's primary contact (if any, and not
  // already linked) plus every deal_contacts row, onto the survivor —
  // ignoreDuplicates skips any contact already linked to the survivor.
  const loserContactRows: { contact_id: string; role: string; role_other?: string }[] = [];
  if (loser.contact && loser.contact.id !== survivor.contact?.id) {
    loserContactRows.push({ contact_id: loser.contact.id, role: 'OTHER' });
  }
  const { data: loserDealContacts } = await supabase.from('deal_contacts').select('contact_id, role, role_other').eq('opportunity_id', loserId);
  (loserDealContacts ?? []).forEach((r: any) => {
    loserContactRows.push({ contact_id: r.contact_id, role: r.role, role_other: r.role_other ?? undefined });
  });
  if (loserContactRows.length > 0) {
    await supabase.from('deal_contacts').upsert(
      loserContactRows.map((r) => ({
        opportunity_id: survivorId, contact_id: r.contact_id, role: r.role, role_other: r.role_other,
      })),
      { onConflict: 'opportunity_id,contact_id', ignoreDuplicates: true },
    );
  }

  // Consolidate Associated Leads (B3) onto the survivor: anything already
  // merged into the loser repoints to the survivor, and the loser's own
  // originating lead (if any) becomes a "merged into the survivor" lead too.
  await supabase.from('leads').update({ merged_into_opportunity_id: survivorId }).eq('merged_into_opportunity_id', loserId);
  if (loser.lead?.id) {
    await supabase.from('leads')
      .update({ merged_into_opportunity_id: survivorId, merged_at: new Date().toISOString() })
      .eq('id', loser.lead.id)
      .is('merged_at', null);
  }

  // Archive the loser, pointing it at the survivor.
  await supabase.from('opportunities')
    .update({ archived_at: new Date().toISOString(), merged_into_opportunity_id: survivorId })
    .eq('id', loserId);

  const currentUser = (await supabase.auth.getUser()).data.user;
  await supabase.from('activities').insert([
    { type: 'FIELD_UPDATE', creator_id: currentUser?.id, opportunity_id: survivorId, body: `Merged deal "${loser.name}" into this deal.` },
    { type: 'FIELD_UPDATE', creator_id: currentUser?.id, opportunity_id: loserId, body: `Merged into deal "${survivor.name}".` },
  ]);

  return getDeal(survivorId);
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('opportunities').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkDeleteDeals(ids: string[]) {
  const { error, count } = await supabase.from('opportunities').delete({ count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateDealStage(ids: string[], stageId: string) {
  const { error, count } = await supabase.from('opportunities').update({ stage_id: stageId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateDealOwner(ids: string[], ownerId: string) {
  const { error, count } = await supabase.from('opportunities').update({ owner_id: ownerId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}
