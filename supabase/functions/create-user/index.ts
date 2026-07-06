// Creates a new teammate (SALES_REP/SALES_MANAGER) from the "+ Add new
// owner" flow in LeadForm/CompanyForm. Creating an auth user requires the
// service_role key, which never ships to the browser, so this has to be a
// server-side call. Ported from auth.controller.ts's POST /users, which was
// @Roles(ADMIN, SALES_MANAGER)-gated.
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

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (!callerProfile || !['ADMIN', 'SALES_MANAGER'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Insufficient role for this action' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { fullName, email, password, role } = await req.json();
  if (!fullName || !email || !password || !['SALES_REP', 'SALES_MANAGER'].includes(role)) {
    return new Response(JSON.stringify({ error: 'fullName, email, password, and role (SALES_REP|SALES_MANAGER) are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName, role },
  });
  if (createError) {
    return new Response(JSON.stringify({ error: createError.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    id: created.user!.id, fullName, email, role,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
