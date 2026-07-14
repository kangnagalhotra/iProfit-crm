import type { ActivityType, Lead, LeadStage } from '../api/types';
import { updateLead } from '../api/leads';

export interface LeadAutomationResult {
  message: string;
  undo: () => Promise<void>;
}

// Built-in lead-progression rules, mirroring how reps actually work so the
// pipeline keeps itself honest without manual stage bookkeeping:
//   - Logging outreach (call/email) on a NEW lead proves contact was
//     attempted -> "Attempted Contact".
//   - Logging a MEETING proves a real conversation happened -> "Contacted"
//     (from New or Attempted Contact).
// Qualified is deliberately NEVER automated — that transition runs through
// the MQL gate (ICP + Budget + Authority) and stays a human decision.
// Same contract as deal stage automation: toast with Undo, never silent.
export const LEAD_AUTOMATION_RULES = [
  {
    fromStageNames: ['New'],
    toStageName: 'Attempted Contact',
    activityTypes: ['CALL', 'EMAIL'] as ActivityType[],
    reason: 'outreach logged',
  },
  {
    fromStageNames: ['New', 'Attempted Contact'],
    toStageName: 'Contacted',
    activityTypes: ['MEETING'] as ActivityType[],
    reason: 'meeting logged',
  },
];

export async function evaluateLeadAutomation(
  lead: Lead,
  activityType: ActivityType,
  stages: LeadStage[],
): Promise<LeadAutomationResult | null> {
  if (lead.convertedAt || lead.stage.isWon || lead.stage.isLost) return null;

  const rule = LEAD_AUTOMATION_RULES.find((r) => r.fromStageNames.includes(lead.stage.name)
    && r.activityTypes.includes(activityType));
  if (!rule) return null;

  const target = stages.find((s) => s.name === rule.toStageName);
  // Stage was renamed/deleted — automation quietly stands down rather than guessing.
  if (!target || target.id === lead.stage.id) return null;

  const previousStageId = lead.stage.id;
  try {
    await updateLead(lead.id, { stageId: target.id });
  } catch {
    return null; // automation must never break activity logging
  }

  return {
    message: `Lead moved to ${target.name} — ${rule.reason}`,
    undo: async () => { await updateLead(lead.id, { stageId: previousStageId }); },
  };
}
