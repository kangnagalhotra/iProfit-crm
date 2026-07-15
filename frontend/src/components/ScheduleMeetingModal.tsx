import { useEffect, useState } from 'react';
import type { User } from '../api/types';
import { createTask } from '../api/tasks';
import { createActivity } from '../api/activities';
import { listUsers } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { downloadMeetingInvite } from '../utils/ics';

const DURATIONS = [15, 30, 45, 60, 90];

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// MEETING is a new task_type enum value (see phase-k patch) — if it hasn't
// been applied to the DB yet, fall back to TODO so scheduling still works.
async function createMeetingTask(payload: Record<string, any>) {
  try {
    return await createTask({ ...payload, type: 'MEETING' });
  } catch (e: any) {
    if (String(e.message ?? '').toLowerCase().includes('invalid input value for enum')) {
      return createTask({ ...payload, type: 'TODO' });
    }
    throw e;
  }
}

export function ScheduleMeetingModal({
  leadId, accountId, opportunityId, defaultTitle, attendeeName, attendeeEmail,
  onClose, onScheduled,
}: {
  leadId?: string;
  accountId?: string;
  opportunityId?: string;
  defaultTitle: string;
  attendeeName?: string;
  attendeeEmail?: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [email, setEmail] = useState(attendeeEmail ?? '');
  const [agenda, setAgenda] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { listUsers().then(setUsers); }, []);

  async function submit() {
    if (!title.trim() || !date || !time) return;
    setError(''); setSaving(true);
    try {
      const start = new Date(`${date}T${time}:00`);
      if (Number.isNaN(start.getTime())) throw new Error('Invalid date/time');
      const reminderAt = new Date(start.getTime() - 15 * 60000).toISOString();

      await createMeetingTask({
        title,
        dueAt: start.toISOString(),
        reminderAt,
        notes: agenda || undefined,
        assigneeId: assigneeId || undefined,
        leadId,
        accountId,
        opportunityId,
      });

      const when = start.toLocaleString(undefined, {
        dateStyle: 'medium', timeStyle: 'short',
      });
      await createActivity({
        type: 'MEETING',
        body: `Meeting scheduled: "${title}" on ${when}${email ? ` with ${email}` : ''}${agenda ? ` — ${agenda}` : ''}`,
        leadId,
        accountId,
        opportunityId,
      });

      downloadMeetingInvite({
        title,
        start,
        durationMinutes: duration,
        description: agenda || undefined,
        organizerEmail: user?.email,
        attendee: email ? { name: attendeeName, email } : undefined,
      });

      onScheduled();
    } catch (e: any) {
      setError(e.message ?? 'Could not schedule meeting');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Schedule meeting</h3>
        <div className="field"><label>Meeting title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>Duration</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>Attendee email</label>
          <input type="email" placeholder="customer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Owner</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Assign to me</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="field"><label>Agenda (optional)</label>
          <textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)}
            style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }} />
        </div>
        <div className="helper-text" style={{ marginBottom: 4 }}>
          This creates a reminder task and downloads a calendar invite (.ics) you can open in Outlook or Google Calendar.
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !title.trim() || !date || !time}>
            {saving ? 'Scheduling…' : 'Schedule & Download Invite'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
