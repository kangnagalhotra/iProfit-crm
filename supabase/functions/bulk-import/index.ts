// CSV bulk import for leads/accounts/deals/tasks. Ported from the 4
// bulkImport() methods in the old NestJS services. One function, one `entity`
// switch, since running per-row dedup/lookup/error-collection as hundreds of
// individual client requests would be slow and racy — this mirrors each
// entity's exact original behavior (see comments per branch).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const STATUS_BY_NAME: Record<string, string> = {
  'not started': 'NOT_STARTED',
  'in progress': 'IN_PROGRESS',
  waiting: 'WAITING',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anon.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { entity, rows } = await req.json();
  const created: any[] = [];
  const errors: { row: number; [k: string]: any; message: string }[] = [];

  if (entity === 'leads') {
    const { data: stages } = await admin.from('lead_stages').select('id, name, is_default');
    const stageByName = new Map((stages ?? []).map((s: any) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = (stages ?? []).find((s: any) => s.is_default)?.id ?? stages?.[0]?.id;
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (row.email) {
          const key = row.email.toLowerCase();
          if (seenEmails.has(key)) { errors.push({ row: i + 1, email: row.email, message: 'Duplicate email within import file' }); continue; }
          const { data: dupe } = await admin.from('leads').select('id').eq('email', row.email).maybeSingle();
          if (dupe) { errors.push({ row: i + 1, email: row.email, message: 'Lead with this email already exists' }); continue; }
          seenEmails.add(key);
        }
        const stageId = (row.stageName && stageByName.get(row.stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No lead stages configured');
        const { data: pickResult } = await admin.functions.invoke('pick-owner', { headers: { Authorization: authHeader } });
        const ownerId = pickResult?.id ?? user.id;
        const { data: lead, error } = await admin.from('leads').insert({
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          phone: row.phone,
          job_title: row.jobTitle,
          stage_id: stageId,
          source: 'IMPORT',
          owner_id: ownerId,
          last_activity_at: new Date().toISOString(),
        }).select().single();
        if (error) throw new Error(error.message);
        created.push(lead);
      } catch (e: any) {
        errors.push({ row: i + 1, email: row.email, message: e.message ?? 'Unknown error' });
      }
    }
  } else if (entity === 'accounts') {
    // Dedup by domain (soft, app-level — Account.domain has no DB unique constraint,
    // matching the original accounts.service.ts).
    const { data: stages } = await admin.from('account_stages').select('id, name, is_default');
    const stageByName = new Map((stages ?? []).map((s: any) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = (stages ?? []).find((s: any) => s.is_default)?.id ?? stages?.[0]?.id;
    const seenDomains = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (row.domain) {
          const key = row.domain.toLowerCase();
          if (seenDomains.has(key)) { errors.push({ row: i + 1, domain: row.domain, message: 'Duplicate domain within import file' }); continue; }
          const { data: dupe } = await admin.from('accounts').select('id').eq('domain', row.domain).maybeSingle();
          if (dupe) { errors.push({ row: i + 1, domain: row.domain, message: 'Company with this domain already exists' }); continue; }
          seenDomains.add(key);
        }
        const stageId = (row.stageName && stageByName.get(row.stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No company stages configured');
        const { data: account, error } = await admin.from('accounts').insert({
          name: row.name, domain: row.domain, industry: row.industry, city: row.city, state: row.state, country: row.country,
          stage_id: stageId, owner_id: user.id,
        }).select().single();
        if (error) throw new Error(error.message);
        created.push(account);
      } catch (e: any) {
        errors.push({ row: i + 1, domain: row.domain, message: e.message ?? 'Unknown error' });
      }
    }
  } else if (entity === 'deals') {
    const { data: pipeline } = await admin.from('pipelines').select('id').eq('is_default', true).single();
    const { data: stages } = await admin.from('deal_stages').select('id, name, is_default').eq('pipeline_id', pipeline!.id);
    const stageByName = new Map((stages ?? []).map((s: any) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = (stages ?? []).find((s: any) => s.is_default)?.id ?? stages?.[0]?.id;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const stageId = (row.stageName && stageByName.get(row.stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No deal stages configured');
        let accountId: string | undefined;
        if (row.companyName) {
          const { data: resolved, error: resolveError } = await admin.functions.invoke('resolve-company', {
            headers: { Authorization: authHeader }, body: { companyName: row.companyName, ownerId: user.id },
          });
          if (resolveError) throw new Error(resolveError.message);
          accountId = resolved.id;
        }
        const { data: deal, error } = await admin.from('opportunities').insert({
          name: row.name, amount: row.amount, stage_id: stageId, pipeline_id: pipeline!.id, owner_id: user.id, account_id: accountId,
          close_date: row.closeDate ? new Date(row.closeDate).toISOString() : undefined,
        }).select().single();
        if (error) throw new Error(error.message);
        created.push(deal);
      } catch (e: any) {
        errors.push({ row: i + 1, name: row.name, message: e.message ?? 'Unknown error' });
      }
    }
  } else if (entity === 'tasks') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const status = row.statusName ? STATUS_BY_NAME[row.statusName.toLowerCase()] : undefined;
        let leadId: string | undefined;
        let accountId: string | undefined;
        let opportunityId: string | undefined;
        if (row.relatedModule && row.relatedRecordName) {
          if (row.relatedModule === 'lead') {
            const { data: lead } = await admin.from('leads').select('id')
              .or(`email.eq.${row.relatedRecordName},lead_name.eq.${row.relatedRecordName}`).maybeSingle();
            if (!lead) throw new Error(`Lead "${row.relatedRecordName}" not found`);
            leadId = lead.id;
          } else if (row.relatedModule === 'account') {
            const { data: account } = await admin.from('accounts').select('id').eq('name', row.relatedRecordName).maybeSingle();
            if (!account) throw new Error(`Company "${row.relatedRecordName}" not found`);
            accountId = account.id;
          } else if (row.relatedModule === 'opportunity') {
            const { data: deal } = await admin.from('opportunities').select('id').eq('name', row.relatedRecordName).maybeSingle();
            if (!deal) throw new Error(`Deal "${row.relatedRecordName}" not found`);
            opportunityId = deal.id;
          }
        }
        const { data: task, error } = await admin.from('tasks').insert({
          title: row.title,
          type: row.type,
          priority: row.priority,
          status,
          due_at: new Date(row.dueAt).toISOString(),
          assignee_id: user.id,
          lead_id: leadId,
          account_id: accountId,
          opportunity_id: opportunityId,
        }).select().single();
        if (error) throw new Error(error.message);
        created.push(task);
      } catch (e: any) {
        errors.push({ row: i + 1, title: row.title, message: e.message ?? 'Unknown error' });
      }
    }
  } else {
    return new Response(JSON.stringify({ error: 'Unknown entity' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
