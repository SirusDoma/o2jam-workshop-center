import { startTransition, useEffect, useState } from 'react';
import { GRID_DIVISIONS } from '../../features/note-tool/settings';

export function RollViewControls({
  grid,
  subGrid,
  hiSpeed,
  onGridChange,
  onSubGridChange,
  onHiSpeedChange,
}: {
  grid: string;
  subGrid: string;
  hiSpeed: string;
  onGridChange: (value: string) => void;
  onSubGridChange: (value: string) => void;
  onHiSpeedChange: (value: string) => void;
}) {
  const [displayedHiSpeed, setDisplayedHiSpeed] = useState(hiSpeed);

  useEffect(() => setDisplayedHiSpeed(hiSpeed), [hiSpeed]);

  return (
    <>
      <label className="nt-grid-option">
        <span>Grid</span>
        <select className="selctl" value={grid} onChange={(event) => onGridChange(event.currentTarget.value)}>
          {GRID_DIVISIONS.map((division) => <option key={division}>{division}</option>)}
        </select>
      </label>
      <label className="nt-grid-option">
        <span>Sub-grid</span>
        <select className="selctl" value={subGrid} onChange={(event) => onSubGridChange(event.currentTarget.value)}>
          <option value="none">None</option>
          {GRID_DIVISIONS.map((division) => <option key={division}>{division}</option>)}
        </select>
      </label>
      <label className="nt-grid-option nt-hi-speed-option">
        <span>Hi-Speed</span>
        <input
          className="nt-hi-speed-slider"
          type="range"
          min="0.5"
          max="8"
          step="0.5"
          value={displayedHiSpeed}
          onChange={(event) => {
            const value = event.currentTarget.valueAsNumber.toFixed(1);
            setDisplayedHiSpeed(value);
            startTransition(() => onHiSpeedChange(value));
          }}
        />
        <output className="mono">{displayedHiSpeed}</output>
      </label>
    </>
  );
}
