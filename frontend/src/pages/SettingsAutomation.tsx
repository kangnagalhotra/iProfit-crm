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

// Plain-language catalog of every automation baked into the CRM, so the whole
// story is visible in one place. These are built-in (triggers/cron in the
// database or fixed client rules) — always on, not configurable here.
const BUILT_IN_AUTOMATIONS: { group: string; items: { when: string; then: string }[] }[] = [
  {
    group: 'Lead progression',
    items: [
      { when: 'A call or email is logged on a lead in "New"', then: 'Lead moves to "Attempted Contact" (toast with Undo)' },
      { when: 'A meeting is logged on a lead in "New" or "Attempted Contact"', then: 'Lead moves to "Contacted" (toast with Undo)' },
      { when: 'A lead is moved to "Qualified"', then: 'Blocked unless ICP Match + Budget + Authority are filled (MQL gate) — qualification is never automated' },
      { when: 'A lead becomes Qualified', then: 'Its owner gets a notification' },
    ],
  },
  {
    group: 'Deals',
    items: [
      { when: 'A deal is created', then: 'Only possible by converting a Qualified lead — direct creation is blocked at the database' },
      { when: 'A deal changes stage', then: 'Probability updates from the stage; stage history is recorded for "days in stage" reporting' },
      { when: 'A deal closes Won', then: 'A Project handover record is created automatically and the company is promoted to Customer' },
      { when: 'A deal closes Lost', then: 'It archives itself automatically' },
      { when: 'A deal sits untouched for 7+ days', then: 'Its owner gets an inactivity alert (daily check)' },
    ],
  },
  {
    group: 'Engagement & scoring',
    items: [
      { when: 'Any call/email/meeting/note is logged', then: 'The lead/deal engagement score (0–100) recalculates instantly' },
      { when: 'Every night at 2:00', then: 'All open scores decay for recency, so cold records sink on their own' },
      { when: 'A meeting is logged anywhere', then: 'A follow-up task is auto-created for 2 days later' },
    ],
  },
  {
    group: 'Post-sale & renewals',
    items: [
      { when: '30 and 7 days before a won deal’s renewal date', then: 'A reminder task + notification go to the deal owner (daily 8:30 check)' },
      { when: 'A renewal date passes with no activity logged', then: 'The owner gets a one-time "renewal overdue — at risk" alert, and the client is flagged At Risk on Client Health' },
      { when: 'A customer account shows no engagement for 180+ days', then: 'Its owner gets a recommendation to mark it Inactive' },
    ],
  },
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
      <h2 style={{ marginTop: 0 }}>Automation</h2>
      <p className="helper-text" style={{ maxWidth: 640 }}>
        Everything the CRM does on its own, in one place. Configurable deal-stage rules are at the top;
        below them is the catalog of built-in automations that are always on.
      </p>

      <h3>Deal stage rules <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(configurable)</span></h3>
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

          <h3 style={{ marginTop: 32 }}>Built-in automations <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>(always on)</span></h3>
          {BUILT_IN_AUTOMATIONS.map((section) => (
            <div className="card" key={section.group} style={{ marginBottom: 14, maxWidth: 860 }}>
              <h4 style={{ marginTop: 0, marginBottom: 10 }}>{section.group}</h4>
              <table>
                <thead>
                  <tr><th style={{ width: '45%' }}>When…</th><th>Then…</th></tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.when}>
                      <td>{item.when}</td>
                      <td>{item.then}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
