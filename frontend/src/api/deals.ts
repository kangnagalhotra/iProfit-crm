import { supabase } from '../lib/supabase';
import type { DealPriority, Opportunity, Paginated } from './types';
import { listStageHistory } from './dealStageHistory';

const SELECT = `*, pipeline:pipelines(id, name), stage:deal_stages(*), owner:profiles(id, full_name),
  account:accounts!opportunities_account_id_fkey(id, name, stage:account_stages(name, color)), lead:leads(id, first_name, last_name, email),
  contact:contacts(id, first_name, last_name, email),
  partner_account:accounts!opportunities_partner_account_id_fkey(id, name)`;

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
    account: row.account ? {
      id: row.account.id, name: row.account.name,
      stage: row.account.stage ? { name: row.account.stage.name, color: row.account.stage.color } : undefined,
    } : undefined,
    lead: row.lead ? {
      id: row.lead.id, firstName: row.lead.first_name ?? undefined, lastName: row.lead.last_name ?? undefined, email: row.lead.email ?? undefined,
    } : undefined,
    contact: row.contact ? {
      id: row.contact.id, firstName: row.contact.first_name ?? undefined, lastName: row.contact.last_name ?? undefined, email: row.contact.email ?? undefined,
    } : undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  const { data, error } = await supabase.from('opportunities').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapDeal(data);
}

export async function updateDeal(id: string, input: Record<string, any>): Promise<Opportunity> {
  const { companyName, ...rest } = input;
  let accountId = rest.accountId;
  if (accountId === undefined && companyName) {
    const { data: current } = await supabase.from('opportunities').select('owner_id').eq('id', id).single();
    accountId = await resolveCompany(companyName, current?.owner_id);
  }
  const row = toRow({ ...rest, accountId });
  const { data, error } = await supabase.from('opportunities').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapDeal(data);
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
