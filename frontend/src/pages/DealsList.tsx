import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  Opportunity, DealStage, DealPriority, User,
} from '../api/types';
import { listDeals, updateDeal, bulkDeleteDeals } from '../api/deals';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { DealsKanban } from '../components/DealsKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';
import { ExportMenu } from '../components/ExportMenu';
import type { ExportColumn } from '../components/ExportMenu';
import { InlineCell } from '../components/InlineCell';
import { ColumnVisibilityMenu } from '../components/ColumnVisibilityMenu';
import type { ColumnDef } from '../components/ColumnVisibilityMenu';
import { FilterBar } from '../components/FilterBar';
import type { FilterField } from '../components/FilterBar';
import { SavedViewsBar } from '../components/SavedViewsBar';
import { useSavedViews } from '../hooks/useSavedViews';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { closedWonHandoverMessage } from '../utils/dealAutomation';
import { dealNextBestAction, isStalled } from '../utils/nextBestAction';
import type { NextBestAction } from '../utils/nextBestAction';

type SortBy = 'name' | 'amount' | 'closeDate' | 'stage' | 'updatedAt' | 'createdAt' | 'score';

const NBA_COLORS: Record<NextBestAction['tone'], string> = { hot: '#DC2626', warn: '#F97316', info: '#6B7280' };

function scoreColor(score: number) {
  return score >= 70 ? '#16A34A' : score >= 40 ? '#F97316' : '#6B7280';
}

interface DealFilters { [key: string]: string; stageId: string; ownerId: string; priority: string; }

const EMPTY_DEAL_FILTERS: DealFilters = { stageId: '', ownerId: '', priority: '' };

const DEAL_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'company', label: 'Company' },
  { key: 'contact', label: 'Contact' },
  { key: 'owner', label: 'Owner' },
  { key: 'priority', label: 'Priority' },
  { key: 'value', label: 'Value' },
  { key: 'score', label: 'Score' },
  { key: 'nextAction', label: 'Next Best Action' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'stage', label: 'Stage' },
  { key: 'probability', label: 'Probability' },
  { key: 'closingDate', label: 'Closing Date' },
  { key: 'created', label: 'Created' },
];
const ALL_DEAL_COLUMN_KEYS = DEAL_COLUMNS.map((c) => c.key);

