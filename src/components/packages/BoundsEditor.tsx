import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Scan, X } from 'lucide-react';
import { parseBounds, writeBounds, type Bound } from '../../o2jam';

export function BoundsEditor({
  data,
  onSave,
  edited,
  onRevert,
}: {
  data: Uint8Array;
  onSave: (bytes: Uint8Array) => void;
  edited: boolean;
  onRevert: () => void;
}) {
  const parsed = useMemo(() => {
    try {
      return parseBounds(data).bounds;
    } catch {
      return [];
    }
  }, [data]);
  const [rows, setRows] = useState<Bound[]>(parsed);
  useEffect(() => setRows(parsed), [parsed]);

  const save = (next: Bound[]) => {
    onSave(writeBounds(next.map(({ left, top, right, bottom }) => ({ left, top, right, bottom }))));
    return next;
  };
  const set = (index: number, key: 'left' | 'top' | 'right' | 'bottom', value: string) =>
    setRows((current) => save(current.map((bound, position) => (position === index ? { ...bound, [key]: Number(value) || 0 } : bound))));
  const addRow = () =>
    setRows((current) =>
      save([...current, { index: current.length, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, offset: 0 }])
    );
  const removeRow = (index: number) => setRows((current) => save(current.filter((_, position) => position !== index)));

  return (
    <>
      <div className="dialogfoot" style={{ borderTop: 'none' }}>
        <span className="hint">Use Scene Composer for a better experience modifying bounds.</span>
        <button className="btn" type="button" onClick={addRow}>
          <Scan size={14} />
          ADD BOUND
        </button>
        <button className="btn" type="button" disabled={!edited} onClick={onRevert}>
          <RotateCcw size={14} />
          REVERT
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="archive-empty">NO BOUNDS</div>
      ) : (
        <div className="boundlist">
          {rows.map((bound, index) => (
            <div className="boundrow removable" key={index}>
              <span className="cell-mono">{index}</span>
              {(['left', 'top', 'right', 'bottom'] as const).map((key) => (
                <input
                  key={key}
                  className="stackinput"
                  aria-label={`Bound ${index} ${key}`}
                  inputMode="numeric"
                  value={String(bound[key])}
                  onChange={(event) => set(index, key, event.target.value)}
                />
              ))}
              <button className="rowact danger" type="button" aria-label={`Remove bound ${index}`} onClick={() => removeRow(index)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
