// Round-robin owner assignment for new leads/accounts/deals created without
// an explicit owner. Ported from assignment.service.ts#pickOwner(), but with
// persistent state (the `assignment_state` table) instead of an in-memory
// counter that reset on every backend restart.
//
// Minor deliberate improvement over the original: instead of a raw
// incrementing index into the pool array (which could skip/repeat people if
// the pool's membership changes between calls), this tracks the last
// *assigned user's id* and finds their position in the current pool — a bit
// more self-healing if someone is added to or removed from the rotation.
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

  const { data: pool, error: poolError } = await admin
    .from('profiles')
    .select('id')
    .eq('is_active', true)
    .eq('in_assignment_pool', true)
    .in('role', ['SALES_REP', 'SALES_MANAGER'])
    .order('created_at', { ascending: true });
  if (poolError) {
    return new Response(JSON.stringify({ error: poolError.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!pool || pool.length === 0) {
    return new Response(JSON.stringify({ id: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: state } = await admin.from('assignment_state').select('last_user_id').eq('id', true).single();
  const lastIndex = state?.last_user_id ? pool.findIndex((p) => p.id === state.last_user_id) : -1;
  const nextIndex = (lastIndex + 1) % pool.length;
  const picked = pool[nextIndex].id;

  await admin.from('assignment_state').update({ last_user_id: picked }).eq('id', true);

  return new Response(JSON.stringify({ id: picked }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
