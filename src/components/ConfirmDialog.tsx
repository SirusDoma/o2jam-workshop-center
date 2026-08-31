import { useRef } from 'react';
import { X } from 'lucide-react';

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; }) {
  const downOnScrim = useRef(false);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="overlay-panel narrow card" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <div className="oh-main">
            <div className="oh-row">
              <span className="overlay-title">{title}</span>
            </div>
          </div>
          <div className="overlay-actions">
            <button className="ct-eye" type="button" title="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="confirm-body">
          <p>{body}</p>
          <div className="confirm-actions">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn danger" type="button" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
