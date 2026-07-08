import { supabase } from '../lib/supabase';
import type { StageHistoryEntry } from './types';

export async function listStageHistory(opportunityId: string): Promise<StageHistoryEntry[]> {
  const { data, error } = await supabase
    .from('stage_history')
    .select('id, to_stage_id, changed_at, changed_by:profiles(id, full_name)')
    .eq('opportunity_id', opportunityId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  const stageIds = [...new Set(rows.map((r: any) => r.to_stage_id))];
  const { data: stages, error: stageError } = stageIds.length
    ? await supabase.from('deal_stages').select('id, name, color').in('id', stageIds)
    : { data: [], error: null };
  if (stageError) throw stageError;
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  return rows.map((row: any) => {
    const stage = stageById.get(row.to_stage_id);
    return {
      id: row.id,
      stage: stage ? { id: stage.id, name: stage.name, color: stage.color } : { id: row.to_stage_id, name: 'Unknown stage', color: '#6B7280' },
      changedAt: row.changed_at,
      changedBy: row.changed_by ? { id: row.changed_by.id, fullName: row.changed_by.full_name } : undefined,
    };
  });
}
