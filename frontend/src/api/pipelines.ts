import { supabase } from '../lib/supabase';

export interface Pipeline { id: string; name: string; isDefault: boolean; }

export async function listPipelines(): Promise<Pipeline[]> {
  const { data, error } = await supabase.from('pipelines').select('id, name, is_default').order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, isDefault: r.is_default }));
}
