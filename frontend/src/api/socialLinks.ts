import { supabase } from '../lib/supabase';
import type { SocialLink } from './types';

function mapLink(row: any): SocialLink {
  return {
    id: row.id, platform: row.platform, url: row.url, order: row.order,
  };
}

// "Other platform" repeatable rows, beyond the named LinkedIn/Instagram/
// Twitter columns on leads/contacts themselves. Delete-then-insert sync,
// same pattern as api/additionalOwners.ts.
async function syncLinks(fkColumn: 'lead_id' | 'contact_id', parentId: string, links: { platform: string; url: string }[]) {
  const { error: delError } = await supabase.from('social_links').delete().eq(fkColumn, parentId);
  if (delError) throw delError;
  const filled = links.filter((l) => l.platform.trim() && l.url.trim());
  if (filled.length === 0) return;
  const { error: insError } = await supabase.from('social_links').insert(
    filled.map((l, i) => ({
      [fkColumn]: parentId, platform: l.platform.trim(), url: l.url.trim(), order: i + 1,
    })),
  );
  if (insError) throw insError;
}

export async function setLeadSocialLinks(leadId: string, links: { platform: string; url: string }[]): Promise<void> {
  return syncLinks('lead_id', leadId, links);
}

export async function setContactSocialLinks(contactId: string, links: { platform: string; url: string }[]): Promise<void> {
  return syncLinks('contact_id', contactId, links);
}

export function mapSocialLinks(rows: any[] | null | undefined): SocialLink[] {
  return (rows ?? []).map(mapLink);
}
