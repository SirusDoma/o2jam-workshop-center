import type { CSSProperties } from 'react';
import type { ArgumentsPreset } from '../../o2jam';
import { StackHead } from '../Shell';

export function PresetSelector({ presets, selected, onSelect }: { presets: ArgumentsPreset[]; selected: string; onSelect: (id: string) => void; }) {
  return (
    <section className="card reveal" style={{ '--d': '0.08s' } as CSSProperties}>
      <StackHead title="preset" tally={`${presets.length} preset${presets.length > 1 ? 's' : ''}`} />
      <div className="optlist" style={{ margin: '14px 22px 18px' }}>
        {presets.map((preset) => (
          <label key={preset.id} className={`opt${preset.id === selected ? ' on' : ''}`}>
            <input type="radio" name="preset" checked={preset.id === selected} onChange={() => onSelect(preset.id)} />
            <span className="txt"><span className="t">{preset.name}</span><span className="d">{preset.description}</span></span>
          </label>
        ))}
      </div>
    </section>
  );
}
