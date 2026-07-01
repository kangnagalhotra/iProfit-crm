import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Lead } from '../api/types';

function initials(lead: Lead) {
  const parts = [lead.firstName, lead.lastName].filter(Boolean) as string[];
  if (parts.length === 0) return (lead.email ?? '?')[0].toUpperCase();
  return parts.map((p) => p[0].toUpperCase()).join('');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
    </div>
  );
}

export function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Lead>(`/leads/${id}`).then(({ data }) => setLead(data)).catch(() => {});
  }, [id]);

  if (!lead) return <p>Loading…</p>;

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Untitled lead';

  function copyEmail() {
    if (!lead!.email) return;
    navigator.clipboard.writeText(lead!.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <p><Link to="/leads">← Leads</Link></p>

      <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="detail-header">
          <div className="avatar">{initials(lead)}</div>
          <div>
            <h2>{name}</h2>
            {lead.email && (
              <span>
                <a href={`mailto:${lead.email}`}>{lead.email}</a>{' '}
                <button className="copy-btn" onClick={copyEmail} title="Copy email">
                  {copied ? '✓' : '⧉'}
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="quick-actions">
          <a className="quick-action" href={lead.email ? `mailto:${lead.email}` : undefined}
            style={!lead.email ? { pointerEvents: 'none', opacity: 0.4 } : undefined}>
            <span className="icon">✉</span>Email
          </a>
          <a className="quick-action" href={lead.phone ? `tel:${lead.phone}` : undefined}
            style={!lead.phone ? { pointerEvents: 'none', opacity: 0.4 } : undefined}>
            <span className="icon">☎</span>Call
          </a>
          <button className="quick-action" disabled title="Coming soon — Activity module not built yet">
            <span className="icon">📝</span>Note
          </button>
          <button className="quick-action" disabled title="Coming soon — Task module not built yet">
            <span className="icon">☑</span>Task
          </button>
          <button className="quick-action" disabled title="Coming soon — Meeting scheduling not built yet">
            <span className="icon">📅</span>Meeting
          </button>
          <button className="quick-action" disabled title="More actions coming soon">
            <span className="icon">⋯</span>More
          </button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Key information</h3>
        <div className="key-info">
          <Row label="Contact owner" value={lead.owner?.fullName} />
          <Row label="Job Title" value={lead.jobTitle} />
          <Row label="Phone Number" value={lead.phone} />
          <Row label="Email" value={lead.email} />
          <Row label="City" value={lead.city} />
          <Row label="Lead Status" value={<span className="chip">{lead.status}</span>} />
          <Row label="Lead Source" value={lead.source} />
          <Row label="Preferred communication method" value={lead.preferredContactMethod} />
          <Row label="Last Contacted" value={lead.lastActivityAt ? new Date(lead.lastActivityAt).toLocaleDateString() : undefined} />
          <Row label="Company" value={lead.account ? <Link to={`/companies/${lead.account.id}`}>{lead.account.name}</Link> : undefined} />
        </div>
      </div>
    </div>
  );
}
