import { useEffect } from 'react';

export interface RecentItem {
  type: 'lead' | 'deal' | 'company' | 'contact';
  id: string;
  label: string;
  to: string;
  at: number;
}

const KEY = 'crm:recently-viewed';
const MAX = 8;

export function getRecentlyViewed(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function record(item: Omit<RecentItem, 'at'>) {
  const list = getRecentlyViewed().filter((r) => !(r.type === item.type && r.id === item.id));
  list.unshift({ ...item, at: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

// Call from a detail page once the record's display name is known — logs the
// visit for the Salesforce-style "Recent" quick-access menu in the topbar.
export function useRecordRecentlyViewed(
  type: RecentItem['type'],
  id: string | undefined,
  label: string | undefined,
) {
  useEffect(() => {
    if (!id || !label) return;
    record({
      type, id, label, to: `/${type === 'company' ? 'companies' : `${type}s`}/${id}`,
    });
  }, [type, id, label]);
}
