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
    postalCode: row.postal_code ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    description: row.description ?? undefined,
    annualRevenue: row.annual_revenue !== null && row.annual_revenue !== undefined ? String(row.annual_revenue) : undefined,
    currency: row.currency ?? undefined,
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
  search?: string; stageId?: string; ownerId?: string; industry?: string; includeArchived?: boolean;
}

export async function listAccounts(params: ListAccountsParams = {}): Promise<Paginated<Account>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('accounts').select(SELECT, { count: 'exact' });

  if (!params.includeArchived) query = query.is('archived_at', null);
  if (params.stageId) query = query.eq('stage_id', params.stageId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.industry) query = query.eq('industry', params.industry);
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

export interface DuplicateAccountMatch { id: string; name: string; domain?: string; matchType: 'name' | 'domain'; }

// Mirrors the DB's normalize_domain() (schema.sql) so the client can preview
// the same collision the accounts_domain_normalized_uidx constraint enforces.
export function normalizeDomain(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
}

const COMPANY_SUFFIX_RE = /\b(pvt\.?\s*ltd\.?|private\s+limited|llc|inc\.?|ltd\.?|limited|corp\.?|corporation|co\.?)\b/gi;

// Ignores case, punctuation, and common legal suffixes so "WeExcel Pvt Ltd"
// and "WeExcel LLC" are treated as the same name for the soft dup-check.
function normalizeCompanyName(input: string): string {
  return input.toLowerCase().replace(COMPANY_SUFFIX_RE, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface DuplicateCheckResult {
  // Domain collisions are a hard signal (DB-enforced) — the caller should block creation.
  domainMatch?: DuplicateAccountMatch;
  // Name collisions can be legitimate different companies — advisory only.
  nameMatch?: DuplicateAccountMatch;
}

// HubSpot-style duplicate check, run before creating a company: domain and
// name are checked independently. Domain match = hard block (same site can't
// be two companies); name match = soft warning requiring explicit confirmation.
export async function checkDuplicateAccount(params: {
  name?: string; domain?: string; excludeId?: string;
}): Promise<DuplicateCheckResult> {
  const { name, domain, excludeId } = params;
  const result: DuplicateCheckResult = {};

  if (domain?.trim()) {
    const normalized = normalizeDomain(domain);
    if (normalized) {
      let q = supabase.from('accounts').select('id, name, domain').eq('domain_normalized', normalized).limit(1);
      if (excludeId) q = q.neq('id', excludeId);
      const { data } = await q.maybeSingle();
      if (data) result.domainMatch = { id: data.id, name: data.name, domain: data.domain ?? undefined, matchType: 'domain' };
    }
  }

  if (name?.trim()) {
    const normalizedTarget = normalizeCompanyName(name);
    const firstWord = normalizedTarget.split(' ')[0];
    if (normalizedTarget && firstWord) {
      let q = supabase.from('accounts').select('id, name, domain').ilike('name', `%${firstWord}%`).limit(20);
      if (excludeId) q = q.neq('id', excludeId);
      const { data } = await q;
      const match = (data ?? []).find((a) => normalizeCompanyName(a.name) === normalizedTarget);
      if (match && match.id !== result.domainMatch?.id) {
        result.nameMatch = { id: match.id, name: match.name, domain: match.domain ?? undefined, matchType: 'name' };
      }
    }
  }

  return result;
}

async function defaultAccountStageId(): Promise<string> {
  const { data, error } = await supabase.from('account_stages').select('id').eq('is_default', true).single();
  if (error) throw error;
  return data.id;
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    name: input.name, domain: input.domain, industry: input.industry, size_bucket: input.sizeBucket,
    annual_revenue: input.annualRevenue, currency: input.currency, city: input.city, state: input.state, country: input.country,
    postal_code: input.postalCode, email: input.email, phone: input.phone, address: input.address,
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

export async function mergeAccounts(sourceId: string, targetId: string): Promise<void> {
  const { error } = await supabase.rpc('merge_accounts', { source_id: sourceId, target_id: targetId });
  if (error) throw new Error(error.message);
}

export async function bulkUpdateAccountOwner(ids: string[], ownerId: string) {
  const { error, count } = await supabase.from('accounts').update({ owner_id: ownerId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}
