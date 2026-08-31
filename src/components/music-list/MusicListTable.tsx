import { useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Lock, X } from 'lucide-react';
import { genreLabel, OJN_HEADER_SIZE, parseOjnHeader, type O2Encoding, type OjnHeader } from '../../o2jam';
import { fmtBytes, fmtDuration } from '../../format';
import { FilterBox } from '../FilterBox';
import { MusicSections } from './MusicSections';
import type { EditChart, SectionRows, SortKey } from '../../features/music-list/types';

const CHART_COLS = '30px 74px minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) 62px 96px 62px 42px';
const HEADER_BYTES_LIMIT = 250 * 1024;

export function MusicListTable({
  charts,
  setCharts,
  version,
  encoding,
  sections,
  setSections,
  changedSongs,
}: {
  charts: EditChart[];
  setCharts: Dispatch<SetStateAction<EditChart[]>>;
  version: ReturnType<typeof import('../../o2jam').musicListVersion>;
  encoding: O2Encoding;
  sections: SectionRows;
  setSections: Dispatch<SetStateAction<SectionRows>>;
  changedSongs: ReadonlySet<number>;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState('');
  const [openSong, setOpenSong] = useState<number | null>(null);
  const headers = useMemo(
    () => charts.map((chart) => ({ chart, header: safeHeader(chart.block, chart.override ?? chart.detected ?? encoding) })),
    [charts, encoding]
  );
  const rows = useMemo(() => {
    const queryText = query.trim().toLowerCase();
    let list = headers.filter(
      ({ header }) =>
        !queryText || `${header.id} ${header.title} ${header.artist} ${header.noteDesigner}`.toLowerCase().includes(queryText)
    );
    if (sort) list = [...list].sort((a, b) => sort.dir * compare(sortValue(a.header, sort.key), sortValue(b.header, sort.key)));
    return list;
  }, [headers, query, sort]);
  const clickSort = (key: SortKey) =>
    setSort((current) =>
      current?.key === key ? { key, dir: (current.dir * -1) as 1 | -1 } : { key, dir: 1 }
    );
  const headerBytes = 4 + charts.length * OJN_HEADER_SIZE;

  return (
    <section className="card listing">
      {headerBytes > HEADER_BYTES_LIMIT && (
        <div className="listwarn">
          <AlertTriangle size={14} />
          <span>The music-header block is {fmtBytes(headerBytes)} — past 250 KB the client may not work correctly.</span>
        </div>
      )}
      <div className="listpin">
        <div className="toolbar">
          <div className="fchips">
            <span className="fchip on" style={{ cursor: 'default' }}>
              {version.filename}
              <span className="n">{charts.length}</span>
            </span>
          </div>
          <div className="toolbar-right">
            <FilterBox value={query} onChange={setQuery} placeholder="Filter" />
          </div>
        </div>

        <div className="reg-head" style={{ '--cols': CHART_COLS } as CSSProperties}>
          <span />
          <Sortable label="ID" k="id" sort={sort} onClick={clickSort} />
          <Sortable label="Title" k="title" sort={sort} onClick={clickSort} />
          <Sortable label="Artist" k="artist" sort={sort} onClick={clickSort} />
          <Sortable label="Note Designer" k="designer" sort={sort} onClick={clickSort} />
          <Sortable label="BPM" k="bpm" sort={sort} onClick={clickSort} right />
          <Sortable label="Lv EX/NX/HX" k="level" sort={sort} onClick={clickSort} right />
          <Sortable label="Time" k="time" sort={sort} onClick={clickSort} right />
          <span />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">NO MATCH</div>
      ) : (
        <ul className="rows">
          {rows.map(({ chart, header }) => {
            const open = openSong === chart.key;
            return (
              <li key={chart.key}>
                <div
                  className={`reg-row${open ? ' selrow' : ''}`}
                  style={{ '--cols': CHART_COLS } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenSong(open ? null : chart.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOpenSong(open ? null : chart.key);
                    }
                  }}
                >
                  <span className="twisty">
                    <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
                  </span>
                  <span className="cell-mono">{header.id}</span>
                  <div className="cell-lead">
                    <div className="nm">
                      <span className="label">
                        <span className="nm-text" title={header.title}>{header.title || '—'}</span>
                        {chart.encrypted && <span className="chip" title="Encrypted OJN"><Lock size={9} style={{ verticalAlign: -1 }} /></span>}
                        {changedSongs.has(header.id) && <span className="chip warn" title="Modified since the last save">UNSAVED</span>}
                      </span>
                      <span className="sub">{genreLabel(header.genre)}</span>
                    </div>
                  </div>
                  <span className="cell-mono">{header.artist || '—'}</span>
                  <span className="cell-mono">{header.noteDesigner || '—'}</span>
                  <span className="cell-m">{header.bpm.toFixed(1)}</span>
                  <span className="cell-m">{header.levelEx}/{header.levelNx}/{header.levelHx}</span>
                  <span className="cell-m dim">{fmtDuration(header.durationHx)}</span>
                  <div className="acts">
                    <button
                      className="rowact danger"
                      type="button"
                      aria-label="Remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCharts((current) => current.filter((item) => item.key !== chart.key));
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {open && (
                  <MusicSections
                    version={version}
                    songId={header.id}
                    sections={sections}
                    setSections={setSections}
                    detected={chart.detected}
                    override={chart.override}
                    fallback={encoding}
                    onOverride={(value) =>
                      setCharts((current) => current.map((item) => item.key === chart.key ? { ...item, override: value } : item))
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Sortable({ label, k, sort, onClick, right }: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 } | null;
  onClick: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort?.key === k;
  return <button type="button" className={`sorth${right ? ' r' : ''}${active ? ' on' : ''}`} onClick={() => onClick(k)}>{label}{active && <ChevronDown size={11} style={{ transform: sort.dir < 0 ? 'rotate(180deg)' : undefined }} />}</button>;
}

function safeHeader(block: Uint8Array, encoding: O2Encoding): OjnHeader {
  try {
    return parseOjnHeader(block, encoding);
  } catch {
    return { id: 0, title: '', artist: '', noteDesigner: '', genre: 10, bpm: 0, levelEx: 0, levelNx: 0, levelHx: 0, durationHx: 0 } as unknown as OjnHeader;
  }
}

function sortValue(header: OjnHeader, key: SortKey): number | string {
  switch (key) {
    case 'id': return header.id;
    case 'title': return header.title.toLowerCase();
    case 'artist': return header.artist.toLowerCase();
    case 'designer': return header.noteDesigner.toLowerCase();
    case 'bpm': return header.bpm;
    case 'level': return header.levelHx;
    case 'time': return header.durationHx;
  }
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
