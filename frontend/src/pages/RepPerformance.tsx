import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  DealStage, Lead, Opportunity, Task, User,
} from '../api/types';
import { listDeals } from '../api/deals';
import { listLeads } from '../api/leads';
import { listTasks } from '../api/tasks';
import { listUsers } from '../api/users';
import { listStages } from '../api/stages';
import { listPipelines } from '../api/pipelines';
import type { Pipeline } from '../api/pipelines';
import { supabase } from '../lib/supabase';
import { MultiEntitySelect } from '../components/MultiEntitySelect';
import type { SearchSelectOption } from '../components/SearchSelect';
import { DateRangeFilter, computeRangeBounds } from '../components/DateRangeFilter';
import type { DateRangeState } from '../components/DateRangeFilter';
import { SkeletonCards } from '../components/Skeleton';

// A currently-open deal is flagged "stuck" once it's spent this many times
// the team's typical (median completed) duration for its current stage.
// Starting-point constant per the spec — adjustable later via a real
// control if managers want to tune it, not exposed yet.
const STUCK_MULTIPLIER = 1.5;

interface StageHistoryRow {
  opportunity_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_at: string;
}

interface ActivityRow {
  creator_id: string;
  type: string;
  occurred_at: string;
}

interface AttentionItem {
  id: string;
  kind: 'No open task' | 'Overdue task' | 'Stuck in stage';
  title: string;
  detail: string;
  link: string;
  severity: number;
}

interface FunnelStep { label: string; count: number; conversionFromPrev: number | null; }

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

