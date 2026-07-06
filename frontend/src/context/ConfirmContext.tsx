import {
  createContext, useCallback, useContext, useState, ReactNode,
} from 'react';

type Confirm = (message: string, opts?: { title?: string; confirmLabel?: string }) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

interface PendingConfirm {
  message: string;
  title?: string;
  confirmLabel?: string;
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm: Confirm = useCallback((message, opts) => new Promise((resolve) => {
    setPending({ message, resolve, ...opts });
  }), []);

  function respond(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="modal-overlay" onClick={() => respond(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{pending.title ?? 'Are you sure?'}</h3>
            <p style={{ color: 'var(--muted)' }}>{pending.message}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn" style={{ background: '#b91c1c' }} onClick={() => respond(true)}>
                {pending.confirmLabel ?? 'Delete'}
              </button>
              <button className="btn secondary" onClick={() => respond(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
