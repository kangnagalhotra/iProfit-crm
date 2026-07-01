import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Account, AccountStatus, Paginated } from '../api/types';
import { Kanban } from './kanban/Kanban';
import type { KanbanColumn } from './kanban/Kanban';

const STATUSES: { id: AccountStatus; label: string }[] = [
  { id: 'PROSPECT', label: 'Prospect' },
  { id: 'ACTIVE_CUSTOMER', label: 'Active Customer' },
  { id: 'ON_HOLD', label: 'On Hold' },
  { id: 'CHURNED', label: 'Churned' },
];

async function loadAllAccounts(): Promise<Account[]> {
  let page = 1;
  let all: Account[] = [];
  for (;;) {
    const { data } = await api.get<Paginated<Account>>('/accounts', { params: { page, pageSize: 100 } });
    all = all.concat(data.data);
    if (all.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return all;
}

export function CompaniesKanban() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllAccounts().then(setAccounts).finally(() => setLoading(false));
  }, []);

  const handleDrop = useCallback((accountId: string, _from: string, toStatus: string) => {
    const prev = accounts;
    setAccounts((as) => as.map((a) => (a.id === accountId ? { ...a, status: toStatus as AccountStatus } : a)));
    setError('');
    api.patch(`/accounts/${accountId}`, { status: toStatus }).catch((e) => {
      setAccounts(prev);
      setError(e.response?.data?.message ?? 'Could not update company status');
    });
  }, [accounts]);

  if (loading) return <p>Loading…</p>;

  const columns: KanbanColumn<Account>[] = STATUSES.map(({ id, label }) => ({
    id,
    label,
    items: accounts.filter((a) => a.status === id),
  }));

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <Kanban
        columns={columns}
        getId={(account) => account.id}
        onDrop={handleDrop}
        renderCard={(account) => (
          <Link to={`/companies/${account.id}`}>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{account.name}</div>
            {account.domain && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{account.domain}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
              {account.industry && <span className="chip">{account.industry}</span>}
              {account.owner && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{account.owner.fullName}</span>}
            </div>
          </Link>
        )}
      />
    </div>
  );
}
