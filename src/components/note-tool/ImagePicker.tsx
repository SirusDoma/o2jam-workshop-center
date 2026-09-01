import type { ChangeEvent } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import type { PreviewImage } from '../../features/note-tool/types';

export function ImagePicker({
  label,
  image,
  onChange,
  onPreview,
  onRemove,
}: {
  label: PreviewImage['label'];
  image: PreviewImage | null;
  onChange: (label: PreviewImage['label'], event: ChangeEvent<HTMLInputElement>) => void;
  onPreview: (image: PreviewImage) => void;
  onRemove: (label: PreviewImage['label']) => void;
}) {
  return (
    <div className="nt-image-picker">
      <span className="nt-image-label">{label}</span>
      <div className="nt-image-control">
        <ImageIcon aria-hidden="true" />
        <div className="nt-image-actions">
          <label className="btn small nt-image-browse">
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/bmp,image/gif"
              aria-label={`Browse ${label}`}
              onChange={(event) => onChange(label, event)}
            />
            Browse
          </label>
          {image ? (
            <>
              <button className="btn small nt-image-preview-inline" type="button" onClick={() => onPreview(image)}>Preview</button>
              <button className="icon-btn nt-image-remove" type="button" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => onRemove(label)}><X /></button>
            </>
          ) : (
            <span className="nt-image-empty">No file loaded</span>
          )}
        </div>
      </div>
    </div>
  );
}