const DEAL_PRIORITY_OPTIONS: { value: DealPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function contactName(deal: Opportunity) {
  if (!deal.contact) return '';
  return deal.contact.firstName || deal.contact.lastName
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(' ')
    : (deal.contact.email ?? '');
}

function priorityColor(p: Opportunity['priority']) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

const EXPORT_COLUMNS: ExportColumn<Opportunity>[] = [
  { label: 'Deal Name', get: (d) => d.name },
  { label: 'Company', get: (d) => d.account?.name ?? '' },
  { label: 'Contact', get: (d) => contactName(d) },
  { label: 'Owner', get: (d) => d.owner?.fullName ?? '' },
  { label: 'Priority', get: (d) => d.priority },
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
    const data = await listDeals({ search: search || undefined, page, pageSize: 100 });
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
  const [includeArchived, setIncludeArchived] = useState(false);
  const [view, setView] = useState<ListView>('board');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stages, setStages] = useState<DealStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'stage' | 'owner' } | null>(null);
  const [filters, setFilters] = useState<DealFilters>(EMPTY_DEAL_FILTERS);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_DEAL_COLUMN_KEYS);
  const {
    views, activeView, activeViewId, setActiveViewId, saveView, updateView, deleteView,
  } = useSavedViews<DealFilters>('deals');

  useEffect(() => {
    if (activeView) {
      setFilters(activeView.filters);
      setVisibleColumns(activeView.visibleColumns ?? ALL_DEAL_COLUMN_KEYS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id]);

  function selectView(id: string | null) {
    setActiveViewId(id);
    if (id === null) {
      setFilters(EMPTY_DEAL_FILTERS);
      setVisibleColumns(ALL_DEAL_COLUMN_KEYS);
    }
  }

  const isViewDirty = !!activeView && (
    JSON.stringify(filters) !== JSON.stringify(activeView.filters)
    || JSON.stringify(visibleColumns) !== JSON.stringify(activeView.visibleColumns ?? ALL_DEAL_COLUMN_KEYS)
  );

  const DEAL_FILTER_FIELDS: FilterField[] = [
    { key: 'stageId', label: 'Stage', options: stages.map((s) => ({ value: s.id, label: s.name })) },
    { key: 'ownerId', label: 'Owner', options: users.map((u) => ({ value: u.id, label: u.fullName })) },
    { key: 'priority', label: 'Priority', options: DEAL_PRIORITY_OPTIONS },
  ];

  useEffect(() => {
    Promise.all([listStages('deal_stages'), listUsers()])
      .then(([stageRes, userRes]) => { setStages(stageRes as DealStage[]); setUsers(userRes); });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    listDeals({
      search: search || undefined,
      includeArchived,
      page,
      pageSize,
      sortBy,
      sortDir,
      stageId: filters.stageId || undefined,
      ownerId: filters.ownerId || undefined,
      priority: (filters.priority || undefined) as DealPriority | undefined,
    })
      .then((data) => { setDeals(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, includeArchived, page, pageSize, sortBy, sortDir, filters]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search, includeArchived, filters]);

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
      const updated = await updateDeal(deal.id, data);
      load();
      const msg = closedWonHandoverMessage(deal.stage, updated.stage);
      if (msg) toast.success(msg);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update deal');
    }
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected deal(s)? This cannot be undone.`, { title: 'Delete deals' });
    if (!ok) return;
    try {
      const data = await bulkDeleteDeals([...selected]);
      toast.success(`Deleted ${data.succeeded} deal(s)`);
      if (data.failed) toast.error(`${data.failed} deal(s) could not be deleted`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk delete failed');
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
              <ColumnVisibilityMenu columns={DEAL_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
            </>
          )}
        </div>
      </div>

      {view === 'board' && (
        <>
          <SavedViewsBar
            views={views}
            activeViewId={activeViewId}
            isDirty={isViewDirty}
            onSelect={selectView}
            onSave={(name) => saveView(name, { filters, visibleColumns })}
            onUpdate={() => activeViewId && updateView(activeViewId, { filters, visibleColumns })}
            onDelete={(id) => deleteView(id)}
          />
          <FilterBar fields={DEAL_FILTER_FIELDS} values={filters} onChange={(v) => setFilters(v as DealFilters)} />
          <div className="quick-filter-chips">
            <button
              className={`chip-filter${includeArchived ? ' active' : ''}`}
              onClick={() => setIncludeArchived((v) => !v)}
            >
              Show archived
            </button>
          </div>
        </>
      )}

      {view === 'board' ? (
        loading ? <SkeletonTable columns={12} /> : deals.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No deals yet"
            description="Deals are created by converting a Qualified lead — there's no direct way to create one."
            action={{ label: 'Go to Leads', onClick: () => navigate('/leads') }}
          />
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
                  {visibleColumns.includes('company') && <th>Company</th>}
                  {visibleColumns.includes('contact') && <th>Contact</th>}
                  {visibleColumns.includes('owner') && <th>Owner</th>}
                  {visibleColumns.includes('priority') && <th>Priority</th>}
                  {visibleColumns.includes('value') && <th className="sortable" onClick={() => toggleSort('amount')}>Value{sortArrow('amount')}</th>}
                  {visibleColumns.includes('score') && <th className="sortable" onClick={() => toggleSort('score')}>Score{sortArrow('score')}</th>}
                  {visibleColumns.includes('nextAction') && <th>Next Best Action</th>}
                  {visibleColumns.includes('pipeline') && <th>Pipeline</th>}
                  {visibleColumns.includes('stage') && <th className="sortable" onClick={() => toggleSort('stage')}>Stage{sortArrow('stage')}</th>}
                  {visibleColumns.includes('probability') && <th>Probability</th>}
                  {visibleColumns.includes('closingDate') && <th className="sortable" onClick={() => toggleSort('closeDate')}>Closing Date{sortArrow('closeDate')}</th>}
                  {visibleColumns.includes('created') && <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>}
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} /></td>
                    <td><Link to={`/deals/${d.id}`}>{d.name}</Link></td>
                    {visibleColumns.includes('company') && <td>{d.account ? <Link to={`/companies/${d.account.id}`}>{d.account.name}</Link> : '—'}</td>}
                    {visibleColumns.includes('contact') && <td>{contactName(d) || '—'}</td>}
                    {visibleColumns.includes('owner') && (
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
                    )}
                    {visibleColumns.includes('priority') && <td><span className="chip" style={{ background: priorityColor(d.priority) + '22', color: priorityColor(d.priority) }}>{d.priority}</span></td>}
                    {visibleColumns.includes('value') && <td>{formatValue(d.amount)}</td>}
                    {visibleColumns.includes('score') && (
                      <td>
                        <span style={{ fontWeight: 600, color: scoreColor(d.score) }}>{d.score}</span>
                        {isStalled(d) && <span className="chip" style={{ background: '#F9731622', color: '#F97316', marginLeft: 6 }}>Stalled</span>}
                      </td>
                    )}
                    {visibleColumns.includes('nextAction') && (
                      <td>
                        {(() => {
                          const nba = dealNextBestAction(d);
                          return <span className="chip" style={{ background: NBA_COLORS[nba.tone] + '22', color: NBA_COLORS[nba.tone] }}>{nba.label}</span>;
                        })()}
                      </td>
                    )}
                    {visibleColumns.includes('pipeline') && <td>{d.pipeline.name}</td>}
                    {visibleColumns.includes('stage') && (
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
                    )}
                    {visibleColumns.includes('probability') && <td>{d.stage.winProbability}%</td>}
                    {visibleColumns.includes('closingDate') && <td>{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '—'}</td>}
                    {visibleColumns.includes('created') && <td>{new Date(d.createdAt).toLocaleDateString()}</td>}
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
        <DealsKanban />
      )}
    </div>
  );
}
