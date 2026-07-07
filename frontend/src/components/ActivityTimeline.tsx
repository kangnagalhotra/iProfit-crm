import { useEffect, useState } from 'react';
import type { Activity, ActivityType } from '../api/types';
import { listActivities } from '../api/activities';
import { timeAgo } from '../utils/timeAgo';
import { Icon } from './Icon';

const ACTIVITY_ICONS: Record<ActivityType, 'phone' | 'mail' | 'calendar' | 'note' | 'edit'> = {
  CALL: 'phone',
  EMAIL: 'mail',
  MEETING: 'calendar',
  NOTE: 'note',
  FIELD_UPDATE: 'edit',
};

function creatorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function ActivityTimeline({
  leadId, accountId, opportunityId, taskId, relatedLeadIds, relatedOpportunityIds, showNotes = false,
}: {
  leadId?: string; accountId?: string; opportunityId?: string; taskId?: string;
  relatedLeadIds?: string[]; relatedOpportunityIds?: string[]; showNotes?: boolean;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const relatedLeadKey = relatedLeadIds?.join(',');
  const relatedOpportunityKey = relatedOpportunityIds?.join(',');

  useEffect(() => {
    setLoading(true);
    listActivities({
      leadId, accountId, opportunityId, taskId, relatedLeadIds, relatedOpportunityIds,
    })
      .then((data) => setActivities(showNotes ? data : data.filter((a) => a.type !== 'NOTE')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, accountId, opportunityId, taskId, relatedLeadKey, relatedOpportunityKey]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Activity</h3>
      {loading ? (
        <>
          <div className="skeleton-row"><div className="skeleton-circle" /><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
          <div className="skeleton-row"><div className="skeleton-circle" /><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
        </>
      ) : activities.length === 0 ? (
        <div className="empty-state">
          <span className="icon"><Icon name="edit" size={18} /></span>
          <p>No activity yet — updates will show up here.</p>
        </div>
      ) : activities.map((a) => (
        <div key={a.id} className="activity-item">
          <div className="activity-icon" title={a.type}><Icon name={ACTIVITY_ICONS[a.type]} size={14} /></div>
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
