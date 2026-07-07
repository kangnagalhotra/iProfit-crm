import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupportTicket, TicketPriority, TicketStatus } from '../api/types';
import { listTicketsFor, updateTicket, deleteTicket as deleteTicketApi } from '../api/supportTickets';
import { SupportTicketForm } from './SupportTicketForm';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Icon } from './Icon';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'];

function priorityColor(p: TicketPriority) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

export function SupportTicketsWidget({ accountId }: { accountId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    listTicketsFor(accountId).then(setTickets).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [accountId]);

  async function changeStatus(ticket: SupportTicket, status: TicketStatus) {
    try {
      const data = await updateTicket(ticket.id, { status });
      setTickets((ts) => ts.map((t) => (t.id === ticket.id ? data : t)));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update ticket');
    }
  }

  async function deleteTicket(id: string) {
    const ok = await confirm('Delete this support ticket?', { title: 'Delete ticket' });
    if (!ok) return;
    try {
      await deleteTicketApi(id);
      setTickets((ts) => ts.filter((t) => t.id !== id));
      toast.success('Ticket deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete ticket');
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Support Tickets</h3>
        <button className="btn secondary" onClick={() => setShowForm(true)}>+ New Ticket</button>
      </div>

      <div>
        {loading ? (
          <div className="skeleton-row"><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <span className="icon"><Icon name="check" size={18} /></span>
            <p>No support tickets yet.</p>
          </div>
        ) : tickets.map((ticket) => (
          <div key={ticket.id} className="task-card">
            <div className="task-card-top">
              <Link to={`/support-tickets/${ticket.id}`} className={`task-card-title${ticket.status === 'CLOSED' ? ' done' : ''}`}>{ticket.subject}</Link>
              <button className="task-delete-btn" onClick={() => deleteTicket(ticket.id)} title="Delete ticket"><Icon name="trash" size={14} /></button>
            </div>
            <div className="task-card-meta">
              <span className="chip" style={{ background: priorityColor(ticket.priority) + '22', color: priorityColor(ticket.priority), marginRight: 6 }}>
                {ticket.priority}
              </span>
              {ticket.dueAt ? `Due ${new Date(ticket.dueAt).toLocaleDateString()}` : 'No due date'}
              {ticket.assignee && ` · ${ticket.assignee.fullName}`}
            </div>
            {ticket.description && <div className="task-card-notes">{ticket.description}</div>}
            <div className="task-card-footer">
              <select
                className="task-status-select"
                value={ticket.status}
                onChange={(e) => changeStatus(ticket, e.target.value as TicketStatus)}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <SupportTicketForm
          accountId={accountId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); toast.success('Ticket added'); }}
        />
      )}
    </div>
  );
}
