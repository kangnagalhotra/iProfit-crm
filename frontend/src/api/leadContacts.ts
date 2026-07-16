import { supabase } from '../lib/supabase';
import type { Contact, DealContactRole } from './types';

const SELECT = 'role, role_other, contact:contacts(id, first_name, last_name, email, job_title, created_at, updated_at)';

export interface LeadContact extends Contact { role: DealContactRole; roleOther?: string; }

function mapLeadContact(row: any): LeadContact {
  const c = row.contact;
  return {
    id: c.id,
    firstName: c.first_name ?? undefined,
    lastName: c.last_name ?? undefined,
    email: c.email ?? undefined,
    jobTitle: c.job_title ?? undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    role: row.role ?? 'OTHER',
    roleOther: row.role_other ?? undefined,
  };
}

export async function listLeadContacts(leadId: string): Promise<LeadContact[]> {
  const { data, error } = await supabase.from('lead_contacts').select(SELECT).eq('lead_id', leadId);
  if (error) throw error;
  return (data ?? []).map(mapLeadContact);
}

export async function replaceLeadContacts(
  leadId: string,
  rows: { contactId: string; role?: DealContactRole; roleOther?: string }[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('lead_contacts').delete().eq('lead_id', leadId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from('lead_contacts').insert(
    rows.map((r) => ({
      lead_id: leadId, contact_id: r.contactId, role: r.role ?? 'OTHER', role_other: r.roleOther,
    })),
  );
  if (insertError) throw insertError;
}

export async function setLeadContactRole(leadId: string, contactId: string, role: DealContactRole, roleOther?: string): Promise<void> {
  const { error } = await supabase.from('lead_contacts')
    .update({ role, role_other: role === 'OTHER' ? (roleOther || null) : null })
    .eq('lead_id', leadId).eq('contact_id', contactId);
  if (error) throw error;
}
