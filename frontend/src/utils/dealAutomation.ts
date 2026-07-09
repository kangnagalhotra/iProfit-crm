import type { DealStage } from '../api/types';

// The actual project row is created server-side (create_project_on_closed_won()
// in triggers.sql) the instant a deal's stage flips to Closed Won — this just
// decides whether the UI should surface that with a toast, from whichever of
// the several places a deal's stage can change (Deal Detail, Deals list
// inline cell, Kanban drag, the Edit Deal modal).
export function closedWonHandoverMessage(prevStage: DealStage | undefined, newStage: DealStage): string | null {
  if (newStage.isClosedWon && !prevStage?.isClosedWon) {
    return 'Deal won — Project handover initiated.';
  }
  return null;
}
