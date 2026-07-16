import { supabase } from '../lib/supabase';
import type { Project, ProjectHealth } from './types';

const SELECT = `*, opportunity:opportunities(id, name, renewal_date, last_activity_at, owner:profiles!opportunities_owner_id_fkey(id, full_name)),
  account:accounts(id, name)`;

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    health: row.health ?? 'ON_TRACK',
    satisfaction: row.satisfaction ?? undefined,
    value: row.value !== null && row.value !== undefined ? String(row.value) : undefined,
    createdAt: row.created_at,
    opportunity: row.opportunity ? {
      id: row.opportunity.id,
      name: row.opportunity.name,
      renewalDate: row.opportunity.renewal_date ?? undefined,
      lastActivityAt: row.opportunity.last_activity_at ?? undefined,
      owner: row.opportunity.owner ? { id: row.opportunity.owner.id, fullName: row.opportunity.owner.full_name } : undefined,
    } : undefined,
    account: row.account ? { id: row.account.id, name: row.account.name } : undefined,
  };
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select(SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProject);
}

export async function getProjectForDeal(opportunityId: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select(SELECT).eq('opportunity_id', opportunityId).maybeSingle();
  if (error) throw error;
  return data ? mapProject(data) : null;
}

export async function updateProject(
  id: string,
  patch: { health?: ProjectHealth; satisfaction?: number | null; status?: string },
): Promise<Project> {
  const row: Record<string, any> = {};
  if (patch.health !== undefined) row.health = patch.health;
  if (patch.satisfaction !== undefined) row.satisfaction = patch.satisfaction;
  if (patch.status !== undefined) row.status = patch.status;
  const { data, error } = await supabase.from('projects').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapProject(data);
}
