import { memo, type CSSProperties } from 'react';
import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import { isAlbumListData, isSpriteData, sniffImageMime, type ArchiveEntry } from '../../o2jam';
import { fmtBytes } from '../../format';
import { COLS, TEXTISH_TYPES } from '../../features/packages/constants';
import { extOf, looksLikeMusicList, quickTextish } from '../../features/packages/packageUtils';
import { PackageIcon } from './PackageIcon';

export const OrigRow = memo(function OrigRow({
  e,
  on,
  removed,
  replaced,
  size,
  type,
  img,
  onPick,
  onToggle,
}: {
  e: ArchiveEntry;
  on: boolean;
  removed: boolean;
  replaced: boolean;
  size: number;
  type: string;
  img: boolean;
  onPick: (key: string) => void;
  onToggle: (index: number) => void;
}) {
  return (
    <li>
      <div
        className={`reg-row${on ? ' selrow' : ''}`}
        style={{ '--cols': COLS, opacity: removed ? 0.4 : 1 } as CSSProperties}
        role="button"
        tabIndex={0}
        onClick={() => onPick(`o${e.index}`)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onPick(`o${e.index}`);
          }
        }}
      >
        <span className="cell-mono">{e.index}</span>
        <div className="cell-lead">
          <span className="ico">{TEXTISH_TYPES.has(type) || e.ext === 'dat' ? <FileText size={15} /> : <PackageIcon ext={e.ext} />}</span>
          <span className="nm-text" title={e.name} style={{ textDecoration: removed ? 'line-through' : undefined }}>
            {e.name}
          </span>
          {replaced && <span className="chip warn">EDITED</span>}
        </div>
        <span className="chips">
          <span className={`chip${img ? ' img' : ''}`}>{type}</span>
        </span>
        <span className="cell-m dim">{fmtBytes(size)}</span>
        <div className="acts">
          <button
            className="rowact danger"
            type="button"
            aria-label={removed ? 'Restore' : 'Remove'}
            onClick={(ev) => {
              ev.stopPropagation();
              onToggle(e.index);
            }}
          >
            {removed ? <RotateCcw size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </li>
  );
});

export const AddedRow = memo(function AddedRow({
  a,
  i,
  on,
  edited,
  onPick,
  onRemove,
}: {
  a: { name: string; data: Uint8Array; };
  i: number;
  on: boolean;
  edited: boolean;
  onPick: (key: string) => void;
  onRemove: (i: number) => void;
}) {
  const ext = extOf(a.name);
  const mime = sniffImageMime(a.data.subarray(0, 8));
  const sprite = isSpriteData(a.data, a.name);
  const type = mime
    ? mime.split('/')[1]!.toUpperCase()
    : isAlbumListData(a.data)
      ? 'ALBUM LIST'
      : /^itemdata/i.test(a.name) && ext === 'dat'
        ? 'ITEM LIST'
        : looksLikeMusicList(a.data) && !sprite
          ? 'MUSIC LIST'
          : !sprite && quickTextish(a.data)
            ? 'TXT'
            : ext.toUpperCase() || '—';
  return (
    <li>
      <div
        className={`reg-row${on ? ' selrow' : ''}`}
        style={{ '--cols': COLS } as CSSProperties}
        role="button"
        tabIndex={0}
        onClick={() => onPick(`a${i}`)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            onPick(`a${i}`);
          }
        }}
      >
        <span className="cell-mono">+</span>
        <div className="cell-lead">
          <span className="ico">{TEXTISH_TYPES.has(type) || ext === 'dat' ? <FileText size={15} /> : <PackageIcon ext={ext} />}</span>
          <span className="nm-text" title={a.name}>
            {a.name}
          </span>
          <span className="chip ok">ADDED</span>
          {edited && <span className="chip warn">EDITED</span>}
        </div>
        <span className="chips">
          <span className={`chip${mime ? ' img' : ''}`}>{type}</span>
        </span>
        <span className="cell-m dim">{fmtBytes(a.data.length)}</span>
        <div className="acts">
          <button
            className="rowact danger"
            type="button"
            aria-label="Remove"
            onClick={(ev) => {
              ev.stopPropagation();
              onRemove(i);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  );
});
