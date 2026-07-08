import { supabase } from '../lib/supabase';
import type { DealContact, DealContactRole } from './types';

const SELECT = '*, contact:contacts(id, first_name, last_name, email)';

function mapDealContact(row: any): DealContact {
  return {
    contactId: row.contact_id,
    role: row.role,
    contact: row.contact ? {
      id: row.contact.id,
      firstName: row.contact.first_name ?? undefined,
      lastName: row.contact.last_name ?? undefined,
      email: row.contact.email ?? undefined,
    } : undefined,
  };
}

export async function listDealContacts(opportunityId: string): Promise<DealContact[]> {
  const { data, error } = await supabase.from('deal_contacts').select(SELECT).eq('opportunity_id', opportunityId);
  if (error) throw error;
  return (data ?? []).map(mapDealContact);
}

export async function replaceDealContacts(
  opportunityId: string,
  rows: { contactId: string; role: DealContactRole }[],
): Promise<void> {
  const { error: deleteError } = await supabase.from('deal_contacts').delete().eq('opportunity_id', opportunityId);
  if (deleteError) throw deleteError;
  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from('deal_contacts').insert(
    rows.map((r) => ({ opportunity_id: opportunityId, contact_id: r.contactId, role: r.role })),
  );
  if (insertError) throw insertError;
}
