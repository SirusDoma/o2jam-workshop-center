import { useState, type ReactNode } from 'react';
import { Upload, X } from 'lucide-react';
import { collectDropped } from './DropZone';
import { SpriteCanvas, type DecodedBitmap } from './SpriteCanvas';

export function FrameGrid({
  className,
  onAddFiles,
  children,
}: {
  className: string;
  onAddFiles?: (files: File[]) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  if (!onAddFiles) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`${className}${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void collectDropped(e.dataTransfer).then((files) => {
          if (files.length) {
            onAddFiles(files);
          }
        });
      }}
    >
      {children}
    </div>
  );
}

export function FrameCell({
  index,
  width,
  height,
  bitmap,
  scale,
  on = false,
  onSelect,
  onReplace,
  onRemove,
}: {
  index: number;
  width: number;
  height: number;
  bitmap: DecodedBitmap | null;
  scale?: number;
  on?: boolean;
  onSelect?: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
}) {
  const preview = (
    <span className="spriteframe">
      <SpriteCanvas bitmap={bitmap} scale={scale} />
    </span>
  );
  return (
    <div className={`spritecell${on ? ' on' : ''}`}>
      {onSelect ? (
        <button type="button" className="spriteframe-btn" title="Select frame" onClick={onSelect}>
          {preview}
        </button>
      ) : (
        preview
      )}
      <span className="sc-meta">
        <span className="sc-i">
          #{index}: {width}×{height}
        </span>
        {(onReplace || onRemove) && (
          <span className="sc-ops">
            {onReplace && (
              <button type="button" title="Replace with BMP" onClick={onReplace}>
                <Upload size={11} />
              </button>
            )}
            {onRemove && (
              <button type="button" title="Remove frame" onClick={onRemove}>
                <X size={11} />
              </button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
