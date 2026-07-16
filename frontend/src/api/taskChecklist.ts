import { supabase } from '../lib/supabase';
import type { ChecklistItem } from './types';

function mapItem(row: any): ChecklistItem {
  return {
    id: row.id, title: row.title, isDone: row.is_done, order: row.order,
  };
}

export async function listChecklistItems(taskId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase.from('task_checklist_items').select('*').eq('task_id', taskId).order('order');
  if (error) throw error;
  return (data ?? []).map(mapItem);
}

export async function addChecklistItem(taskId: string, title: string): Promise<ChecklistItem> {
  const { data: maxRow } = await supabase.from('task_checklist_items').select('order').eq('task_id', taskId).order('order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxRow?.order ?? 0) + 1;
  const { data, error } = await supabase.from('task_checklist_items').insert({ task_id: taskId, title, order: nextOrder }).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<ChecklistItem> {
  const { data, error } = await supabase.from('task_checklist_items').update({ is_done: isDone }).eq('id', id).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function renameChecklistItem(id: string, title: string): Promise<ChecklistItem> {
  const { data, error } = await supabase.from('task_checklist_items').update({ title }).eq('id', id).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('task_checklist_items').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderChecklistItems(orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('task_checklist_items').update({ order: i + 1 }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
}
