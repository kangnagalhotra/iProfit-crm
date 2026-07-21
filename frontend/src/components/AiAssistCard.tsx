import { useState } from 'react';
import type { AiAssistAction } from '../api/aiAssist';
import { runAiAssist } from '../api/aiAssist';
import { QuickTaskModal } from './QuickTaskModal';
import { Icon } from './Icon';
import { useToast } from '../context/ToastContext';

const BUTTON_LABEL: Record<AiAssistAction, string> = {
  summarize: 'Summarize this',
  followup: 'Draft follow-up email',
  nextstep: 'Suggest next step',
};

const LOADING_LABEL: Record<AiAssistAction, string> = {
  summarize: 'Summarizing…',
  followup: 'Drafting…',
  nextstep: 'Thinking…',
};

const textareaStyle = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
};

// Rebuilds ai_assistant_deal_page_prototype.html against real CRM data via
// the ai-assist Edge Function — the Anthropic API key never reaches the
// browser. Same three actions as the prototype, on both Deal and Lead pages.
export function AiAssistCard({
  dealId, leadId, contactName, contactEmail, contactPhone,
}: {
  dealId?: string; leadId?: string;
  contactName?: string; contactEmail?: string; contactPhone?: string;
}) {
  const toast = useToast();
  const subject = dealId ? 'deal' : 'lead';
  const [loading, setLoading] = useState<AiAssistAction | null>(null);
  const [lastAction, setLastAction] = useState<AiAssistAction | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [showUseDraft, setShowUseDraft] = useState(false);

  async function run(action: AiAssistAction) {
    setLoading(action);
    setError('');
    try {
      const text = await runAiAssist({ action, dealId, leadId });
      setResult(text);
      setLastAction(action);
    } catch (e: any) {
      setError(e.message ?? 'Could not reach the AI assistant');
      setLastAction(null);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>AI Assistant</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(['summarize', 'followup', 'nextstep'] as AiAssistAction[]).map((action) => (
          <button
            key={action}
            className="btn secondary btn-icon"
            onClick={() => run(action)}
            disabled={loading !== null}
          >
            <Icon name="sparkle" size={14} />
            {loading === action ? LOADING_LABEL[action] : `${BUTTON_LABEL[action]}${action === 'summarize' ? ` ${subject}` : ''}`}
          </button>
        ))}
      </div>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {lastAction && result && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          {lastAction === 'followup' ? (
            <>
              <textarea
                rows={6}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                style={textareaStyle}
              />
              <button
                className="btn secondary btn-icon"
                style={{ marginTop: 8 }}
                onClick={() => setShowUseDraft(true)}
              >
                <Icon name="mail" size={14} /> Use this draft
              </button>
            </>
          ) : (
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{result}</div>
          )}
        </div>
      )}

      {showUseDraft && (
        <QuickTaskModal
          type="EMAIL"
          leadId={leadId}
          opportunityId={dealId}
          defaultTitle={`Email to ${contactName ?? subject}`}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
          initialNotes={result}
          onClose={() => setShowUseDraft(false)}
          onSaved={() => { setShowUseDraft(false); toast.success('Logged'); }}
        />
      )}
    </div>
  );
}
