import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Lead, LeadStatus, Paginated } from '../api/types';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';

const STATUSES: { id: LeadStatus; label: string }[] = [
  { id: 'NEW', label: 'New' },
  { id: 'OPEN', label: 'Open' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'CONNECTED', label: 'Connected' },
  { id: 'UNQUALIFIED', label: 'Unqualified' },
];

async function loadAllLeads(): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  // Server caps pageSize at 100 — page through until every lead is fetched.
  for (;;) {
    const { data } = await api.get<Paginated<Lead>>('/leads', { params: { page, pageSize: 100 } });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function LeadsKanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllLeads().then(setLeads).finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((leadId: string, _from: string, toStatus: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, status: toStatus as LeadStatus } : l)));
    setError('');
    api.patch(`/leads/${leadId}`, { status: toStatus }).catch((e) => {
      setLeads(prev); // revert optimistic move
      setError(e.response?.data?.message ?? 'Could not update lead status');
    });
  }, [leads]);

  if (loading) return <p>Loading…</p>;

  const columns: KanbanColumn<Lead>[] = STATUSES.map(({ id, label }) => ({
    id,
    label,
    items: leads.filter((l) => l.status === id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(lead) => lead.id}
        onDrop={handleDrop}
        renderCard={(lead) => (
          <Link to={`/leads/${lead.id}`}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead'}
            </div>
            {lead.email && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{lead.email}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              {lead.source && <span className="chip">{lead.source}</span>}
              {lead.owner && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lead.owner.fullName}</span>}
            </div>
          </Link>
        )}
      />
    </div>
  );
}
