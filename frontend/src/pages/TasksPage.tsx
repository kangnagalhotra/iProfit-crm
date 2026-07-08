import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  Task, TaskPriority, TaskStatus, TaskSummary, User,
} from '../api/types';
import {
  listTasks, getTaskSummary, updateTask, completeTask as completeTaskApi,
  bulkUpdateTaskStatus, bulkUpdateTaskOwner, bulkDeleteTasks,
} from '../api/tasks';
import { listUsers } from '../api/users';
import { TaskForm } from '../components/TaskForm';
import { TaskImport } from '../components/TaskImport';
import { AddContactsMenu } from '../components/AddContactsMenu';
import { TasksKanban } from '../components/TasksKanban';
import { ViewToggle } from '../components/ViewToggle';
import type { ListView } from '../components/ViewToggle';
import { ExportMenu } from '../components/ExportMenu';
import type { ExportColumn } from '../components/ExportMenu';
import { InlineCell } from '../components/InlineCell';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

type SortBy = 'title' | 'dueAt' | 'priority' | 'status' | 'createdAt' | 'updatedAt';
type DueFilter = '' | 'today' | 'overdue' | 'upcoming';

const STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function isOverdue(task: Task) {
  return new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
}

function priorityColor(p: TaskPriority) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function statusColor(s: TaskStatus) {
  return s === 'COMPLETED' ? '#16A34A' : s === 'CANCELLED' ? '#DC2626' : s === 'WAITING' ? '#F59E0B' : s === 'IN_PROGRESS' ? '#0EA5E9' : '#6B7280';
}

function relatedRecord(task: Task) {
  if (task.lead) {
    const name = [task.lead.firstName, task.lead.lastName].filter(Boolean).join(' ') || task.lead.email || 'Lead';
    return { label: name, to: `/leads/${task.lead.id}`, module: 'Lead' };
  }
  if (task.account) return { label: task.account.name, to: `/companies/${task.account.id}`, module: 'Company' };
  if (task.opportunity) return { label: task.opportunity.name, to: `/deals/${task.opportunity.id}`, module: 'Deal' };
  return null;
}

const EXPORT_COLUMNS: ExportColumn<Task>[] = [
  { label: 'Task Title', get: (t) => t.title },
  { label: 'Type', get: (t) => t.type },
  { label: 'Priority', get: (t) => t.priority },
  { label: 'Related Record', get: (t) => relatedRecord(t)?.label ?? '' },
  { label: 'Module', get: (t) => relatedRecord(t)?.module ?? '' },
  { label: 'Owner', get: (t) => t.assignee?.fullName ?? '' },
  { label: 'Status', get: (t) => t.status.replace('_', ' ') },
  { label: 'Due Date', get: (t) => new Date(t.dueAt).toLocaleDateString() },
  { label: 'Created', get: (t) => new Date(t.createdAt).toLocaleDateString() },
  { label: 'Last Updated', get: (t) => new Date(t.updatedAt).toLocaleDateString() },
];

