import { useEffect, useState } from 'react';
import type { ActivityType, Task, User } from '../api/types';
import { createTask } from '../api/tasks';
import { listUsers } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { downloadMeetingInvite } from '../utils/ics';

const DURATIONS = [15, 30, 45, 60, 90];
const CALL_OUTCOMES = ['Connected', 'No answer', 'Left voicemail'];

const TYPE_LABEL: Record<ActivityType, string> = {
  CALL: 'call', EMAIL: 'email', MEETING: 'meeting', NOTE: 'note', FIELD_UPDATE: 'update',
};

function defaultScheduleDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// MEETING is a newer task_type enum value (see phase-k patch) that isn't
// guaranteed to be applied everywhere — fall back to TODO so scheduling/
// logging still works rather than throwing a raw enum error at the rep.
async function createTaskWithMeetingFallback(payload: Record<string, any>): Promise<Task> {
  try {
    return await createTask(payload);
  } catch (e: any) {
    if (payload.type === 'MEETING' && String(e.message ?? '').toLowerCase().includes('invalid input value for enum')) {
      return createTask({ ...payload, type: 'TODO' });
    }
    throw e;
  }
}

const textareaStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
};

// One form behind all the Call/Email/Meeting quick-action buttons — creates
// exactly one tasks row per submit (a completed log entry, an open follow-up
// reminder, or both), instead of the old pattern of a task and a separate
// activity log entry for the same action. Engagement scoring / stage
// automation keep working because a DB trigger (phase-s) auto-derives a
// linked activity whenever a Call/Email/Meeting task is completed — nothing
// here needs to write to `activities` directly.
export function QuickTaskModal({
  type, leadId, accountId, opportunityId, contactId, defaultTitle,
  contactName, contactEmail, contactPhone, initialNotes, onClose, onSaved,
}: {
  type: 'CALL' | 'EMAIL' | 'MEETING';
  leadId?: string; accountId?: string; opportunityId?: string; contactId?: string;
  defaultTitle: string;
  contactName?: string; contactEmail?: string; contactPhone?: string;
  initialNotes?: string;
  onClose: () => void;
  onSaved: (task: Task, activityType: ActivityType) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'happened' | 'schedule'>('happened');
  const [title, setTitle] = useState(defaultTitle);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [date, setDate] = useState(defaultScheduleDate());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [addFollowUp, setAddFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(defaultScheduleDate());
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers); }, []);

  const label = TYPE_LABEL[type];
  const contactLink = type === 'EMAIL' && contactEmail
    ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
    : type === 'CALL' && contactPhone
      ? <a href={`tel:${contactPhone}`}>{contactPhone}</a>
      : null;

  function combine(d: string, t: string): Date | null {
    const dt = new Date(`${d}T${t}:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  async function submit() {
    if (!title.trim()) return;
    if (mode === 'happened' && !notes.trim()) return;
    if (mode === 'schedule' && (!date || !time)) return;
    setError(''); setSaving(true);
    try {
      let task: Task;
      const base = {
        title: title.trim(), type, assigneeId: assigneeId || undefined,
        contactId, leadId, accountId, opportunityId, createdVia: 'QUICK_ACTION',
      };

      if (mode === 'happened') {
        const now = new Date();
        task = await createTaskWithMeetingFallback({
          ...base, status: 'COMPLETED', notes: notes.trim(), dueAt: now.toISOString(),
        });
        if (addFollowUp) {
          const followUp = combine(followUpDate, followUpTime);
          if (followUp) {
            await createTaskWithMeetingFallback({
              ...base, title: `Follow-up: ${title.trim()}`, status: 'NOT_STARTED',
              dueAt: followUp.toISOString(), reminderAt: new Date(followUp.getTime() - 15 * 60000).toISOString(),
            });
          }
        }
      } else {
        const start = combine(date, time);
        if (!start) throw new Error('Invalid date/time');
        task = await createTaskWithMeetingFallback({
          ...base, status: 'NOT_STARTED', notes: notes.trim() || undefined,
          dueAt: start.toISOString(), reminderAt: new Date(start.getTime() - 15 * 60000).toISOString(),
        });
        if (type === 'MEETING') {
          downloadMeetingInvite({
            title: title.trim(),
            start,
            durationMinutes: duration,
            description: notes.trim() || undefined,
            organizerEmail: user?.email,
            attendee: contactEmail ? { name: contactName, email: contactEmail } : undefined,
          });
        }
      }
      onSaved(task, type);
    } catch (e: any) {
      setError(e.message ?? `Could not log the ${label}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Log {label}</h3>
        {contactLink && (
          <div className="helper-text" style={{ marginTop: -8, marginBottom: 10 }}>
            {type === 'EMAIL' ? 'Email' : 'Call'} {contactLink} directly, then log it below.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`btn ${mode === 'happened' ? '' : 'secondary'} btn-icon`}
            onClick={() => setMode('happened')}
          >
            This already happened
          </button>
          <button
            type="button"
            className={`btn ${mode === 'schedule' ? '' : 'secondary'} btn-icon`}
            onClick={() => setMode('schedule')}
          >
            Schedule for later
          </button>
        </div>

        <div className="field"><label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} /></div>

        {mode === 'schedule' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            {type === 'MEETING' && (
              <div className="field" style={{ flex: 1 }}><label>Duration</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>{mode === 'happened' ? 'Outcome / notes*' : 'Notes (optional)'}</label>
          {mode === 'happened' && type === 'CALL' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              {CALL_OUTCOMES.map((o) => (
                <button key={o} type="button" className="btn secondary" style={{ padding: '4px 10px', fontSize: 13 }}
                  onClick={() => setNotes(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={textareaStyle} />
        </div>

        <div className="field"><label>Owner</label>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Assign to me</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>

        {mode === 'happened' && (
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={addFollowUp} onChange={(e) => setAddFollowUp(e.target.checked)} />
              Add a follow-up?
            </label>
            {addFollowUp && (
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Follow-up date</label>
                  <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Time</label>
                  <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} /></div>
              </div>
            )}
          </div>
        )}

        {mode === 'schedule' && type === 'MEETING' && (
          <div className="helper-text" style={{ marginBottom: 4 }}>
            This also downloads a calendar invite (.ics) you can open in Outlook or Google Calendar.
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            className="btn"
            onClick={submit}
            disabled={saving || !title.trim() || (mode === 'happened' ? !notes.trim() : !date || !time)}
          >
            {saving ? 'Saving…' : mode === 'happened' ? 'Log it' : 'Schedule'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
