import { supabase } from '../lib/supabase';
import type { Contact } from './types';

const SELECT = 'contact:contacts(id, first_name, last_name, email, job_title, created_at, updated_at)';

function mapContact(row: any): Contact {
  return {
    id: row.id,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    jobTitle: row.job_title ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLeadContacts(leadId: string): Promise<Contact[]> {
  const { data, error } = await supabase.from('lead_contacts').select(SELECT).eq('lead_id', leadId);
  if (error) throw error;
  return (data ?? []).map((row: any) => mapContact(row.contact));
}

export async function replaceLeadContacts(leadId: string, contactIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase.from('lead_contacts').delete().eq('lead_id', leadId);
  if (deleteError) throw deleteError;
  if (contactIds.length === 0) return;
  const { error: insertError } = await supabase.from('lead_contacts').insert(
    contactIds.map((contactId) => ({ lead_id: leadId, contact_id: contactId })),
  );
  if (insertError) throw insertError;
}

export async function addLeadContact(leadId: string, contactId: string): Promise<void> {
  const { error } = await supabase.from('lead_contacts').insert({ lead_id: leadId, contact_id: contactId });
  if (error) throw error;
}

export async function removeLeadContact(leadId: string, contactId: string): Promise<void> {
  const { error } = await supabase.from('lead_contacts').delete().eq('lead_id', leadId).eq('contact_id', contactId);
  if (error) throw error;
}
