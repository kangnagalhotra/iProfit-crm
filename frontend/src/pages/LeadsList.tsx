import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  Lead, LeadSource, LeadStage, User,
} from '../api/types';
import { listLeads, updateLead, bulkDeleteLeads } from '../api/leads';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { LeadForm } from '../components/LeadForm';
import { LeadImport } from '../components/LeadImport';
import { ConvertToDealModal } from '../components/ConvertToDealModal';
import { AddContactsMenu } from '../components/AddContactsMenu';
import { LeadsKanban } from '../components/LeadsKanban';
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
import { leadNextBestAction } from '../utils/nextBestAction';
import type { NextBestAction } from '../utils/nextBestAction';

type SortBy = 'firstName' | 'value' | 'updatedAt' | 'createdAt' | 'score';

const NBA_COLORS: Record<NextBestAction['tone'], string> = { hot: '#DC2626', warn: '#F97316', info: '#6B7280' };

function nbaChip(action: NextBestAction) {
  return (
    <span className="chip" style={{ background: NBA_COLORS[action.tone] + '22', color: NBA_COLORS[action.tone] }}>
      {action.label}
    </span>
  );
}

function scoreColor(score: number) {
  return score >= 70 ? '#16A34A' : score >= 40 ? '#F97316' : '#6B7280';
}

interface LeadFilters { [key: string]: string; stageId: string; ownerId: string; source: string; }

const EMPTY_LEAD_FILTERS: LeadFilters = { stageId: '', ownerId: '', source: '' };

const LEAD_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score' },
  { key: 'nextAction', label: 'Next Best Action' },
  { key: 'owner', label: 'Owner' },
  { key: 'company', label: 'Company' },
  { key: 'value', label: 'Value' },
  { key: 'lastActivity', label: 'Last Activity' },
  { key: 'created', label: 'Created' },
];
const ALL_LEAD_COLUMN_KEYS = LEAD_COLUMNS.map((c) => c.key);

