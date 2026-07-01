import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Paginated, Lead } from '../api/types';

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, newLeads: 0, connected: 0 });

  useEffect(() => {
    api.get<Paginated<Lead>>('/leads', { params: { pageSize: 100 } }).then(({ data }) => {
      setStats({
        total: data.total,
        newLeads: data.data.filter((l) => l.status === 'NEW').length,
        connected: data.data.filter((l) => l.status === 'CONNECTED').length,
      });
    }).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{greeting}, {user?.fullName?.split(' ')[0]}</h2>
      <div className="cards">
        <div className="card"><div className="label">Total leads</div><div className="value">{stats.total}</div></div>
        <div className="card"><div className="label">New leads</div><div className="value">{stats.newLeads}</div></div>
        <div className="card"><div className="label">Connected</div><div className="value">{stats.connected}</div></div>
        <div className="card"><div className="label">Your role</div><div className="value" style={{ fontSize: 18 }}>{user?.role}</div></div>
      </div>
      <p style={{ color: 'var(--muted)' }}>
        KPI cards above are live from the API. Task panel and activity feed wire in on Day 21–22.
      </p>
    </div>
  );
}
