import { Eye, EyeOff, Frame, Image as ImageIcon, RotateCcw, Square, SquareDashed, Trash2 } from 'lucide-react';
import type { Bound, ControlEntry } from '../../o2jam';
import { ControlBoundsEditor } from './ControlBoundsEditor';
import { ControlSpriteEditor } from './ControlSpriteEditor';
import { ControlTextEditor } from './ControlTextEditor';
import type { FieldEdit, Placed, PosSource, TextStyle } from '../../features/scene/model';

export function SceneInspector({
  control,
  placed,
  bound,
  frame,
  off,
  boundOff,
  showBounds,
  source,
  canSwitch,
  spriteRows,
  spriteMissing,
  spriteOn,
  textOn,
  style,
  edited,
  onRevert,
  onField,
  onFrame,
  onBound,
  onSpriteRow,
  onBrowse,
  onRemove,
  onAddSprite,
  onAddText,
  onRemoveSprite,
  onRemoveText,
  onReplaceFrame,
  onRemoveFrame,
  onAddFrame,
  onAddFrameFiles,
  onToggleHidden,
  onToggleBound,
  onToggleSource,
  onStyle,
}: {
  control: ControlEntry;
  placed: Placed | null;
  bound: Bound | undefined;
  frame: number;
  off: boolean;
  boundOff: boolean;
  showBounds: boolean;
  source: PosSource;
  canSwitch: boolean;
  spriteRows: { x: number; y: number; w: number; h: number }[] | null;
  spriteMissing: boolean;
  spriteOn: boolean;
  textOn: boolean;
  style: TextStyle;
  edited: boolean;
  onRevert: () => void;
  onField: (patch: FieldEdit) => void;
  onFrame: (frame: number) => void;
  onBound: (patch: Partial<Bound>) => void;
  onSpriteRow: (index: number, patch: { x?: number; y?: number }) => void;
  onBrowse: () => void;
  onRemove: () => void;
  onAddSprite: () => void;
  onAddText: () => void;
  onRemoveSprite: () => void;
  onRemoveText: () => void;
  onReplaceFrame: (index: number) => void;
  onRemoveFrame: (index: number) => void;
  onAddFrame: () => void;
  onAddFrameFiles: (files: File[]) => void;
  onToggleHidden: () => void;
  onToggleBound: () => void;
  onToggleSource: () => void;
  onStyle: (patch: Partial<TextStyle>) => void;
}) {
  const parseId = (value: string) => {
    const id = parseInt(value.replace(/^0x/i, '') || '0', 16);
    onField({ id: Number.isNaN(id) ? control.id : id >>> 0 });
  };

  return (
    <div className="ctsel">
      <div className="ctsel-head">
        <button className="ct-eye ctsel-eye" type="button" aria-label={off ? 'Show' : 'Hide'} title={off ? 'Show in render' : 'Hide from render'} onClick={onToggleHidden}>
          {off ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        {showBounds && (
          <button className={`ct-eye ctsel-eye${boundOff ? '' : ' on'}`} type="button" aria-label={boundOff ? 'Show bound' : 'Hide bound'} title={boundOff ? 'Show bound outline' : 'Hide bound outline'} onClick={onToggleBound}>
            {boundOff ? <SquareDashed size={14} /> : <Square size={14} />}
          </button>
        )}
        {canSwitch && (
          <button className="ct-eye ctsel-eye" type="button" aria-label={source === 'sprite' ? 'Positioned by sprite bound' : 'Positioned by control bound'} title={source === 'sprite' ? 'Positioned by sprite bound' : 'Positioned by control bound'} onClick={onToggleSource}>
            {source === 'sprite' ? <ImageIcon size={14} /> : <Frame size={14} />}
          </button>
        )}
        <button className="ct-eye ctsel-undo" type="button" title="Revert this control's edits" onClick={onRevert} disabled={!edited}>
          <RotateCcw size={14} />
        </button>
        <button className="ct-eye ctsel-del" type="button" title="Remove control" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="ctsel-note ctsel-ident">
        <label className="tfield">
          <span>Name</span>
          <input className="secinput" value={control.token} spellCheck={false} onChange={(event) => onField({ token: event.target.value })} />
        </label>
        <label className="tfield">
          <span>ID</span>
          <input className="secinput mono" value={control.idHex} spellCheck={false} onChange={(event) => parseId(event.target.value)} />
        </label>
      </div>

      <ControlSpriteEditor
        control={control}
        placed={placed}
        frame={frame}
        source={source}
        spriteRows={spriteRows}
        spriteMissing={spriteMissing}
        spriteOn={spriteOn}
        textOn={textOn}
        onField={onField}
        onFrame={onFrame}
        onSpriteRow={onSpriteRow}
        onBrowse={onBrowse}
        onAddSprite={onAddSprite}
        onAddText={onAddText}
        onRemoveSprite={onRemoveSprite}
        onRemoveText={onRemoveText}
        onReplaceFrame={onReplaceFrame}
        onRemoveFrame={onRemoveFrame}
        onAddFrame={onAddFrame}
        onAddFrameFiles={onAddFrameFiles}
      >
        {textOn && <ControlTextEditor style={style} onRemove={onRemoveText} onChange={onStyle} />}
      </ControlSpriteEditor>

      {bound && <ControlBoundsEditor control={control} bound={bound} source={source} onChange={onBound} />}
    </div>
  );
}
