import { memo, type CSSProperties } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { ItemEntry } from '../../o2jam';
import { COLS } from '../../features/avatar/constants';
import { AvatarItemIcon } from './AvatarItemIcon';

export const AvatarItemRow = memo(function AvatarItemRow({
  it,
  on,
  edited,
  removed,
  onPick,
  onRemove,
  onRestore,
}: {
  it: ItemEntry;
  on: boolean;
  edited: boolean;
  removed: boolean;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onRestore: (index: number) => void;
}) {
  return (
    <li>
      <div
        className={`reg-row${on ? ' selrow' : ''}`}
        style={{ '--cols': COLS, opacity: removed ? 0.4 : 1 } as CSSProperties}
        role="button"
        tabIndex={0}
        onClick={() => onPick(it.index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick(it.index);
          }
        }}
      >
        <span className="cell-mono">{it.itemId}</span>
        <div className="cell-lead">
          <span className="ico"><AvatarItemIcon item={it} /></span>
          <div className="nm-stack">
            <span className="nm-text" title={it.name} style={{ textDecoration: removed ? 'line-through' : undefined }}>
              {it.name || '—'}
            </span>
            <span className="nm-sub">{it.planetLabel}</span>
          </div>
          {it.index >= 1_000_000 && <span className="chip ok">ADDED</span>}
          {edited && <span className="chip warn">EDITED</span>}
        </div>
        <span className="chips">
          <span className="chip" title={it.itemPartLabel}>
            {it.itemTypeLabel}
          </span>
        </span>
        <span className="chips">
          <span className="chip">{it.gender.toUpperCase()}</span>
        </span>
        <div className="acts">
          <button
            className="rowact danger"
            type="button"
            aria-label={removed ? 'Restore' : 'Remove'}
            onClick={(e) => {
              e.stopPropagation();
              (removed ? onRestore : onRemove)(it.index);
            }}
          >
            {removed ? <RotateCcw size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </li>
  );
});
