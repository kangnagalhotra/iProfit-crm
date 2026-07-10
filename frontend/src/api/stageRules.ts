import { supabase } from '../lib/supabase';
import type { ActivityType, StageAutomationRule } from './types';

const SELECT = '*, fromStage:deal_stages!stage_automation_rules_from_stage_id_fkey(id, name), toStage:deal_stages!stage_automation_rules_to_stage_id_fkey(id, name)';

// Columns a rule is allowed to require non-null — kept as an allowlist so the
// settings UI can't reference arbitrary/unsafe columns.
export const RULE_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'amount', label: 'Value filled in' },
  { value: 'next_step', label: 'Next step filled in' },
  { value: 'close_date', label: 'Closing date set' },
];

function mapRule(row: any): StageAutomationRule {
  return {
    id: row.id,
    fromStage: { id: row.fromStage.id, name: row.fromStage.name },
    toStage: { id: row.toStage.id, name: row.toStage.name },
    requiresActivityType: row.requires_activity_type,
    requiresField: row.requires_field ?? undefined,
    enabled: row.enabled,
  };
}

export async function listStageRules(): Promise<StageAutomationRule[]> {
  const { data, error } = await supabase.from('stage_automation_rules').select(SELECT).order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapRule);
}

export async function createStageRule(input: {
  fromStageId: string; toStageId: string; requiresActivityType: ActivityType; requiresField?: string;
}): Promise<StageAutomationRule> {
  const { data, error } = await supabase.from('stage_automation_rules').insert({
    from_stage_id: input.fromStageId,
    to_stage_id: input.toStageId,
    requires_activity_type: input.requiresActivityType,
    requires_field: input.requiresField || null,
  }).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapRule(data);
}

export async function updateStageRule(id: string, patch: { enabled?: boolean }): Promise<StageAutomationRule> {
  const { data, error } = await supabase.from('stage_automation_rules').update({ enabled: patch.enabled })
    .eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapRule(data);
}

export async function deleteStageRule(id: string): Promise<void> {
  const { error } = await supabase.from('stage_automation_rules').delete().eq('id', id);
  if (error) throw error;
}
