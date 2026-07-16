import { supabase } from '../lib/supabase';
import type { LeadSourceOption } from './types';

function mapOption(row: any): LeadSourceOption {
  return {
    id: row.id, name: row.name, order: row.order, isActive: row.is_active,
  };
}

export async function listLeadSourceOptions(includeInactive = false): Promise<LeadSourceOption[]> {
  let query = supabase.from('lead_source_options').select('*').order('order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapOption);
}

export async function createLeadSourceOption(name: string): Promise<LeadSourceOption> {
  const { data: maxRow } = await supabase.from('lead_source_options').select('order').order('order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxRow?.order ?? 0) + 1;
  const { data, error } = await supabase.from('lead_source_options').insert({ name, order: nextOrder }).select().single();
  if (error) throw error;
  return mapOption(data);
}

export async function updateLeadSourceOption(id: string, patch: { name?: string; isActive?: boolean }): Promise<LeadSourceOption> {
  const dbPatch: Record<string, any> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  const { data, error } = await supabase.from('lead_source_options').update(dbPatch).eq('id', id).select().single();
  if (error) throw error;
  return mapOption(data);
}

export async function deleteLeadSourceOption(id: string): Promise<void> {
  const { error } = await supabase.from('lead_source_options').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderLeadSourceOptions(orderedIds: string[]): Promise<LeadSourceOption[]> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('lead_source_options').update({ order: i + 1 }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
  return listLeadSourceOptions(true);
}
