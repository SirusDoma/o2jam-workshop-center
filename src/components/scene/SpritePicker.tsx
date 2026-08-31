import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { FrameCell, FrameGrid } from '../../components/FrameCell';
import type { DecodedBitmap } from '../../components/SpriteCanvas';
import { fitScale, type EditFrame } from '../../features/scene/model';

export function SpritePicker({
  names,
  current,
  newLower,
  spriteFrames,
  decodeFrames,
  onPick,
  onClose,
  onAddOjs,
  onRemoveOjs,
  onReplaceFrame,
  onRemoveFrame,
  onAddFrame,
  onAddFrameFiles,
}: {
  names: string[];
  current: string;
  newLower: Set<string>;
  spriteFrames: Record<string, EditFrame[]>;
  decodeFrames: (name: string) => EditFrame[];
  onPick: (name: string) => void;
  onClose: () => void;
  onAddOjs: (name: string) => void;
  onRemoveOjs: (name: string) => void;
  onReplaceFrame: (name: string, i: number) => void;
  onRemoveFrame: (name: string, i: number) => void;
  onAddFrame: (name: string) => void;
  onAddFrameFiles: (name: string, files: File[]) => void;
}) {
  const [q, setQ] = useState(current);
  const [sel, setSel] = useState<string | null>(current || null);
  const downOnScrim = useRef(false);
  const ql = q.trim().toLowerCase();
  const matches = ql ? names.filter((n) => n.toLowerCase().includes(ql)) : names;
  const exact = names.some((n) => n.toLowerCase() === ql);
  const frames = useMemo(() => (sel ? spriteFrames[sel.toLowerCase()] ?? decodeFrames(sel) : []), [sel, spriteFrames, decodeFrames]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="overlay-panel mid card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <div className="oh-main">
            <div className="oh-row">
              <span className="overlay-title">Sprites</span>
            </div>
          </div>
          <div className="overlay-actions">
            <button className="ct-eye" type="button" title="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="spritepick-body">
          <div className="ctsel-refrow">
            <input className="secinput mono" autoFocus value={q} placeholder="name.ojs — any name, missing is allowed" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
            <button className="btn small" type="button" disabled={!q.trim()} onClick={() => onPick(q.trim())}>
              Use
            </button>
            <button className="btn small" type="button" disabled={!q.trim() || exact} title="Create a new .ojs" onClick={() => { onAddOjs(q.trim()); setSel(q.trim()); }}>
              <Plus size={13} /> OJS
            </button>
          </div>
          <div className="picklist scroller">
            {matches.length === 0 && <div className="archive-empty">NO MATCH</div>}
            {matches.slice(0, 400).map((n) => (
              <div key={n} className={`picklist-row managerow${n.toLowerCase() === (sel ?? '').toLowerCase() ? ' on' : ''}`}>
                <button type="button" className="pl-name" title="Edit frames" onClick={() => setSel(n)}>
                  <span className="mono">{n}</span>
                  {newLower.has(n.toLowerCase()) && <span className="chip">new</span>}
                </button>
                <button type="button" className="btn small pl-use" onClick={() => onPick(n)}>
                  Use
                </button>
                <button type="button" className="pl-del" title="Delete .ojs" onClick={() => { onRemoveOjs(n); if (sel === n) setSel(null); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          {sel && (
            <div className="sprite-edit">
              <div className="ctsel-blabel">
                Frames of <span className="mono">{sel}</span>
                <button className="btn small" type="button" style={{ marginLeft: 'auto' }} onClick={() => onAddFrame(sel)}>
                  <Plus size={12} /> Add frame
                </button>
              </div>
              <FrameGrid className="ctsel-frames" onAddFiles={(files) => onAddFrameFiles(sel, files)}>
                {frames.length === 0 && <div className="archive-empty">NO FRAMES</div>}
                {frames.map((f, i) => (
                  <FrameCell
                    key={i}
                    index={i}
                    width={f.width}
                    height={f.height}
                    bitmap={{ width: f.width, height: f.height, rgba: f.rgba } as DecodedBitmap}
                    scale={fitScale(f.width, f.height)}
                    onReplace={() => onReplaceFrame(sel, i)}
                    onRemove={() => onRemoveFrame(sel, i)}
                  />
                ))}
              </FrameGrid>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
