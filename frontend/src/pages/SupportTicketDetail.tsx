import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { SupportTicket } from '../api/types';
import { getTicket, updateTicket, deleteTicket } from '../api/supportTickets';
import { SupportTicketForm } from '../components/SupportTicketForm';
import { Icon } from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
    </div>
  );
}

function priorityColor(p: SupportTicket['priority']) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function statusColor(s: SupportTicket['status']) {
  return s === 'RESOLVED' || s === 'CLOSED' ? '#16A34A' : s === 'WAITING_ON_CUSTOMER' ? '#F59E0B' : s === 'IN_PROGRESS' ? '#0EA5E9' : '#6B7280';
}

function contactName(ticket: SupportTicket) {
  if (!ticket.contact) return undefined;
  return [ticket.contact.firstName, ticket.contact.lastName].filter(Boolean).join(' ') || ticket.contact.email;
}

export function SupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [editing, setEditing] = useState(false);

  function load() {
    if (!id) return;
    getTicket(id).then(setTicket).catch(() => {});
  }

  useEffect(() => { load(); }, [id]);

  if (!ticket) return <p>Loading…</p>;

  async function resolve() {
    try {
      const data = await updateTicket(ticket!.id, { status: 'RESOLVED' });
      setTicket(data);
      toast.success('Ticket resolved');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not resolve ticket');
    }
  }

  async function reopen() {
    try {
      const data = await updateTicket(ticket!.id, { status: 'OPEN' });
      setTicket(data);
      toast.success('Ticket reopened');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not reopen ticket');
    }
  }

  async function deleteRecord() {
    const ok = await confirm(`Delete "${ticket!.subject}"? This cannot be undone.`, { title: 'Delete ticket' });
    if (!ok) return;
    try {
      await deleteTicket(ticket!.id);
      toast.success('Ticket deleted');
      navigate('/support-tickets');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete ticket');
    }
  }

  const isResolved = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  return (
    <div>
      <p><Link to="/support-tickets">← Support Tickets</Link></p>

      <div className="detail-page-layout">
      <div className="card detail-header-card">
        <div className="detail-header">
          <div className="avatar">{ticket.subject[0]?.toUpperCase() ?? '?'}</div>
          <div>
            <h2>{ticket.subject}</h2>
            <span className="chip" style={{ background: statusColor(ticket.status) + '22', color: statusColor(ticket.status) }}>{ticket.status.replace(/_/g, ' ')}</span>{' '}
            <span className="chip" style={{ background: priorityColor(ticket.priority) + '22', color: priorityColor(ticket.priority) }}>{ticket.priority}</span>
          </div>
        </div>

        <div className="quick-actions">
          <button className="quick-action" onClick={() => setEditing(true)}>
            <span className="icon"><Icon name="edit" size={18} /></span>Edit
          </button>
          {isResolved ? (
            <button className="quick-action" onClick={reopen}>
              <span className="icon"><Icon name="check" size={18} /></span>Reopen
            </button>
          ) : (
            <button className="quick-action" onClick={resolve}>
              <span className="icon"><Icon name="check" size={18} /></span>Resolve
            </button>
          )}
          <button className="quick-action" onClick={deleteRecord}>
            <span className="icon"><Icon name="trash" size={18} /></span>Delete
          </button>
        </div>
      </div>

      <div className="detail-sidebar">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ticket details</h3>
        <div className="key-info">
          <Row label="Account" value={<Link to={`/companies/${ticket.account.id}`}>{ticket.account.name}</Link>} />
          <Row label="Contact" value={contactName(ticket)} />
          <Row label="Assignee" value={ticket.assignee?.fullName} />
          <Row label="Due date" value={ticket.dueAt ? new Date(ticket.dueAt).toLocaleDateString() : undefined} />
          <Row label="Resolved" value={ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString() : undefined} />
          <Row label="Created" value={new Date(ticket.createdAt).toLocaleDateString()} />
        </div>
        {ticket.description && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
          </div>
        )}
      </div>
      </div>
      </div>

      {editing && (
        <SupportTicketForm
          ticket={ticket}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { setEditing(false); setTicket(updated); toast.success('Ticket updated'); }}
        />
      )}
    </div>
  );
}
