import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Account } from '../api/types';

export function CompanyDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    api.get<Account>(`/accounts/${id}`).then(({ data }) => setAccount(data)).catch(() => {});
  }, [id]);

  if (!account) return <p>Loading…</p>;
  return (
    <div>
      <p><Link to="/companies">← Companies</Link></p>
      <h2 style={{ marginTop: 0 }}>{account.name}</h2>
      <div className="card" style={{ maxWidth: 520 }}>
        <p><strong>Domain:</strong> {account.domain ?? '—'}</p>
        <p><strong>Industry:</strong> {account.industry ?? '—'}</p>
        <p><strong>Status:</strong> <span className="chip">{account.status}</span></p>
        <p><strong>Owner:</strong> {account.owner?.fullName ?? '—'}</p>
        <p><strong>Location:</strong> {[account.city, account.state, account.country].filter(Boolean).join(', ') || '—'}</p>
      </div>
    </div>
  );
}
