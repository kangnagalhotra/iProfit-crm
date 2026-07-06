import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import { TaskForm } from './TaskForm';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'];

function priorityColor(p: TaskPriority) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

export function TasksWidget({
  leadId, accountId, opportunityId,
}: { leadId?: string; accountId?: string; opportunityId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const params = leadId ? { leadId } : accountId ? { accountId } : { opportunityId };

  function load() {
    setLoading(true);
    api.get<Task[]>('/tasks', { params })
      .then(({ data }) => setTasks(data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, accountId, opportunityId]);

  async function changeStatus(task: Task, status: TaskStatus) {
    try {
      const { data } = status === 'COMPLETED'
        ? await api.patch<Task>(`/tasks/${task.id}/complete`)
        : await api.patch<Task>(`/tasks/${task.id}`, { status });
      setTasks((ts) => ts.map((t) => (t.id === task.id ? data : t)));
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not update task');
    }
  }

  async function deleteTask(id: string) {
    const ok = await confirm('Delete this task?', { title: 'Delete task' });
    if (!ok) return;
    try {
      await api.delete(`/tasks/${id}`);
      setTasks((ts) => ts.filter((t) => t.id !== id));
      toast.success('Task deleted');
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not delete task');
    }
  }

  return (
    <div className="card" id="tasks-section" style={{ maxWidth: 640, marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Tasks</h3>
        <button className="btn secondary" onClick={() => setShowForm(true)}>+ Add task</button>
      </div>

      <div>
        {loading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : tasks.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No tasks yet.</p>
        ) : tasks.map((task) => (
          <div key={task.id} className="task-card">
            <div className="task-card-top">
              <Link to={`/tasks/${task.id}`} className={`task-card-title${task.status === 'COMPLETED' ? ' done' : ''}`}>{task.title}</Link>
              <button className="task-delete-btn" onClick={() => deleteTask(task.id)} title="Delete task">🗑</button>
            </div>
            <div className="task-card-meta">
              <span className="chip" style={{ background: priorityColor(task.priority) + '22', color: priorityColor(task.priority), marginRight: 6 }}>
                {task.priority}
              </span>
              {task.type.replace('_', ' ')} · Due {new Date(task.dueAt).toLocaleDateString()}
              {task.assignee && ` · ${task.assignee.fullName}`}
            </div>
            {task.notes && <div className="task-card-notes">{task.notes}</div>}
            <div className="task-card-footer">
              <select
                className="task-status-select"
                value={task.status}
                onChange={(e) => changeStatus(task, e.target.value as TaskStatus)}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <TaskForm
          leadId={leadId}
          accountId={accountId}
          opportunityId={opportunityId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); toast.success('Task added'); }}
        />
      )}
    </div>
  );
}
