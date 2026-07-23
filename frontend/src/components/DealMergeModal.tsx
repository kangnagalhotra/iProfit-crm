import { useEffect, useState } from 'react';
import type { DealStage, Opportunity } from '../api/types';
import { listDeals, mergeDeals } from '../api/deals';
import { listStages } from '../api/stages';
import { SearchSelect } from './SearchSelect';

function dealLabel(d: Opportunity) {
  return `${d.name} — ${d.stage.name}${d.amount ? ` — $${Number(d.amount).toLocaleString()}` : ''}`;
}

// Section C — "Merge with another deal at this company", always available
// regardless of stage/age (unlike the automatic duplicate check in Section
// B, which only fires at Lead-creation time). Two steps: pick the other
// open deal, then resolve which side wins on stage/value/owner.
export function DealMergeModal({
  deal, onClose, onMerged,
}: { deal: Opportunity; onClose: () => void; onMerged: (survivorId: string) => void }) {
  const [candidates, setCandidates] = useState<Opportunity[]>([]);
  const [targetId, setTargetId] = useState('');
  const [stages, setStages] = useState<DealStage[]>([]);
  const [survivorId, setSurvivorId] = useState(deal.id);
  const [stageId, setStageId] = useState(deal.stage.id);
  const [valueChoice, setValueChoice] = useState<'this' | 'other' | 'combine' | 'custom'>('this');
  const [customAmount, setCustomAmount] = useState('');
  const [ownerId, setOwnerId] = useState(deal.owner?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!deal.account?.id) return;
    listDeals({ accountId: deal.account.id, includeArchived: false, pageSize: 100 }).then((res) => {
      setCandidates(res.data.filter((d) => d.id !== deal.id && !d.stage.isClosedWon && !d.stage.isClosedLost));
    });
    listStages('deal_stages').then((res) => setStages(res as DealStage[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = candidates.find((d) => d.id === targetId);

  useEffect(() => {
    if (!target) return;
    setSurvivorId(deal.id);
    setStageId(deal.stage.id);
    setValueChoice('this');
    setOwnerId(deal.owner?.id ?? '');
  }, [target, deal]);

  const survivor = survivorId === deal.id ? deal : target;
  const loser = survivorId === deal.id ? target : deal;

  function resolvedAmount(): string | undefined {
    if (!target) return undefined;
    if (valueChoice === 'this') return deal.amount;
    if (valueChoice === 'other') return target.amount;
    if (valueChoice === 'combine') return String((Number(deal.amount) || 0) + (Number(target.amount) || 0));
    return customAmount || undefined;
  }

  async function submit() {
    if (!target || !ownerId) return;
    setSaving(true); setError('');
    try {
      const result = await mergeDeals(deal.id, target.id, {
        survivorId, stageId, amount: resolvedAmount(), ownerId,
      });
      onMerged(result.id);
    } catch (e: any) {
      setError(e.message ?? 'Could not merge deals');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Merge with another deal</h3>
        <p className="helper-text" style={{ marginTop: 0 }}>
          Combines two deals at the same company into one. The losing deal is archived (never deleted) and stays viewable for audit.
        </p>

        <div className="field">
          <label>Other deal at this company</label>
          <SearchSelect
            options={candidates.map((d) => ({ value: d.id, label: dealLabel(d) }))}
            value={targetId}
            onChange={setTargetId}
            placeholder="Search open deals…"
          />
        </div>

        {target && survivor && loser && (
          <>
            <div className="field">
              <label>Which deal survives?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={survivorId === deal.id} onChange={() => setSurvivorId(deal.id)} />
                  {deal.name} (this deal)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={survivorId === target.id} onChange={() => setSurvivorId(target.id)} />
                  {target.name}
                </label>
              </div>
            </div>

            <div className="field">
              <label>Stage to keep</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Value to keep</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={valueChoice === 'this'} onChange={() => setValueChoice('this')} />
                  {deal.name}&apos;s value {deal.amount ? `($${Number(deal.amount).toLocaleString()})` : '(none)'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={valueChoice === 'other'} onChange={() => setValueChoice('other')} />
                  {target.name}&apos;s value {target.amount ? `($${Number(target.amount).toLocaleString()})` : '(none)'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={valueChoice === 'combine'} onChange={() => setValueChoice('combine')} />
                  Combine (sum of both)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" checked={valueChoice === 'custom'} onChange={() => setValueChoice('custom')} />
                  Custom
                </label>
                {valueChoice === 'custom' && (
                  <input type="number" min="0" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="0.00" style={{ marginLeft: 26, width: 160 }} />
                )}
              </div>
            </div>

            <div className="field">
              <label>Owner who remains</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deal.owner && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" checked={ownerId === deal.owner.id} onChange={() => setOwnerId(deal.owner!.id)} />
                    {deal.owner.fullName} ({deal.name})
                  </label>
                )}
                {target.owner && target.owner.id !== deal.owner?.id && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" checked={ownerId === target.owner.id} onChange={() => setOwnerId(target.owner!.id)} />
                    {target.owner.fullName} ({target.name})
                  </label>
                )}
              </div>
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !target || !ownerId}>
            {saving ? 'Merging…' : 'Merge deals'}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
