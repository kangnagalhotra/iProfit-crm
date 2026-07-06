import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import type {
  Lead, Opportunity, DealStage, User,
} from '../api/types';
import { listLeads } from '../api/leads';
import { listDeals } from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { countByDay, countBy } from '../utils/aggregate';

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

  useEffect(() => {
    if (canFilterByOwner) listUsers().then(setUsers);
  }, [canFilterByOwner]);

  useEffect(() => {
    listStages('deal_stages').then((data) => setDealStages(data as DealStage[]));
  }, []);

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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{greeting}, {user?.fullName?.split(' ')[0]}</h2>

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

      {loading ? <p>Loading…</p> : (
        <div className="dashboard-grid">
          <div className="card">
            <div className="label">New Contacts Created</div>
            <div className="value">{leads.length}</div>
            <div style={{ fontSize: 13, color: delta >= 0 ? '#16A34A' : '#DC2626', marginTop: 6 }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs previous {range} days ({prevLeadsCount})
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Contact Sources</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={sourceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="key" tickFormatter={(k) => k.replace('_', ' ')} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(k) => String(k).replace('_', ' ')} />
                <Bar dataKey="count" name="Contacts" fill={BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Contacts Added Over Time</h3>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={contactsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString()} />
                <Area type="monotone" dataKey="count" name="Contacts" stroke={BLUE} fill={`${BLUE}33`} />
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
    </div>
  );
}