const LEAD_SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'IMPORT', label: 'Import' },
  { value: 'OUTREACH', label: 'Outreach' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'CAMPAIGN', label: 'Campaign' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'EVENT', label: 'Event' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'OTHER', label: 'Other' },
];

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const EXPORT_COLUMNS: ExportColumn<Lead>[] = [
  { label: 'Name', get: (l) => l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') },
  { label: 'Email', get: (l) => l.email ?? '' },
  { label: 'Mobile Number', get: (l) => l.mobile ?? '' },
  { label: 'Stage', get: (l) => l.stage.name },
  { label: 'Owner', get: (l) => l.owner?.fullName ?? '' },
  { label: 'Company', get: (l) => l.account?.name ?? '' },
  { label: 'Value', get: (l) => l.value ?? '' },
  { label: 'Source', get: (l) => l.source ?? '' },
  { label: 'Created', get: (l) => new Date(l.createdAt).toLocaleDateString() },
  { label: 'Last Activity', get: (l) => (l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : '') },
];

async function fetchAllLeads(search: string): Promise<Lead[]> {
  let page = 1;
  let all: Lead[] = [];
  for (;;) {
    const data = await listLeads({ search: search || undefined, page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function LeadsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
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
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'stage' | 'owner' } | null>(null);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_LEAD_COLUMN_KEYS);
  const {
    views, activeView, activeViewId, setActiveViewId, saveView, updateView, deleteView,
  } = useSavedViews<LeadFilters>('leads');

  useEffect(() => {
    if (activeView) {
      setFilters(activeView.filters);
      setVisibleColumns(activeView.visibleColumns ?? ALL_LEAD_COLUMN_KEYS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id]);

  function selectView(id: string | null) {
    setActiveViewId(id);
    if (id === null) {
      setFilters(EMPTY_LEAD_FILTERS);
      setVisibleColumns(ALL_LEAD_COLUMN_KEYS);
    }
  }

  const isViewDirty = !!activeView && (
    JSON.stringify(filters) !== JSON.stringify(activeView.filters)
    || JSON.stringify(visibleColumns) !== JSON.stringify(activeView.visibleColumns ?? ALL_LEAD_COLUMN_KEYS)
  );

  const LEAD_FILTER_FIELDS: FilterField[] = [
    { key: 'stageId', label: 'Stage', options: stages.map((s) => ({ value: s.id, label: s.name })) },
    { key: 'ownerId', label: 'Owner', options: users.map((u) => ({ value: u.id, label: u.fullName })) },
    { key: 'source', label: 'Source', options: LEAD_SOURCE_OPTIONS },
  ];

  useEffect(() => {
    Promise.all([listStages('lead_stages'), listUsers()])
      .then(([stageRes, userRes]) => { setStages(stageRes as LeadStage[]); setUsers(userRes); });
    // Hot Leads smart view: top 5 by engagement score with activity in the
    // last 7 days (unconverted only).
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    listLeads({ sortBy: 'score', sortDir: 'desc', pageSize: 25 }).then((res) => {
      setHotLeads(res.data
        .filter((l) => !l.convertedAt && l.score > 0 && l.lastActivityAt && l.lastActivityAt >= weekAgo)
        .slice(0, 5));
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    listLeads({
      search: search || undefined,
      includeArchived,
      page,
      pageSize,
      sortBy,
      sortDir,
      stageId: filters.stageId || undefined,
      ownerId: filters.ownerId || undefined,
      source: (filters.source || undefined) as LeadSource | undefined,
    })
      .then((data) => { setLeads(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, includeArchived, page, pageSize, sortBy, sortDir, filters]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search, includeArchived, filters]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function inlineUpdate(lead: Lead, data: Record<string, any>) {
    try {
      await updateLead(lead.id, data);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update lead');
    }
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected lead(s)? This cannot be undone.`, { title: 'Delete leads' });
    if (!ok) return;
    try {
      const data = await bulkDeleteLeads([...selected]);
      toast.success(`Deleted ${data.succeeded} lead(s)`);
      if (data.failed) toast.error(`${data.failed} lead(s) could not be deleted`);
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
        <h2 style={{ margin: 0 }}>Leads {view === 'board' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span>}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <ViewToggle value={view} onChange={setView} />
          {view === 'board' && (
            <>
              <input placeholder="Search name or email" value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
              <ExportMenu
                columns={EXPORT_COLUMNS}
                entityName="leads"
                getCurrentView={() => leads}
                getAll={() => fetchAllLeads(search)}
                getSelected={() => leads.filter((l) => selected.has(l.id))}
                selectedCount={selected.size}
              />
              <ColumnVisibilityMenu columns={LEAD_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} />
            </>
          )}
          <AddContactsMenu onCreateNew={() => setShowForm(true)} onImport={() => setShowImport(true)} />
        </div>
      </div>

      {view === 'board' && hotLeads.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>🔥 Hot Leads — highest score, active in the last 7 days</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {hotLeads.map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="chip" style={{ textDecoration: 'none' }}>
                <span style={{ fontWeight: 700, color: scoreColor(l.score), marginRight: 6 }}>{l.score}</span>
                {l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email}
                <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{leadNextBestAction(l).label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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
          <FilterBar fields={LEAD_FILTER_FIELDS} values={filters} onChange={(v) => setFilters(v as LeadFilters)} />
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
        loading ? <SkeletonTable columns={9} /> : leads.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No leads yet"
            description="Create your first lead to start tracking prospects."
            action={{ label: '+ Create lead', onClick: () => setShowForm(true) }}
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
                    <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('firstName')}>Name{sortArrow('firstName')}</th>
                  {visibleColumns.includes('email') && <th>Email</th>}
                  {visibleColumns.includes('stage') && <th>Stage</th>}
                  {visibleColumns.includes('score') && <th className="sortable" onClick={() => toggleSort('score')}>Score{sortArrow('score')}</th>}
                  {visibleColumns.includes('nextAction') && <th>Next Best Action</th>}
                  {visibleColumns.includes('owner') && <th>Owner</th>}
                  {visibleColumns.includes('company') && <th>Company</th>}
                  {visibleColumns.includes('value') && <th className="sortable" onClick={() => toggleSort('value')}>Value{sortArrow('value')}</th>}
                  {visibleColumns.includes('lastActivity') && <th className="sortable" onClick={() => toggleSort('updatedAt')}>Last Activity{sortArrow('updatedAt')}</th>}
                  {visibleColumns.includes('created') && <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                    <td><Link to={`/leads/${l.id}`}>{l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}</Link></td>
                    {visibleColumns.includes('email') && <td>{l.email ?? '—'}</td>}
                    {visibleColumns.includes('stage') && (
                      <td>
                        <InlineCell
                          display={<span className="chip" style={{ background: l.stage.color + '22', color: l.stage.color }}>{l.stage.name}</span>}
                          editing={editingCell?.id === l.id && editingCell.field === 'stage'}
                          onStartEdit={() => setEditingCell({ id: l.id, field: 'stage' })}
                        >
                          <select
                            autoFocus
                            defaultValue={l.stage.id}
                            onBlur={() => setEditingCell(null)}
                            onChange={(e) => { inlineUpdate(l, { stageId: e.target.value }); setEditingCell(null); }}
                          >
                            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </InlineCell>
                      </td>
                    )}
                    {visibleColumns.includes('score') && (
                      <td><span style={{ fontWeight: 600, color: scoreColor(l.score) }}>{l.score}</span></td>
                    )}
                    {visibleColumns.includes('nextAction') && <td>{nbaChip(leadNextBestAction(l))}</td>}
                    {visibleColumns.includes('owner') && (
                      <td>
                        <InlineCell
                          display={l.owner?.fullName ?? '—'}
                          editing={editingCell?.id === l.id && editingCell.field === 'owner'}
                          onStartEdit={() => setEditingCell({ id: l.id, field: 'owner' })}
                        >
                          <select
                            autoFocus
                            defaultValue={l.owner?.id ?? ''}
                            onBlur={() => setEditingCell(null)}
                            onChange={(e) => { inlineUpdate(l, { ownerId: e.target.value }); setEditingCell(null); }}
                          >
                            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                          </select>
                        </InlineCell>
                      </td>
                    )}
                    {visibleColumns.includes('company') && <td>{l.account ? <Link to={`/companies/${l.account.id}`}>{l.account.name}</Link> : '—'}</td>}
                    {visibleColumns.includes('value') && <td>{formatValue(l.value)}</td>}
                    {visibleColumns.includes('lastActivity') && <td>{l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : '—'}</td>}
                    {visibleColumns.includes('created') && <td>{new Date(l.createdAt).toLocaleDateString()}</td>}
                    <td>
                      {l.stage.isWon && !l.convertedAt && (
                        <button className="btn secondary" onClick={() => setConvertingLead(l)}>Convert to Deal</button>
                      )}
                    </td>
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
        <LeadsKanban key={kanbanKey} />
      )}

      {showForm && (
        <LeadForm
          onClose={() => setShowForm(false)}
          onSaved={(lead) => { setShowForm(false); toast.success('Lead created'); navigate(`/leads/${lead.id}`); }}
        />
      )}
      {showImport && (
        <LeadImport
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            if (view === 'board') load(); else setKanbanKey((k) => k + 1);
          }}
        />
      )}
      {convertingLead && (
        <ConvertToDealModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConverted={(deal) => {
            setConvertingLead(null);
            toast.success('Converted to Deal');
            navigate(`/deals/${deal.id}`);
          }}
        />
      )}
    </div>
  );
}
