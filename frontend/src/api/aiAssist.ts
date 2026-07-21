import { supabase } from '../lib/supabase';

export type AiAssistAction = 'summarize' | 'followup' | 'nextstep';

export async function runAiAssist(params: { action: AiAssistAction; dealId?: string; leadId?: string }): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-assist', { body: params });
  if (error) {
    // supabase-js doesn't surface the function's own JSON error body by
    // default (error.message is a generic "non-2xx status code") — read the
    // actual { error: "..." } payload the function returns instead.
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message ?? 'Could not reach the AI assistant');
  }
  return data.result as string;
}
