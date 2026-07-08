import { supabase } from '../lib/supabase';
import type { AccountStage, CustomerStage, DealStage, LeadStage } from './types';

export type StageTable = 'lead_stages' | 'account_stages' | 'deal_stages' | 'customer_stages';

function mapStage(row: any): LeadStage | AccountStage | DealStage | CustomerStage {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    color: row.color,
    isDefault: row.is_default,
    ...(row.is_won !== undefined && row.is_won !== null ? { isWon: row.is_won, isLost: row.is_lost } : {}),
    ...(row.win_probability !== undefined && row.win_probability !== null
      ? { winProbability: row.win_probability, isClosedWon: row.is_closed_won, isClosedLost: row.is_closed_lost }
      : {}),
    ...(row.is_customer_stage !== undefined && row.is_customer_stage !== null
      ? { isCustomerStage: row.is_customer_stage, isInactiveStage: row.is_inactive_stage }
      : {}),
    ...(row.is_renewed_stage !== undefined && row.is_renewed_stage !== null
      ? { isRenewedStage: row.is_renewed_stage }
      : {}),
  } as any;
}

async function defaultPipelineId(): Promise<string> {
  const { data, error } = await supabase.from('pipelines').select('id').eq('is_default', true).single();
  if (error) throw error;
  return data.id;
}

export async function listStages(table: StageTable) {
  let query = supabase.from(table).select('*').order('order');
  if (table === 'deal_stages') query = query.eq('pipeline_id', await defaultPipelineId());
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapStage);
}

export async function createStage(table: StageTable, input: { name: string; color: string }) {
  let maxQuery = supabase.from(table).select('order').order('order', { ascending: false }).limit(1);
  if (table === 'deal_stages') maxQuery = maxQuery.eq('pipeline_id', await defaultPipelineId());
  const { data: maxRow } = await maxQuery.maybeSingle();
  const nextOrder = (maxRow?.order ?? 0) + 1;

  const insertRow: Record<string, any> = { name: input.name, color: input.color, order: nextOrder };
  if (table === 'deal_stages') insertRow.pipeline_id = await defaultPipelineId();

  const { data, error } = await supabase.from(table).insert(insertRow).select().single();
  if (error) throw error;
  return mapStage(data);
}

export async function updateStage(table: StageTable, id: string, patch: Record<string, any>) {
  const dbPatch: Record<string, any> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.order !== undefined) dbPatch.order = patch.order;
  if (patch.isWon !== undefined) dbPatch.is_won = patch.isWon;
  if (patch.isLost !== undefined) dbPatch.is_lost = patch.isLost;
  if (patch.isDefault !== undefined) dbPatch.is_default = patch.isDefault;
  if (patch.winProbability !== undefined) dbPatch.win_probability = patch.winProbability;
  if (patch.isClosedWon !== undefined) dbPatch.is_closed_won = patch.isClosedWon;
  if (patch.isClosedLost !== undefined) dbPatch.is_closed_lost = patch.isClosedLost;
  if (patch.isCustomerStage !== undefined) dbPatch.is_customer_stage = patch.isCustomerStage;
  if (patch.isInactiveStage !== undefined) dbPatch.is_inactive_stage = patch.isInactiveStage;
  if (patch.isRenewedStage !== undefined) dbPatch.is_renewed_stage = patch.isRenewedStage;

  const { data, error } = await supabase.from(table).update(dbPatch).eq('id', id).select().single();
  if (error) throw error;
  return mapStage(data);
}

export async function deleteStage(table: StageTable, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function reorderStages(table: StageTable, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from(table).update({ order: i + 1 }).eq('id', orderedIds[i]);
    if (error) throw error;
  }
  return listStages(table);
}
