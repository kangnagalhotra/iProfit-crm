import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface SavedView<F> {
  id: string;
  name: string;
  filters: F;
  visibleColumns?: string[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useSavedViews<F>(listKey: string) {
  const { user } = useAuth();
  const storageKey = `savedViews:${listKey}:${user?.id ?? 'anon'}`;
  const [views, setViews] = useState<SavedView<F>[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    let stored: SavedView<F>[] = [];
    try {
      const raw = localStorage.getItem(storageKey);
      stored = raw ? JSON.parse(raw) : [];
    } catch {
      stored = [];
    }
    setViews(stored);
    setActiveViewId(null);
  }, [storageKey]);

  function persist(next: SavedView<F>[]) {
    setViews(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function saveView(name: string, data: Omit<SavedView<F>, 'id' | 'name'>): string {
    const id = `v${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    persist([...views, { id, name, ...data }]);
    setActiveViewId(id);
    return id;
  }

  function updateView(id: string, data: Omit<SavedView<F>, 'id' | 'name'>) {
    persist(views.map((v) => (v.id === id ? { ...v, ...data } : v)));
  }

  function deleteView(id: string) {
    persist(views.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  }

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  return {
    views, activeView, activeViewId, setActiveViewId, saveView, updateView, deleteView,
  };
}
