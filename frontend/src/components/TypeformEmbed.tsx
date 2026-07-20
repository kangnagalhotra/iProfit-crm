import { useEffect } from 'react';

// Typeform's own "next" embed script — the lightweight, official,
// dependency-free embed method (vs. installing @typeform/embed-react),
// consistent with this app's otherwise-lean dependency list. The script
// auto-detects any element with a data-tf-live attribute already in the
// DOM or added afterward, so no imperative init call is needed here.
const EMBED_SCRIPT_SRC = '//embed.typeform.com/next/embed.js';
let scriptPromise: Promise<void> | null = null;

function loadEmbedScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${EMBED_SCRIPT_SRC}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = EMBED_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the Typeform embed script'));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export function TypeformEmbed({ formId, hiddenFields }: { formId: string; hiddenFields?: string }) {
  useEffect(() => {
    loadEmbedScript().catch(() => {});
  }, []);

  return (
    <div
      data-tf-live={formId}
      data-tf-hidden={hiddenFields || undefined}
      style={{ width: '100%', minHeight: 600 }}
    />
  );
}
