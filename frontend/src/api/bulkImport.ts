import { supabase } from '../lib/supabase';

export async function bulkImport<T extends { row: number; message: string }>(
  entity: 'leads' | 'accounts' | 'deals' | 'tasks',
  rows: Record<string, any>[],
): Promise<{ created: any[]; errors: T[]; summary: { total: number; createdCount: number; errorCount: number } }> {
  const { data, error } = await supabase.functions.invoke('bulk-import', { body: { entity, rows } });
  if (error) throw error;
  return data;
}
