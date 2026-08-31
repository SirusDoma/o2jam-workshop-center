import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'info';

interface ToastContextValue {
  notify: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue>({ notify: () => {} });

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [shown, setShown] = useState(false);

  const notify = useCallback((message: string, tone: Tone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const on = window.setTimeout(() => setShown(true), 20);
    const off = window.setTimeout(() => setShown(false), 3600);
    const gone = window.setTimeout(() => setToast(null), 3900);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
      window.clearTimeout(gone);
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone}${shown ? ' show' : ''}`} role="status">
          <span className="tdot" />
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
