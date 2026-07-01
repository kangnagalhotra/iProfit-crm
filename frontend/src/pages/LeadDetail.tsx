import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Lead } from '../api/types';

export function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);

  useEffect(() => {
    api.get<Lead>(`/leads/${id}`).then(({ data }) => setLead(data)).catch(() => {});
  }, [id]);

  if (!lead) return <p>Loading…</p>;
  return (
    <div>
      <p><Link to="/leads">← Leads</Link></p>
      <h2 style={{ marginTop: 0 }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email}</h2>
      <div className="card" style={{ maxWidth: 520 }}>
        <p><strong>Email:</strong> {lead.email ?? '—'}</p>
        <p><strong>Phone:</strong> {lead.phone ?? '—'}</p>
        <p><strong>Status:</strong> <span className="chip">{lead.status}</span></p>
        <p><strong>Owner:</strong> {lead.owner?.fullName ?? '—'}</p>
        <p><strong>Company:</strong> {lead.account?.name ?? '—'}</p>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 20 }}>
        Activity timeline + composer attach here (Day 11–12 — Activity module).
      </p>
    </div>
  );
}
