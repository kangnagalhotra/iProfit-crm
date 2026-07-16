import { useEffect, useState } from 'react';
import type { LeadSourceOption } from '../api/types';
import {
  listLeadSourceOptions, createLeadSourceOption, updateLeadSourceOption, deleteLeadSourceOption, reorderLeadSourceOptions,
} from '../api/leadSourceOptions';
import { SkeletonTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

export function SettingsLeadSources() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [options, setOptions] = useState<LeadSourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    listLeadSourceOptions(true).then(setOptions).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addOption() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const created = await createLeadSourceOption(newName.trim());
      setOptions((os) => [...os, created]);
      setNewName('');
      toast.success('Lead source added');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add lead source');
    } finally {
      setSaving(false);
    }
  }

  async function saveRename(id: string) {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      const updated = await updateLeadSourceOption(id, { name: editingName.trim() });
      setOptions((os) => os.map((o) => (o.id === id ? updated : o)));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not rename lead source');
    } finally {
      setEditingId(null);
    }
  }

  async function toggleActive(option: LeadSourceOption) {
    try {
      const updated = await updateLeadSourceOption(option.id, { isActive: !option.isActive });
      setOptions((os) => os.map((o) => (o.id === option.id ? updated : o)));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update lead source');
    }
  }

  async function move(option: LeadSourceOption, dir: -1 | 1) {
    const sorted = [...options].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((o) => o.id === option.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    try {
      const updated = await reorderLeadSourceOptions(sorted.map((o) => o.id));
      setOptions(updated);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not reorder');
    }
  }

  async function removeOption(option: LeadSourceOption) {
    const ok = await confirm(
      `Delete "${option.name}"? Leads already using this source keep it on their record, but it won't be selectable for new leads.`,
      { title: 'Delete lead source' },
    );
    if (!ok) return;
    try {
      await deleteLeadSourceOption(option.id);
      setOptions((os) => os.filter((o) => o.id !== option.id));
      toast.success('Lead source deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete — it may still be in use by existing leads. Try deactivating it instead.');
    }
  }

  if (!canManage) {
    return <p>Lead source settings are only available to admins and sales managers.</p>;
  }

  const sorted = [...options].sort((a, b) => a.order - b.order);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Lead Sources</h2>
      <p className="helper-text" style={{ maxWidth: 640 }}>
        The list of channels reps can pick from on a lead's Source field. Add, rename, reorder, or
        deactivate values here — deactivating keeps the label on any lead already using it but hides
        it from the dropdown for new leads.
      </p>

      {loading ? <SkeletonTable columns={3} /> : (
        <table style={{ maxWidth: 560 }}>
          <thead><tr><th>Name</th><th style={{ width: 90 }}>Active</th><th style={{ width: 140 }} /></tr></thead>
          <tbody>
            {sorted.map((o, i) => (
              <tr key={o.id} style={o.isActive ? undefined : { opacity: 0.55 }}>
                <td>
                  {editingId === o.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => saveRename(o.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  ) : (
                    <span onClick={() => { setEditingId(o.id); setEditingName(o.name); }} style={{ cursor: 'text' }}>{o.name}</span>
                  )}
                </td>
                <td>
                  <input type="checkbox" checked={o.isActive} onChange={() => toggleActive(o)} />
                </td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn secondary btn-icon" onClick={() => move(o, -1)} disabled={i === 0} title="Move up">
                    <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevronDown" size={13} /></span>
                  </button>
                  <button className="btn secondary btn-icon" onClick={() => move(o, 1)} disabled={i === sorted.length - 1} title="Move down">
                    <Icon name="chevronDown" size={13} />
                  </button>
                  <button className="btn secondary btn-icon" onClick={() => removeOption(o)} title="Delete">
                    <Icon name="trash" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="card" style={{ marginTop: 18, maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Add lead source</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Trade Show"
            onKeyDown={(e) => { if (e.key === 'Enter') addOption(); }}
          />
          <button className="btn" onClick={addOption} disabled={saving || !newName.trim()}>Add</button>
        </div>
      </div>
    </div>
  );
}
