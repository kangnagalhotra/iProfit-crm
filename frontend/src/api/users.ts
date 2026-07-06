import { supabase } from '../lib/supabase';
import type { User } from './types';

function mapUser(row: any): User {
  return {
    id: row.id, fullName: row.full_name, email: row.email, role: row.role,
  };
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []).map(mapUser);
}

export async function createUser(input: { fullName: string; email: string; password: string; role: 'SALES_REP' | 'SALES_MANAGER' }): Promise<User> {
  // Creating an auth user requires the service_role key, which never ships to
  // the browser — this goes through the create-user Edge Function instead.
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      fullName: input.fullName, email: input.email, password: input.password, role: input.role,
    },
  });
  if (error) throw error;
  return mapUser(data);
}
