import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Paginated, Account } from '../api/types';
import { CompanyForm } from '../components/CompanyForm';
import { CompanyImport } from '../components/CompanyImport';
import { AddContactsMenu } from '../components/AddContactsMenu';
import { CompaniesKanban } from '../components/CompaniesKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';

export function CompaniesList() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView>('board');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kanbanKey, setKanbanKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Paginated<Account>>('/accounts', { params: { search: search || undefined } })
      .then(({ data }) => { setAccounts(data.data); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);

  return (
    <div>
      <div className="topbar">
        <h2 style={{ margin: 0 }}>Companies {view === 'board' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span>}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <ViewToggle value={view} onChange={setView} />
          {view === 'board' && (
            <input placeholder="Search name or domain" value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
          )}
          <AddContactsMenu label="Add companies" onCreateNew={() => setShowForm(true)} onImport={() => setShowImport(true)} />
        </div>
      </div>

      {view === 'board' ? (
        loading ? <p>Loading…</p> : accounts.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No companies yet. Create your first one.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Domain</th><th>Status</th><th>Owner</th><th>Industry</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/companies/${a.id}`}>{a.name}</Link></td>
                  <td>{a.domain ?? '—'}</td>
                  <td><span className="chip">{a.status}</span></td>
                  <td>{a.owner?.fullName ?? '—'}</td>
                  <td>{a.industry ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <CompaniesKanban key={kanbanKey} />
      )}

      {showForm && (
        <CompanyForm
          onClose={() => setShowForm(false)}
          onSaved={(account) => { setShowForm(false); navigate(`/companies/${account.id}`); }}
        />
      )}
      {showImport && (
        <CompanyImport
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            if (view === 'board') load(); else setKanbanKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
