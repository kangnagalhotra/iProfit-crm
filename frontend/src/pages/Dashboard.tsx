import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import type {
  Account, Lead, Opportunity, DealStage, TicketSummary, User,
} from '../api/types';
import { listLeads } from '../api/leads';
import { listDeals } from '../api/deals';
import { listAccounts } from '../api/accounts';
import { getTicketSummary } from '../api/supportTickets';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { countByDay, countBy } from '../utils/aggregate';
import { SkeletonCards } from '../components/Skeleton';

type RangeOption = 7 | 30 | 90;

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

const CHART_HEIGHT = 260;
const BLUE = '#025ADF';

async function fetchAllLeads(params: Record<string, any>): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  for (;;) {
    const data = await listLeads({ ...params, page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function fetchAllDeals(params: Record<string, any>): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const data = await listDeals({ ...params, page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function fetchAllAccounts(params: Record<string, any>): Promise<Account[]> {
  let page = 1;
  let all: Account[] = [];
  for (;;) {
    const data = await listAccounts({ ...params, page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function formatAxisDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Dashboard() {
  const { user } = useAuth();
  const canFilterByOwner = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [range, setRange] = useState<RangeOption>(30);
  const [ownerId, setOwnerId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [prevLeadsCount, setPrevLeadsCount] = useState(0);
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  // Overall current-state snapshot for the Lead/Deal/Company overview
  // sections below — unlike the charts above, these aren't windowed by the
  // date-range dropdown (Total Leads / Open Pipeline / Customers are meant
  // to read as "right now", not "created in the last N days").
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [allDeals, setAllDeals] = useState<Opportunity[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [ticketSummary, setTicketSummary] = useState<TicketSummary | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Live clock so the greeting (morning/afternoon/evening) and the displayed
  // time stay correct without a page refresh; minute granularity is enough.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (canFilterByOwner) listUsers().then(setUsers);
  }, [canFilterByOwner]);

  useEffect(() => {
    listStages('deal_stages').then((data) => setDealStages(data as DealStage[]));
  }, []);

  useEffect(() => {
    setOverviewLoading(true);
    const ownerParams = { ownerId: ownerId || undefined };
    Promise.all([
      fetchAllLeads(ownerParams),
      fetchAllDeals(ownerParams),
      fetchAllAccounts(ownerParams),
      getTicketSummary(),
    ]).then(([l, d, a, t]) => {
      setAllLeads(l);
      setAllDeals(d);
      setAllAccounts(a);
      setTicketSummary(t);
    }).finally(() => setOverviewLoading(false));
  }, [ownerId]);

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - (range - 1));
    rangeStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(rangeStart);
    prevStart.setDate(prevStart.getDate() - range);
    const prevEnd = new Date(rangeStart);
    prevEnd.setMilliseconds(-1);

    const baseParams = { createdAfter: rangeStart.toISOString(), ownerId: ownerId || undefined };
    const prevParams = { createdAfter: prevStart.toISOString(), ownerId: ownerId || undefined };

    Promise.all([
      fetchAllLeads(baseParams),
      fetchAllLeads(prevParams),
      fetchAllDeals(baseParams),
    ]).then(([currentLeads, prevLeadsRaw, currentDeals]) => {
      setLeads(currentLeads);
      setPrevLeadsCount(prevLeadsRaw.filter((l) => new Date(l.createdAt) <= prevEnd).length);
      setDeals(currentDeals);
    }).finally(() => setLoading(false));
  }, [range, ownerId]);

  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - (range - 1));

  const contactsOverTime = countByDay(leads, (l) => l.createdAt, rangeStart, now);
  const dealsOverTime = countByDay(deals, (d) => d.createdAt, rangeStart, now);
  const sourceData = countBy(leads, (l) => l.source ?? 'OTHER');
  const stageData = countBy(deals, (d) => d.stage.name);
  const stageColorByName = new Map(dealStages.map((s) => [s.name, s.color]));

  const delta = leads.length - prevLeadsCount;
  const hour = clock.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';

  // Leads overview
  const qualifiedLeads = allLeads.filter((l) => l.stage.isWon);
  const conversionRate = allLeads.length ? (qualifiedLeads.length / allLeads.length) * 100 : 0;
  const leadsByStage = countBy(allLeads, (l) => l.stage.name);

  // Deals overview
  const openDeals = allDeals.filter((d) => !d.stage.isClosedWon && !d.stage.isClosedLost);
  const wonDeals = allDeals.filter((d) => d.stage.isClosedWon);
  const lostDeals = allDeals.filter((d) => d.stage.isClosedLost);
  const openPipelineValue = openDeals.reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);
  const totalPipelineValue = allDeals.reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);
  const wonRevenue = wonDeals.reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);

  // Companies overview
  const customerAccounts = allAccounts.filter((a) => a.stage.isCustomerStage);
  const prospectAccounts = allAccounts.filter((a) => !a.stage.isCustomerStage);
  const customerAccountIds = new Set(customerAccounts.map((a) => a.id));
  const customerRevenue = wonDeals
    .filter((d) => d.account && customerAccountIds.has(d.account.id))
    .reduce((sum, d) => sum + (d.amount ? parseFloat(d.amount) : 0), 0);

  function formatMoney(n: number) {
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>{greetingEmoji} {greeting}, {user?.fullName?.split(' ')[0]}</h2>
      <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
        {clock.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}
        {clock.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </div>

      <div className="dashboard-filter-bar">
        <select value={range} onChange={(e) => setRange(Number(e.target.value) as RangeOption)}>
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canFilterByOwner && (
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">All owners</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        )}
      </div>

      {loading ? <SkeletonCards count={5} height={CHART_HEIGHT} /> : (
        <div className="dashboard-grid">
          <div className="card">
            <div className="label">New Leads Created</div>
            <div className="value">{leads.length}</div>
            <div style={{ fontSize: 13, color: delta >= 0 ? '#16A34A' : '#DC2626', marginTop: 6 }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs previous {range} days ({prevLeadsCount})
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Lead Sources</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={sourceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="key" tickFormatter={(k) => k.replace('_', ' ')} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(k) => String(k).replace('_', ' ')} />
                <Bar dataKey="count" name="Leads" fill={BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Leads Added Over Time</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={contactsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
                <Area type="monotone" dataKey="count" name="Leads" stroke={BLUE} fill={`${BLUE}33`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Deals by Stage</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <PieChart>
                <Pie data={stageData} dataKey="count" nameKey="key" cx="50%" cy="50%" outerRadius={90} label>
                  {stageData.map((entry) => (
                    <Cell key={entry.key} fill={stageColorByName.get(entry.key) ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Deals Created Over Time</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={dealsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
                <Area type="monotone" dataKey="count" name="Deals" stroke="#F97316" fill="#F9731633" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {overviewLoading ? <SkeletonCards count={4} height={40} /> : (
        <>
          <h3 style={{ marginTop: 28 }}>Leads Overview</h3>
          <div className="dashboard-grid">
            <div className="card"><div className="label">Total Leads</div><div className="value">{allLeads.length}</div></div>
            <div className="card"><div className="label">Qualified Leads</div><div className="value">{qualifiedLeads.length}</div></div>
            <div className="card"><div className="label">Conversion Rate</div><div className="value">{conversionRate.toFixed(1)}%</div></div>
            <div className="card">
              <div className="label" style={{ marginBottom: 8 }}>Leads by Stage</div>
              {leadsByStage.map((s) => (
                <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                  <span>{s.key}</span><span style={{ fontWeight: 600 }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <h3 style={{ marginTop: 28 }}>Deals Overview</h3>
          <div className="dashboard-grid">
            <div className="card"><div className="label">Open Pipeline</div><div className="value">{formatMoney(openPipelineValue)}</div></div>
            <div className="card"><div className="label">Won Deals</div><div className="value">{wonDeals.length}</div></div>
            <div className="card"><div className="label">Won Revenue</div><div className="value">{formatMoney(wonRevenue)}</div></div>
            <div className="card"><div className="label">Lost Deals</div><div className="value">{lostDeals.length}</div></div>
            <div className="card"><div className="label">Pipeline Value</div><div className="value">{formatMoney(totalPipelineValue)}</div></div>
          </div>

          <h3 style={{ marginTop: 28 }}>Companies Overview</h3>
          <div className="dashboard-grid">
            <div className="card"><div className="label">Prospects</div><div className="value">{prospectAccounts.length}</div></div>
            <div className="card"><div className="label">Customers</div><div className="value">{customerAccounts.length}</div></div>
            <div className="card"><div className="label">Customer Revenue</div><div className="value">{formatMoney(customerRevenue)}</div></div>
          </div>

          <h3 style={{ marginTop: 28 }}>Support Overview</h3>
          <div className="dashboard-grid">
            <div className="card"><div className="label">Open Tickets</div><div className="value">{ticketSummary?.open ?? 0}</div></div>
            <div className="card"><div className="label">Critical Tickets</div><div className="value">{ticketSummary?.critical ?? 0}</div></div>
          </div>
        </>
      )}
    </div>
  );
}
