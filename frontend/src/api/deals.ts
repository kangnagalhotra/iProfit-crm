import { supabase } from '../lib/supabase';
import type { Opportunity, Paginated } from './types';

const SELECT = `*, pipeline:pipelines(id, name), stage:deal_stages(*), owner:profiles(id, full_name),
  account:accounts(id, name), lead:leads(id, first_name, last_name, email),
  contact:contacts(id, first_name, last_name, email)`;

const SORT_COLUMN: Record<string, string> = {
  name: 'name', amount: 'amount', closeDate: 'close_date', updatedAt: 'updated_at', createdAt: 'created_at',
};

function mapDeal(row: any): Opportunity {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount !== null && row.amount !== undefined ? String(row.amount) : undefined,
    closeDate: row.close_date ?? undefined,
    closedAt: row.closed_at ?? undefined,
    dealType: row.deal_type,
    description: row.description ?? undefined,
    source: row.source ?? undefined,
    pipeline: { id: row.pipeline.id, name: row.pipeline.name },
    stage: {
      id: row.stage.id, name: row.stage.name, order: row.stage.order, color: row.stage.color,
      isDefault: row.stage.is_default, winProbability: row.stage.win_probability,
      isClosedWon: row.stage.is_closed_won, isClosedLost: row.stage.is_closed_lost,
    },
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name } : undefined,
    lead: row.lead ? {
      id: row.lead.id, firstName: row.lead.first_name ?? undefined, lastName: row.lead.last_name ?? undefined, email: row.lead.email ?? undefined,
    } : undefined,
    contact: row.contact ? {
      id: row.contact.id, firstName: row.contact.first_name ?? undefined, lastName: row.contact.last_name ?? undefined, email: row.contact.email ?? undefined,
    } : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListDealsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; stageId?: string; ownerId?: string; accountId?: string; createdAfter?: string;
}

export async function listDeals(params: ListDealsParams = {}): Promise<Paginated<Opportunity>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('opportunities').select(SELECT, { count: 'exact' });

  if (params.stageId) query = query.eq('stage_id', params.stageId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.accountId) query = query.eq('account_id', params.accountId);
  if (params.createdAfter) query = query.gte('created_at', params.createdAfter);
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
  return mapDeal(data);
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
    name: input.name, amount: input.amount, deal_type: input.dealType, description: input.description,
    source: input.source, owner_id: input.ownerId, stage_id: input.stageId, account_id: input.accountId, lead_id: input.leadId,
    contact_id: input.contactId, close_date: input.closeDate,
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
