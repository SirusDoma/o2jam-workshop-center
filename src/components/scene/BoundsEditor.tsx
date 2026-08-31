import { X } from 'lucide-react';
import type { Bound, ControlEntry } from '../../o2jam';

export function BoundsEditor({
  rows,
  onEdit,
  onRemove,
}: {
  rows: { key: string; token: string; bound: Bound; control: ControlEntry | null; }[];
  onEdit: (row: { bound: Bound; control: ControlEntry | null; }, patch: Partial<Bound>) => void;
  onRemove: (row: { bound: Bound; control: ControlEntry | null; }) => void;
}) {
  if (rows.length === 0) {
    return <div className="archive-empty">NO BOUNDS</div>;
  }

  return (
    <div className="boundlist">
      {rows.map((r, i) => (
        <div className="boundrow removable" key={r.key}>
          <span className="cell-mono" title={r.token}>
            {i}
          </span>
          {(['left', 'top', 'right', 'bottom'] as const).map((k) => (
            <input key={k} className="stackinput" aria-label={`Bound ${i} ${k}`} value={String(r.bound[k])} inputMode="numeric" onChange={(e) => onEdit(r, { [k]: Number(e.target.value) || 0 })} />
          ))}
          <button className="rowact danger" type="button" aria-label={`Remove bound ${i}`} onClick={() => onRemove(r)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
