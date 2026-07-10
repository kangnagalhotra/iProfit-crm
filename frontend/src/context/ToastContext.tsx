import {
  createContext, useCallback, useContext, useState, ReactNode,
} from 'react';

interface ToastAction { label: string; onClick: () => void; }
interface ToastItem { id: number; message: string; type: 'success' | 'error'; action?: ToastAction; }
interface ToastApi {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({} as ToastApi);
export const useToast = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, type: ToastItem['type'], action?: ToastAction) => {
    const id = nextId++;
    setToasts((t) => [...t, {
      id, message, type, action,
    }]);
    // Toasts with an action (e.g. Undo) stay longer so the user can react.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4000);
  }, []);

  const api: ToastApi = {
    success: (message, action) => push(message, 'success', action),
    error: (message) => push(message, 'error'),
  };

  function runAction(t: ToastItem) {
    t.action?.onClick();
    setToasts((ts) => ts.filter((x) => x.id !== t.id));
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
            {t.action && (
              <button type="button" className="toast-action" onClick={() => runAction(t)}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
