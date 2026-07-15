import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../api/types';
import { listReminderTasks, completeTask } from '../api/tasks';
import { Icon } from './Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const POLL_MS = 60000;
const REMINDED_KEY = 'crm:reminded-task-ids';

type Bucket = 'Overdue' | 'Today' | 'Tomorrow' | 'In 2 days';
const BUCKET_COLORS: Record<Bucket, string> = {
  Overdue: '#DC2626', Today: '#025ADF', Tomorrow: '#8B5CF6', 'In 2 days': '#6B7280',
};

function bucketOf(task: Task): Bucket {
  const now = new Date();
  const due = new Date(task.dueAt);
  if (due < now) return 'Overdue';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'In 2 days';
}

function alreadyReminded(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]')); } catch { return new Set(); }
}
function markReminded(ids: Set<string>) {
  localStorage.setItem(REMINDED_KEY, JSON.stringify([...ids].slice(-100)));
}

// Topbar reminders: a grouped list of everything due through the day after
// tomorrow, plus pop-up toasts the moment a task's reminder time passes
// while the app is open. (A server cron also raises bell notifications so
// reminders aren't lost when the app is closed.)
export function RemindersMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function poll() {
      try {
        const data = await listReminderTasks(user!.id);
        if (cancelled) return;
        setTasks(data);
        // Pop-up any task whose reminder time has passed and hasn't fired yet
        // in this browser.
        const reminded = alreadyReminded();
        const now = new Date();
        let changed = false;
        for (const t of data) {
          if (t.reminderAt && new Date(t.reminderAt) <= now && !reminded.has(t.id)) {
            toast.success(`⏰ Reminder: ${t.title}`, { label: 'Open', onClick: () => navigate(`/tasks/${t.id}`) });
            reminded.add(t.id);
            changed = true;
          }
        }
        if (changed) markReminded(reminded);
      } catch { /* polling must never break the shell */ }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function done(task: Task) {
    try {
      await completeTask(task.id);
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      toast.success('Task completed ✓');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not complete task');
    }
  }

  const buckets: Bucket[] = ['Overdue', 'Today', 'Tomorrow', 'In 2 days'];
  const grouped = buckets
    .map((b) => ({ bucket: b, items: tasks.filter((t) => bucketOf(t) === b) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button type="button" className="btn secondary btn-icon" title="Task reminders — everything due in the next 2 days" onClick={() => setOpen((o) => !o)}>
        <Icon name="clock" size={14} /> Reminders
        {tasks.length > 0 && <span className="reminder-badge">{tasks.length}</span>}
      </button>
      {open && (
        <div className="dropdown-menu reminders-menu">
          {grouped.length === 0 && <div className="search-select-empty">Nothing due in the next 2 days 🎉</div>}
          {grouped.map((g) => (
            <div key={g.bucket}>
              <div className="reminders-group-label" style={{ color: BUCKET_COLORS[g.bucket] }}>{g.bucket}</div>
              {g.items.map((t) => (
                <div className="reminders-item" key={t.id}>
                  <button type="button" className="reminders-item-main" onClick={() => { setOpen(false); navigate(`/tasks/${t.id}`); }}>
                    <span className="reminders-item-title">{t.title}</span>
                    <span className="reminders-item-meta">
                      {t.type.replace('_', ' ')} · due {new Date(t.dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </button>
                  <button type="button" className="reminders-item-done" title="Mark complete" onClick={() => done(t)}>
                    <Icon name="check" size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
