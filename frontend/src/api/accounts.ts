import { supabase } from '../lib/supabase';
import type { Account, Paginated } from './types';

const SELECT = '*, stage:account_stages(*), customerStage:customer_stages(*), owner:profiles(id, full_name)';

const SORT_COLUMN: Record<string, string> = {
  name: 'name', annualRevenue: 'annual_revenue', updatedAt: 'updated_at', createdAt: 'created_at',
};

function mapAccount(row: any): Account {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain ?? undefined,
    industry: row.industry ?? undefined,
    sizeBucket: row.size_bucket ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    country: row.country ?? undefined,
    companyType: row.company_type ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    description: row.description ?? undefined,
    annualRevenue: row.annual_revenue !== null && row.annual_revenue !== undefined ? String(row.annual_revenue) : undefined,
    stage: {
      id: row.stage.id, name: row.stage.name, order: row.stage.order, color: row.stage.color, isDefault: row.stage.is_default,
      isCustomerStage: row.stage.is_customer_stage, isInactiveStage: row.stage.is_inactive_stage,
    },
    customerStage: row.customerStage ? {
      id: row.customerStage.id, name: row.customerStage.name, order: row.customerStage.order, color: row.customerStage.color,
      isDefault: row.customerStage.is_default, isRenewedStage: row.customerStage.is_renewed_stage,
    } : undefined,
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : undefined,
    lastInactivityAlertAt: row.last_inactivity_alert_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListAccountsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; stageId?: string; ownerId?: string; includeArchived?: boolean;
}

export async function listAccounts(params: ListAccountsParams = {}): Promise<Paginated<Account>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('accounts').select(SELECT, { count: 'exact' });

  if (!params.includeArchived) query = query.is('archived_at', null);
  if (params.stageId) query = query.eq('stage_id', params.stageId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`name.ilike.${term},domain.ilike.${term}`);
  }

  if (params.sortBy === 'stage') {
    query = query.order('order', { foreignTable: 'account_stages', ascending: params.sortDir !== 'desc' });
  } else {
    const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'updated_at';
    query = query.order(column, { ascending: params.sortDir === 'asc' });
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapAccount), page, pageSize, total: count ?? 0,
  };
}

export async function getAccount(id: string): Promise<Account> {
  const { data, error } = await supabase.from('accounts').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapAccount(data);
}

async function defaultAccountStageId(): Promise<string> {
  const { data, error } = await supabase.from('account_stages').select('id').eq('is_default', true).single();
  if (error) throw error;
  return data.id;
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    name: input.name, domain: input.domain, industry: input.industry, size_bucket: input.sizeBucket,
    annual_revenue: input.annualRevenue, city: input.city, state: input.state, country: input.country,
    company_type: input.companyType, email: input.email, phone: input.phone, address: input.address,
    description: input.description, owner_id: input.ownerId, stage_id: input.stageId,
    customer_stage_id: input.customerStageId, archived_at: input.archivedAt,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createAccount(input: Record<string, any>): Promise<Account> {
  const currentUser = (await supabase.auth.getUser()).data.user;
  const row = toRow(input);
  row.owner_id = row.owner_id ?? currentUser?.id;
  row.stage_id = row.stage_id ?? (await defaultAccountStageId());

  const { data, error } = await supabase.from('accounts').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapAccount(data);
}

export async function updateAccount(id: string, input: Record<string, any>): Promise<Account> {
  const row = toRow(input);
  const { data, error } = await supabase.from('accounts').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapAccount(data);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkDeleteAccounts(ids: string[]) {
  const { error, count } = await supabase.from('accounts').delete({ count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateAccountStage(ids: string[], stageId: string) {
  const { error, count } = await supabase.from('accounts').update({ stage_id: stageId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateAccountOwner(ids: string[], ownerId: string) {
  const { error, count } = await supabase.from('accounts').update({ owner_id: ownerId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}
