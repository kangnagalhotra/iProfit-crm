import type { LeadUnqualifiedReason } from '../api/types';

// Reused by LeadForm.tsx and DispositionReasonModal.tsx (the latter for the
// inline stage-dropdown/Kanban-drag entry points that used to bypass this
// requirement entirely) — single source of truth for the option list.
export const UNQUALIFIED_REASONS: { value: LeadUnqualifiedReason; label: string }[] = [
  { value: 'NO_BUDGET', label: 'No Budget' },
  { value: 'NOT_A_FIT', label: 'Not a Fit' },
  { value: 'NO_RESPONSE', label: 'No Response' },
  { value: 'COMPETITOR', label: 'Competitor' },
  { value: 'BAD_DATA', label: 'Bad Data' },
  { value: 'OTHER', label: 'Other' },
];
