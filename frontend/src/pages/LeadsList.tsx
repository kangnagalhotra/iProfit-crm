import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lead, LeadStage, User } from '../api/types';
import { listLeads, updateLead, bulkDeleteLeads } from '../api/leads';
import { listStages } from '../api/stages';
import { listUsers } from '../api/users';
import { LeadForm } from '../components/LeadForm';
import { LeadImport } from '../components/LeadImport';
import { AddContactsMenu } from '../components/AddContactsMenu';
import { LeadsKanban } from '../components/LeadsKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';
import { ExportMenu } from '../components/ExportMenu';
import type { ExportColumn } from '../components/ExportMenu';
import { InlineCell } from '../components/InlineCell';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

type SortBy = 'firstName' | 'value' | 'updatedAt' | 'createdAt';

function formatValue(value?: string) {
  if (!value) return '—';
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const EXPORT_COLUMNS: ExportColumn<Lead>[] = [
  { label: 'Name', get: (l) => l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') },
  { label: 'Email', get: (l) => l.email ?? '' },
  { label: 'Phone', get: (l) => l.phone ?? '' },
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

  useEffect(() => {
    Promise.all([listStages('lead_stages'), listUsers()])
      .then(([stageRes, userRes]) => { setStages(stageRes as LeadStage[]); setUsers(userRes); });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    listLeads({
      search: search || undefined, page, pageSize, sortBy, sortDir,
    })
      .then((data) => { setLeads(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search]);

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
            </>
          )}
          <AddContactsMenu onCreateNew={() => setShowForm(true)} onImport={() => setShowImport(true)} />
        </div>
      </div>

      {view === 'board' ? (
        loading ? <p>Loading…</p> : leads.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No leads yet. Create your first one.</p>
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
                  <th>Email</th>
                  <th>Stage</th>
                  <th>Owner</th>
                  <th>Company</th>
                  <th className="sortable" onClick={() => toggleSort('value')}>Value{sortArrow('value')}</th>
                  <th className="sortable" onClick={() => toggleSort('updatedAt')}>Last Activity{sortArrow('updatedAt')}</th>
                  <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} /></td>
                    <td><Link to={`/leads/${l.id}`}>{l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}</Link></td>
                    <td>{l.email ?? '—'}</td>
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
                    <td>{l.account ? <Link to={`/companies/${l.account.id}`}>{l.account.name}</Link> : '—'}</td>
                    <td>{formatValue(l.value)}</td>
                    <td>{l.lastActivityAt ? new Date(l.lastActivityAt).toLocaleDateString() : '—'}</td>
                    <td>{new Date(l.createdAt).toLocaleDateString()}</td>
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
    </div>
  );
}
