import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type {
  Paginated, Opportunity, DealStage, User,
} from '../api/types';
import { DealForm } from '../components/DealForm';
import { DealImport } from '../components/DealImport';
import { AddContactsMenu } from '../components/AddContactsMenu';
import { DealsKanban } from '../components/DealsKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';
import { ExportMenu } from '../components/ExportMenu';
import type { ExportColumn } from '../components/ExportMenu';
import { InlineCell } from '../components/InlineCell';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

type SortBy = 'name' | 'amount' | 'closeDate' | 'stage' | 'updatedAt' | 'createdAt';

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function contactName(deal: Opportunity) {
  if (!deal.lead) return '';
  return deal.lead.firstName || deal.lead.lastName
    ? [deal.lead.firstName, deal.lead.lastName].filter(Boolean).join(' ')
    : (deal.lead.email ?? '');
}

const EXPORT_COLUMNS: ExportColumn<Opportunity>[] = [
  { label: 'Deal Name', get: (d) => d.name },
  { label: 'Company', get: (d) => d.account?.name ?? '' },
  { label: 'Contact', get: (d) => contactName(d) },
  { label: 'Owner', get: (d) => d.owner?.fullName ?? '' },
  { label: 'Value', get: (d) => d.amount ?? '' },
  { label: 'Pipeline', get: (d) => d.pipeline.name },
  { label: 'Stage', get: (d) => d.stage.name },
  { label: 'Probability', get: (d) => `${d.stage.winProbability}%` },
  { label: 'Closing Date', get: (d) => (d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '') },
  { label: 'Created', get: (d) => new Date(d.createdAt).toLocaleDateString() },
];

async function fetchAllDeals(search: string): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const { data } = await api.get<Paginated<Opportunity>>('/deals', { params: { search: search || undefined, page, pageSize: 100 } });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function DealsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [deals, setDeals] = useState<Opportunity[]>([]);
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
  const [stages, setStages] = useState<DealStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'stage' | 'owner' } | null>(null);

  useEffect(() => {
    Promise.all([api.get<DealStage[]>('/deal-stages'), api.get<User[]>('/users')])
      .then(([stageRes, userRes]) => { setStages(stageRes.data); setUsers(userRes.data); });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.get<Paginated<Opportunity>>('/deals', { params: { search: search || undefined, page, pageSize, sortBy, sortDir } })
      .then(({ data }) => { setDeals(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === deals.length ? new Set() : new Set(deals.map((d) => d.id))));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function inlineUpdate(deal: Opportunity, data: Record<string, any>) {
    try {
      await api.patch(`/deals/${deal.id}`, data);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not update deal');
    }
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected deal(s)? This cannot be undone.`, { title: 'Delete deals' });
    if (!ok) return;
    try {
      const { data } = await api.post('/deals/bulk/delete', { ids: [...selected] });
      toast.success(`Deleted ${data.succeeded} deal(s)`);
      if (data.failed) toast.error(`${data.failed} deal(s) could not be deleted`);
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
        <h2 style={{ margin: 0 }}>Deals {view === 'board' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span>}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <ViewToggle value={view} onChange={setView} />
          {view === 'board' && (
            <>
              <input placeholder="Search deal name" value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
              <ExportMenu
                columns={EXPORT_COLUMNS}
                entityName="deals"
                getCurrentView={() => deals}
                getAll={() => fetchAllDeals(search)}
                getSelected={() => deals.filter((d) => selected.has(d.id))}
                selectedCount={selected.size}
              />
            </>
          )}
          <AddContactsMenu label="Add deal" onCreateNew={() => setShowForm(true)} onImport={() => setShowImport(true)} />
        </div>
      </div>

      {view === 'board' ? (
        loading ? <p>Loading…</p> : deals.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No deals yet. Create your first one.</p>
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
                    <input type="checkbox" checked={selected.size === deals.length && deals.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('name')}>Deal Name{sortArrow('name')}</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Owner</th>
                  <th className="sortable" onClick={() => toggleSort('amount')}>Value{sortArrow('amount')}</th>
                  <th>Pipeline</th>
                  <th className="sortable" onClick={() => toggleSort('stage')}>Stage{sortArrow('stage')}</th>
                  <th>Probability</th>
                  <th className="sortable" onClick={() => toggleSort('closeDate')}>Closing Date{sortArrow('closeDate')}</th>
                  <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} /></td>
                    <td><Link to={`/deals/${d.id}`}>{d.name}</Link></td>
                    <td>{d.account ? <Link to={`/companies/${d.account.id}`}>{d.account.name}</Link> : '—'}</td>
                    <td>{contactName(d) || '—'}</td>
                    <td>
                      <InlineCell
                        display={d.owner?.fullName ?? '—'}
                        editing={editingCell?.id === d.id && editingCell.field === 'owner'}
                        onStartEdit={() => setEditingCell({ id: d.id, field: 'owner' })}
                      >
                        <select
                          autoFocus
                          defaultValue={d.owner?.id ?? ''}
                          onBlur={() => setEditingCell(null)}
                          onChange={(e) => { inlineUpdate(d, { ownerId: e.target.value }); setEditingCell(null); }}
                        >
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </InlineCell>
                    </td>
                    <td>{formatValue(d.amount)}</td>
                    <td>{d.pipeline.name}</td>
                    <td>
                      <InlineCell
                        display={<span className="chip" style={{ background: d.stage.color + '22', color: d.stage.color }}>{d.stage.name}</span>}
                        editing={editingCell?.id === d.id && editingCell.field === 'stage'}
                        onStartEdit={() => setEditingCell({ id: d.id, field: 'stage' })}
                      >
                        <select
                          autoFocus
                          defaultValue={d.stage.id}
                          onBlur={() => setEditingCell(null)}
                          onChange={(e) => { inlineUpdate(d, { stageId: e.target.value }); setEditingCell(null); }}
                        >
                          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </InlineCell>
                    </td>
                    <td>{d.stage.winProbability}%</td>
                    <td>{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '—'}</td>
                    <td>{new Date(d.createdAt).toLocaleDateString()}</td>
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
        <DealsKanban key={kanbanKey} />
      )}

      {showForm && (
        <DealForm
          onClose={() => setShowForm(false)}
          onSaved={(deal) => { setShowForm(false); toast.success('Deal created'); navigate(`/deals/${deal.id}`); }}
        />
      )}
      {showImport && (
        <DealImport
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
