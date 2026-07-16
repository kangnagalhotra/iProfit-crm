import type { Lead } from '../api/types';

// Same MQL formula as LeadQualificationCard.tsx, but against a persisted
// Lead object — used to decide whether to show the BANT/ICP soft-warning
// before letting a stage move into Qualified proceed (Group 4 / E2: the
// database no longer blocks this, so the UI nudges instead).
export function isMqlReady(lead: Lead): boolean {
  return !!lead.icpMatch && lead.budgetScore != null && lead.authorityScore != null;
}

export const BANT_WARNING_MESSAGE = 'BANT/ICP qualification is not complete for this lead (ICP Match, Budget, and Authority) — continue anyway?';
