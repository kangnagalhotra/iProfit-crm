import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { Account, AccountStage } from '../api/types';
import { listAccounts, updateAccount, deleteAccount } from '../api/accounts';
import { listStages, createStage } from '../api/stages';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { CompanyForm } from './CompanyForm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

async function loadAllAccounts(): Promise<Account[]> {
  let page = 1;
  let all: Account[] = [];
  for (;;) {
    const data = await listAccounts({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function formatRevenue(value?: string) {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function CompaniesKanban() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManageStages = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stages, setStages] = useState<AccountStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [formState, setFormState] = useState<{ account?: Account; defaultStageId?: string } | null>(null);

  useEffect(() => {
    Promise.all([loadAllAccounts(), listStages('account_stages')])
      .then(([accountRows, stageRes]) => { setAccounts(accountRows); setStages(stageRes as AccountStage[]); })
      .finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((accountId: string, _from: string, toStageId: string) => {
    const prev = accounts;
    setAccounts((as) => as.map((a) => (a.id === accountId ? { ...a, stage: stages.find((s) => s.id === toStageId)! } : a)));
    setError('');
    updateAccount(accountId, { stageId: toStageId }).catch((e) => {
      setAccounts(prev);
      setError(e.message ?? 'Could not update company stage');
    });
  }, [accounts, stages]);

  async function handleDelete(account: Account) {
    const ok = await confirm(`Delete "${account.name}"? This cannot be undone.`, { title: 'Delete company' });
    if (!ok) return;
    try {
      await deleteAccount(account.id);
      setAccounts((as) => as.filter((a) => a.id !== account.id));
      toast.success('Company deleted');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not delete company');
    }
  }

  async function addStage() {
    const name = newStageName.trim();
    if (!name) { setAddingStage(false); return; }
    try {
      const data = await createStage('account_stages', { name, color: '#6B7280' });
      setStages((s) => [...s, data as AccountStage]);
      toast.success(`Added stage "${name}"`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add stage');
    } finally {
      setNewStageName('');
      setAddingStage(false);
    }
  }

  if (loading) return <p>Loading…</p>;

  const stageIds = stages.map((s) => s.id);
  const columns: KanbanColumn<Account>[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.name,
    items: accounts.filter((a) => a.stage.id === stage.id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(account) => account.id}
        onDrop={handleDrop}
        renderColumnHeader={(col) => {
          const stage = stages.find((s) => s.id === col.id)!;
          return (
            <StageColumnHeader
              stage={stage}
              count={col.items.length}
              editable={canManageStages}
              table="account_stages"
              allStageIds={stageIds}
              myIndex={stageIds.indexOf(stage.id)}
              onChanged={(updated) => setStages((s) => s.map((st) => (st.id === updated.id ? updated : st)))}
              onDeleted={(id) => setStages((s) => s.filter((st) => st.id !== id))}
              onReordered={setStages}
            />
          );
        }}
        renderColumnActions={(col) => (
          <button className="kanban-add-btn" onClick={() => setFormState({ defaultStageId: col.id })}>+ Add company</button>
        )}
        emptyState={(col) => (
          <div className="kanban-empty">
            <div className="icon">📭</div>
            <p>No companies in this stage</p>
            <button className="btn secondary" onClick={() => setFormState({ defaultStageId: col.id })}>+ Add company</button>
          </div>
        )}
        extraColumn={canManageStages ? (
          <div className="add-stage-col">
            {addingStage ? (
              <input
                autoFocus
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onBlur={addStage}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, width: '100%' }}
              />
            ) : (
              <button onClick={() => setAddingStage(true)}>+ Add stage</button>
            )}
          </div>
        ) : undefined}
        renderCard={(account) => (
          <>
            <Link to={`/companies/${account.id}`}>
              <div className="kanban-card-title">{account.name}</div>
              {account.industry && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{account.industry}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                {formatRevenue(account.annualRevenue) ? <span className="chip">{formatRevenue(account.annualRevenue)}</span> : <span />}
                {account.owner && <div className="avatar avatar-sm" title={account.owner.fullName}>{initials(account.owner.fullName)}</div>}
              </div>
              <div className="kanban-card-footer">
                <span className="kanban-card-badge">🕐 Updated {new Date(account.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
            <div className="kanban-card-actions">
              <button
                title="View"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/companies/${account.id}`); }}
              >👁</button>
              <button
                title="Edit"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFormState({ account }); }}
              >✎</button>
              <button
                className="danger"
                title="Delete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(account); }}
              >🗑</button>
            </div>
          </>
        )}
      />

      {formState && (
        <CompanyForm
          account={formState.account}
          defaultStageId={formState.defaultStageId}
          onClose={() => setFormState(null)}
          onSaved={(saved) => {
            setFormState(null);
            setAccounts((as) => (as.some((a) => a.id === saved.id) ? as.map((a) => (a.id === saved.id ? saved : a)) : [...as, saved]));
            toast.success(formState.account ? 'Company updated' : 'Company created');
          }}
        />
      )}
    </div>
  );
}
