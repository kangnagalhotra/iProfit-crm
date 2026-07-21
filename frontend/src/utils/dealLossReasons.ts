// Reused by DealForm.tsx and DispositionReasonModal.tsx so both entry
// points into a Closed Lost stage offer the identical list. The first 5
// values are this app's existing live free-text data (kept unchanged, so
// existing deals' loss_reason values still match a real option) — Deferred
// and Other are new, per the disposition-codes request.
export const DEAL_LOSS_REASON_OTHER = 'OTHER';

export const DEAL_LOSS_REASONS: { value: string; label: string }[] = [
  { value: 'Price', label: 'Price' },
  { value: 'Competitor', label: 'Competitor' },
  { value: 'No Budget', label: 'No Budget' },
  { value: 'Bad Timing', label: 'Bad Timing' },
  { value: 'No Decision', label: 'No Decision' },
  { value: 'Deferred — revisit later', label: 'Deferred — revisit later' },
  { value: DEAL_LOSS_REASON_OTHER, label: 'Other' },
];
