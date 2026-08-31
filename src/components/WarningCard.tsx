import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function WarningCard({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <section className="card">
      <div className="callout warn">
        <AlertTriangle size={15} />
        <div className="co-main"><span>{children}</span></div>
        {onClose && (
          <button className="rowact danger warning-close" type="button" aria-label="Dismiss warning" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
