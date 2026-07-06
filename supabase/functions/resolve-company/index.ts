// Find-or-create company, used by Lead/Deal create+update when a company is
// typed instead of selected from the list. Ported from resolveCompany() in
// the old leads.service.ts / opportunities.service.ts. Runs with the
// service-role key so the "check then insert" is atomic and can't race
// against another request creating the same company name.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

  const { companyName, ownerId } = await req.json();
  if (!companyName) {
    return new Response(JSON.stringify({ error: 'companyName is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: existing } = await admin.from('accounts').select('id').eq('name', companyName).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ id: existing.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: defaultStage, error: stageError } = await admin
    .from('account_stages').select('id').eq('is_default', true).single();
  if (stageError || !defaultStage) {
    return new Response(JSON.stringify({ error: 'No default company stage configured' }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: created, error: createError } = await admin
    .from('accounts')
    .insert({ name: companyName, owner_id: ownerId ?? user.id, stage_id: defaultStage.id })
    .select('id')
    .single();
  if (createError) {
    return new Response(JSON.stringify({ error: createError.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ id: created.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
