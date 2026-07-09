import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Contact } from '../api/types';
import { listContacts, deleteContact } from '../api/contacts';
import { ContactForm } from '../components/ContactForm';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

type SortBy = 'firstName' | 'lastName' | 'updatedAt' | 'createdAt';

function contactName(c: Contact) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Untitled contact';
}

export function ContactsList() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    listContacts({
      search: search || undefined, page, pageSize, sortBy, sortDir,
    })
      .then((data) => { setContacts(data.data); setTotal(data.total); setSelected(new Set()); })
      .finally(() => setLoading(false));
  }, [search, page, pageSize, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  function toggleSort(field: SortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))));
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkDeleteSelected() {
    const ok = await confirm(`Delete ${selected.size} selected contact(s)? This cannot be undone.`, { title: 'Delete contacts' });
    if (!ok) return;
    try {
      await Promise.allSettled([...selected].map((id) => deleteContact(id)));
      toast.success(`Deleted ${selected.size} contact(s)`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk delete failed');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sortArrow = (field: SortBy) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="topbar page-toolbar">
        <h2 style={{ margin: 0 }}>Contacts <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({total})</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="Search name or email" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 6 }} />
          <button className="btn" onClick={() => setShowForm(true)}>+ Add Contact</button>
        </div>
      </div>

      {loading ? <SkeletonTable columns={7} /> : contacts.length === 0 ? (
        <EmptyState
          icon="person"
          title="No contacts yet"
          description="Add a contact to start tracking the people at your companies."
          action={{ label: '+ Add contact', onClick: () => setShowForm(true) }}
        />
      ) : (
        <>
          {selected.size > 0 && (
            <div className="bulk-bar">
              <span>{selected.size} selected</span>
              <button className="btn secondary" onClick={bulkDeleteSelected}>Delete</button>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0} onChange={toggleSelectAll} />
                </th>
                <th className="sortable" onClick={() => toggleSort('firstName')}>Name{sortArrow('firstName')}</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Email</th>
                <th>Mobile Number</th>
                <th>Company</th>
                <th>Linked Lead</th>
                <th>Owner</th>
                <th className="sortable" onClick={() => toggleSort('updatedAt')}>Last Activity{sortArrow('updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td><Link to={`/contacts/${c.id}`}>{contactName(c)}</Link></td>
                  <td>{c.jobTitle ?? '—'}</td>
                  <td>{c.department ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{c.mobile ?? '—'}</td>
                  <td>{c.account ? <Link to={`/companies/${c.account.id}`}>{c.account.name}</Link> : '—'}</td>
                  <td>
                    {c.leads && c.leads.length > 0
                      ? c.leads.map((l, i) => (
                        <span key={l.id}>
                          {i > 0 && ', '}
                          <Link to={`/leads/${l.id}`}>{[l.firstName, l.lastName].filter(Boolean).join(' ') || l.email}</Link>
                        </span>
                      ))
                      : '—'}
                  </td>
                  <td>{c.owner?.fullName ?? '—'}</td>
                  <td>{new Date(c.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
        </>
      )}

      {showForm && (
        <ContactForm
          onClose={() => setShowForm(false)}
          onSaved={(contact) => { setShowForm(false); toast.success('Contact created'); navigate(`/contacts/${contact.id}`); }}
        />
      )}
    </div>
  );
}
