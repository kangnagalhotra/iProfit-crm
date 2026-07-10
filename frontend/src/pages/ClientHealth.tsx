import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project, ProjectHealth } from '../api/types';
import { listProjects, updateProject } from '../api/projects';
import { HEALTH_LABELS, HEALTH_COLORS } from '../components/HealthRenewalCard';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

const HEALTH_SORT: Record<ProjectHealth, number> = { DELAYED: 0, AT_RISK: 1, ON_TRACK: 2 };

function daysUntil(dateIso?: string): number | null {
  if (!dateIso) return null;
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / 86400000);
}

// A won client is "at risk" when its renewal date has passed with no renewal
// activity logged since — same definition the check_renewals() cron uses.
function isRenewalAtRisk(p: Project): boolean {
  const days = daysUntil(p.opportunity?.renewalDate);
  if (days === null || days >= 0) return false;
  const lastActivity = p.opportunity?.lastActivityAt;
  return !lastActivity || lastActivity <= p.opportunity!.renewalDate!;
}

function renewalChip(p: Project) {
  const days = daysUntil(p.opportunity?.renewalDate);
  if (days === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const date = new Date(p.opportunity!.renewalDate!).toLocaleDateString();
  if (days < 0) return <span className="chip" style={{ background: '#DC262622', color: '#DC2626' }}>Overdue — {date}</span>;
  if (days <= 30) return <span className="chip" style={{ background: '#F9731622', color: '#F97316' }}>{date} ({days}d)</span>;
  return <span>{date}</span>;
}

export function ClientHealth() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects().then(setProjects).finally(() => setLoading(false));
  }, []);

  async function setHealth(p: Project, health: ProjectHealth) {
    try {
      const updated = await updateProject(p.id, { health });
      setProjects((ps) => ps.map((x) => (x.id === p.id ? updated : x)));
      toast.success('Health updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update health');
    }
  }

  const sorted = [...projects].sort((a, b) => {
    const riskA = isRenewalAtRisk(a) ? 0 : 1;
    const riskB = isRenewalAtRisk(b) ? 0 : 1;
    if (riskA !== riskB) return riskA - riskB;
    return HEALTH_SORT[a.health] - HEALTH_SORT[b.health];
  });

  const atRiskCount = projects.filter((p) => p.health !== 'ON_TRACK' || isRenewalAtRisk(p)).length;
  const renewingSoon = projects.filter((p) => {
    const d = daysUntil(p.opportunity?.renewalDate);
    return d !== null && d >= 0 && d <= 30;
  }).length;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Client Health</h2>

      <div className="dashboard-grid" style={{ marginBottom: 18 }}>
        <div className="card"><div className="label">Active Clients</div><div className="value">{projects.length}</div></div>
        <div className="card"><div className="label">At Risk / Delayed</div><div className="value" style={{ color: atRiskCount > 0 ? '#DC2626' : undefined }}>{atRiskCount}</div></div>
        <div className="card"><div className="label">Renewals in 30 days</div><div className="value" style={{ color: renewingSoon > 0 ? '#F97316' : undefined }}>{renewingSoon}</div></div>
      </div>

      {loading ? <SkeletonTable columns={7} /> : projects.length === 0 ? (
        <EmptyState
          icon="headset"
          title="No active clients yet"
          description="Client health records are created automatically when a deal closes won."
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Client / Project</th>
              <th>Company</th>
              <th>Deal</th>
              <th>Value</th>
              <th>Health</th>
              <th>Satisfaction</th>
              <th>Renewal</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  {isRenewalAtRisk(p) && <span className="chip" style={{ background: '#DC262622', color: '#DC2626', marginLeft: 6 }}>At Risk</span>}
                </td>
                <td>{p.account ? <Link to={`/companies/${p.account.id}`}>{p.account.name}</Link> : '—'}</td>
                <td>{p.opportunity ? <Link to={`/deals/${p.opportunity.id}`}>{p.opportunity.name}</Link> : '—'}</td>
                <td>{p.value ? parseFloat(p.value).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—'}</td>
                <td>
                  <select
                    value={p.health}
                    style={{ color: HEALTH_COLORS[p.health], fontWeight: 600 }}
                    onChange={(e) => setHealth(p, e.target.value as ProjectHealth)}
                  >
                    {(Object.keys(HEALTH_LABELS) as ProjectHealth[]).map((h) => (
                      <option key={h} value={h}>{HEALTH_LABELS[h]}</option>
                    ))}
                  </select>
                </td>
                <td>{p.satisfaction ? '★'.repeat(p.satisfaction) + '☆'.repeat(5 - p.satisfaction) : '—'}</td>
                <td>{renewalChip(p)}</td>
                <td>{p.opportunity?.owner?.fullName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
