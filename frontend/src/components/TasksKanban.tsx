import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Task, TaskStatus } from '../api/types';
import {
  listTasks, updateTask, deleteTask, completeTask,
} from '../api/tasks';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { TaskForm } from './TaskForm';
import { Icon } from './Icon';
import { SkeletonKanban } from './Skeleton';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

// No Completed column — a Task means "still pending"; once completed it
// moves to the Activity Log (see ActivityTimeline), never lingers on the
// board. Reps mark a task done via the card's own Complete button below,
// which removes it from the board immediately rather than dragging it into
// a "completed pile" column.
const STATUS_COLUMNS: { id: TaskStatus; name: string; color: string }[] = [
  { id: 'NOT_STARTED', name: 'Not Started', color: '#6B7280' },
  { id: 'IN_PROGRESS', name: 'In Progress', color: '#0EA5E9' },
  { id: 'WAITING', name: 'Waiting', color: '#F59E0B' },
  { id: 'CANCELLED', name: 'Cancelled', color: '#DC2626' },
];

async function loadAllTasks(): Promise<Task[]> {
  let page = 1;
  let all: Task[] = [];
  for (;;) {
    const data = await listTasks({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function isOverdue(task: Task) {
  return new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
}

function priorityColor(p: Task['priority']) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function relatedRecord(task: Task) {
  if (task.lead) {
    const name = [task.lead.firstName, task.lead.lastName].filter(Boolean).join(' ') || task.lead.email || 'Lead';
    return { label: name, to: `/leads/${task.lead.id}` };
  }
  if (task.account) return { label: task.account.name, to: `/companies/${task.account.id}` };
  if (task.opportunity) return { label: task.opportunity.name, to: `/deals/${task.opportunity.id}` };
  return null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function TasksKanban() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formState, setFormState] = useState<{ task?: Task; defaultStatus?: TaskStatus } | null>(null);

  useEffect(() => {
    loadAllTasks().then(setTasks).finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((taskId: string, _from: string, toStatus: string) => {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: toStatus as TaskStatus } : t)));
    setError('');
    updateTask(taskId, { status: toStatus }).catch((e) => {
      setTasks(prev);
      setError(e.message ?? 'Could not update task status');
    });
  }, [tasks]);

  async function handleDelete(task: Task) {
    const ok = await confirm(`Delete "${task.title}"? This cannot be undone.`, { title: 'Delete task' });
    if (!ok) return;
    try {
      await deleteTask(task.id);
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      toast.success('Task deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete task');
    }
  }

  async function handleComplete(task: Task) {
    try {
      await completeTask(task.id);
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      toast.success('Task completed — logged to the Activity Log');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not complete task');
    }
  }

  if (loading) return <SkeletonKanban columns={STATUS_COLUMNS.length} />;

  const statusIds = STATUS_COLUMNS.map((s) => s.id);
  const columns: KanbanColumn<Task>[] = STATUS_COLUMNS.map((col) => ({
    id: col.id,
    label: col.name,
    items: tasks.filter((t) => t.status === col.id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(task) => task.id}
        onDrop={handleDrop}
        renderColumnHeader={(col) => {
          const status = STATUS_COLUMNS.find((s) => s.id === col.id)!;
          return (
            <StageColumnHeader
              stage={{
                id: status.id, name: status.name, order: statusIds.indexOf(status.id), color: status.color, isDefault: false,
              }}
              count={col.items.length}
              editable={false}
              allStageIds={statusIds}
              myIndex={statusIds.indexOf(status.id)}
              onChanged={() => {}}
              onDeleted={() => {}}
              onReordered={() => {}}
            />
          );
        }}
        renderColumnActions={(col) => (
          <button className="kanban-add-btn" onClick={() => setFormState({ defaultStatus: col.id as TaskStatus })}>+ Add task</button>
        )}
        emptyState={(col) => (
          <div className="kanban-empty">
            <div className="icon"><Icon name="inbox" size={18} /></div>
            <p>No tasks in this status</p>
            <button className="btn secondary" onClick={() => setFormState({ defaultStatus: col.id as TaskStatus })}>+ Add task</button>
          </div>
        )}
        renderCard={(task) => {
          const related = relatedRecord(task);
          return (
            <>
              <Link to={`/tasks/${task.id}`}>
                <div className="kanban-card-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isOverdue(task) && <span title="Overdue" style={{ color: '#DC2626', display: 'flex' }}><Icon name="alert" size={12} /></span>}
                  {task.title}
                </div>
                {related && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{related.label}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="chip" style={{ background: priorityColor(task.priority) + '22', color: priorityColor(task.priority) }}>
                    {task.priority}
                  </span>
                  {task.assignee && <div className="avatar avatar-sm" title={task.assignee.fullName}>{initials(task.assignee.fullName)}</div>}
                </div>
                <div className="kanban-card-footer">
                  <span className={`kanban-card-badge${isOverdue(task) ? ' overdue' : ''}`}>
                    <Icon name="clock" size={11} /> Due {new Date(task.dueAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
              <div className="kanban-card-actions">
                <button
                  title="Mark complete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleComplete(task); }}
                ><Icon name="check" size={13} /></button>
                <button
                  title="View"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/tasks/${task.id}`); }}
                ><Icon name="eye" size={13} /></button>
                <button
                  title="Edit"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormState({ task }); }}
                ><Icon name="edit" size={13} /></button>
                <button
                  className="danger"
                  title="Delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(task); }}
                ><Icon name="trash" size={13} /></button>
              </div>
            </>
          );
        }}
      />

      {formState && (
        <TaskForm
          task={formState.task}
          defaultStatus={formState.defaultStatus}
          onClose={() => setFormState(null)}
          onSaved={(saved) => {
            setFormState(null);
            setTasks((ts) => (ts.some((t) => t.id === saved.id) ? ts.map((t) => (t.id === saved.id ? saved : t)) : [...ts, saved]));
            toast.success(formState.task ? 'Task updated' : 'Task created');
          }}
        />
      )}
    </div>
  );
}
