import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SupportTicket, TicketPriority, TicketStatus, User } from '../api/types';
import { listTickets, getTicketSummary } from '../api/supportTickets';
import { listUsers } from '../api/users';
import { SupportTicketForm } from '../components/SupportTicketForm';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

type SortBy = 'subject' | 'priority' | 'status' | 'dueAt' | 'createdAt' | 'updatedAt';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function priorityColor(p: TicketPriority) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function statusColor(s: TicketStatus) {
  return s === 'RESOLVED' || s === 'CLOSED' ? '#16A34A' : s === 'WAITING_ON_CUSTOMER' ? '#F59E0B' : s === 'IN_PROGRESS' ? '#0EA5E9' : '#6B7280';
}

export function SupportTicketsList() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ total: number; open: number; critical: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { listUsers().then(setUsers); }, []);
  useEffect(() => { getTicketSummary().then(setSummary); }, []);

  const load = useCallback(() => {
    setLoading(true);
    listTickets({
      search: search || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      assigneeId: assigneeFilter || undefined,
      page, pageSize, sortBy, sortDir,
    })
      .then((data) => { setTickets(data.data); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [search, statusFilter, priorityFilter, assigneeFilter, page, pageSize, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, assigneeFilter]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sortArrow = (field: SortBy) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Support Tickets <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Search subject" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | '')}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }}>
            <option value="">All assignees</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          <button className="btn" onClick={() => setShowForm(true)}>+ New Ticket</button>
        </div>
      </div>

      {summary && (
        <div className="metric-cards">
          <div className="metric-card"><div className="metric-value">{summary.total}</div><div className="metric-label">Total Tickets</div></div>
          <div className="metric-card"><div className="metric-value">{summary.open}</div><div className="metric-label">Open Tickets</div></div>
          <div className="metric-card overdue"><div className="metric-value">{summary.critical}</div><div className="metric-label">Critical Tickets</div></div>
        </div>
      )}

      {loading ? <SkeletonTable columns={7} /> : tickets.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No matching tickets"
          description="No support tickets match these filters — try adjusting them, or create a new ticket."
          action={{ label: '+ New ticket', onClick: () => setShowForm(true) }}
        />
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('subject')}>Subject{sortArrow('subject')}</th>
                <th>Account</th>
                <th className="sortable" onClick={() => toggleSort('status')}>Status{sortArrow('status')}</th>
                <th className="sortable" onClick={() => toggleSort('priority')}>Priority{sortArrow('priority')}</th>
                <th>Assignee</th>
                <th className="sortable" onClick={() => toggleSort('dueAt')}>Due{sortArrow('dueAt')}</th>
                <th className="sortable" onClick={() => toggleSort('createdAt')}>Created{sortArrow('createdAt')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="clickable-row" onClick={() => navigate(`/support-tickets/${t.id}`)}>
                  <td><Link to={`/support-tickets/${t.id}`}>{t.subject}</Link></td>
                  <td><Link to={`/companies/${t.account.id}`} onClick={(e) => e.stopPropagation()}>{t.account.name}</Link></td>
                  <td><span className="chip" style={{ background: statusColor(t.status) + '22', color: statusColor(t.status) }}>{t.status.replace(/_/g, ' ')}</span></td>
                  <td><span className="chip" style={{ background: priorityColor(t.priority) + '22', color: priorityColor(t.priority) }}>{t.priority}</span></td>
                  <td>{t.assignee?.fullName ?? '—'}</td>
                  <td>{t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '—'}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
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
      )}

      {showForm && (
        <SupportTicketForm
          onClose={() => setShowForm(false)}
          onSaved={(ticket) => { setShowForm(false); load(); getTicketSummary().then(setSummary); navigate(`/support-tickets/${ticket.id}`); }}
        />
      )}
    </div>
  );
}
