import type { ActivityType, Opportunity, StageAutomationRule } from '../api/types';
import { listStageRules } from '../api/stageRules';
import { updateDeal } from '../api/deals';

export interface AutomationResult {
  message: string;
  undo: () => Promise<void>;
}

function fieldFilled(deal: Opportunity, field: string): boolean {
  switch (field) {
    case 'amount': return !!deal.amount && Number(deal.amount) > 0;
    case 'next_step': return !!deal.nextStep;
    case 'close_date': return !!deal.closeDate;
    default: return false;
  }
}

// Evaluated client-side right after an activity is logged on a deal, so the
// rep sees a toast with an Undo option — automation is never silent and
// manual stage override always remains available. Returns null when no
// enabled rule matches.
export async function evaluateStageAutomation(
  deal: Opportunity,
  activityType: ActivityType,
): Promise<AutomationResult | null> {
  let rules: StageAutomationRule[];
  try {
    rules = await listStageRules();
  } catch {
    return null; // automation must never break activity logging
  }

  const rule = rules.find((r) => r.enabled
    && r.fromStage.id === deal.stage.id
    && r.requiresActivityType === activityType
    && (!r.requiresField || fieldFilled(deal, r.requiresField)));
  if (!rule) return null;

  const previousStageId = deal.stage.id;
  try {
    await updateDeal(deal.id, { stageId: rule.toStage.id });
  } catch {
    return null;
  }

  const reason = rule.requiresField
    ? `${activityType.toLowerCase()} logged + ${rule.requiresField.replace('_', ' ')} filled`
    : `${activityType.toLowerCase()} logged`;
  return {
    message: `Deal moved to ${rule.toStage.name} — ${reason}`,
    undo: async () => { await updateDeal(deal.id, { stageId: previousStageId }); },
  };
}
