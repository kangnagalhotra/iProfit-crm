import {
  createContext, useContext, useEffect, useState, ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

async function loadProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, role').eq('id', userId).single();
  if (error || !data) return null;
  return {
    id: data.id, fullName: data.full_name, email: data.email, role: data.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session ? await loadProfile(session.user.id) : null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session ? await loadProfile(session.user.id) : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(await loadProfile(data.user.id));
  }

  function logout() {
    supabase.auth.signOut();
    setUser(null);
  }

  return <AuthContext.Provider value={{
    user, loading, login, logout,
  }}
  >
    {children}
  </AuthContext.Provider>;
}
