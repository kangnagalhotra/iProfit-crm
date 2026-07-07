import { supabase } from '../lib/supabase';
import type {
  Paginated, SupportTicket, TicketPriority, TicketStatus, TicketSummary,
} from './types';

const SELECT = `*, account:accounts(id, name), contact:contacts(id, first_name, last_name, email),
  assignee:profiles(id, full_name)`;

const SORT_COLUMN: Record<string, string> = {
  subject: 'subject', priority: 'priority', status: 'status', dueAt: 'due_at', createdAt: 'created_at', updatedAt: 'updated_at',
};

const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'];

function mapTicket(row: any): SupportTicket {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    account: { id: row.account.id, name: row.account.name },
    contact: row.contact ? {
      id: row.contact.id, firstName: row.contact.first_name ?? undefined, lastName: row.contact.last_name ?? undefined, email: row.contact.email ?? undefined,
    } : undefined,
    assignee: row.assignee ? { id: row.assignee.id, fullName: row.assignee.full_name } : undefined,
    dueAt: row.due_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListTicketsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; status?: TicketStatus; priority?: TicketPriority; assigneeId?: string; accountId?: string;
}

export async function listTickets(params: ListTicketsParams = {}): Promise<Paginated<SupportTicket>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('support_tickets').select(SELECT, { count: 'exact' });

  if (params.status) query = query.eq('status', params.status);
  if (params.priority) query = query.eq('priority', params.priority);
  if (params.assigneeId) query = query.eq('assignee_id', params.assigneeId);
  if (params.accountId) query = query.eq('account_id', params.accountId);
  if (params.search) query = query.ilike('subject', `%${params.search}%`);

  const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'created_at';
  query = query.order(column, { ascending: params.sortDir === 'asc' });
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapTicket), page, pageSize, total: count ?? 0,
  };
}

export async function listTicketsFor(accountId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from('support_tickets').select(SELECT)
    .eq('account_id', accountId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTicket);
}

export async function getTicket(id: string): Promise<SupportTicket> {
  const { data, error } = await supabase.from('support_tickets').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapTicket(data);
}

export async function getTicketSummary(): Promise<TicketSummary> {
  const [total, open, critical] = await Promise.all([
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('priority', 'CRITICAL').in('status', OPEN_STATUSES),
  ]);
  return { total: total.count ?? 0, open: open.count ?? 0, critical: critical.count ?? 0 };
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    subject: input.subject, description: input.description, status: input.status, priority: input.priority,
    due_at: input.dueAt, account_id: input.accountId, contact_id: input.contactId, assignee_id: input.assigneeId,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createTicket(input: Record<string, any>): Promise<SupportTicket> {
  const row = toRow(input);
  const { data, error } = await supabase.from('support_tickets').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapTicket(data);
}

export async function updateTicket(id: string, input: Record<string, any>): Promise<SupportTicket> {
  const row = toRow(input);
  const { data, error } = await supabase.from('support_tickets').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapTicket(data);
}

export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase.from('support_tickets').delete().eq('id', id);
  if (error) throw error;
}
