import { supabase } from '../lib/supabase';
import type { LeadAttachment } from './types';

const BUCKET = 'lead-attachments';

function mapAttachment(row: any): LeadAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export async function listAttachments(leadId: string): Promise<LeadAttachment[]> {
  const { data, error } = await supabase.from('lead_attachments').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAttachment);
}

export async function uploadAttachment(leadId: string, file: File): Promise<LeadAttachment> {
  const path = `${leadId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const currentUser = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase.from('lead_attachments').insert({
    lead_id: leadId,
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
  const { data: row, error: fetchError } = await supabase.from('lead_attachments').select('storage_path').eq('id', id).single();
  if (fetchError) throw fetchError;
  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase.from('lead_attachments').delete().eq('id', id);
  if (error) throw error;
}
