import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Activity, ActivityType } from '../api/types';
import { timeAgo } from '../utils/timeAgo';

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  CALL: '☎',
  EMAIL: '✉',
  MEETING: '📅',
  NOTE: '📝',
  FIELD_UPDATE: '✎',
};

function creatorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function ActivityTimeline({
  leadId, accountId, opportunityId, taskId, showNotes = false,
}: {
  leadId?: string; accountId?: string; opportunityId?: string; taskId?: string; showNotes?: boolean;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const params = leadId ? { leadId } : accountId ? { accountId } : taskId ? { taskId } : { opportunityId };

  useEffect(() => {
    setLoading(true);
    api.get<Activity[]>('/activities', { params })
      .then(({ data }) => setActivities(showNotes ? data : data.filter((a) => a.type !== 'NOTE')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, accountId, opportunityId, taskId]);

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
      <h3 style={{ marginTop: 0 }}>Activity</h3>
      {loading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : activities.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No activity yet.</p>
      ) : activities.map((a) => (
        <div key={a.id} className="activity-item">
          <div className="activity-icon" title={a.type}>{ACTIVITY_ICONS[a.type]}</div>
          <div className="activity-body">
            <div className="activity-text">{a.body}</div>
            <div className="activity-meta">
              <span className="avatar avatar-sm">{creatorInitials(a.creator.fullName)}</span>
              <span>{a.creator.fullName} · {timeAgo(a.occurredAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
