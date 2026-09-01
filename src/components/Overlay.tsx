import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Overlay({
  children,
  onClose,
  label,
  width = 'wide',
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  width?: 'compact' | 'narrow' | 'mid' | 'wide';
}) {
  // Close only if both pointer down and pointer up hit the scrim.
  const downOnScrim = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`card overlay-panel${width === 'wide' ? '' : ` ${width}`}`}>{children}</div>
    </div>
  );
}

export function CloseButton({ onClose }: { onClose: () => void; }) {
  return (
    <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
      <X size={15} />
    </button>
  );
}
