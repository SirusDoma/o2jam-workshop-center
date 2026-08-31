import type { CSSProperties } from 'react';
import { Layers, RotateCcw, Trash2 } from 'lucide-react';
import type { SetInfoEntry } from '../../o2jam';
import type { SetEdit } from '../../features/avatar/types';
import { AvatarTableToolbar, type AvatarTableSource } from './AvatarTableToolbar';

const SET_COLS = '46px minmax(0, 1fr) 70px 76px 30px';

export function AvatarSetsTable({ sets, query, hasSetInfo, selected, edits, removed, source, onQuery, onAdd, onPick, onRemove, onRestore }: {
  sets: SetInfoEntry[];
  query: string;
  hasSetInfo: boolean;
  selected: number | null;
  edits: Record<number, SetEdit>;
  removed: ReadonlySet<number>;
  source: AvatarTableSource;
  onQuery: (query: string) => void;
  onAdd: () => void;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onRestore: (index: number) => void;
}) {
  const term = query.trim().toLowerCase();
  const visible = term ? sets.filter((set) => `${set.id} ${set.name}`.toLowerCase().includes(term)) : sets;
  return (
    <>
      <div className="archive-pin">
        <AvatarTableToolbar sources={[source]} query={query} addLabel="ADD SET" addDisabled={!hasSetInfo} onQuery={onQuery} onAdd={onAdd} />
        <div className="reg-head" style={{ '--cols': SET_COLS } as CSSProperties}><span>ID</span><span>Name</span><span>Items</span><span>Gender</span><span /></div>
      </div>
      <div className="archive-list">
        {!hasSetInfo ? <div className="empty">NO SETINFODATA.OJS IN THIS PACKAGE</div> : visible.length === 0 ? <div className="empty">NO MATCH</div> : (
          <ul className="rows">
            {visible.map((set) => {
              const isRemoved = removed.has(set.index);
              return (
                <li key={set.index}>
                  <div className={`reg-row${selected === set.index ? ' selrow' : ''}`} style={{ '--cols': SET_COLS, opacity: isRemoved ? 0.4 : 1 } as CSSProperties} role="button" tabIndex={0} onClick={() => onPick(set.index)} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault(); onPick(set.index);
                    }
                  }}>
                    <span className="cell-mono">{set.id}</span>
                    <div className="cell-lead"><span className="ico"><Layers size={15} /></span><div className="nm-stack"><span className="nm-text" title={set.name} style={{ textDecoration: isRemoved ? 'line-through' : undefined }}>{set.name || '—'}</span><span className="nm-sub">{set.planetLabel}</span></div>{set.index >= 1_000_000 && <span className="chip ok">ADDED</span>}{edits[set.index] && <span className="chip warn">EDITED</span>}</div>
                    <span className="chips"><span className="chip">{set.itemCount}</span></span>
                    <span className="chips"><span className="chip">{set.gender.toUpperCase()}</span></span>
                    <div className="acts"><button className="rowact danger" type="button" aria-label={isRemoved ? 'Restore' : 'Remove'} onClick={(event) => { event.stopPropagation(); (isRemoved ? onRestore : onRemove)(set.index); }}>{isRemoved ? <RotateCcw size={14} /> : <Trash2 size={14} />}</button></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
