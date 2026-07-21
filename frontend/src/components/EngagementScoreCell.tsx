import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface ScoreBreakdown {
  total: number;
  engagement: number; engagementMax: number;
  callCount: number; meetingCount: number; emailCount: number; noteCount: number;
  recency: number; recencyMax: number; daysSinceActivity: number | null;
  // Lead-only
  fit?: number; fitMax?: number;
  icpMatch?: boolean | null; budgetScore?: number | null; authorityScore?: number | null;
  needScore?: number | null; timelineScore?: number | null;
  // Deal-only
  momentum?: number; momentumMax?: number;
  hasProposal?: boolean; budgetConfirmed?: boolean | null; nextStepSet?: boolean; decisionTimeframeSet?: boolean;
}

function activitySummary(b: ScoreBreakdown): string {
  const parts: string[] = [];
  if (b.callCount) parts.push(`${b.callCount} call${b.callCount > 1 ? 's' : ''}`);
  if (b.meetingCount) parts.push(`${b.meetingCount} meeting${b.meetingCount > 1 ? 's' : ''}`);
  if (b.emailCount) parts.push(`${b.emailCount} email${b.emailCount > 1 ? 's' : ''}`);
  if (b.noteCount) parts.push(`${b.noteCount} note${b.noteCount > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'no activity logged';
}

function fitSummary(b: ScoreBreakdown): string {
  const bant = [b.budgetScore, b.authorityScore, b.needScore, b.timelineScore].map((v) => v ?? 0).reduce((a, c) => a + c, 0);
  return `${b.icpMatch ? 'ICP match' : 'no ICP match'}, BANT ${bant}/40`;
}

function momentumSummary(b: ScoreBreakdown): string {
  const parts = [
    b.hasProposal && 'proposal sent',
    b.budgetConfirmed && 'budget confirmed',
    b.nextStepSet && 'next step set',
    b.decisionTimeframeSet && 'decision timeframe set',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'none yet';
}

// Makes the already-existing, already-computed engagement score transparent
// — clicking the chip lazily fetches its point breakdown (lead_score_breakdown/
// deal_score_breakdown, phase-u) instead of leaving reps to guess why a lead
// or deal scored what it did.
export function EngagementScoreCell({ kind, id, score }: { kind: 'lead' | 'deal'; id: string; score: number }) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (breakdown || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc(
        kind === 'lead' ? 'lead_score_breakdown' : 'deal_score_breakdown',
        kind === 'lead' ? { p_lead_id: id } : { p_opportunity_id: id },
      );
      if (rpcError) throw rpcError;
      setBreakdown(data as ScoreBreakdown);
    } catch {
      // The raw Postgres/PostgREST error (e.g. "function not found" before
      // this ships) isn't useful to a rep — show one plain, stable message.
      setError("Couldn't load the score breakdown right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="chip" style={{ border: 'none', cursor: 'pointer' }} onClick={toggle} title="Click to see why">
        {score}/100
      </button>
      {open && (
        <div className="helper-text" style={{ marginTop: 6, lineHeight: 1.6 }}>
          {loading && 'Loading…'}
          {error && <span style={{ color: '#DC2626' }}>{error}</span>}
          {breakdown && (
            <>
              Activity: {breakdown.engagement}/{breakdown.engagementMax} ({activitySummary(breakdown)})
              <br />
              {kind === 'lead'
                ? <>Fit: {breakdown.fit}/{breakdown.fitMax} ({fitSummary(breakdown)})</>
                : <>Momentum: {breakdown.momentum}/{breakdown.momentumMax} ({momentumSummary(breakdown)})</>}
              <br />
              Recency: {breakdown.recency}/{breakdown.recencyMax} (
              {breakdown.daysSinceActivity === null ? 'no activity logged yet' : `${breakdown.daysSinceActivity} day(s) since last touch`}
              )
            </>
          )}
        </div>
      )}
    </div>
  );
}
