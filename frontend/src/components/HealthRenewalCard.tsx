import { useEffect, useState } from 'react';
import type { Opportunity, Project, ProjectHealth } from '../api/types';
import { getProjectForDeal, updateProject } from '../api/projects';
import { updateDeal } from '../api/deals';
import { CollapsibleCard } from './CollapsibleCard';
import { useToast } from '../context/ToastContext';

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  ON_TRACK: 'On Track', AT_RISK: 'At Risk', DELAYED: 'Delayed',
};
export const HEALTH_COLORS: Record<ProjectHealth, string> = {
  ON_TRACK: '#16A34A', AT_RISK: '#F97316', DELAYED: '#DC2626',
};

// Post-sale panel shown only on Closed Won deals: onboarding/implementation
// health + satisfaction live on the auto-created project row; the AMC/renewal
// date lives on the deal itself (it also drives the renewal-reminder cron).
export function HealthRenewalCard({ deal, onDealUpdated }: {
  deal: Opportunity;
  onDealUpdated: (deal: Opportunity) => void;
}) {
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProjectForDeal(deal.id).then((p) => { setProject(p); setLoaded(true); }).catch(() => setLoaded(true));
  }, [deal.id]);

  async function saveProject(patch: { health?: ProjectHealth; satisfaction?: number | null; status?: string }) {
    if (!project) return;
    try {
      const updated = await updateProject(project.id, patch);
      setProject(updated);
      toast.success('Client health updated');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update client health');
    }
  }

  async function saveRenewalDate(value: string) {
    try {
      const updated = await updateDeal(deal.id, { renewalDate: value || null });
      onDealUpdated(updated);
      toast.success('Renewal date saved');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save renewal date');
    }
  }

  if (!loaded) return null;

  return (
    <CollapsibleCard title="Client Health & Renewal" storageKey="collapsible:deal:health">
      {!project && (
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 0 }}>
          No project handover record found for this deal (it is created automatically when a deal closes won with a linked company).
        </p>
      )}
      {project && (
        <div className="form-grid-2">
          <div className="field"><label>Implementation status</label>
            <select value={project.health} onChange={(e) => saveProject({ health: e.target.value as ProjectHealth })}>
              {(Object.keys(HEALTH_LABELS) as ProjectHealth[]).map((h) => (
                <option key={h} value={h}>{HEALTH_LABELS[h]}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Satisfaction (1–5)</label>
            <select
              value={project.satisfaction ?? ''}
              onChange={(e) => saveProject({ satisfaction: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="field"><label>AMC / Renewal date</label>
        <input
          type="date"
          defaultValue={deal.renewalDate ?? ''}
          onBlur={(e) => { if (e.target.value !== (deal.renewalDate ?? '')) saveRenewalDate(e.target.value); }}
        />
        <div className="helper-text">Reminder tasks are created automatically 30 and 7 days before this date.</div>
      </div>
    </CollapsibleCard>
  );
}
