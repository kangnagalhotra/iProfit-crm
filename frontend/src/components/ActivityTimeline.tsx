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
  OTHER: 'dots',
};

const TASK_TYPE_ICONS: Record<TaskType, IconName> = {
  CALL: 'phone',
  EMAIL: 'mail',
  MEETING: 'calendar',
  TODO: 'check',
  FOLLOW_UP: 'checklist',
  OTHER: 'dots',
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
  badge: 'upcoming' | 'completed' | 'cancelled';
};

function fromActivity(a: Activity): TimelineEntry {
  return {
    id: `activity-${a.id}`,
    icon: ACTIVITY_ICONS[a.type],
    title: a.body,
    who: a.creator.fullName,
    at: a.occurredAt,
    badge: 'completed',
  };
}

function fromTask(t: Task): TimelineEntry {
  return {
    id: `task-${t.id}`,
    icon: TASK_TYPE_ICONS[t.type],
    title: t.title,
    detail: t.notes,
    who: t.assignee?.fullName ?? 'Unassigned',
    at: t.dueAt,
    badge: t.status === 'CANCELLED' ? 'cancelled' : 'upcoming',
  };
}

// Merges two sources into one date-ordered feed, each entry clearly badged
// Upcoming vs Completed: Call/Email/Meeting/Other/To-Do entries that are
// still pending come from the tasks table (a Task means "still pending" —
// completed ones never appear here, see QuickTaskModal/TasksWidget), while
// completed Call/Email/Meeting/Other logs and Notes/Field-Updates come from
// the activities table, which is the definitive "what happened" log
// regardless of whether it was logged fresh or derived from completing a
// scheduled task.
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
      }).then((data) => data.filter((a) => a.type !== 'NOTE' || showNotes)),
      // taskId-scoped usage (a task's own audit trail) has no matching
      // lead/account/opportunity to fetch tasks for — skip it there.
      (leadId || accountId || opportunityId)
        ? listTasksFor({ leadId, accountId, opportunityId }).then((tasks) => tasks.filter((t) => t.status !== 'COMPLETED'))
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
              <span
                className="chip"
                style={{
                  marginLeft: 8,
                  background: entry.badge === 'upcoming' ? '#F59E0B22' : entry.badge === 'cancelled' ? '#6B728022' : '#16A34A22',
                  color: entry.badge === 'upcoming' ? '#B45309' : entry.badge === 'cancelled' ? '#6B7280' : '#16A34A',
                }}
              >
                {entry.badge === 'upcoming' ? `Upcoming · due ${new Date(entry.at).toLocaleDateString()}`
                  : entry.badge === 'cancelled' ? 'Cancelled' : 'Completed'}
              </span>
            </div>
            {entry.detail && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{entry.detail}</div>}
            <div className="activity-meta">
              <span className="avatar avatar-sm">{creatorInitials(entry.who)}</span>
              <span>{entry.who} · {entry.badge === 'upcoming' ? 'scheduled' : timeAgo(entry.at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
