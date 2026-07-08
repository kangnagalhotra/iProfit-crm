import { supabase } from '../lib/supabase';
import type {
  Lead, LeadSource, Opportunity, Paginated,
} from './types';
import { createDeal } from './deals';
import { createContact } from './contacts';

const SELECT = `*, stage:lead_stages(*), owner:profiles!leads_owner_id_fkey(id, full_name),
  createdByProfile:profiles!leads_created_by_fkey(id, full_name), account:accounts(id, name)`;

const SORT_COLUMN: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', value: 'value', updatedAt: 'updated_at', createdAt: 'created_at',
};

function mapLead(row: any): Lead {
  return {
    id: row.id,
    leadName: row.lead_name ?? undefined,
    salutation: row.salutation ?? undefined,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    emailOptIn: row.email_opt_in ?? undefined,
    phone: row.phone ?? undefined,
    mobile: row.mobile ?? undefined,
    jobTitle: row.job_title ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    city: row.city ?? undefined,
    value: row.value !== null && row.value !== undefined ? String(row.value) : undefined,
    notes: row.notes ?? undefined,
    stage: {
      id: row.stage.id, name: row.stage.name, order: row.stage.order, color: row.stage.color,
      isDefault: row.stage.is_default, isWon: row.stage.is_won, isLost: row.stage.is_lost,
    },
    source: row.source ?? undefined,
    sourceDetails: row.source_details ?? undefined,
    score: row.score,
    rating: row.rating ?? undefined,
    unqualifiedReason: row.unqualified_reason ?? undefined,
    tags: row.tags ?? [],
    owner: row.owner ? { id: row.owner.id, fullName: row.owner.full_name } : undefined,
    createdBy: row.createdByProfile ? { id: row.createdByProfile.id, fullName: row.createdByProfile.full_name } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name } : undefined,
    lastActivityAt: row.last_activity_at ?? undefined,
    budgetScore: row.budget_score ?? undefined,
    authorityScore: row.authority_score ?? undefined,
    needScore: row.need_score ?? undefined,
    timelineScore: row.timeline_score ?? undefined,
    qualificationNotes: row.qualification_notes ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListLeadsParams {
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc';
  search?: string; stageId?: string; ownerId?: string; accountId?: string; createdAfter?: string;
  source?: LeadSource; includeArchived?: boolean;
}

export async function listLeads(params: ListLeadsParams = {}): Promise<Paginated<Lead>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  let query = supabase.from('leads').select(SELECT, { count: 'exact' });

  if (!params.includeArchived) query = query.is('archived_at', null);
  if (params.stageId) query = query.eq('stage_id', params.stageId);
  if (params.ownerId) query = query.eq('owner_id', params.ownerId);
  if (params.accountId) query = query.eq('account_id', params.accountId);
  if (params.createdAfter) query = query.gte('created_at', params.createdAfter);
  if (params.source) query = query.eq('source', params.source);
  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`);
  }

  if (params.sortBy === 'stage') {
    query = query.order('order', { foreignTable: 'lead_stages', ascending: params.sortDir !== 'desc' });
  } else {
    const column = SORT_COLUMN[params.sortBy ?? ''] ?? 'updated_at';
    query = query.order(column, { ascending: params.sortDir === 'asc' });
  }

  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []).map(mapLead), page, pageSize, total: count ?? 0,
  };
}

export async function getLead(id: string): Promise<Lead> {
  const { data, error } = await supabase.from('leads').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapLead(data);
}

async function resolveCompany(companyName: string, ownerId?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('resolve-company', { body: { companyName, ownerId } });
  if (error) throw error;
  return data.id;
}

async function pickOwner(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('pick-owner', { body: {} });
  if (error) throw error;
  return data.id;
}

async function defaultLeadStageId(): Promise<string> {
  const { data, error } = await supabase.from('lead_stages').select('id').eq('is_default', true).single();
  if (error) throw error;
  return data.id;
}

function translateError(error: any): never {
  if (error.code === '23505' && error.message?.includes('leads_email_key')) {
    throw new Error('Lead with this email exists');
  }
  throw new Error(error.message ?? 'Something went wrong');
}

export interface AccountEnrichmentFields {
  industry?: string;
  sizeBucket?: string;
  annualRevenue?: string;
  currency?: string;
  domain?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

const ENRICHMENT_COLUMNS: Record<keyof AccountEnrichmentFields, string> = {
  industry: 'industry', sizeBucket: 'size_bucket', annualRevenue: 'annual_revenue', currency: 'currency',
  domain: 'domain', address: 'address', city: 'city', state: 'state', postalCode: 'postal_code', country: 'country',
};

// Fills Company/Address fields on the shared Account only where they're
// currently empty — never overwrites existing data. Best-effort: failures
// are swallowed so enrichment can never block the lead itself from saving.
export async function enrichAccountIfEmpty(accountId: string, fields: AccountEnrichmentFields): Promise<void> {
  try {
    const columns = Object.values(ENRICHMENT_COLUMNS);
    const { data: current, error } = await supabase.from('accounts').select(columns.join(', ')).eq('id', accountId).single();
    if (error || !current) return;

    const patch: Record<string, any> = {};
    (Object.keys(ENRICHMENT_COLUMNS) as (keyof AccountEnrichmentFields)[]).forEach((key) => {
      const incoming = fields[key];
      const column = ENRICHMENT_COLUMNS[key];
      const existing = (current as any)[column];
      if (incoming && (existing === null || existing === undefined || existing === '')) {
        patch[column] = incoming;
      }
    });
    if (Object.keys(patch).length === 0) return;
    await supabase.from('accounts').update(patch).eq('id', accountId);
  } catch {
    // enrichment is a secondary side-effect — never throw from here
  }
}

export interface DuplicateLeadMatch {
  id: string;
  name: string;
  matchType: 'email' | 'name_company';
}

export async function checkDuplicateLead(params: {
  email?: string; firstName?: string; lastName?: string; companyName?: string; excludeId?: string;
}): Promise<DuplicateLeadMatch | null> {
  const {
    email, firstName, lastName, companyName, excludeId,
  } = params;

  if (email) {
    let q = supabase.from('leads').select('id, lead_name, first_name, last_name').ilike('email', email).limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q.maybeSingle();
    if (data) {
      return {
        id: data.id,
        name: data.lead_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Untitled lead',
        matchType: 'email',
      };
    }
  }

  if (firstName && lastName && companyName) {
    let q = supabase
      .from('leads')
      .select('id, lead_name, first_name, last_name, account:accounts!inner(name)')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .ilike('account.name', companyName)
      .limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q.maybeSingle();
    if (data) {
      const row = data as any;
      return {
        id: row.id,
        name: row.lead_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Untitled lead',
        matchType: 'name_company',
      };
    }
  }

  return null;
}

export async function createLead(input: Record<string, any>): Promise<Lead> {
  const {
    companyName, accountId: inputAccountId, companyEnrichment, ...rest
  } = input;
  const currentUser = (await supabase.auth.getUser()).data.user;
  const ownerId = rest.ownerId ?? (await pickOwner()) ?? currentUser?.id;
  const accountId = inputAccountId ?? (companyName ? await resolveCompany(companyName, ownerId) : undefined);
  const stageId = rest.stageId ?? (await defaultLeadStageId());

  if (accountId && companyEnrichment) {
    await enrichAccountIfEmpty(accountId, companyEnrichment);
  }

  const row: Record<string, any> = {
    salutation: rest.salutation, first_name: rest.firstName, last_name: rest.lastName,
    email: rest.email, email_opt_in: rest.emailOptIn, phone: rest.phone, mobile: rest.mobile,
    job_title: rest.jobTitle, linkedin_url: rest.linkedinUrl, city: rest.city, value: rest.value, notes: rest.notes,
    source: rest.source, source_details: rest.sourceDetails, score: rest.score, rating: rest.rating,
    unqualified_reason: rest.unqualifiedReason, tags: rest.tags,
    owner_id: ownerId, created_by: currentUser?.id, account_id: accountId, stage_id: stageId,
    lead_name: [rest.firstName, rest.lastName].filter(Boolean).join(' ') || undefined,
    last_activity_at: new Date().toISOString(),
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });

  const { data, error } = await supabase.from('leads').insert(row).select(SELECT).single();
  if (error) translateError(error);
  return mapLead(data);
}

export async function updateLead(id: string, input: Record<string, any>): Promise<Lead> {
  const { companyName, accountId: inputAccountId, companyEnrichment, ...rest } = input;
  let accountId = inputAccountId;
  if (accountId === undefined && companyName) {
    const { data: current } = await supabase.from('leads').select('owner_id').eq('id', id).single();
    accountId = await resolveCompany(companyName, current?.owner_id);
  }

  if (accountId && companyEnrichment) {
    await enrichAccountIfEmpty(accountId, companyEnrichment);
  }

  const row: Record<string, any> = {
    salutation: rest.salutation, first_name: rest.firstName, last_name: rest.lastName,
    email: rest.email, email_opt_in: rest.emailOptIn, phone: rest.phone, mobile: rest.mobile,
    job_title: rest.jobTitle, linkedin_url: rest.linkedinUrl, city: rest.city, value: rest.value, notes: rest.notes,
    source: rest.source, source_details: rest.sourceDetails, owner_id: rest.ownerId, stage_id: rest.stageId,
    score: rest.score, rating: rest.rating, unqualified_reason: rest.unqualifiedReason, tags: rest.tags,
    account_id: accountId,
    budget_score: rest.budgetScore, authority_score: rest.authorityScore, need_score: rest.needScore,
    timeline_score: rest.timelineScore, qualification_notes: rest.qualificationNotes,
    archived_at: rest.archivedAt,
  };
  Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });

  // Lead Name is never user-typed — regenerate it from the merged effective names
  // whenever either name is part of this update (mirrors the old leads.service.ts).
  if (row.first_name !== undefined || row.last_name !== undefined) {
    const { data: current } = await supabase.from('leads').select('first_name, last_name').eq('id', id).single();
    const first = row.first_name !== undefined ? row.first_name : current?.first_name;
    const last = row.last_name !== undefined ? row.last_name : current?.last_name;
    row.lead_name = [first, last].filter(Boolean).join(' ') || null;
  }

  const { data, error } = await supabase.from('leads').update(row).eq('id', id).select(SELECT).single();
  if (error) translateError(error);
  return mapLead(data);
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkDeleteLeads(ids: string[]): Promise<{ succeeded: number; failed: number; total: number }> {
  const { error, count } = await supabase.from('leads').delete({ count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateLeadStage(ids: string[], stageId: string) {
  const { error, count } = await supabase.from('leads').update({ stage_id: stageId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

export async function bulkUpdateLeadOwner(ids: string[], ownerId: string) {
  const { error, count } = await supabase.from('leads').update({ owner_id: ownerId }, { count: 'exact' }).in('id', ids);
  if (error) return { succeeded: 0, failed: ids.length, total: ids.length };
  return { succeeded: count ?? 0, failed: ids.length - (count ?? 0), total: ids.length };
}

// A Lead can have at most one converted Deal in practice, but this returns
// whatever is linked via opportunities.lead_id (no schema change needed —
// that FK already existed).
export async function getConvertedDeal(leadId: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from('opportunities').select('id, name').eq('lead_id', leadId).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function convertLeadToDeal(
  lead: Lead,
  dealName: string,
  opts: { value?: string; stageId?: string; closeDate?: string } = {},
): Promise<Opportunity> {
  // Auto-create the Contact (person record) — the account itself is already
  // resolved on the lead (Company name is required on both lead forms, so
  // lead.account is set by the time a lead exists), so conversion just
  // carries it forward rather than re-resolving it.
  const contact = await createContact({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    jobTitle: lead.jobTitle,
    accountId: lead.account?.id,
    leadId: lead.id,
    ownerId: lead.owner?.id,
  });

  const deal = await createDeal({
    name: dealName,
    amount: opts.value ?? lead.value,
    accountId: lead.account?.id,
    ownerId: lead.owner?.id,
    leadId: lead.id,
    contactId: contact.id,
    description: lead.notes,
    stageId: opts.stageId,
    closeDate: opts.closeDate,
  });

  // Carry the lead's existing activity history onto the new deal too — both
  // FK columns on `activities` are independently nullable, so this is purely
  // additive: the activities still show on the lead's own timeline as well.
  await supabase.from('activities').update({ opportunity_id: deal.id }).eq('lead_id', lead.id);

  const currentUser = (await supabase.auth.getUser()).data.user;
  await supabase.from('activities').insert({
    type: 'FIELD_UPDATE', body: `Converted to Deal: ${deal.name}`, creator_id: currentUser?.id, lead_id: lead.id,
  });

  await supabase.from('leads').update({ converted_at: new Date().toISOString() }).eq('id', lead.id);

  return deal;
}
