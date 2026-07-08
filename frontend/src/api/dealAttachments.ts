import { supabase } from '../lib/supabase';
import type { DealAttachment } from './types';

const BUCKET = 'deal-attachments';

function mapAttachment(row: any): DealAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export async function listAttachments(opportunityId: string): Promise<DealAttachment[]> {
  const { data, error } = await supabase.from('deal_attachments').select('*').eq('opportunity_id', opportunityId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAttachment);
}

export async function uploadAttachment(opportunityId: string, file: File): Promise<DealAttachment> {
  const path = `${opportunityId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const currentUser = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase.from('deal_attachments').insert({
    opportunity_id: opportunityId,
    file_name: file.name,
    storage_path: path,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream',
    uploaded_by: currentUser?.id,
  }).select('*').single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return mapAttachment(data);
}

export async function deleteAttachment(id: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase.from('deal_attachments').select('storage_path').eq('id', id).single();
  if (fetchError) throw fetchError;
  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase.from('deal_attachments').delete().eq('id', id);
  if (error) throw error;
}
