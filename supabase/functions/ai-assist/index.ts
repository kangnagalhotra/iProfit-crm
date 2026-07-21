// AI Assistant (Summarize / Draft follow-up / Suggest next step) for Deal
// and Lead detail pages. Rebuilds ai_assistant_deal_page_prototype.html
// properly: the Anthropic API key never reaches the browser, and the
// context is built from real CRM data instead of hardcoded mock data.
//
// ai_assist_log (phase-t patch) backs both the rate limit and the usage
// log — one row per call, inserted before calling Anthropic so rapid
// clicks are throttled even if a prior call is still in flight or fails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MODEL = 'claude-sonnet-5';
const MAX_CALLS_PER_MINUTE = 5;
const MAX_TIMELINE_ENTRIES = 20;

type Action = 'summarize' | 'followup' | 'nextstep';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TASK_TYPE_LABEL: Record<string, string> = { CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting' };

function systemPromptFor(action: Action, subject: 'deal' | 'lead'): string {
  if (action === 'summarize') {
    return `You are a CRM assistant. Summarize the ${subject} below in 3-4 concise sentences for a sales manager glancing at the ${subject} card. Focus on where things stand and what the key open issue is.`;
  }
  if (action === 'followup') {
    return `You are a CRM assistant helping a sales rep draft a follow-up email based on the ${subject} timeline below. Write a short, professional follow-up email addressing the most recent open concern. Keep it under 120 words. Do not use em dashes.`;
  }
  return `You are a CRM assistant. Based on the ${subject} timeline below, suggest one specific, concrete next step the sales rep should take this week, and briefly explain why, in 2-3 sentences. If the timeline is empty or very short, suggest scheduling an initial discovery call and explain why — treat a sparse timeline as normal for a new ${subject}, not as an error.`;
}

interface TimelineEntry { at: string; label: string; body: string; }

function formatTimeline(entries: TimelineEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX_TIMELINE_ENTRIES)
    .reverse()
    .map((e) => `- ${formatDate(e.at)} (${e.label}): ${e.body}`);
  return `\n\nTimeline:\n${lines.join('\n')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await anon.auth.getUser();
  if (authError || !user) return jsonResponse({ error: 'Not authenticated' }, 401);

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return jsonResponse({ error: 'The AI assistant is not configured yet — ask an admin to set ANTHROPIC_API_KEY.' }, 500);

  let body: { action?: string; dealId?: string; leadId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const { action, dealId, leadId } = body;
  if (!action || !['summarize', 'followup', 'nextstep'].includes(action)) {
    return jsonResponse({ error: 'action must be one of summarize, followup, nextstep' }, 400);
  }
  if ((!dealId && !leadId) || (dealId && leadId)) {
    return jsonResponse({ error: 'Provide exactly one of dealId or leadId' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // --- Rate limit: count this user's calls in the last minute ---
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCalls } = await admin
    .from('ai_assist_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneMinuteAgo);
  if ((recentCalls ?? 0) >= MAX_CALLS_PER_MINUTE) {
    return jsonResponse({ error: 'Too many AI requests — wait a moment and try again.' }, 429);
  }

  // Logged before calling Anthropic so this also throttles rapid-fire
  // clicks whose earlier call is still in flight or failed.
  await admin.from('ai_assist_log').insert({
    user_id: user.id, action, lead_id: leadId ?? null, opportunity_id: dealId ?? null,
  });

  // --- Build context from real data ---
  let subject: 'deal' | 'lead';
  let contextText: string;
  let timelineEntries: TimelineEntry[];

  if (dealId) {
    subject = 'deal';
    const { data: deal, error: dealError } = await admin
      .from('opportunities')
      .select(`
        name, amount, currency,
        stage:deal_stages(name),
        owner:profiles!opportunities_owner_id_fkey(full_name),
        account:accounts!opportunities_account_id_fkey(name),
        contact:contacts(first_name, last_name, email)
      `)
      .eq('id', dealId)
      .single();
    if (dealError || !deal) return jsonResponse({ error: 'Deal not found' }, 404);

    const [{ data: tasks }, { data: activities }] = await Promise.all([
      admin.from('tasks').select('type, notes, title, completed_at')
        .eq('opportunity_id', dealId).eq('status', 'COMPLETED').in('type', ['CALL', 'EMAIL', 'MEETING']),
      admin.from('activities').select('body, occurred_at').eq('opportunity_id', dealId).eq('type', 'NOTE'),
    ]);
    timelineEntries = [
      ...(tasks ?? []).filter((t: any) => t.completed_at).map((t: any) => ({
        at: t.completed_at, label: TASK_TYPE_LABEL[t.type] ?? t.type, body: t.notes || t.title,
      })),
      ...(activities ?? []).map((a: any) => ({ at: a.occurred_at, label: 'Note', body: a.body })),
    ];

    const contactName = deal.contact ? [deal.contact.first_name, deal.contact.last_name].filter(Boolean).join(' ') : undefined;
    contextText = [
      `Deal: ${deal.name}`,
      deal.account?.name ? `Company: ${deal.account.name}` : null,
      deal.amount ? `Deal value: ${deal.currency ?? ''} ${deal.amount}`.trim() : null,
      deal.stage?.name ? `Stage: ${deal.stage.name}` : null,
      deal.owner?.full_name ? `Owner: ${deal.owner.full_name}` : null,
      contactName ? `Contact: ${contactName}` : null,
    ].filter(Boolean).join('\n') + formatTimeline(timelineEntries);
  } else {
    subject = 'lead';
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select(`
        first_name, last_name, lead_name, value,
        stage:lead_stages(name),
        owner:profiles!leads_owner_id_fkey(full_name),
        account:accounts(name),
        source:lead_source_options(name)
      `)
      .eq('id', leadId)
      .single();
    if (leadError || !lead) return jsonResponse({ error: 'Lead not found' }, 404);

    const [{ data: tasks }, { data: activities }] = await Promise.all([
      admin.from('tasks').select('type, notes, title, completed_at')
        .eq('lead_id', leadId).eq('status', 'COMPLETED').in('type', ['CALL', 'EMAIL', 'MEETING']),
      admin.from('activities').select('body, occurred_at').eq('lead_id', leadId).eq('type', 'NOTE'),
    ]);
    timelineEntries = [
      ...(tasks ?? []).filter((t: any) => t.completed_at).map((t: any) => ({
        at: t.completed_at, label: TASK_TYPE_LABEL[t.type] ?? t.type, body: t.notes || t.title,
      })),
      ...(activities ?? []).map((a: any) => ({ at: a.occurred_at, label: 'Note', body: a.body })),
    ];

    const leadName = lead.lead_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Untitled lead';
    contextText = [
      `Lead: ${leadName}`,
      lead.account?.name ? `Company: ${lead.account.name}` : null,
      lead.value ? `Estimated value: ${lead.value}` : null,
      lead.stage?.name ? `Stage: ${lead.stage.name}` : null,
      lead.source?.name ? `Source: ${lead.source.name}` : null,
      lead.owner?.full_name ? `Owner: ${lead.owner.full_name}` : null,
    ].filter(Boolean).join('\n') + formatTimeline(timelineEntries);
  }

  // --- Call Anthropic ---
  const system = systemPromptFor(action as Action, subject);
  const instruction = action === 'followup' ? 'email body' : 'response';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system,
        messages: [
          { role: 'user', content: `Here is the ${subject} data:\n${contextText}\n\nRespond with only the ${instruction}, no preamble.` },
        ],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      return jsonResponse({ error: `AI assistant call failed: ${errBody.slice(0, 200)}` }, 502);
    }
    const data = await response.json();
    const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return jsonResponse({ result: text || 'No response received.' });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Could not reach the AI assistant' }, 502);
  }
});
