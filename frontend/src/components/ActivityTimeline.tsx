import { useEffect, useState } from 'react';
import type {
  Activity, ActivityType, Task, TaskType,
} from '../api/types';
import { listActivities } from '../api/activities';
import { listTasksFor } from '../api/tasks';
import { timeAgo } from '../utils/timeAgo';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { EmptyState } from './EmptyState';

const ACTIVITY_ICONS: Record<ActivityType, IconName> = {
  CALL: 'phone',
  EMAIL: 'mail',
  MEETING: 'calendar',
  NOTE: 'note',
  FIELD_UPDATE: 'edit',
};

const TASK_TYPE_ICONS: Record<TaskType, IconName> = {
  CALL: 'phone',
  EMAIL: 'mail',
  MEETING: 'calendar',
  TODO: 'check',
  FOLLOW_UP: 'checklist',
};

function creatorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

type TimelineEntry = {
  id: string;
  icon: IconName;
  title: string;
  detail?: string;
  who: string;
  at: string;
  open: boolean;
};

function fromActivity(a: Activity): TimelineEntry {
  return {
    id: `activity-${a.id}`,
    icon: ACTIVITY_ICONS[a.type],
    title: a.body,
    who: a.creator.fullName,
    at: a.occurredAt,
    open: false,
  };
}

function fromTask(t: Task): TimelineEntry {
  return {
    id: `task-${t.id}`,
    icon: TASK_TYPE_ICONS[t.type],
    title: t.title,
    detail: t.notes,
    who: t.assignee?.fullName ?? 'Unassigned',
    at: t.completedAt ?? t.dueAt,
    open: t.status !== 'COMPLETED' && t.status !== 'CANCELLED',
  };
}

// Merges two sources into one date-ordered feed: Call/Email/Meeting/To-Do
// entries come from the tasks table (both open and completed — logging one
// via a quick action creates exactly one task, never a separate activity
// entry too), while Notes and system Field-Update audit rows still come
// from the activities table, which they've always owned.
export function ActivityTimeline({
  leadId, accountId, opportunityId, taskId, relatedLeadIds, relatedOpportunityIds, showNotes = false,
}: {
  leadId?: string; accountId?: string; opportunityId?: string; taskId?: string;
  relatedLeadIds?: string[]; relatedOpportunityIds?: string[]; showNotes?: boolean;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const relatedLeadKey = relatedLeadIds?.join(',');
  const relatedOpportunityKey = relatedOpportunityIds?.join(',');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listActivities({
        leadId, accountId, opportunityId, taskId, relatedLeadIds, relatedOpportunityIds,
      }).then((data) => data.filter((a) => {
        if (a.type === 'FIELD_UPDATE') return true;
        if (a.type === 'NOTE') return showNotes;
        // CALL/EMAIL/MEETING now come from tasks below — never shown twice.
        return false;
      })),
      // taskId-scoped usage (a task's own audit trail) has no matching
      // lead/account/opportunity to fetch tasks for — skip it there.
      (leadId || accountId || opportunityId)
        ? listTasksFor({ leadId, accountId, opportunityId })
        : Promise.resolve([] as Task[]),
    ]).then(([activities, tasks]) => {
      const merged = [...activities.map(fromActivity), ...tasks.map(fromTask)]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setEntries(merged);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, accountId, opportunityId, taskId, relatedLeadKey, relatedOpportunityKey, showNotes]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Activity</h3>
      {loading ? (
        <>
          <div className="skeleton-row"><div className="skeleton-circle" /><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
          <div className="skeleton-row"><div className="skeleton-circle" /><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
        </>
      ) : entries.length === 0 ? (
        <EmptyState icon="edit" description="No activity yet — updates will show up here." size="sm" />
      ) : entries.map((entry) => (
        <div key={entry.id} className="activity-item">
          <div className="activity-icon" title={entry.icon}><Icon name={entry.icon} size={14} /></div>
          <div className="activity-body">
            <div className="activity-text">
              {entry.title}
              {entry.open && <span className="chip" style={{ marginLeft: 8 }}>Open · due {new Date(entry.at).toLocaleDateString()}</span>}
            </div>
            {entry.detail && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{entry.detail}</div>}
            <div className="activity-meta">
              <span className="avatar avatar-sm">{creatorInitials(entry.who)}</span>
              <span>{entry.who} · {entry.open ? 'scheduled' : timeAgo(entry.at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
