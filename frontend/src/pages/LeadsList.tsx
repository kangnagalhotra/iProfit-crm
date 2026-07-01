import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Paginated, Lead } from '../api/types';
import { LeadForm } from '../components/LeadForm';

export function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Paginated<Lead>>('/leads', { params: { search: search || undefined } })
      .then(({ data }) => { setLeads(data.data); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="topbar">
        <h2 style={{ margin: 0 }}>Leads <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Search name or email" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
          <button className="btn" onClick={() => setShowForm(true)}>Create lead</button>
        </div>
      </div>

      {loading ? <p>Loading…</p> : leads.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No leads yet. Create your first one.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Owner</th><th>Company</th></tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td><Link to={`/leads/${l.id}`}>{[l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}</Link></td>
                <td>{l.email ?? '—'}</td>
                <td><span className="chip">{l.status}</span></td>
                <td>{l.owner?.fullName ?? '—'}</td>
                <td>{l.account?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && <LeadForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}
