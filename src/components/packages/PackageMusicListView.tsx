import type { CSSProperties } from 'react';
import type { OjnHeader } from '../../o2jam';
import { SONG_COLS } from '../../features/packages/constants';

export function PackageMusicListView({ songs }: { songs: OjnHeader[]; }) {
  return (
    <>
      <div className="reg-head" style={{ '--cols': SONG_COLS } as CSSProperties}>
        <span>ID</span>
        <span>Title</span>
        <span>Artist</span>
        <span>Note Designer</span>
        <span className="r">Levels</span>
      </div>
      <ul className="rows">
        {songs.map((header, index) => (
          <li key={index}>
            <div className="reg-row" style={{ '--cols': SONG_COLS } as CSSProperties}>
              <span className="cell-mono">{header.id}</span>
              <div className="cell-lead">
                <span className="nm-text" title={header.title}>
                  {header.title || '—'}
                </span>
              </div>
              <span className="cell-m l" title={header.artist}>{header.artist || '—'}</span>
              <span className="cell-m l" title={header.noteDesigner}>{header.noteDesigner || '—'}</span>
              <span className="cell-m r">
                <span className="diff-ex">{header.levelEx}</span> / <span className="diff-nx">{header.levelNx}</span> /{' '}
                <span className="diff-hx">{header.levelHx}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
