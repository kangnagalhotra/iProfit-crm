import { supabase } from '../lib/supabase';
import type {
  Paginated, Task, TaskStatus, TaskSummary,
} from './types';

const SELECT = `*, assignee:profiles(id, full_name), lead:leads(id, first_name, last_name, email, mobile),
  account:accounts(id, name, phone, email), opportunity:opportunities(id, name, contact:contacts(id, first_name, last_name, email, mobile))`;

const SORT_COLUMN: Record<string, string> = {
  title: 'title', dueAt: 'due_at', priority: 'priority', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at',
};

const OPEN_STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING'];

function mapTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    notes: row.notes ?? undefined,
    reminderAt: row.reminder_at ?? undefined,
    assignee: row.assignee ? { id: row.assignee.id, fullName: row.assignee.full_name } : undefined,
    lead: row.lead ? {
      id: row.lead.id,
      firstName: row.lead.first_name ?? undefined,
      lastName: row.lead.last_name ?? undefined,
      email: row.lead.email ?? undefined,
      mobile: row.lead.mobile ?? undefined,
    } : undefined,
    account: row.account ? {
      id: row.account.id, name: row.account.name, phone: row.account.phone ?? undefined, email: row.account.email ?? undefined,
    } : undefined,
    opportunity: row.opportunity ? {
      id: row.opportunity.id,
      name: row.opportunity.name,
      contact: row.opportunity.contact ? {
        firstName: row.opportunity.contact.first_name ?? undefined,
        lastName: row.opportunity.contact.last_name ?? undefined,
        email: row.opportunity.contact.email ?? undefined,
        mobile: row.opportunity.contact.mobile ?? undefined,
      } : undefined,
    } : undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dueFilterRange(dueFilter?: 'today' | 'overdue' | 'upcoming') {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return {
    now: now.toISOString(), startOfToday: startOfToday.toISOString(), startOfTomorrow: startOfTomorrow.toISOString(), dueFilter,
  };
}

export interface ListTasksParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; status?: TaskStatus; priority?: string; assigneeId?: string;
  dueFilter?: 'today' | 'overdue' | 'upcoming';
}

export async function listTasks(params: ListTasksParams = {}): Promise<Paginated<Task>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('tasks').select(SELECT, { count: 'exact' });

  if (params.assigneeId) query = query.eq('assignee_id', params.assigneeId);
  if (params.status) query = query.eq('status', params.status);
  if (params.priority) query = query.eq('priority', params.priority);
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`title.ilike.${term},notes.ilike.${term}`);
  }
  if (params.dueFilter) {
    const { now, startOfToday, startOfTomorrow } = dueFilterRange(params.dueFilter);
    query = query.not('status', 'in', '(COMPLETED,CANCELLED)');
    if (params.dueFilter === 'overdue') query = query.lt('due_at', now);
    else if (params.dueFilter === 'today') query = query.gte('due_at', startOfToday).lt('due_at', startOfTomorrow);
    else query = query.gte('due_at', startOfTomorrow);
  }

  const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'due_at';
  query = query.order(column, { ascending: params.sortDir !== 'desc' });
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapTask), page, pageSize, total: count ?? 0,
  };
}

export async function listTasksFor(params: { leadId?: string; accountId?: string; opportunityId?: string }): Promise<Task[]> {
  let query = supabase.from('tasks').select(SELECT).order('due_at', { ascending: true });
  if (params.leadId) query = query.eq('lead_id', params.leadId);
  else if (params.accountId) query = query.eq('account_id', params.accountId);
  else if (params.opportunityId) query = query.eq('opportunity_id', params.opportunityId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

// Open tasks for the Reminders menu: everything due before the end of the
// day after tomorrow (overdue included), oldest first. Grouping into
// Overdue / Today / Tomorrow / In 2 days happens client-side.
export async function listReminderTasks(assigneeId: string): Promise<Task[]> {
  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const { data, error } = await supabase.from('tasks').select(SELECT)
    .eq('assignee_id', assigneeId)
    .not('status', 'in', '(COMPLETED,CANCELLED)')
    .lt('due_at', horizon.toISOString())
    .order('due_at', { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function getTask(id: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapTask(data);
}

export async function getTaskSummary(): Promise<TaskSummary> {
  const { now, startOfToday, startOfTomorrow } = dueFilterRange();
  const [total, open, completed, overdue, dueToday] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).lt('due_at', now).not('status', 'in', '(COMPLETED,CANCELLED)'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('due_at', startOfToday).lt('due_at', startOfTomorrow).not('status', 'in', '(COMPLETED,CANCELLED)'),
  ]);
  return {
    total: total.count ?? 0, open: open.count ?? 0, completed: completed.count ?? 0, overdue: overdue.count ?? 0, dueToday: dueToday.count ?? 0,
  };
}

function toRow(input: Record<string, any>) {
  const row: Record<string, any> = {
    title: input.title, type: input.type, priority: input.priority, status: input.status,
    due_at: input.dueAt, notes: input.notes, reminder_at: input.reminderAt, assignee_id: input.assigneeId,
    lead_id: input.leadId, account_id: input.accountId, opportunity_id: input.opportunityId,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
  return row;
}

export async function createTask(input: Record<string, any>): Promise<Task> {
  const currentUser = (await supabase.auth.getUser()).data.user;
  const row = toRow(input);
  row.assignee_id = row.assignee_id ?? currentUser?.id;
  if (row.status === 'COMPLETED') row.completed_at = new Date().toISOString();

  const { data, error } = await supabase.from('tasks').insert(row).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapTask(data);
}

export async function updateTask(id: string, input: Record<string, any>): Promise<Task> {
  const row = toRow(input);
  if (row.status !== undefined) {
    const { data: current } = await supabase.from('tasks').select('status').eq('id', id).single();
    if (row.status === 'COMPLETED' && current?.status !== 'COMPLETED') row.completed_at = new Date().toISOString();
    else if (row.status !== 'COMPLETED' && current?.status === 'COMPLETED') row.completed_at = null;
  }
  const { data, error } = await supabase.from('tasks').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapTask(data);
}

export async function completeTask(id: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks')
    .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
    .eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapTask(data);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkDeleteTasks(ids: string[]) {
  const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateTaskStatus(ids: string[], status: TaskStatus) {
  const patch: Record<string, any> = { status };
  if (status === 'COMPLETED') patch.completed_at = new Date().toISOString();
  const { error, count } = await supabase.from('tasks').update(patch, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateTaskOwner(ids: string[], assigneeId: string) {
  const { error, count } = await supabase.from('tasks').update({ assignee_id: assigneeId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}
