import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Task, TaskType } from '../api/types';
import { listTasks, completeTask } from '../api/tasks';
import { Icon } from './Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ACTION_VERBS: Record<TaskType, string> = {
  CALL: 'Call', EMAIL: 'Email', FOLLOW_UP: 'Follow up with', TODO: 'Do', MEETING: 'Meet', OTHER: 'Follow up with',
};
const TYPE_ICONS: Record<TaskType, 'phone' | 'mail' | 'clock' | 'check' | 'calendar' | 'dots'> = {
  CALL: 'phone', EMAIL: 'mail', FOLLOW_UP: 'clock', TODO: 'check', MEETING: 'calendar', OTHER: 'dots',
};

// Answers the rep's morning question in one glance: WHO do I call/email
// today, with the phone/email one click away, pulled from the task's linked
// lead / company / deal's primary contact.
function contactFor(task: Task): { name?: string; to?: string; phone?: string; email?: string } {
  if (task.lead) {
    return {
      name: [task.lead.firstName, task.lead.lastName].filter(Boolean).join(' ') || task.lead.email,
      to: `/leads/${task.lead.id}`,
      phone: task.lead.mobile,
      email: task.lead.email,
    };
  }
  if (task.opportunity) {
    const c = task.opportunity.contact;
    return {
      name: c ? ([c.firstName, c.lastName].filter(Boolean).join(' ') || c.email) : task.opportunity.name,
      to: `/deals/${task.opportunity.id}`,
      phone: c?.mobile,
      email: c?.email,
    };
  }
  if (task.account) {
    return {
      name: task.account.name, to: `/companies/${task.account.id}`, phone: task.account.phone, email: task.account.email,
    };
  }
  return {};
}

export function MyActionsPanel({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [today, setToday] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      listTasks({ assigneeId: user.id, dueFilter: 'overdue', pageSize: 15 }),
      listTasks({ assigneeId: user.id, dueFilter: 'today', pageSize: 15 }),
    ]).then(([o, t]) => { setOverdue(o.data); setToday(t.data); }).finally(() => setLoaded(true));
  }, [user]);

  async function done(task: Task) {
    try {
      await completeTask(task.id);
      setOverdue((ts) => ts.filter((t) => t.id !== task.id));
      setToday((ts) => ts.filter((t) => t.id !== task.id));
      toast.success('Nice — task done ✓');
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not complete task');
    }
  }

  if (!loaded || (overdue.length === 0 && today.length === 0)) return null;

  function rows(tasks: Task[], tone: 'overdue' | 'today') {
    return tasks.map((task) => {
      const contact = contactFor(task);
      return (
        <div className="my-action-row" key={task.id}>
          <span className="my-action-icon" style={{ color: tone === 'overdue' ? '#DC2626' : '#025ADF' }}>
            <Icon name={TYPE_ICONS[task.type]} size={15} />
          </span>
          <span className="my-action-text">
            <strong>{ACTION_VERBS[task.type]}</strong>
            {contact.name && (
              <>
                {' '}
                {contact.to ? <Link to={contact.to}>{contact.name}</Link> : contact.name}
              </>
            )}
            <span className="my-action-title"> — {task.title}</span>
            {task.checklist && task.checklist.length > 0 && (
              <span className="chip" style={{ marginLeft: 6 }}>
                {task.checklist.filter((c) => c.isDone).length}/{task.checklist.length} done
              </span>
            )}
          </span>
          <span className={`chip ${tone === 'overdue' ? '' : ''}`} style={tone === 'overdue'
            ? { background: '#DC262622', color: '#DC2626' }
            : { background: '#025ADF22', color: '#025ADF' }}>
            {tone === 'overdue' ? `Overdue · ${new Date(task.dueAt).toLocaleDateString()}` : 'Due today'}
          </span>
          <span className="my-action-buttons">
            {contact.phone && (
              <a className="btn secondary btn-icon" href={`tel:${contact.phone}`} title={`Call ${contact.phone}`}>
                <Icon name="phone" size={13} /> Call
              </a>
            )}
            {contact.email && (
              <a className="btn secondary btn-icon" href={`mailto:${contact.email}`} title={`Email ${contact.email}`}>
                <Icon name="mail" size={13} /> Email
              </a>
            )}
            <button type="button" className="btn secondary btn-icon" onClick={() => done(task)} title="Mark complete">
              <Icon name="check" size={13} /> Done
            </button>
          </span>
        </div>
      );
    });
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>🎯 My Actions</h3>
      <div className="helper-text" style={{ marginBottom: 12 }}>
        Your calls, emails, and follow-ups for today — contact details one click away.
      </div>
      {rows(overdue, 'overdue')}
      {rows(today, 'today')}
    </div>
  );
}
