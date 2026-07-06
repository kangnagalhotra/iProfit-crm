import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Paginated, Account, AccountStage, User } from '../api/types';
import { CompanyForm } from '../components/CompanyForm';
import { CompanyImport } from '../components/CompanyImport';
import { CompaniesKanban } from '../components/CompaniesKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';
import { ExportMenu } from '../components/ExportMenu';
import type { ExportColumn } from '../components/ExportMenu';
import { InlineCell } from '../components/InlineCell';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

type SortBy = 'name' | 'annualRevenue' | 'updatedAt' | 'createdAt';

function formatRevenue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const EXPORT_COLUMNS: ExportColumn<Account>[] = [
  { label: 'Name', get: (a) => a.name },
  { label: 'Domain', get: (a) => a.domain ?? '' },
  { label: 'Industry', get: (a) => a.industry ?? '' },
  { label: 'Stage', get: (a) => a.stage.name },
  { label: 'Owner', get: (a) => a.owner?.fullName ?? '' },
  { label: 'Revenue', get: (a) => a.annualRevenue ?? '' },
  { label: 'Employees', get: (a) => a.sizeBucket ?? '' },
  { label: 'Created', get: (a) => new Date(a.createdAt).toLocaleDateString() },
  { label: 'Last Activity', get: (a) => new Date(a.updatedAt).toLocaleDateString() },
];

async function fetchAllAccounts(search: string): Promise<Account[]> {
  let page = 1;
  let all: Account[] = [];
  for (;;) {
    const { data } = await api.get<Paginated<Account>>('/accounts', { params: { search: search || undefined, page, pageSize: 100 } });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function CompaniesList() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView>('board');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kanbanKey, setKanbanKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'stage' | 'owner' } | null>(null);

  useEffect(() => {
    Promise.all([api.get<AccountStage[]>('/account-stages'), api.get<User[]>('/users')])
      .then(([stageRes, userRes]) => { setStages(stageRes.data); setUsers(userRes.data); });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Paginated<Account>>('/accounts', { params: { search: search || undefined, page, pageSize, sortBy, sortDir } })
      .then(({ data }) => { setAccounts(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === accounts.length ? new Set() : new Set(accounts.map((a) => a.id))));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function inlineUpdate(account: Account, data: Record<string, any>) {
    try {
      await api.patch(`/accounts/${account.id}`, data);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not update company');
    }
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected compan${selected.size === 1 ? 'y' : 'ies'}? This cannot be undone.`, { title: 'Delete companies' });
    if (!ok) return;
    try {
      const { data } = await api.post('/accounts/bulk/delete', { ids: [...selected] });
      toast.success(`Deleted ${data.succeeded} compan${data.succeeded === 1 ? 'y' : 'ies'}`);
      if (data.failed) toast.error(`${data.failed} could not be deleted`);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Bulk delete failed');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sortArrow = (field: SortBy) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Companies {view === 'board' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span>}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <ViewToggle value={view} onChange={setView} />
          {view === 'board' && (
            <>
              <input placeholder="Search name or domain" value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
              <ExportMenu
                columns={EXPORT_COLUMNS}
                entityName="companies"
                getCurrentView={() => accounts}
                getAll={() => fetchAllAccounts(search)}
                getSelected={() => accounts.filter((a) => selected.has(a.id))}
                selectedCount={selected.size}
              />
            </>
          )}
          {/* Add Company and Import are always separate, visible buttons in both views. */}
          <button className="btn" onClick={() => setShowForm(true)}>+ Add Company</button>
          <button className="btn secondary" onClick={() => setShowImport(true)}>Import</button>
        </div>
      </div>

      {view === 'board' ? (
        loading ? <p>Loading…</p> : accounts.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No companies yet. Create your first one.</p>
        ) : (
          <>
            {selected.size > 0 && (
              <div className="bulk-bar">
                <span>{selected.size} selected</span>
                <button className="btn secondary" onClick={bulkDeleteSelected}>Delete</button>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={selected.size === accounts.length && accounts.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('name')}>Name{sortArrow('name')}</th>
                  <th>Owner</th>
                  <th>Industry</th>
                  <th>Stage</th>
                  <th className="sortable" onClick={() => toggleSort('annualRevenue')}>Revenue{sortArrow('annualRevenue')}</th>
                  <th>Employees</th>
                  <th>Website</th>
                  <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>
                  <th className="sortable" onClick={() => toggleSort('updatedAt')}>Last Activity{sortArrow('updatedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} /></td>
                    <td><Link to={`/companies/${a.id}`}>{a.name}</Link></td>
                    <td>
                      <InlineCell
                        display={a.owner?.fullName ?? '—'}
                        editing={editingCell?.id === a.id && editingCell.field === 'owner'}
                        onStartEdit={() => setEditingCell({ id: a.id, field: 'owner' })}
                      >
                        <select
                          autoFocus
                          defaultValue={a.owner?.id ?? ''}
                          onBlur={() => setEditingCell(null)}
                          onChange={(e) => { inlineUpdate(a, { ownerId: e.target.value }); setEditingCell(null); }}
                        >
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </InlineCell>
                    </td>
                    <td>{a.industry ?? '—'}</td>
                    <td>
                      <InlineCell
                        display={<span className="chip" style={{ background: a.stage.color + '22', color: a.stage.color }}>{a.stage.name}</span>}
                        editing={editingCell?.id === a.id && editingCell.field === 'stage'}
                        onStartEdit={() => setEditingCell({ id: a.id, field: 'stage' })}
                      >
                        <select
                          autoFocus
                          defaultValue={a.stage.id}
                          onBlur={() => setEditingCell(null)}
                          onChange={(e) => { inlineUpdate(a, { stageId: e.target.value }); setEditingCell(null); }}
                        >
                          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </InlineCell>
                    </td>
                    <td>{formatRevenue(a.annualRevenue)}</td>
                    <td>{a.sizeBucket ?? '—'}</td>
                    <td>{a.domain ?? '—'}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(a.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page} of {totalPages}</span>
              <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </>
        )
      ) : (
        <CompaniesKanban key={kanbanKey} />
      )}

      {showForm && (
        <CompanyForm
          onClose={() => setShowForm(false)}
          onSaved={(account) => { setShowForm(false); toast.success('Company created'); navigate(`/companies/${account.id}`); }}
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
