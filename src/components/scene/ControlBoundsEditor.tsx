import type { Bound, ControlEntry } from '../../o2jam';
import type { PosSource } from '../../features/scene/model';

export function ControlBoundsEditor({
  control,
  bound,
  source,
  onChange,
}: {
  control: ControlEntry;
  bound: Bound;
  source: PosSource;
  onChange: (patch: Partial<Bound>) => void;
}) {
  return (
    <div className="ctsel-bound">
      <span className="ctsel-blabel">
        {control.boundIndex >= 0 ? `Control Bound #${control.boundIndex}` : 'Control Bound'}
        {source === 'bound' && <span className="ctsel-inuse">in use</span>}
      </span>
      <div className="ctsel-brow">
        {(['left', 'top', 'right', 'bottom'] as const).map((key) => (
          <label key={key} className="bfield">
            <span>{key}</span>
            <input
              className="stackinput"
              inputMode="numeric"
              value={String(bound[key])}
              onChange={(event) => onChange({ [key]: Number(event.target.value) || 0 })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
