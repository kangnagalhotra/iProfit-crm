import { useEffect, useState } from 'react';
import type { Account } from '../api/types';
import { listAccounts, mergeAccounts } from '../api/accounts';
import { SearchSelect } from './SearchSelect';
import type { SearchSelectOption } from './SearchSelect';

export function MergeCompanyModal({
  source, onClose, onMerged,
}: {
  source: Account;
  onClose: () => void;
  onMerged: (targetId: string) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listAccounts({ pageSize: 100 }).then((res) => setAccounts(res.data.filter((a) => a.id !== source.id)));
  }, [source.id]);

  const options: SearchSelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name, sublabel: a.domain }));

  async function submit() {
    if (!targetId) return;
    setSaving(true); setError('');
    try {
      await mergeAccounts(source.id, targetId);
      onMerged(targetId);
    } catch (e: any) {
      setError(e.message ?? 'Could not merge companies');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Merge company</h3>
        <p className="helper-text" style={{ marginTop: 0 }}>
          Moves every lead, contact, deal, task, activity, and support ticket from
          <strong> {source.name}</strong> onto the company you pick below, then deletes {source.name}. This cannot be undone.
        </p>
        <div className="field">
          <label>Merge into…</label>
          <SearchSelect options={options} value={targetId} onChange={setTargetId} placeholder="Search company…" />
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={submit} disabled={saving || !targetId}>
            {saving ? 'Merging…' : 'Merge'}
          </button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
