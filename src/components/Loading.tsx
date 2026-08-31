import type { CSSProperties } from 'react';

export function SkeletonRows({ cols, rows = 5 }: { cols: string; rows?: number; }) {
  const cellCount = cols.split(' ').length;
  return (
    <ul className="rows">
      {Array.from({ length: rows }, (_, r) => (
        <li key={r}>
          <div className="reg-row skelrow" style={{ '--cols': cols } as CSSProperties}>
            {Array.from({ length: cellCount }, (_, c) => (
              <span key={c} className="skel" style={{ '--sd': `${(r + c) * 0.06}s` } as CSSProperties} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PanelLoading({ label = 'READING' }: { label?: string; }) {
  return (
    <div className="paneloading">
      <span className="spin" />
      {label}
    </div>
  );
}
