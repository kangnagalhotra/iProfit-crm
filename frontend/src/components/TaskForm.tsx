import { useEffect, useState } from 'react';
import type {
  Account, Lead, Opportunity, Task, TaskPriority, TaskStatus, TaskType, User,
} from '../api/types';
import { createTask, updateTask } from '../api/tasks';
import { listUsers } from '../api/users';
import { listLeads } from '../api/leads';
import { listAccounts } from '../api/accounts';
import { listDeals } from '../api/deals';

const TASK_TYPES: TaskType[] = ['TODO', 'CALL', 'EMAIL', 'FOLLOW_UP'];
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'];
type ReminderOffset = 'none' | 'at_due' | '15_min' | '1_hour' | '1_day';
const REMINDER_OFFSETS: { value: ReminderOffset; label: string }[] = [
  { value: 'none', label: 'No reminder' },
  { value: 'at_due', label: 'At due time' },
  { value: '15_min', label: '15 minutes before' },
  { value: '1_hour', label: '1 hour before' },
  { value: '1_day', label: '1 day before' },
];
type RelatedModule = '' | 'lead' | 'account' | 'opportunity';

function computeReminderAt(dueAt: string, offset: ReminderOffset): string | undefined {
  if (offset === 'none' || !dueAt) return undefined;
  const due = new Date(dueAt);
  if (offset === '15_min') due.setMinutes(due.getMinutes() - 15);
  else if (offset === '1_hour') due.setHours(due.getHours() - 1);
  else if (offset === '1_day') due.setDate(due.getDate() - 1);
  return due.toISOString();
}

export function TaskForm({
  task, leadId, accountId, opportunityId, defaultStatus, onClose, onSaved,
}: {
  task?: Task;
  leadId?: string;
  accountId?: string;
  opportunityId?: string;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const isEdit = !!task;
  const isScoped = !!(leadId || accountId || opportunityId);

  const initialModule: RelatedModule = task?.lead ? 'lead' : task?.account ? 'account' : task?.opportunity ? 'opportunity' : '';
  const initialRecordId = task?.lead?.id ?? task?.account?.id ?? task?.opportunity?.id ?? '';

  const [form, setForm] = useState({
    title: task?.title ?? '',
    type: (task?.type ?? 'TODO') as TaskType,
    priority: (task?.priority ?? 'MEDIUM') as TaskPriority,
    status: (task?.status ?? defaultStatus ?? 'NOT_STARTED') as TaskStatus,
    dueAt: task?.dueAt ? task.dueAt.slice(0, 10) : '',
    notes: task?.notes ?? '',
    assigneeId: task?.assignee?.id ?? '',
  });
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>('none');
  const [relatedModule, setRelatedModule] = useState<RelatedModule>(initialModule);
  const [relatedRecordId, setRelatedRecordId] = useState(initialRecordId);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listUsers().then(setUsers);
    if (!isScoped) {
      Promise.all([
        listLeads({ pageSize: 100 }),
        listAccounts({ pageSize: 100 }),
        listDeals({ pageSize: 100 }),
      ]).then(([leadRes, accountRes, dealRes]) => {
        setLeads(leadRes.data);
        setAccounts(accountRes.data);
        setDeals(dealRes.data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function recordOptions() {
    if (relatedModule === 'lead') return leads.map((l) => ({ id: l.id, label: l.leadName || [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email || 'Untitled lead' }));
    if (relatedModule === 'account') return accounts.map((a) => ({ id: a.id, label: a.name }));
    if (relatedModule === 'opportunity') return deals.map((d) => ({ id: d.id, label: d.name }));
    return [];
  }

  async function submit() {
    setError(''); setSaving(true);
    try {
      const relation = isScoped
        ? { leadId, accountId, opportunityId }
        : {
          leadId: relatedModule === 'lead' ? relatedRecordId : undefined,
          accountId: relatedModule === 'account' ? relatedRecordId : undefined,
          opportunityId: relatedModule === 'opportunity' ? relatedRecordId : undefined,
        };
      const payload: Record<string, any> = {
        ...form,
        ...relation,
        reminderAt: computeReminderAt(form.dueAt, reminderOffset),
      };
      Object.keys(payload).forEach((k) => { if (payload[k] === '' || payload[k] === undefined) delete payload[k]; });
      const data = isEdit
        ? await updateTask(task!.id, payload)
        : await createTask(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.message ?? 'Could not save task');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = form.title.trim() && form.dueAt && (isScoped || !relatedModule || relatedRecordId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit task' : 'Create task'}</h3>
        <div className="field"><label>Task name</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field"><label>Task type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value as TaskType)}>
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={form.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Status</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="field"><label>Due date</label>
          <input type="date" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} /></div>
        <div className="field"><label>Reminder</label>
          <select value={reminderOffset} onChange={(e) => setReminderOffset(e.target.value as ReminderOffset)}>
            {REMINDER_OFFSETS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Owner</label>
          <select value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">Assign to me</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        {!isScoped && (
          <>
            <div className="field"><label>Related module</label>
              <select value={relatedModule} onChange={(e) => { setRelatedModule(e.target.value as RelatedModule); setRelatedRecordId(''); }}>
                <option value="">None</option>
                <option value="lead">Lead</option>
                <option value="account">Company</option>
                <option value="opportunity">Deal</option>
              </select>
            </div>
            {relatedModule && (
              <div className="field"><label>Related record</label>
                <select value={relatedRecordId} onChange={(e) => setRelatedRecordId(e.target.value)}>
                  <option value="">—</option>
                  {recordOptions().map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        <div className="field"><label>Description</label>
          <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
        </div>

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !canSubmit}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
