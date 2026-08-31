import { X } from 'lucide-react';
import type { HAlign, TextStyle, VAlign } from '../../features/scene/model';

export function ControlTextEditor({
  style,
  onRemove,
  onChange,
}: {
  style: TextStyle;
  onRemove: () => void;
  onChange: (patch: Partial<TextStyle>) => void;
}) {
  return (
    <div className="ctsel-note">
      <span className="ctsel-blabel">
        Text
        <button className="ctsel-x" type="button" title="Remove text properties" onClick={onRemove}>
          <X size={12} />
        </button>
      </span>
      <textarea
        className="secinput ctsel-text"
        rows={2}
        value={style.text}
        placeholder="Enter text here.."
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <div className="ctsel-tgrid">
        <label className="tfield">
          <span>Color</span>
          <input className="tcolor" type="color" value={style.color} onChange={(event) => onChange({ color: event.target.value })} />
        </label>
        <label className="tfield">
          <span>Size</span>
          <input
            className="stackinput"
            inputMode="numeric"
            value={String(style.size)}
            onChange={(event) => onChange({ size: Math.max(1, Number(event.target.value) || 0) })}
          />
        </label>
        <label className="tfield">
          <span>Horizontal</span>
          <select className="secinput" value={style.halign} onChange={(event) => onChange({ halign: event.target.value as HAlign })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="tfield">
          <span>Vertical</span>
          <select className="secinput" value={style.valign} onChange={(event) => onChange({ valign: event.target.value as VAlign })}>
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
      </div>
      <label className="tcheck">
        <input type="checkbox" checked={style.outline} onChange={(event) => onChange({ outline: event.target.checked })} />
        <span>Use Outline</span>
      </label>
    </div>
  );
}
