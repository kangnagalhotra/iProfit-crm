import { useEffect, useState } from 'react';
import type { ActivityType, DealStage, StageAutomationRule } from '../api/types';
import {
  listStageRules, createStageRule, updateStageRule, deleteStageRule,
} from '../api/stageRules';
import { RULE_FIELD_OPTIONS } from '../api/stageRules';
import { listStages } from '../api/stages';
import { SkeletonTable } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'CALL', label: 'Call logged' },
  { value: 'MEETING', label: 'Meeting logged' },
  { value: 'EMAIL', label: 'Email logged' },
  { value: 'NOTE', label: 'Note logged' },
];

export function SettingsAutomation() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [rules, setRules] = useState<StageAutomationRule[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    fromStageId: '', toStageId: '', requiresActivityType: 'CALL' as ActivityType, requiresField: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([listStageRules(), listStages('deal_stages')])
      .then(([ruleRes, stageRes]) => { setRules(ruleRes); setStages(stageRes as DealStage[]); })
      .finally(() => setLoading(false));
  }, []);

  async function addRule() {
    if (!form.fromStageId || !form.toStageId) { toast.error('Pick both stages.'); return; }
    if (form.fromStageId === form.toStageId) { toast.error('From and To stages must differ.'); return; }
    setSaving(true);
    try {
      const created = await createStageRule({
        fromStageId: form.fromStageId,
        toStageId: form.toStageId,
        requiresActivityType: form.requiresActivityType,
        requiresField: form.requiresField || undefined,
      });
      setRules((rs) => [...rs, created]);
      setForm({ fromStageId: '', toStageId: '', requiresActivityType: 'CALL', requiresField: '' });
      toast.success('Automation rule created');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not create rule');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: StageAutomationRule) {
    try {
      const updated = await updateStageRule(rule.id, { enabled: !rule.enabled });
      setRules((rs) => rs.map((r) => (r.id === rule.id ? updated : r)));
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update rule');
    }
  }

  async function removeRule(rule: StageAutomationRule) {
    const ok = await confirm(`Delete the ${rule.fromStage.name} → ${rule.toStage.name} rule?`, { title: 'Delete rule' });
    if (!ok) return;
    try {
      await deleteStageRule(rule.id);
      setRules((rs) => rs.filter((r) => r.id !== rule.id));
      toast.success('Rule deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete rule');
    }
  }

  if (!canManage) {
    return <p>Stage automation settings are only available to admins and sales managers.</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Stage Automation</h2>
      <p className="helper-text" style={{ maxWidth: 640 }}>
        When an activity of the chosen type is logged on a deal sitting in the "From" stage (and the optional
        field condition is met), the deal advances to the "To" stage automatically. The rep always sees a
        toast with an Undo option — automation is never silent — and manual stage changes remain available.
      </p>

      {loading ? <SkeletonTable columns={5} /> : (
        <>
          {rules.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No rules configured yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>From stage</th><th>To stage</th><th>Trigger</th><th>Extra condition</th><th>Enabled</th><th /></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={r.enabled ? undefined : { opacity: 0.55 }}>
                    <td>{r.fromStage.name}</td>
                    <td>{r.toStage.name}</td>
                    <td>{ACTIVITY_OPTIONS.find((o) => o.value === r.requiresActivityType)?.label ?? r.requiresActivityType}</td>
                    <td>{r.requiresField ? (RULE_FIELD_OPTIONS.find((o) => o.value === r.requiresField)?.label ?? r.requiresField) : '—'}</td>
                    <td>
                      <input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} />
                    </td>
                    <td><button className="btn secondary" onClick={() => removeRule(r)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="card" style={{ marginTop: 18, maxWidth: 720 }}>
            <h3 style={{ marginTop: 0 }}>Add rule</h3>
            <div className="form-grid-2">
              <div className="field"><label>From stage*</label>
                <select value={form.fromStageId} onChange={(e) => setForm((f) => ({ ...f, fromStageId: e.target.value }))}>
                  <option value="">—</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field"><label>To stage*</label>
                <select value={form.toStageId} onChange={(e) => setForm((f) => ({ ...f, toStageId: e.target.value }))}>
                  <option value="">—</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Trigger activity*</label>
                <select value={form.requiresActivityType} onChange={(e) => setForm((f) => ({ ...f, requiresActivityType: e.target.value as ActivityType }))}>
                  {ACTIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field"><label>Extra condition</label>
                <select value={form.requiresField} onChange={(e) => setForm((f) => ({ ...f, requiresField: e.target.value }))}>
                  <option value="">None</option>
                  {RULE_FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <button className="btn" onClick={addRule} disabled={saving}>{saving ? 'Saving…' : 'Add rule'}</button>
          </div>
        </>
      )}
    </div>
  );
}
