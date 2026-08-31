import { memo, useMemo, useRef, useState } from 'react';
import { ChevronRight, Eye, EyeOff, Frame, GripVertical, Image as ImageIcon, Pencil, RotateCcw, Square, SquareDashed, X } from 'lucide-react';
import type { ControlEntry } from '../../o2jam';
import { ckey, defaultSource, type PosSource, type Row } from '../../features/scene/model';

export function ControlTree({
  rows,
  selected,
  expanded,
  drawn,
  hidden,
  boundHidden,
  removed,
  posSource,
  showBounds,
  onSelect,
  onToggle,
  onToggleHidden,
  onToggleBound,
  onToggleSource,
  onRestore,
  setLabel,
  onEditSet,
  onDeleteSet,
  onRestoreSet,
  onReorder,
}: {
  rows: Row[];
  selected: string | null;
  expanded: Record<number, boolean>;
  drawn: Set<string>;
  hidden: Set<string>;
  boundHidden: Set<string>;
  removed: Set<string>;
  posSource: Record<string, PosSource>;
  showBounds: boolean;
  onSelect: (id: string) => void;
  onToggle: (setId: number) => void;
  onToggleHidden: (id: string) => void;
  onToggleBound: (id: string) => void;
  onToggleSource: (c: ControlEntry) => void;
  onRestore: (id: string) => void;
  setLabel: (sid: number) => string;
  onEditSet: (sid: number) => void;
  onDeleteSet: (sid: number) => void;
  onRestoreSet: (sid: number) => void;
  onReorder: (dragKey: string, dragScope: 'unit' | 'member', targetKey: string, after: boolean) => void;
}) {
  const dragData = useRef<{ key: string; scope: 'unit' | 'member' } | null>(null);
  const [dropHint, setDropHint] = useState<{ key: string; after: boolean } | null>(null);
  const latest = useRef({ onSelect, onToggleHidden, onToggleBound, onToggleSource, onRestore, onReorder });
  latest.current = { onSelect, onToggleHidden, onToggleBound, onToggleSource, onRestore, onReorder };
  const stable = useMemo(
    () => ({
      onSelect: (id: string) => latest.current.onSelect(id),
      onToggleHidden: (id: string) => latest.current.onToggleHidden(id),
      onToggleBound: (id: string) => latest.current.onToggleBound(id),
      onToggleSource: (c: ControlEntry) => latest.current.onToggleSource(c),
      onRestore: (id: string) => latest.current.onRestore(id),
      startDrag: (key: string, scope: 'unit' | 'member') => {
        dragData.current = { key, scope };
      },
      overRow: (hintKey: string, e: React.DragEvent) => {
        if (!dragData.current) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        setDropHint((h) => (h && h.key === hintKey && h.after === after ? h : { key: hintKey, after }));
      },
      dropRow: (targetKey: string, e: React.DragEvent) => {
        e.preventDefault();
        const d = dragData.current;
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        dragData.current = null;
        setDropHint(null);
        if (d) latest.current.onReorder(d.key, d.scope, targetKey, after);
      },
      endDrag: () => {
        dragData.current = null;
        setDropHint(null);
      },
    }),
    []
  );
  const hintCls = (hintKey: string) => (dropHint?.key === hintKey ? (dropHint.after ? ' drop-below' : ' drop-above') : '');
  const { startDrag, overRow, dropRow, endDrag } = stable;
  const rowProps = { drawn, hidden, boundHidden, removed, posSource, showBounds, ...stable };
  return (
    <div className="ctree">
      {rows.length === 0 && <div className="archive-empty">NO MATCH</div>}
      {rows.map((row) => {
        if (row.kind === 'control') {
          const k = ckey(row.control);
          return <ControlRow key={k} c={row.control} on={selected === k} hintCls={hintCls(k)} {...rowProps} />;
        }
        if (row.kind === 'deadset') {
          return (
            <div key={`dead${row.setId}`} className="ctrow setrow removedctl">
              <ChevronRight size={13} style={{ flexShrink: 0 }} />
              <div className="ct-main">
                <span className="ct-name">SET</span>
                <span className="ct-id">{setLabel(row.setId)}</span>
              </div>
              <button className="ct-eye" type="button" aria-label="Restore SET" title="Restore SET" onClick={() => onRestoreSet(row.setId)}>
                <RotateCcw size={13} />
              </button>
            </div>
          );
        }
        const open = expanded[row.setId] ?? false;
        const dead = row.members.length > 0 && row.members.every((m) => removed.has(ckey(m)));
        if (dead) {
          return (
            <div key={`set${row.setId}`}>
              <div
                className="ctrow setrow removedctl"
                role="button"
                tabIndex={0}
                onClick={() => onToggle(row.setId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(row.setId);
                  }
                }}
              >
                <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : undefined, flexShrink: 0 }} />
                <div className="ct-main">
                  <span className="ct-name">SET</span>
                  <span className="ct-id">{setLabel(row.setId)}</span>
                </div>
                <button
                  className="ct-eye"
                  type="button"
                  aria-label="Restore SET"
                  title="Restore SET"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestoreSet(row.setId);
                  }}
                >
                  <RotateCcw size={13} />
                </button>
                <span className="chip">{row.members.length}</span>
              </div>
              {open && row.members.map((m) => <ControlRow key={ckey(m)} c={m} on={selected === ckey(m)} hintCls={hintCls(ckey(m))} {...rowProps} nested />)}
            </div>
          );
        }
        return (
          <div key={`set${row.setId}`}>
            <div
              className={`ctrow setrow${hintCls(`set${row.setId}`)}`}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(row.setId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(row.setId);
                }
              }}
              draggable
              onDragStart={(e) => {
                if (row.members[0]) startDrag(ckey(row.members[0]), 'unit');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `set${row.setId}`);
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => overRow(`set${row.setId}`, e)}
              onDrop={(e) => {
                if (row.members[0]) dropRow(ckey(row.members[0]), e);
              }}
            >
              <span className="ct-grip" title="Drag to reorder">
                <GripVertical size={12} />
              </span>
              <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : undefined, flexShrink: 0 }} />
              <div className="ct-main">
                <span className="ct-name">SET</span>
                <span className="ct-id">{setLabel(row.setId)}</span>
              </div>
              <button
                className="ct-eye"
                type="button"
                aria-label="Edit SET id"
                title="Edit SET id"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditSet(row.setId);
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="ct-eye"
                type="button"
                aria-label="Delete SET"
                title="Delete SET"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSet(row.setId);
                }}
              >
                <X size={13} />
              </button>
              <span className="chip">{row.members.length}</span>
            </div>
            {open && row.members.map((m) => <ControlRow key={ckey(m)} c={m} on={selected === ckey(m)} hintCls={hintCls(ckey(m))} {...rowProps} nested />)}
          </div>
        );
      })}
    </div>
  );
}

