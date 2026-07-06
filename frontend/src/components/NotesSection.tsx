import { useEffect, useState } from 'react';
import type { Activity } from '../api/types';
import {
  listActivities, createActivity, updateActivity, deleteActivity,
} from '../api/activities';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const textareaStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
};

export function NotesSection({
  leadId, accountId, opportunityId,
}: { leadId?: string; accountId?: string; opportunityId?: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const params = { leadId, accountId, opportunityId };
  const canModerate = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';

  function load() {
    setLoading(true);
    listActivities(params)
      .then((data) => setNotes(data.filter((a) => a.type === 'NOTE')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [leadId, accountId, opportunityId]);

  async function addNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      await createActivity({ type: 'NOTE', body, ...params });
      setDraft('');
      load();
      toast.success('Note added');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add note');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    setEditingId(null);
    if (!body) return;
    try {
      await updateActivity(id, body);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update note');
    }
  }

  async function deleteNote(id: string) {
    const ok = await confirm('Delete this note?', { title: 'Delete note' });
    if (!ok) return;
    try {
      await deleteActivity(id);
      setNotes((n) => n.filter((x) => x.id !== id));
      toast.success('Note deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete note');
    }
  }

  return (
    <div className="card" id="notes-section" style={{ maxWidth: 640, marginTop: 20 }}>
      <h3 style={{ marginTop: 0 }}>Notes</h3>
      <div className="field">
        <textarea
          rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note…" style={textareaStyle}
        />
      </div>
      <button className="btn" onClick={addNote} disabled={saving || !draft.trim()}>
        {saving ? 'Saving…' : 'Add note'}
      </button>

      <div style={{ marginTop: 18 }}>
        {loading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : notes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No notes yet.</p>
        ) : notes.map((note) => {
          const isOwn = note.creator.id === user?.id;
          return (
            <div key={note.id} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                {note.creator.fullName} · {new Date(note.occurredAt).toLocaleString()}
              </div>
              {editingId === note.id ? (
                <>
                  <textarea rows={2} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} style={textareaStyle} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="btn" onClick={() => saveEdit(note.id)}>Save</button>
                    <button className="btn secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{note.body}</div>
                  {(isOwn || canModerate) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      {isOwn && (
                        <button className="copy-btn" onClick={() => { setEditingId(note.id); setEditDraft(note.body); }}>Edit</button>
                      )}
                      <button className="copy-btn" onClick={() => deleteNote(note.id)}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
