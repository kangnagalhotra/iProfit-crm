import type { Opportunity } from '../api/types';

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
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
