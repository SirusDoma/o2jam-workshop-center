import { AlertTriangle, Image as ImageIcon, MoveVertical, Plus, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ControlEntry } from '../../o2jam';
import { FrameCell, FrameGrid } from '../FrameCell';
import { fitScale, parseScroll, type FieldEdit, type Placed, type PosSource } from '../../features/scene/model';

export function ControlSpriteEditor({
  control,
  placed,
  frame,
  source,
  spriteRows,
  spriteMissing,
  spriteOn,
  textOn,
  onField,
  onFrame,
  onSpriteRow,
  onBrowse,
  onAddSprite,
  onAddText,
  onRemoveSprite,
  onRemoveText,
  onReplaceFrame,
  onRemoveFrame,
  onAddFrame,
  onAddFrameFiles,
  children,
}: {
  control: ControlEntry;
  placed: Placed | null;
  frame: number;
  source: PosSource;
  spriteRows: { x: number; y: number; w: number; h: number; }[] | null;
  spriteMissing: boolean;
  spriteOn: boolean;
  textOn: boolean;
  onField: (patch: FieldEdit) => void;
  onFrame: (frame: number) => void;
  onSpriteRow: (index: number, patch: { x?: number; y?: number; }) => void;
  onBrowse: () => void;
  onAddSprite: () => void;
  onAddText: () => void;
  onRemoveSprite: () => void;
  onRemoveText: () => void;
  onReplaceFrame: (index: number) => void;
  onRemoveFrame: (index: number) => void;
  onAddFrame: () => void;
  onAddFrameFiles: (files: File[]) => void;
  children?: ReactNode;
}) {
  const scroll = spriteOn ? parseScroll(control.sprite) : null;

  return (
    <>
      {spriteOn && scroll && (
        <div className="ctsel-note">
          <div className="scrollgrid">
            <div className="bfield">
              <span className="ctsel-blabel">
                Scrollbar
                <button className="ctsel-x" type="button" title="Remove scrollbar properties" onClick={onRemoveSprite}>
                  <X size={12} />
                </button>
              </span>
              <select
                className="secinput"
                aria-label="Orientation"
                value={scroll.orient}
                onChange={(event) => onField({ sprite: `${event.target.value} ${scroll.w} ${scroll.h}` })}
              >
                <option value="O2_SBS_HORZ">Horizontal (O2_SBS_HORZ)</option>
                <option value="O2_SBS_VERT">Vertical (O2_SBS_VERT)</option>
              </select>
            </div>
            <label className="bfield">
              <span>Width</span>
              <input
                className="secinput"
                inputMode="numeric"
                value={String(scroll.w)}
                onChange={(event) => onField({ sprite: `${scroll.orient} ${Number(event.target.value) || 0} ${scroll.h}` })}
              />
            </label>
            <label className="bfield">
              <span>Height</span>
              <input
                className="secinput"
                inputMode="numeric"
                value={String(scroll.h)}
                onChange={(event) => onField({ sprite: `${scroll.orient} ${scroll.w} ${Number(event.target.value) || 0}` })}
              />
            </label>
          </div>
        </div>
      )}

      {spriteOn && !scroll && (
        <div className="ctsel-note">
          <span className="ctsel-blabel">
            Sprite Reference
            {spriteMissing && <span className="ctsel-warn"><AlertTriangle size={11} /> not found</span>}
            <button className="ctsel-x" type="button" title="Remove sprite properties" onClick={onRemoveSprite}>
              <X size={12} />
            </button>
          </span>
          <div className="ctsel-refrow">
            <input
              className={`secinput mono${spriteMissing ? ' warn' : ''}`}
              value={control.sprite}
              placeholder="name.ojs — blank for none"
              spellCheck={false}
              onChange={(event) => onField({ sprite: event.target.value })}
            />
            <button className="btn small" type="button" onClick={onBrowse} title="Browse sprites"><Search size={13} /></button>
            {control.sprite && (
              <button className="btn small" type="button" onClick={() => onField({ sprite: '' })} title="Unlink sprite"><X size={13} /></button>
            )}
          </div>
        </div>
      )}

      {children}

      {!scroll && (
        <div className="ctsel-addrow">
          {!spriteOn && (
            <button className="btn" type="button" onClick={onAddSprite}>
              <Plus size={14} />
              ADD SPRITE PROPERTIES
            </button>
          )}
          {!textOn && (
            <button className="btn" type="button" onClick={onAddText}>
              <Plus size={14} />
              ADD TEXT PROPERTIES
            </button>
          )}
          <button
            className="btn"
            type="button"
            onClick={() => {
              onRemoveText();
              onAddSprite();
              onField({ sprite: 'O2_SBS_VERT 7 100', id: ((control.id & 0xff00ffff) | 0x00020000) >>> 0 });
            }}
          >
            <MoveVertical size={14} />
            CONVERT TO SCROLL BAR
          </button>
        </div>
      )}

      {scroll && (
        <div className="ctsel-addrow">
          <button
            className="btn"
            type="button"
            onClick={() => {
              onAddSprite();
              onField({ sprite: '', id: ((control.id & 0xff00ffff) | 0x00500000) >>> 0 });
            }}
          >
            <ImageIcon size={14} />
            CONVERT TO SPRITE
          </button>
        </div>
      )}

      {spriteOn && placed && placed.frames.length > 0 && (
        <FrameGrid className="ctsel-frames" onAddFiles={onAddFrameFiles}>
          {placed.frames.map((decoded, index) => (
            <FrameCell
              key={index}
              index={index}
              width={decoded.width}
              height={decoded.height}
              bitmap={decoded}
              scale={fitScale(decoded.width, decoded.height)}
              on={index === frame}
              onSelect={() => onFrame(index)}
              onReplace={() => onReplaceFrame(index)}
              onRemove={() => onRemoveFrame(index)}
            />
          ))}
          <button type="button" className="spritecell addframe" title="Add a frame from BMP" onClick={onAddFrame}>
            <Plus size={16} />
            <span>Add frame</span>
          </button>
        </FrameGrid>
      )}

      {spriteOn && spriteRows && spriteRows.length > 0 && (
        <div className="ctsel-bound">
          <span className="ctsel-blabel">
            Sprite Bounds{source === 'sprite' && <span className="ctsel-inuse">in use</span>}
          </span>
          <div className="sbtable">
            <div className="sbrow sbhead"><span>#</span><span>x</span><span>y</span><span>w</span><span>h</span><span /></div>
            {spriteRows.map((row, index) => (
              <div key={index} className="sbrow">
                <button
                  type="button"
                  className={`sb-i${source === 'sprite' && index === frame ? ' on' : ''}`}
                  title="Select frame"
                  onClick={() => onFrame(index)}
                >
                  #{index}
                </button>
                <input className="stackinput" inputMode="numeric" aria-label={`Frame ${index} x`} value={String(row.x)} onChange={(event) => onSpriteRow(index, { x: Number(event.target.value) || 0 })} />
                <input className="stackinput" inputMode="numeric" aria-label={`Frame ${index} y`} value={String(row.y)} onChange={(event) => onSpriteRow(index, { y: Number(event.target.value) || 0 })} />
                <input className="stackinput" aria-label={`Frame ${index} width`} value={String(row.w)} disabled />
                <input className="stackinput" aria-label={`Frame ${index} height`} value={String(row.h)} disabled />
                {source === 'sprite' && index === frame ? <span className="ctsel-inuse">in use</span> : <span />}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