async function fetchAllTasks(params: Record<string, any>): Promise<Task[]> {
  let page = 1;
  let all: Task[] = [];
  for (;;) {
    const data = await listTasks({ ...params, page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function TasksPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [view, setView] = useState<ListView>('board');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kanbanKey, setKanbanKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>('dueAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<User[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'owner' | 'status' } | null>(null);

  useEffect(() => {
    listUsers().then(setUsers);
  }, []);

  function loadSummary() {
    getTaskSummary().then(setSummary);
  }

  const queryParams = {
    search: search || undefined,
    dueFilter: dueFilter || undefined,
    priority: priorityFilter || undefined,
    assigneeId: ownerFilter || undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    listTasks({
      ...queryParams, page, pageSize, sortBy, sortDir,
    })
      .then((data) => { setTasks(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dueFilter, priorityFilter, ownerFilter, page, pageSize, sortBy, sortDir]);

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { if (view === 'board') load(); }, [load, view]);
  useEffect(() => { setPage(1); }, [search, dueFilter, priorityFilter, ownerFilter]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id))));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function refreshAfterChange() {
    load();
    loadSummary();
  }

  async function bulkChangeStatus(status: string) {
    if (!status) return;
    try {
      const data = await bulkUpdateTaskStatus([...selected], status as TaskStatus);
      toast.success(`Updated ${data.succeeded} task(s)`);
      if (data.failed) toast.error(`${data.failed} task(s) could not be updated`);
      refreshAfterChange();
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk status update failed');
    }
  }

  async function bulkChangeOwner(ownerId: string) {
    if (!ownerId) return;
    try {
      const data = await bulkUpdateTaskOwner([...selected], ownerId);
      toast.success(`Reassigned ${data.succeeded} task(s)`);
      if (data.failed) toast.error(`${data.failed} task(s) could not be reassigned`);
      refreshAfterChange();
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk reassignment failed');
    }
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected task(s)? This cannot be undone.`, { title: 'Delete tasks' });
    if (!ok) return;
    try {
      const data = await bulkDeleteTasks([...selected]);
      toast.success(`Deleted ${data.succeeded} task(s)`);
      if (data.failed) toast.error(`${data.failed} task(s) could not be deleted`);
      refreshAfterChange();
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk delete failed');
    }
  }

  async function completeTask(task: Task) {
    try {
      await completeTaskApi(task.id);
      refreshAfterChange();
      toast.success('Task marked complete');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update task');
    }
  }

  async function inlineUpdate(task: Task, data: Record<string, any>) {
    try {
      await updateTask(task.id, data);
      refreshAfterChange();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update task');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sortArrow = (field: SortBy) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Tasks {view === 'board' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span>}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <ViewToggle value={view} onChange={setView} />
          {view === 'board' && (
            <>
              <input placeholder="Search title or notes" value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | '')}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}
                style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
                <option value="">All owners</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
              <ExportMenu
                columns={EXPORT_COLUMNS}
                entityName="tasks"
                getCurrentView={() => tasks}
                getAll={() => fetchAllTasks(queryParams)}
                getSelected={() => tasks.filter((t) => selected.has(t.id))}
                selectedCount={selected.size}
              />
            </>
          )}
          <AddContactsMenu label="Add task" onCreateNew={() => setShowForm(true)} onImport={() => setShowImport(true)} />
        </div>
      </div>

      {summary && (
        <div className="metric-cards">
          <div className="metric-card"><div className="metric-value">{summary.total}</div><div className="metric-label">Total Tasks</div></div>
          <div className="metric-card"><div className="metric-value">{summary.open}</div><div className="metric-label">Open Tasks</div></div>
          <div className="metric-card"><div className="metric-value">{summary.completed}</div><div className="metric-label">Completed Tasks</div></div>
          <div className="metric-card overdue"><div className="metric-value">{summary.overdue}</div><div className="metric-label">Overdue Tasks</div></div>
          <div className="metric-card"><div className="metric-value">{summary.dueToday}</div><div className="metric-label">Due Today</div></div>
        </div>
      )}

      {view === 'board' && (
        <div className="quick-filter-chips">
          {(['', 'today', 'overdue', 'upcoming'] as DueFilter[]).map((f) => (
            <button
              key={f || 'all'}
              className={`chip-filter${dueFilter === f ? ' active' : ''}`}
              onClick={() => setDueFilter(f)}
            >
              {f === '' ? 'All' : f === 'today' ? 'Due Today' : f === 'overdue' ? 'Overdue' : 'Upcoming'}
            </button>
          ))}
        </div>
      )}

      {view === 'board' ? (
        loading ? <SkeletonTable columns={10} /> : tasks.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No matching tasks"
            description="No tasks match these filters — try adjusting them, or create a new task."
            action={{ label: '+ Add task', onClick: () => setShowForm(true) }}
          />
        ) : (
          <>
            {selected.size > 0 && (
              <div className="bulk-bar">
                <span>{selected.size} selected</span>
                <select defaultValue="" onChange={(e) => { bulkChangeStatus(e.target.value); e.target.value = ''; }}>
                  <option value="" disabled>Change status…</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select defaultValue="" onChange={(e) => { bulkChangeOwner(e.target.value); e.target.value = ''; }}>
                  <option value="" disabled>Reassign owner…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
                <button className="btn secondary" onClick={bulkDeleteSelected}>Delete</button>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={selected.size === tasks.length && tasks.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="sortable" onClick={() => toggleSort('title')}>Task Title{sortArrow('title')}</th>
                  <th>Related Record</th>
                  <th>Module</th>
                  <th>Owner</th>
                  <th className="sortable" onClick={() => toggleSort('priority')}>Priority{sortArrow('priority')}</th>
                  <th className="sortable" onClick={() => toggleSort('status')}>Status{sortArrow('status')}</th>
                  <th className="sortable" onClick={() => toggleSort('dueAt')}>Due Date{sortArrow('dueAt')}</th>
                  <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>
                  <th className="sortable" onClick={() => toggleSort('updatedAt')}>Last Updated{sortArrow('updatedAt')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const related = relatedRecord(t);
                  const overdue = isOverdue(t);
                  return (
                    <tr key={t.id}>
                      <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                      <td>
                        {overdue && <span title="Overdue" style={{ color: '#DC2626', marginRight: 4, display: 'inline-flex', verticalAlign: 'middle' }}><Icon name="alert" size={12} /></span>}
                        <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                      </td>
                      <td>{related ? <Link to={related.to}>{related.label}</Link> : '—'}</td>
                      <td>{related?.module ?? '—'}</td>
                      <td>
                        <InlineCell
                          display={t.assignee?.fullName ?? '—'}
                          editing={editingCell?.id === t.id && editingCell.field === 'owner'}
                          onStartEdit={() => setEditingCell({ id: t.id, field: 'owner' })}
                        >
                          <select
                            autoFocus
                            defaultValue={t.assignee?.id ?? ''}
                            onBlur={() => setEditingCell(null)}
                            onChange={(e) => { inlineUpdate(t, { assigneeId: e.target.value }); setEditingCell(null); }}
                          >
                            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                          </select>
                        </InlineCell>
                      </td>
                      <td><span className="chip" style={{ background: priorityColor(t.priority) + '22', color: priorityColor(t.priority) }}>{t.priority}</span></td>
                      <td>
                        <InlineCell
                          display={<span className="chip" style={{ background: statusColor(t.status) + '22', color: statusColor(t.status) }}>{t.status.replace('_', ' ')}</span>}
                          editing={editingCell?.id === t.id && editingCell.field === 'status'}
                          onStartEdit={() => setEditingCell({ id: t.id, field: 'status' })}
                        >
                          <select
                            autoFocus
                            defaultValue={t.status}
                            onBlur={() => setEditingCell(null)}
                            onChange={(e) => { inlineUpdate(t, { status: e.target.value }); setEditingCell(null); }}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                          </select>
                        </InlineCell>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={t.dueAt.slice(0, 10)}
                          style={{ color: overdue ? '#DC2626' : undefined, border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px' }}
                          onChange={(e) => inlineUpdate(t, { dueAt: e.target.value })}
                        />
                      </td>
                      <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td>{new Date(t.updatedAt).toLocaleDateString()}</td>
                      <td>
                        {t.status !== 'COMPLETED' && (
                          <button className="copy-btn" onClick={() => completeTask(t)}>Complete</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
        <TasksKanban key={kanbanKey} />
      )}

      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSaved={(task) => { setShowForm(false); toast.success('Task created'); loadSummary(); navigate(`/tasks/${task.id}`); }}
        />
      )}
      {showImport && (
        <TaskImport
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadSummary();
            if (view === 'board') load(); else setKanbanKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
