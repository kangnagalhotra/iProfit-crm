import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Icon } from './Icon';

interface SearchResult { id: string; label: string; sublabel?: string; to: string; }
interface SearchGroup { key: string; label: string; results: SearchResult[]; }

function leadLabel(row: any) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Untitled lead';
}

function contactLabel(row: any) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Untitled contact';
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setGroups([]); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      const term = `%${trimmed}%`;
      const [leads, accounts, deals, contacts] = await Promise.all([
        supabase.from('leads').select('id, first_name, last_name, email')
          .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
        supabase.from('accounts').select('id, name').ilike('name', term).limit(5),
        supabase.from('opportunities').select('id, name').ilike('name', term).limit(5),
        supabase.from('contacts').select('id, first_name, last_name, email, account_id').or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`).limit(5),
      ]);
      setGroups([
        { key: 'leads', label: 'Leads', results: (leads.data ?? []).map((r) => ({ id: r.id, label: leadLabel(r), to: `/leads/${r.id}` })) },
        { key: 'companies', label: 'Companies', results: (accounts.data ?? []).map((r) => ({ id: r.id, label: r.name, to: `/companies/${r.id}` })) },
        { key: 'deals', label: 'Deals', results: (deals.data ?? []).map((r) => ({ id: r.id, label: r.name, to: `/deals/${r.id}` })) },
        {
          key: 'contacts',
          label: 'Contacts',
          results: (contacts.data ?? []).filter((r) => r.account_id).map((r) => ({
            id: r.id, label: contactLabel(r), sublabel: 'View company', to: `/companies/${r.account_id}`,
          })),
        },
      ]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const totalResults = groups.reduce((sum, g) => sum + g.results.length, 0);

  function goTo(to: string) {
    setOpen(false);
    setQuery('');
    navigate(to);
  }

  return (
    <div className="global-search-wrap" ref={ref}>
      <div className="global-search-input">
        <Icon name="search" size={16} />
        <input
          placeholder="Search leads, companies, deals…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="global-search-menu">
          {loading ? (
            <div className="search-select-empty">Searching…</div>
          ) : totalResults === 0 ? (
            <div className="search-select-empty">No matches for "{query.trim()}"</div>
          ) : (
            groups.filter((g) => g.results.length > 0).map((g) => (
              <div key={g.key}>
                <div className="global-search-group-label">{g.label}</div>
                {g.results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="search-select-option"
                    onClick={() => goTo(r.to)}
                  >
                    <span>{r.label}</span>
                    {r.sublabel && <span className="search-select-sublabel">{r.sublabel}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