async function fetchAllTasks(): Promise<Task[]> {
  let page = 1;
  let all: Task[] = [];
  for (;;) {
    const data = await listTasks({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function isInRange(iso: string | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function withConversion(steps: { label: string; count: number }[]): FunnelStep[] {
  return steps.map((s, i) => ({
    ...s,
    conversionFromPrev: i === 0 || steps[i - 1].count === 0 ? null : (s.count / steps[i - 1].count) * 100,
  }));
}

export function RepPerformance() {
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistoryRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState<DateRangeState>({ preset: 'month', customStart: '', customEnd: '' });
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [viewMode, setViewMode] = useState<'team' | 'rep'>('team');
  const [focusedRepId, setFocusedRepId] = useState('');
  const [staleDays, setStaleDays] = useState(7);
  const [overdueDays, setOverdueDays] = useState(2);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    async function load() {
      const dealRows = await fetchAllDeals();
      const dealIds = dealRows.map((d) => d.id);
      const [leadRows, taskRows, userRows, dealStageRows, pipelineRows, stageHistoryRes, activitiesRes] = await Promise.all([
        fetchAllLeads(),
        fetchAllTasks(),
        listUsers(),
        listStages('deal_stages') as Promise<DealStage[]>,
        listPipelines(),
        dealIds.length
          ? supabase.from('stage_history').select('opportunity_id, from_stage_id, to_stage_id, changed_at').in('opportunity_id', dealIds)
          : Promise.resolve({ data: [] as StageHistoryRow[], error: null }),
        // Completed Call/Email/Meeting/Other work now lives here, not in
        // tasks (a Task means "still pending") — this is the single source
        // of truth for "logged" activity, whether it was logged fresh or
        // derived from completing a task that was actually scheduled.
        supabase.from('activities').select('creator_id, type, occurred_at').in('type', ['CALL', 'EMAIL', 'MEETING', 'OTHER']),
      ]);
      setDeals(dealRows);
      setLeads(leadRows);
      setTasks(taskRows);
      setDealStages(dealStageRows);
      setPipelines(pipelineRows);
      setUsers(userRows);
      setStageHistory((stageHistoryRes.data ?? []) as StageHistoryRow[]);
      setActivities((activitiesRes.data ?? []) as ActivityRow[]);
    }
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { start: rangeStart, end: rangeEnd } = useMemo(() => computeRangeBounds(range), [range]);

  // Roster: every user + everyone who actually owns/is assigned a lead, deal,
  // or task — so historical/deactivated owners still show up with real data
  // instead of silently disappearing.
  const roster = useMemo(() => {
    const byId = new Map<string, string>();
    for (const u of users) byId.set(u.id, u.fullName);
    for (const d of deals) if (d.owner && !byId.has(d.owner.id)) byId.set(d.owner.id, d.owner.fullName);
    for (const l of leads) if (l.owner && !byId.has(l.owner.id)) byId.set(l.owner.id, l.owner.fullName);
    for (const t of tasks) if (t.assignee && !byId.has(t.assignee.id)) byId.set(t.assignee.id, t.assignee.fullName);
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [users, deals, leads, tasks]);

  const scopedRoster = useMemo(
    () => (selectedRepIds.length ? roster.filter((r) => selectedRepIds.includes(r.id)) : roster),
    [roster, selectedRepIds],
  );

  useEffect(() => {
    if (viewMode === 'rep' && !scopedRoster.some((r) => r.id === focusedRepId)) {
      setFocusedRepId(scopedRoster[0]?.id ?? '');
    }
  }, [viewMode, scopedRoster, focusedRepId]);

  const repOptions: SearchSelectOption[] = useMemo(
    () => roster.map((r) => ({ value: r.id, label: r.name })),
    [roster],
  );

  const dealsScoped = useMemo(() => deals.filter((d) => (
    (!pipelineId || d.pipeline.id === pipelineId)
    && (!selectedRepIds.length || (d.owner && selectedRepIds.includes(d.owner.id)))
  )), [deals, pipelineId, selectedRepIds]);

  const tasksScoped = useMemo(() => tasks.filter((t) => (
    !selectedRepIds.length || (t.assignee && selectedRepIds.includes(t.assignee.id))
  )), [tasks, selectedRepIds]);

  const openTaskOppIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.opportunity) set.add(t.opportunity.id);
    }
    return set;
  }, [tasks]);

  const activitiesScoped = useMemo(() => activities.filter((a) => (
    !selectedRepIds.length || selectedRepIds.includes(a.creator_id)
  )), [activities, selectedRepIds]);

  // --- Activity metrics per rep ---------------------------------------
  // Calls/emails/meetings/other "completed" counts come from `activities`,
  // not `tasks` — a Task means "still pending," so completed work (whether
  // logged fresh via a quick action or derived from completing a task that
  // was actually scheduled) only ever lives in the Activity Log.
  const activityByRep = useMemo(() => {
    const map = new Map<string, {
      repId: string; repName: string; calls: number; emails: number; meetings: number; other: number;
      completed: number; overdueNow: number; quickAction: number; manual: number;
    }>();
    for (const rep of scopedRoster) {
      map.set(rep.id, {
        repId: rep.id, repName: rep.name, calls: 0, emails: 0, meetings: 0, other: 0, completed: 0, overdueNow: 0, quickAction: 0, manual: 0,
      });
    }
    const now = Date.now();
    for (const t of tasksScoped) {
      if (!t.assignee) continue;
      const row = map.get(t.assignee.id);
      if (!row) continue;
      if (t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueAt).getTime() < now) row.overdueNow += 1;
      if (isInRange(t.createdAt, rangeStart, rangeEnd)) {
        if (t.createdVia === 'QUICK_ACTION') row.quickAction += 1; else row.manual += 1;
      }
    }
    for (const a of activitiesScoped) {
      if (!isInRange(a.occurred_at, rangeStart, rangeEnd)) continue;
      const row = map.get(a.creator_id);
      if (!row) continue;
      row.completed += 1;
      if (a.type === 'CALL') row.calls += 1;
      else if (a.type === 'EMAIL') row.emails += 1;
      else if (a.type === 'MEETING') row.meetings += 1;
      else if (a.type === 'OTHER') row.other += 1;
    }
    return map;
  }, [tasksScoped, activitiesScoped, scopedRoster, rangeStart, rangeEnd]);

  // --- Outcomes per rep -------------------------------------------------
  const outcomesByRep = useMemo(() => {
    const map = new Map<string, {
      repId: string; repName: string; won: number; lost: number; wonValue: number;
      avgDealSize: number | null; winRate: number | null; forecastVarianceDays: number | null;
    }>();
    const wonValues = new Map<string, number[]>();
    const varianceDays = new Map<string, number[]>();
    for (const rep of scopedRoster) {
      map.set(rep.id, {
        repId: rep.id, repName: rep.name, won: 0, lost: 0, wonValue: 0, avgDealSize: null, winRate: null, forecastVarianceDays: null,
      });
    }
    for (const d of dealsScoped) {
      if (!d.owner) continue;
      const row = map.get(d.owner.id);
      if (!row) continue;
      const amt = d.amount ? parseFloat(d.amount) : 0;
      if (d.stage.isClosedWon && d.closedAt && isInRange(d.closedAt, rangeStart, rangeEnd)) {
        row.won += 1;
        row.wonValue += amt;
        if (!wonValues.has(d.owner.id)) wonValues.set(d.owner.id, []);
        wonValues.get(d.owner.id)!.push(amt);
        if (d.closeDate) {
          const variance = (new Date(d.closedAt).getTime() - new Date(d.closeDate).getTime()) / 86400000;
          if (!varianceDays.has(d.owner.id)) varianceDays.set(d.owner.id, []);
          varianceDays.get(d.owner.id)!.push(variance);
        }
      } else if (d.stage.isClosedLost && d.closedAt && isInRange(d.closedAt, rangeStart, rangeEnd)) {
        row.lost += 1;
      }
    }
    for (const row of map.values()) {
      row.avgDealSize = average(wonValues.get(row.repId) ?? []);
      row.winRate = (row.won + row.lost) > 0 ? (row.won / (row.won + row.lost)) * 100 : null;
      row.forecastVarianceDays = average(varianceDays.get(row.repId) ?? []);
    }
    return map;
  }, [dealsScoped, scopedRoster, rangeStart, rangeEnd]);

  // --- Stage history / duration aggregation -----------------------------
  const stageHistoryByOpp = useMemo(() => {
    const map = new Map<string, StageHistoryRow[]>();
    for (const row of stageHistory) {
      if (!map.has(row.opportunity_id)) map.set(row.opportunity_id, []);
      map.get(row.opportunity_id)!.push(row);
    }
    for (const rows of map.values()) rows.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
    return map;
  }, [stageHistory]);

  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);

  const stageDurationData = useMemo(() => {
    const completedByStage = new Map<string, number[]>();
    const completedByRepStage = new Map<string, Map<string, number[]>>();
    const ongoingByOpp = new Map<string, { stageId: string; days: number }>();

    for (const [oppId, rows] of stageHistoryByOpp.entries()) {
      const deal = dealById.get(oppId);
      if (!deal) continue;
      for (let i = 0; i < rows.length - 1; i++) {
        const days = (new Date(rows[i + 1].changed_at).getTime() - new Date(rows[i].changed_at).getTime()) / 86400000;
        const stageId = rows[i].to_stage_id;
        if (!completedByStage.has(stageId)) completedByStage.set(stageId, []);
        completedByStage.get(stageId)!.push(days);
        if (deal.owner) {
          if (!completedByRepStage.has(deal.owner.id)) completedByRepStage.set(deal.owner.id, new Map());
          const repMap = completedByRepStage.get(deal.owner.id)!;
          if (!repMap.has(stageId)) repMap.set(stageId, []);
          repMap.get(stageId)!.push(days);
        }
      }
      const last = rows[rows.length - 1];
      if (last && !deal.stage.isClosedWon && !deal.stage.isClosedLost) {
        ongoingByOpp.set(oppId, { stageId: last.to_stage_id, days: (Date.now() - new Date(last.changed_at).getTime()) / 86400000 });
      }
    }

    const teamMedianByStage = new Map<string, number | null>();
    for (const [stageId, samples] of completedByStage.entries()) teamMedianByStage.set(stageId, median(samples));

    return {
      completedByRepStage, ongoingByOpp, teamMedianByStage,
    };
  }, [stageHistoryByOpp, dealById]);

  const stuckDeals = useMemo(() => {
    const result: { deal: Opportunity; days: number; typical: number }[] = [];
    for (const [oppId, ongoing] of stageDurationData.ongoingByOpp.entries()) {
      const deal = dealById.get(oppId);
      if (!deal) continue;
      if (pipelineId && deal.pipeline.id !== pipelineId) continue;
      if (selectedRepIds.length && (!deal.owner || !selectedRepIds.includes(deal.owner.id))) continue;
      const typical = stageDurationData.teamMedianByStage.get(ongoing.stageId);
      if (typical && typical > 0 && ongoing.days > typical * STUCK_MULTIPLIER) {
        result.push({ deal, days: ongoing.days, typical });
      }
    }
    return result.sort((a, b) => (b.days / b.typical) - (a.days / a.typical));
  }, [stageDurationData, dealById, pipelineId, selectedRepIds]);

  // --- Stale deals (Pipeline Health) -------------------------------------
  const staleDeals = useMemo(() => {
    const now = Date.now();
    return dealsScoped.filter((d) => {
      if (d.stage.isClosedWon || d.stage.isClosedLost || d.archivedAt) return false;
      const noRecentActivity = !d.lastActivityAt || (now - new Date(d.lastActivityAt).getTime()) / 86400000 > staleDays;
      const noOpenTask = !openTaskOppIds.has(d.id);
      return noRecentActivity || noOpenTask;
    });
  }, [dealsScoped, openTaskOppIds, staleDays]);

  // --- Needs Attention (not scoped by date range — it's a "right now" view) ---
  const dealsNoOpenTask = useMemo(
    () => dealsScoped.filter((d) => !d.stage.isClosedWon && !d.stage.isClosedLost && !d.archivedAt && !openTaskOppIds.has(d.id)),
    [dealsScoped, openTaskOppIds],
  );

  const overdueTasks = useMemo(() => {
    const now = Date.now();
    return tasksScoped
      .filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (now - new Date(t.dueAt).getTime()) / 86400000 > overdueDays)
      .map((t) => ({ task: t, daysOverdue: (now - new Date(t.dueAt).getTime()) / 86400000 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [tasksScoped, overdueDays]);

  const needsAttention = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const d of dealsNoOpenTask) {
      items.push({
        id: `no-task-${d.id}`,
        kind: 'No open task',
        title: d.name,
        detail: `${d.owner?.fullName ?? 'Unassigned'} · ${d.stage.name}`,
        link: `/deals/${d.id}`,
        severity: 1,
      });
    }
    for (const { task, daysOverdue } of overdueTasks) {
      items.push({
        id: `overdue-${task.id}`,
        kind: 'Overdue task',
        title: task.title,
        detail: `${task.assignee?.fullName ?? 'Unassigned'} · ${Math.floor(daysOverdue)}d overdue`,
        link: `/tasks/${task.id}`,
        severity: daysOverdue,
      });
    }
    for (const { deal, days, typical } of stuckDeals) {
      items.push({
        id: `stuck-${deal.id}`,
        kind: 'Stuck in stage',
        title: deal.name,
        detail: `${deal.owner?.fullName ?? 'Unassigned'} · ${deal.stage.name} for ${Math.floor(days)}d (typical ${Math.floor(typical)}d)`,
        link: `/deals/${deal.id}`,
        severity: days / typical,
      });
    }
    return items.sort((a, b) => b.severity - a.severity);
  }, [dealsNoOpenTask, overdueTasks, stuckDeals]);

  // --- Funnel / conversion ------------------------------------------------
  const computeFunnel = useMemo(() => (repFilterId: string | null): { label: string; count: number }[] => {
    const leadsInScope = leads.filter((l) => (!repFilterId || (l.owner && l.owner.id === repFilterId)) && isInRange(l.createdAt, rangeStart, rangeEnd));
    const qualified = leadsInScope.filter((l) => l.stage.isWon);
    const converted = leadsInScope.filter((l) => l.convertedAt);
    const dealsInScope = deals.filter((d) => (
      (!pipelineId || d.pipeline.id === pipelineId)
      && (!repFilterId || (d.owner && d.owner.id === repFilterId))
      && isInRange(d.createdAt, rangeStart, rangeEnd)
    ));
    const steps: { label: string; count: number }[] = [
      { label: 'Leads Created', count: leadsInScope.length },
      { label: 'Qualified', count: qualified.length },
      { label: 'Converted to Deal', count: converted.length },
    ];
    for (const stage of dealStages) {
      const reached = dealsInScope.filter((d) => {
        const rows = stageHistoryByOpp.get(d.id);
        if (rows && rows.length) return rows.some((r) => r.to_stage_id === stage.id);
        return d.stage.order >= stage.order;
      });
      steps.push({ label: stage.name, count: reached.length });
    }
    return steps;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, deals, dealStages, stageHistoryByOpp, pipelineId, rangeStart, rangeEnd]);

  const teamFunnel = useMemo(() => withConversion(computeFunnel(null)), [computeFunnel]);
  const funnelByRep = useMemo(
    () => new Map(scopedRoster.map((r) => [r.id, withConversion(computeFunnel(r.id))])),
    [computeFunnel, scopedRoster],
  );

  // --- Stage duration table rows ------------------------------------------
  function stageDurationRows(repId: string | null) {
    return dealStages.map((stage) => {
      const samples = repId
        ? stageDurationData.completedByRepStage.get(repId)?.get(stage.id) ?? []
        : [...stageDurationData.completedByRepStage.values()].flatMap((m) => m.get(stage.id) ?? []);
      const avgDays = average(samples);
      const teamMedian = stageDurationData.teamMedianByStage.get(stage.id) ?? null;
      const flagged = !!(avgDays && teamMedian && avgDays > teamMedian * STUCK_MULTIPLIER);
      return {
        stage, avgDays, teamMedian, flagged,
      };
    });
  }

  const repsToShow = viewMode === 'rep'
    ? scopedRoster.filter((r) => r.id === focusedRepId)
    : scopedRoster;

  if (loading) return <div><h2 style={{ marginTop: 0 }}>Rep Performance</h2><SkeletonCards count={4} height={200} /></div>;

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Rep Performance</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn ${viewMode === 'team' ? '' : 'secondary'}`} onClick={() => setViewMode('team')}>Team-wide</button>
            <button className={`btn ${viewMode === 'rep' ? '' : 'secondary'}`} onClick={() => setViewMode('rep')}>Per-rep detail</button>
          </div>
          {viewMode === 'rep' && (
            <select value={focusedRepId} onChange={(e) => setFocusedRepId(e.target.value)} style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
              {scopedRoster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <DateRangeFilter value={range} onChange={setRange} />
          <div style={{ minWidth: 220 }}>
            <MultiEntitySelect
              options={repOptions}
              value={selectedRepIds}
              onChange={setSelectedRepIds}
              placeholder="All reps…"
            />
          </div>
          <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
            <option value="">All pipelines</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <h3 style={{ marginTop: 8 }}>
        ⚠ Needs Attention
        <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
          (right now — not affected by the date range above)
        </span>
      </h3>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13, color: 'var(--muted)' }}>
          <label>Overdue threshold: <input type="number" min={0} value={overdueDays} onChange={(e) => setOverdueDays(Number(e.target.value))} style={{ width: 50 }} /> days</label>
          <label>Stale threshold: <input type="number" min={0} value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))} style={{ width: 50 }} /> days</label>
        </div>
        {needsAttention.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing needs attention right now — everything's on track.</p>
        ) : (
          <table>
            <thead><tr><th>Type</th><th>Record</th><th>Detail</th></tr></thead>
            <tbody>
              {needsAttention.slice(0, 25).map((item) => (
                <tr key={item.id}>
                  <td><span className="chip">{item.kind}</span></td>
                  <td><Link to={item.link}>{item.title}</Link></td>
                  <td style={{ color: 'var(--muted)' }}>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {needsAttention.length > 25 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>+{needsAttention.length - 25} more</p>
        )}
      </div>

      <h3>Activity</h3>
      <div className="card" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Rep</th><th>Calls</th><th>Emails</th><th>Meetings</th><th>Other</th><th>Completed</th><th>Overdue (now)</th><th>Quick action</th><th>Manual</th>
            </tr>
          </thead>
          <tbody>
            {repsToShow.map((rep) => {
              const a = activityByRep.get(rep.id);
              if (!a) return null;
              return (
                <tr key={rep.id}>
                  <td>{rep.name}</td>
                  <td>{a.calls}</td>
                  <td>{a.emails}</td>
                  <td>{a.meetings}</td>
                  <td>{a.other}</td>
                  <td>{a.completed}</td>
                  <td style={{ color: a.overdueNow > 0 ? '#DC2626' : undefined, fontWeight: a.overdueNow > 0 ? 600 : undefined }}>{a.overdueNow}</td>
                  <td>{a.quickAction}</td>
                  <td>{a.manual}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Pipeline Health</h3>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          {viewMode === 'rep' ? `${scopedRoster.find((r) => r.id === focusedRepId)?.name ?? ''}'s funnel` : 'Team funnel'}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> (leads created / deals created in range)</span>
        </div>
        <table>
          <thead><tr><th>Stage</th><th>Count</th><th>Conversion from previous</th></tr></thead>
          <tbody>
            {(viewMode === 'rep' ? funnelByRep.get(focusedRepId) ?? [] : teamFunnel).map((step) => (
              <tr key={step.label}>
                <td>{step.label}</td>
                <td>{step.count}</td>
                <td>{step.conversionFromPrev === null ? '—' : `${step.conversionFromPrev.toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          Average time per stage {viewMode === 'rep' ? '' : '(team)'}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}> — based on completed stage transitions; flagged when well beyond the team median</span>
        </div>
        <table>
          <thead><tr><th>Stage</th><th>{viewMode === 'rep' ? 'Rep avg.' : 'Team avg.'}</th><th>Team median</th></tr></thead>
          <tbody>
            {stageDurationRows(viewMode === 'rep' ? focusedRepId : null).map(({
              stage, avgDays, teamMedian, flagged,
            }) => (
              <tr key={stage.id}>
                <td>{stage.name}</td>
                <td style={{ color: flagged ? '#DC2626' : undefined, fontWeight: flagged ? 600 : undefined }}>
                  {avgDays === null ? '—' : `${avgDays.toFixed(1)}d`}
                </td>
                <td>{teamMedian === null ? '—' : `${teamMedian.toFixed(1)}d`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          Stale deals ({staleDeals.length}) <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>— no activity in {staleDays}+ days, or no open task</span>
        </div>
        {staleDeals.length === 0 ? <p style={{ color: 'var(--muted)', margin: 0 }}>None.</p> : (
          <table>
            <thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th>Last activity</th></tr></thead>
            <tbody>
              {staleDeals.slice(0, 20).map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/deals/${d.id}`}>{d.name}</Link></td>
                  <td>{d.owner?.fullName ?? '—'}</td>
                  <td><span className="chip" style={{ background: d.stage.color + '22', color: d.stage.color }}>{d.stage.name}</span></td>
                  <td>{d.lastActivityAt ? new Date(d.lastActivityAt).toLocaleDateString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h3>Outcomes</h3>
      <div className="card" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr><th>Rep</th><th>Won</th><th>Lost</th><th>Won Value</th><th>Avg. Deal Size</th><th>Win Rate</th><th>Forecast Variance</th></tr>
          </thead>
          <tbody>
            {repsToShow.map((rep) => {
              const o = outcomesByRep.get(rep.id);
              if (!o) return null;
              return (
                <tr key={rep.id}>
                  <td>{rep.name}</td>
                  <td>{o.won}</td>
                  <td>{o.lost}</td>
                  <td style={{ fontWeight: 600 }}>{money(o.wonValue)}</td>
                  <td>{o.avgDealSize === null ? '—' : money(o.avgDealSize)}</td>
                  <td>{o.winRate === null ? '—' : `${o.winRate.toFixed(0)}%`}</td>
                  <td>
                    {o.forecastVarianceDays === null ? '—'
                      : `${o.forecastVarianceDays > 0 ? '+' : ''}${o.forecastVarianceDays.toFixed(1)}d`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
