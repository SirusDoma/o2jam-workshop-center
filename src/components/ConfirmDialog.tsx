import { useRef } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: 'danger' | 'primary';
  cancelLabel?: string | null;
  secondaryLabel?: string;
  onConfirm: () => void;
  onSecondary?: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, confirmTone = 'danger', cancelLabel = 'Cancel', secondaryLabel, onConfirm, onSecondary, onClose }: ConfirmDialogProps) {
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
      <div className="overlay-panel narrow card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
            {cancelLabel ? (
              <button className="btn" type="button" onClick={onClose}>
                {cancelLabel}
              </button>
            ) : null}
            {secondaryLabel && onSecondary && (
              <button className="btn" type="button" onClick={onSecondary}>
                {secondaryLabel}
              </button>
            )}
            <button className={`btn ${confirmTone}`} type="button" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
