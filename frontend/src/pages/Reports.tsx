import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { ForecastCategory, Lead, Opportunity } from '../api/types';
import { listDeals } from '../api/deals';
import { listLeads } from '../api/leads';
import { listAllProposalsWithOutcome } from '../api/proposals';
import type { ProposalWithOutcome } from '../api/proposals';
import { supabase } from '../lib/supabase';
import { SkeletonCards } from '../components/Skeleton';
import { FORECAST_LABELS, FORECAST_ORDER, effectiveForecastCategory } from '../utils/forecast';

const CHART_HEIGHT = 260;
const BLUE = '#025ADF';

type RangeOption = 30 | 90 | 365 | 0;
const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last 12 months' },
  { value: 0, label: 'All time' },
];

async function fetchAllDeals(): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const data = await listDeals({ page, pageSize: 100, includeArchived: true });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function fetchAllLeads(): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  for (;;) {
    const data = await listLeads({ page, pageSize: 100, includeArchived: true });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function amountOf(d: Opportunity) {
  return d.amount ? parseFloat(d.amount) : 0;
}

export function Reports() {
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [proposals, setProposals] = useState<ProposalWithOutcome[]>([]);
  const [championDealIds, setChampionDealIds] = useState<Set<string>>(new Set());
  const [decisionMakerDealIds, setDecisionMakerDealIds] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<RangeOption>(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllDeals(),
      fetchAllLeads(),
      listAllProposalsWithOutcome().catch(() => [] as ProposalWithOutcome[]),
      supabase.from('deal_contacts').select('opportunity_id, role'),
    ]).then(([dealRes, leadRes, proposalRes, dcRes]) => {
      setDeals(dealRes);
      setLeads(leadRes);
      setProposals(proposalRes);
      const dcs = dcRes.data ?? [];
      setChampionDealIds(new Set(dcs.filter((r: any) => r.role === 'CHAMPION').map((r: any) => r.opportunity_id)));
      setDecisionMakerDealIds(new Set(dcs.filter((r: any) => r.role === 'DECISION_MAKER').map((r: any) => r.opportunity_id)));
    }).finally(() => setLoading(false));
  }, []);

  const rangeStart = useMemo(() => {
    if (range === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d;
  }, [range]);

  const dealsInRange = useMemo(
    () => (rangeStart ? deals.filter((d) => new Date(d.createdAt) >= rangeStart) : deals),
    [deals, rangeStart],
  );

  // --- (a) Forecast by category (open deals only — closed deals are actuals) ---
  const openDeals = deals.filter((d) => !d.stage.isClosedWon && !d.stage.isClosedLost && !d.archivedAt);
  const forecastTotals = FORECAST_ORDER.map((cat: ForecastCategory) => ({
    key: FORECAST_LABELS[cat],
    total: openDeals.filter((d) => effectiveForecastCategory(d) === cat).reduce((s, d) => s + amountOf(d), 0),
    count: openDeals.filter((d) => effectiveForecastCategory(d) === cat).length,
  }));

  // --- (b) Revenue per channel: deal value + win rate grouped by the
  // originating lead's source (deals are created only via lead conversion,
  // so lead_id → leads.source is the channel of record) ---
  const leadSourceById = useMemo(() => new Map(leads.map((l) => [l.id, l.source ?? 'OTHER'])), [leads]);
  const channelReport = useMemo(() => {
    const byChannel = new Map<string, { value: number; won: number; lost: number; total: number; wonValue: number }>();
    for (const d of dealsInRange) {
      const channel = (d.lead && leadSourceById.get(d.lead.id)) || 'UNKNOWN';
      const row = byChannel.get(channel) ?? { value: 0, won: 0, lost: 0, total: 0, wonValue: 0 };
      row.total += 1;
      row.value += amountOf(d);
      if (d.stage.isClosedWon) { row.won += 1; row.wonValue += amountOf(d); }
      if (d.stage.isClosedLost) row.lost += 1;
      byChannel.set(channel, row);
    }
    return [...byChannel.entries()]
      .map(([channel, r]) => ({
        channel: channel.replace('_', ' '),
        totalValue: r.value,
        wonValue: r.wonValue,
        deals: r.total,
        winRate: (r.won + r.lost) > 0 ? (r.won / (r.won + r.lost)) * 100 : null,
      }))
      .sort((a, b) => b.wonValue - a.wonValue);
  }, [dealsInRange, leadSourceById]);

  // --- (c) Contact-role risk ---
  const dealsNoDecisionMaker = openDeals.filter((d) => !decisionMakerDealIds.has(d.id));
  const closedDeals = deals.filter((d) => d.stage.isClosedWon || d.stage.isClosedLost);
  function winRate(subset: Opportunity[]): number | null {
    if (subset.length === 0) return null;
    return (subset.filter((d) => d.stage.isClosedWon).length / subset.length) * 100;
  }
  const winRateWithChampion = winRate(closedDeals.filter((d) => championDealIds.has(d.id)));
  const winRateWithoutChampion = winRate(closedDeals.filter((d) => !championDealIds.has(d.id)));

  // --- (d) Proposal timing: first proposal sent → closed won/lost days ---
  const proposalTiming = useMemo(() => {
    const firstProposalByDeal = new Map<string, ProposalWithOutcome>();
    for (const p of proposals) {
      const existing = firstProposalByDeal.get(p.opportunityId);
      if (!existing || p.sentDate < existing.sentDate) firstProposalByDeal.set(p.opportunityId, p);
    }
    const wonDays: number[] = [];
    const lostDays: number[] = [];
    for (const p of firstProposalByDeal.values()) {
      if (!p.closedAt) continue;
      const days = (new Date(p.closedAt).getTime() - new Date(p.sentDate).getTime()) / 86400000;
      if (days < 0) continue;
      if (p.isClosedWon) wonDays.push(days);
      if (p.isClosedLost) lostDays.push(days);
    }
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    return {
      avgToWon: avg(wonDays), wonCount: wonDays.length, avgToLost: avg(lostDays), lostCount: lostDays.length,
    };
  }, [proposals]);

  if (loading) return <div><h2 style={{ marginTop: 0 }}>Reports</h2><SkeletonCards count={4} height={CHART_HEIGHT} /></div>;

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Reports</h2>
        <select value={range} onChange={(e) => setRange(Number(e.target.value) as RangeOption)}>
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <h3>Forecast <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(open pipeline by forecast category — separate from stage view)</span></h3>
      <div className="dashboard-grid">
        {forecastTotals.map((f) => (
          <div className="card" key={f.key}>
            <div className="label">{f.key}</div>
            <div className="value">{money(f.total)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{f.count} deal(s)</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 28 }}>Revenue per Channel <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(deals created in the selected range, by originating lead source)</span></h3>
      {channelReport.length === 0 ? <p style={{ color: 'var(--muted)' }}>No deals in this range.</p> : (
        <div className="dashboard-grid">
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={channelReport}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => money(Number(v))} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Bar dataKey="wonValue" name="Won revenue" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalValue" name="Total pipeline" fill={BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <table>
              <thead><tr><th>Channel</th><th>Deals</th><th>Total value</th><th>Won revenue</th><th>Win rate</th></tr></thead>
              <tbody>
                {channelReport.map((r) => (
                  <tr key={r.channel}>
                    <td>{r.channel}</td>
                    <td>{r.deals}</td>
                    <td>{money(r.totalValue)}</td>
                    <td>{money(r.wonValue)}</td>
                    <td>{r.winRate === null ? '—' : `${r.winRate.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>Contact-Role Risk</h3>
      <div className="dashboard-grid">
        <div className="card">
          <div className="label">Win rate with a Champion</div>
          <div className="value">{winRateWithChampion === null ? '—' : `${winRateWithChampion.toFixed(0)}%`}</div>
        </div>
        <div className="card">
          <div className="label">Win rate without a Champion</div>
          <div className="value">{winRateWithoutChampion === null ? '—' : `${winRateWithoutChampion.toFixed(0)}%`}</div>
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="label" style={{ marginBottom: 8 }}>⚠ Open deals with no Decision Maker identified ({dealsNoDecisionMaker.length})</div>
          {dealsNoDecisionMaker.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: 0 }}>Every open deal has a Decision Maker — no risk flags.</p>
          ) : (
            <table>
              <thead><tr><th>Deal</th><th>Company</th><th>Stage</th><th>Value</th><th>Owner</th></tr></thead>
              <tbody>
                {dealsNoDecisionMaker.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/deals/${d.id}`}>{d.name}</Link></td>
                    <td>{d.account?.name ?? '—'}</td>
                    <td><span className="chip" style={{ background: d.stage.color + '22', color: d.stage.color }}>{d.stage.name}</span></td>
                    <td>{money(amountOf(d))}</td>
                    <td>{d.owner?.fullName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h3 style={{ marginTop: 28 }}>Proposal Timing <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(first proposal sent → deal closed)</span></h3>
      <div className="dashboard-grid">
        <div className="card">
          <div className="label">Avg. proposal → Closed Won</div>
          <div className="value">{proposalTiming.avgToWon === null ? '—' : `${proposalTiming.avgToWon.toFixed(1)} days`}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{proposalTiming.wonCount} deal(s)</div>
        </div>
        <div className="card">
          <div className="label">Avg. proposal → Closed Lost</div>
          <div className="value">{proposalTiming.avgToLost === null ? '—' : `${proposalTiming.avgToLost.toFixed(1)} days`}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{proposalTiming.lostCount} deal(s)</div>
        </div>
      </div>
    </div>
  );
}