const ControlRow = memo(function ControlRow({
  c,
  on,
  hintCls,
  drawn,
  hidden,
  boundHidden,
  removed,
  posSource,
  showBounds,
  onSelect,
  onToggleHidden,
  onToggleBound,
  onToggleSource,
  onRestore,
  startDrag,
  overRow,
  dropRow,
  endDrag,
  nested,
}: {
  c: ControlEntry;
  on: boolean;
  hintCls: string;
  drawn: Set<string>;
  hidden: Set<string>;
  boundHidden: Set<string>;
  removed: Set<string>;
  posSource: Record<string, PosSource>;
  showBounds: boolean;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleBound: (id: string) => void;
  onToggleSource: (c: ControlEntry) => void;
  onRestore: (id: string) => void;
  startDrag: (key: string, scope: 'unit' | 'member') => void;
  overRow: (hintKey: string, e: React.DragEvent) => void;
  dropRow: (targetKey: string, e: React.DragEvent) => void;
  endDrag: () => void;
  nested?: boolean;
}) {
  const key = ckey(c);
  const off = hidden.has(key);
  const boundOff = boundHidden.has(key);
  const canSwitch = c.setId === null && !!c.sprite;
  const source = posSource[key] ?? defaultSource(c);
  if (removed.has(key)) {
    return (
      <div className={`ctrow removedctl${nested ? ' nested' : ''}${hintCls}`} onDragOver={(e) => overRow(key, e)} onDrop={(e) => dropRow(key, e)}>
        <span className="dot none" />
        <div className="ct-main">
          <span className="ct-name" title={c.token}>
            {c.token}
          </span>
          <span className="ct-id">{c.idHex}</span>
        </div>
        <span className="ct-sprite" title={c.sprite}>
          {c.sprite || '—'}
        </span>
        <button
          className="ct-eye"
          type="button"
          aria-label="Restore control"
          title="Restore control"
          onClick={(e) => {
            e.stopPropagation();
            onRestore(key);
          }}
        >
          <RotateCcw size={13} />
        </button>
      </div>
    );
  }
  return (
    <div
      className={`ctrow${nested ? ' nested' : ''}${on ? ' on' : ''}${off ? ' hiddenctl' : ''}${hintCls}`}
      role="button"
      tabIndex={0}
      draggable
      onClick={() => onSelect(key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(key); } }}
      onDragStart={(e) => {
        startDrag(key, nested ? 'member' : 'unit');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      }}
      onDragEnd={endDrag}
      onDragOver={(e) => overRow(key, e)}
      onDrop={(e) => dropRow(key, e)}
    >
      <span className="ct-grip" title="Drag to reorder">
        <GripVertical size={12} />
      </span>
      <span className={`dot${drawn.has(key) ? ' ok' : c.sprite ? '' : ' none'}`} />
      <div className="ct-main">
        <span className="ct-name" title={c.token}>
          {c.token}
        </span>
        <span className="ct-id">{c.idHex}</span>
      </div>
      <span className="ct-sprite" title={c.sprite}>
        {c.sprite || '—'}
      </span>
      <button
        className="ct-eye"
        type="button"
        aria-label={off ? 'Show' : 'Hide'}
        title={off ? 'Show in render' : 'Hide from render'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleHidden(key);
        }}
      >
        {off ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      {showBounds && (
        <button
          className={`ct-eye${boundOff ? '' : ' on'}`}
          type="button"
          aria-label={boundOff ? 'Show bound' : 'Hide bound'}
          title={boundOff ? 'Show bound outline' : 'Hide bound outline'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBound(key);
          }}
        >
          {boundOff ? <SquareDashed size={13} /> : <Square size={13} />}
        </button>
      )}
      {canSwitch && (
        <button
          className="ct-eye"
          type="button"
          aria-label={source === 'sprite' ? 'Positioned by sprite bound' : 'Positioned by control bound'}
          title={source === 'sprite' ? 'Positioned by sprite bound' : 'Positioned by control bound'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSource(c);
          }}
        >
          {source === 'sprite' ? <ImageIcon size={13} /> : <Frame size={13} />}
        </button>
      )}
    </div>
  );
});
