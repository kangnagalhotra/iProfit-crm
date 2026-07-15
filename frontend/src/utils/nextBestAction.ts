import type { Lead, Opportunity } from '../api/types';

export interface NextBestAction {
  label: string;
  tone: 'hot' | 'warn' | 'info';
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Simple weighted rules, evaluated top-down — first match wins. Deliberately
// not ML: transparent, debuggable, and cheap to extend when Outlook lands
// (email open/reply signals slot in as higher-priority rules here).
export function leadNextBestAction(lead: Lead): NextBestAction {
  const cold = daysSince(lead.lastActivityAt);

  if (lead.stage.isLost) return { label: 'Unqualified — archive or nurture', tone: 'info' };
  if (lead.convertedAt) return { label: 'Converted', tone: 'info' };

  if (lead.stage.isWon) return { label: 'Convert to Deal — qualified', tone: 'hot' };

  const mqlReady = lead.icpMatch && lead.budgetScore != null && lead.authorityScore != null;
  if (mqlReady) return { label: 'Mark Qualified — MQL checks passed', tone: 'hot' };

  if (cold !== null && cold <= 1 && lead.score >= 60) return { label: 'Call now — engaged in last 24h', tone: 'hot' };
  if (cold !== null && cold >= 14) return { label: `Re-engage — cold ${cold} days`, tone: 'warn' };
  if (cold === null) return { label: 'Make first contact', tone: 'warn' };
  if (!lead.icpMatch) return { label: 'Verify ICP fit', tone: 'info' };
  if (lead.budgetScore == null || lead.authorityScore == null) return { label: 'Complete BANT qualification', tone: 'info' };

  return { label: 'Follow up', tone: 'info' };
}

export function dealNextBestAction(deal: Opportunity, hasProposal?: boolean): NextBestAction {
  const cold = daysSince(deal.lastActivityAt);

  if (deal.stage.isClosedWon) {
    return deal.renewalDate
      ? { label: 'Won — renewal tracked', tone: 'info' }
      : { label: 'Won — set renewal date', tone: 'warn' };
  }
  if (deal.stage.isClosedLost) return { label: 'Lost — review loss reason', tone: 'info' };

  if (cold !== null && cold >= 14) return { label: `Stalled — no activity ${cold} days`, tone: 'warn' };
  if (hasProposal === false && deal.stage.name === 'SQL') return { label: 'Send proposal — none logged', tone: 'hot' };
  if (cold !== null && cold <= 1 && deal.score >= 60) return { label: 'Call now — engaged in last 24h', tone: 'hot' };
  if (!deal.nextStep) return { label: 'Define next step', tone: 'info' };
  if (!deal.closeDate) return { label: 'Set a closing date', tone: 'info' };

  return { label: 'Keep momentum — log next activity', tone: 'info' };
}

// Deals sitting in an open stage with no activity past this many days show a
// "Stalled" chip on list/kanban views.
export const STALLED_AFTER_DAYS = 14;
export const ROTTING_WARN_DAYS = 7;

export function idleDays(deal: Opportunity): number | null {
  if (deal.stage.isClosedWon || deal.stage.isClosedLost) return null;
  return daysSince(deal.lastActivityAt ?? deal.createdAt);
}

export function isStalled(deal: Opportunity): boolean {
  const cold = idleDays(deal);
  return cold !== null && cold >= STALLED_AFTER_DAYS;
}
