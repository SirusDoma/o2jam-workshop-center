import { Fragment, useState, type CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AlbumListResult, AlbumSongRef } from '../../o2jam';

const COLS = '30px 74px minmax(0, 1.6fr) 70px 60px 70px 130px';
const DIFFICULTY_LABEL: Record<number, string> = { 0: 'EX', 1: 'NX', 2: 'HX' };
const DIFFICULTY_CLASS: Record<number, string> = { 0: 'diff-ex', 1: 'diff-nx', 2: 'diff-hx' };

function SongSummary({ songs }: { songs: AlbumSongRef[] }) {
  if (songs.length === 0) return <>—</>;
  const counts = new Map<number, number>();
  for (const song of songs) counts.set(song.difficulty, (counts.get(song.difficulty) ?? 0) + 1);

  return (
    <>
      {[...counts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([difficulty, count], index) => (
          <Fragment key={difficulty}>
            {index > 0 && ' + '}
            <span className={DIFFICULTY_CLASS[difficulty] ?? ''}>
              {count} {DIFFICULTY_LABEL[difficulty] ?? `D${difficulty}`}
            </span>
          </Fragment>
        ))}
    </>
  );
}

export function AlbumEntryView({ active, album }: { active: boolean; album: AlbumListResult }) {
  const [openAlbum, setOpenAlbum] = useState<number | null>(null);
  if (!active) return null;

  return (
    <>
      <div className="reg-head" style={{ '--cols': COLS } as CSSProperties}>
        <span />
        <span>ID</span>
        <span>Name</span>
        <span className="r">Price</span>
        <span className="r">Level</span>
        <span className="r">Ranked</span>
        <span className="r">Songs</span>
      </div>
      <ul className="rows">
        {album.albums.map((entry) => {
          const open = openAlbum === entry.index;
          return (
            <li key={entry.index}>
              <div
                className={`reg-row${open ? ' selrow' : ''}`}
                style={{ '--cols': COLS } as CSSProperties}
                role="button"
                tabIndex={0}
                onClick={() => setOpenAlbum(open ? null : entry.index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setOpenAlbum(open ? null : entry.index);
                  }
                }}
              >
                <span className="twisty">
                  <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
                </span>
                <span className="cell-mono">{entry.albumId}</span>
                <div className="cell-lead">
                  <span className="nm-text" title={entry.name}>
                    {entry.name || '—'}
                  </span>
                </div>
                <span className="cell-m">{entry.price}</span>
                <span className="cell-m">{entry.level}</span>
                <span className="cell-m">{entry.ranked !== 0 ? 'Yes' : 'No'}</span>
                <span className="cell-m"><SongSummary songs={entry.songs} /></span>
              </div>
              {open && (
                <div className="albumsongs">
                  {entry.songs.length === 0 ? (
                    <div className="archive-empty">NO SONGS</div>
                  ) : (
                    entry.songs.map((song, index) => (
                      <div className="metarow" key={index}>
                        <span className="mr-k">
                          <span className={`chip ${DIFFICULTY_CLASS[song.difficulty] ?? ''}`} style={{ marginRight: 8 }}>
                            {DIFFICULTY_LABEL[song.difficulty] ?? `D${song.difficulty}`}
                          </span>
                          o2ma{song.musicId}.ojn
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
