import { supabase } from '../lib/supabase';
import type { Contact, Paginated } from './types';

const SELECT = '*, account:accounts(id, name), lead:leads(id), owner:profiles(id, full_name)';

const SORT_COLUMN: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', updatedAt: 'updated_at', createdAt: 'created_at',
};

function mapContact(row: any): Contact {
  return {
    id: row.id,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    jobTitle: row.job_title ?? undefined,
    account: row.account ? { id: row.account.id, name: row.account.name } : undefined,
    lead: row.lead ? { id: row.lead.id } : undefined,
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListContactsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; accountId?: string; ownerId?: string;
}

export async function listContacts(params: ListContactsParams = {}): Promise<Paginated<Contact>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('contacts').select(SELECT, { count: 'exact' });

  if (params.accountId) query = query.eq('account_id', params.accountId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`);
  }

  const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'updated_at';
  query = query.order(column, { ascending: params.sortDir === 'asc' });
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapContact), page, pageSize, total: count ?? 0,
  };
}

export async function getContact(id: string): Promise<Contact> {
  const { data, error } = await supabase.from('contacts').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapContact(data);
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    first_name: input.firstName, last_name: input.lastName, email: input.email, phone: input.phone,
    job_title: input.jobTitle, account_id: input.accountId, lead_id: input.leadId, owner_id: input.ownerId,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createContact(input: Record<string, any>): Promise<Contact> {
  const currentUser = (await supabase.auth.getUser()).data.user;
  const row = toRow(input);
  row.owner_id = row.owner_id ?? currentUser?.id;

  const { data, error } = await supabase.from('contacts').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapContact(data);
}

export async function updateContact(id: string, input: Record<string, any>): Promise<Contact> {
  const row = toRow(input);
  const { data, error } = await supabase.from('contacts').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapContact(data);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}
