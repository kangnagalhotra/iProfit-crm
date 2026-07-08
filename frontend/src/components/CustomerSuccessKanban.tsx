import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { Account, CustomerStage, Opportunity } from '../api/types';
import { listAccounts, updateAccount } from '../api/accounts';
import { listDeals } from '../api/deals';
import { listStages, createStage } from '../api/stages';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';
import { StageColumnHeader } from './kanban/StageColumnHeader';
import { Icon } from './Icon';
import { SkeletonKanban } from './Skeleton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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

async function loadAllDeals(): Promise<Opportunity[]> {
  let page = 1;
  let all: Opportunity[] = [];
  for (;;) {
    const data = await listDeals({ page, pageSize: 100 });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

const RENEWAL_WINDOW_DAYS = 60;

export function CustomerSuccessKanban() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const canManageStages = user?.role === 'ADMIN' || user?.role === 'SALES_MANAGER';
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Opportunity[]>([]);
  const [stages, setStages] = useState<CustomerStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');

  useEffect(() => {
    Promise.all([loadAllAccounts(), loadAllDeals(), listStages('customer_stages')])
      .then(([accountRows, dealRows, stageRes]) => {
        setAccounts(accountRows.filter((a) => a.customerStage));
        setDeals(dealRows);
        setStages(stageRes as CustomerStage[]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Account id -> nearest upcoming open RENEWAL deal close date, purely a
  // client-side nudge — the Deal stays the single source of truth for
  // renewal progress, this never gets written back to the account.
  const renewalDueByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + RENEWAL_WINDOW_DAYS);
    for (const deal of deals) {
      if (deal.dealType !== 'RENEWAL' || !deal.closeDate || !deal.account) continue;
      if (deal.stage.isClosedWon || deal.stage.isClosedLost) continue;
      if (new Date(deal.closeDate) > cutoff) continue;
      const existing = map.get(deal.account.id);
      if (!existing || new Date(deal.closeDate) < new Date(existing)) map.set(deal.account.id, deal.closeDate);
    }
    return map;
  }, [deals]);

  const handleDrop = useCallback((accountId: string, _from: string, toStageId: string) => {
    const prev = accounts;
    setAccounts((as) => as.map((a) => (a.id === accountId ? { ...a, customerStage: stages.find((s) => s.id === toStageId)! } : a)));
    setError('');
    updateAccount(accountId, { customerStageId: toStageId }).catch((e) => {
      setAccounts(prev);
      setError(e.message ?? 'Could not update customer stage');
    });
  }, [accounts, stages]);

  async function addStage() {
    const name = newStageName.trim();
    if (!name) { setAddingStage(false); return; }
    try {
      const data = await createStage('customer_stages', { name, color: '#6B7280' });
      setStages((s) => [...s, data as CustomerStage]);
      toast.success(`Added stage "${name}"`);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add stage');
    } finally {
      setNewStageName('');
      setAddingStage(false);
    }
  }

  if (loading) return <SkeletonKanban columns={stages.length || 4} />;

  const stageIds = stages.map((s) => s.id);
  const columns: KanbanColumn<Account>[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.name,
    items: accounts.filter((a) => a.customerStage?.id === stage.id),
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
              table="customer_stages"
              allStageIds={stageIds}
              myIndex={stageIds.indexOf(stage.id)}
              onChanged={(updated) => setStages((s) => s.map((st) => (st.id === updated.id ? updated : st)))}
              onDeleted={(id) => setStages((s) => s.filter((st) => st.id !== id))}
              onReordered={setStages}
            />
          );
        }}
        emptyState={() => (
          <div className="kanban-empty">
            <div className="icon"><Icon name="sparkle" size={18} /></div>
            <p>No customers in this stage yet</p>
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
        renderCard={(account) => {
          const renewalDue = renewalDueByAccountId.get(account.id);
          return (
            <>
              <Link to={`/companies/${account.id}`}>
                <div className="kanban-card-title">{account.name}</div>
                {account.industry && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{account.industry}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  {renewalDue ? (
                    <span className="chip" style={{ background: '#F9731622', color: '#F97316' }}>
                      Renewal due {new Date(renewalDue).toLocaleDateString()}
                    </span>
                  ) : <span />}
                  {account.owner && <div className="avatar avatar-sm" title={account.owner.fullName}>{initials(account.owner.fullName)}</div>}
                </div>
                <div className="kanban-card-footer">
                  <span className="kanban-card-badge"><Icon name="clock" size={11} /> Updated {new Date(account.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
              <div className="kanban-card-actions">
                <button
                  title="View"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/companies/${account.id}`); }}
                ><Icon name="eye" size={13} /></button>
              </div>
            </>
          );
        }}
      />
    </div>
  );
}
