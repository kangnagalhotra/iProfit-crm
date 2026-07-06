import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Task } from '../api/types';
import { getTask, completeTask } from '../api/tasks';
import { createActivity } from '../api/activities';
import { TaskForm } from '../components/TaskForm';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { useToast } from '../context/ToastContext';

const textareaStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
    </div>
  );
}

function priorityColor(p: Task['priority']) {
  return p === 'CRITICAL' ? '#991B1B' : p === 'HIGH' ? '#DC2626' : p === 'MEDIUM' ? '#F59E0B' : '#6B7280';
}

function statusColor(s: Task['status']) {
  return s === 'COMPLETED' ? '#16A34A' : s === 'CANCELLED' ? '#DC2626' : s === 'WAITING' ? '#F59E0B' : s === 'IN_PROGRESS' ? '#0EA5E9' : '#6B7280';
}

function relatedRecord(task: Task) {
  if (task.lead) {
    const name = [task.lead.firstName, task.lead.lastName].filter(Boolean).join(' ') || task.lead.email || 'Lead';
    return { label: `${name} (Lead)`, to: `/leads/${task.lead.id}` };
  }
  if (task.account) return { label: `${task.account.name} (Company)`, to: `/companies/${task.account.id}` };
  if (task.opportunity) return { label: `${task.opportunity.name} (Deal)`, to: `/deals/${task.opportunity.id}` };
  return null;
}

export function TaskDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [activityKey, setActivityKey] = useState(0);

  function load() {
    if (!id) return;
    getTask(id).then(setTask).catch(() => {});
  }

  useEffect(() => { load(); }, [id]);

  if (!task) return <p>Loading…</p>;

  const related = relatedRecord(task);

  return (
    <div>
      <p><Link to="/tasks">← Tasks</Link></p>

      <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="detail-header">
          <div className="avatar">{(task.assignee?.fullName ?? '?')[0].toUpperCase()}</div>
          <div>
            <h2 style={{ textDecoration: task.status === 'COMPLETED' ? 'line-through' : undefined }}>{task.title}</h2>
            <span className="chip" style={{ background: statusColor(task.status) + '22', color: statusColor(task.status) }}>{task.status.replace('_', ' ')}</span>{' '}
            <span className="chip" style={{ background: priorityColor(task.priority) + '22', color: priorityColor(task.priority) }}>{task.priority}</span>
          </div>
        </div>

        <div className="quick-actions">
          <button className="quick-action" onClick={() => setEditing(true)}>
            <span className="icon">✎</span>Edit
          </button>
          <button className="quick-action" onClick={() => setAddingUpdate(true)}>
            <span className="icon">📝</span>Add Update
          </button>
          {task.status !== 'COMPLETED' && (
            <button className="quick-action" onClick={async () => { await completeTask(task.id); load(); setActivityKey((k) => k + 1); toast.success('Task marked complete'); }}>
              <span className="icon">☑</span>Complete
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Task details</h3>
        <div className="key-info">
          <Row label="Type" value={task.type.replace('_', ' ')} />
          <Row label="Owner" value={task.assignee?.fullName} />
          <Row label="Due date" value={new Date(task.dueAt).toLocaleDateString()} />
          <Row label="Reminder" value={task.reminderAt ? new Date(task.reminderAt).toLocaleString() : undefined} />
          <Row label="Related record" value={related ? <Link to={related.to}>{related.label}</Link> : undefined} />
        </div>
        {task.notes && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <div className="label" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{task.notes}</div>
          </div>
        )}
      </div>

      <ActivityTimeline key={activityKey} taskId={task.id} showNotes />

      {editing && (
        <TaskForm
          task={task}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); setActivityKey((k) => k + 1); toast.success('Task updated'); }}
        />
      )}

      {addingUpdate && (
        <AddUpdateModal
          taskId={task.id}
          onClose={() => setAddingUpdate(false)}
          onSaved={() => { setAddingUpdate(false); setActivityKey((k) => k + 1); toast.success('Update added'); }}
        />
      )}
    </div>
  );
}

function AddUpdateModal({
  taskId, onClose, onSaved,
}: { taskId: string; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true); setError('');
    try {
      await createActivity({ type: 'NOTE', taskId, body: trimmed });
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Could not add update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add update</h3>
        <div className="field">
          <label>Update description</label>
          <textarea rows={4} autoFocus value={body} onChange={(e) => setBody(e.target.value)} style={textareaStyle} />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !body.trim()}>{saving ? 'Saving…' : 'Save'}</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
