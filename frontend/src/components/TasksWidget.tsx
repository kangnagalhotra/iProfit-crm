import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import {
  listTasksFor, completeTask, updateTask, deleteTask as deleteTaskApi,
} from '../api/tasks';
import { toggleChecklistItem } from '../api/taskChecklist';
import { TaskForm } from './TaskForm';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Icon } from './Icon';
import { TASK_TYPE_LABELS } from '../utils/taskTypeLabels';
import { EmptyState } from './EmptyState';

const STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'];

function priorityColor(p: TaskPriority) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

export function TasksWidget({
  leadId, accountId, opportunityId, onChanged,
}: { leadId?: string; accountId?: string; opportunityId?: string; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    listTasksFor({ leadId, accountId, opportunityId })
      .then(setTasks)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, accountId, opportunityId]);

  async function changeStatus(task: Task, status: TaskStatus) {
    try {
      const data = status === 'COMPLETED'
        ? await completeTask(task.id)
        : await updateTask(task.id, { status });
      setTasks((ts) => ts.map((t) => (t.id === task.id ? data : t)));
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update task');
    }
  }

  async function deleteTask(id: string) {
    const ok = await confirm('Delete this task?', { title: 'Delete task' });
    if (!ok) return;
    try {
      await deleteTaskApi(id);
      setTasks((ts) => ts.filter((t) => t.id !== id));
      toast.success('Task deleted');
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete task');
    }
  }

  async function toggleSubtask(task: Task, itemId: string, isDone: boolean) {
    try {
      const updated = await toggleChecklistItem(itemId, isDone);
      setTasks((ts) => ts.map((t) => (t.id === task.id
        ? { ...t, checklist: t.checklist?.map((c) => (c.id === itemId ? updated : c)) }
        : t)));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update sub-task');
    }
  }

  return (
    <div className="card" id="tasks-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ marginTop: 0 }}>Tasks</h3>
        <button className="btn secondary" onClick={() => setShowForm(true)}>+ Add task</button>
      </div>

      <div>
        {loading ? (
          <>
            <div className="skeleton-row"><div className="skeleton-lines"><div className="skeleton-line" /><div className="skeleton-line short" /></div></div>
          </>
        ) : tasks.length === 0 ? (
          <EmptyState icon="check" description="No tasks yet — add one to keep this moving." size="sm" />
        ) : tasks.map((task) => (
          <div key={task.id} className="task-card">
            <div className="task-card-top">
              <Link to={`/tasks/${task.id}`} className={`task-card-title${task.status === 'COMPLETED' ? ' done' : ''}`}>{task.title}</Link>
              <button className="task-delete-btn" onClick={() => deleteTask(task.id)} title="Delete task"><Icon name="trash" size={14} /></button>
            </div>
            <div className="task-card-meta">
              <span className="chip" style={{ background: priorityColor(task.priority) + '22', color: priorityColor(task.priority), marginRight: 6 }}>
                {task.priority}
              </span>
              {TASK_TYPE_LABELS[task.type]} · Due {new Date(task.dueAt).toLocaleDateString()}
              {task.assignee && ` · ${task.assignee.fullName}`}
              {task.checklist && task.checklist.length > 0 && (
                <button
                  type="button"
                  className="chip"
                  style={{ marginLeft: 6, border: 'none', cursor: 'pointer' }}
                  onClick={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                >
                  {task.checklist.filter((c) => c.isDone).length}/{task.checklist.length} done
                </button>
              )}
            </div>
            {task.notes && <div className="task-card-notes">{task.notes}</div>}
            {expandedId === task.id && task.checklist && (
              <div style={{ margin: '6px 0' }}>
                {task.checklist.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={item.isDone} onChange={(e) => toggleSubtask(task, item.id, e.target.checked)} />
                    <span style={{ textDecoration: item.isDone ? 'line-through' : undefined, color: item.isDone ? 'var(--muted)' : undefined }}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
          onSaved={() => { setShowForm(false); load(); toast.success('Task added'); onChanged?.(); }}
        />
      )}
    </div>
  );
}
