import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Image, Plus, Square } from 'lucide-react';
import type { ArchiveEntry } from '../../o2jam';
import { collectDropped } from '../DropZone';
import { FilterBox } from '../FilterBox';
import { SplitButton } from '../SplitButton';
import { AddedRow, OrigRow } from './PackageRows';
import { bytesEqual, isSprite } from '../../features/packages/packageUtils';

const COLS = '46px minmax(0, 1fr) 84px 66px 30px';

interface AddedEntry {
  name: string;
  data: Uint8Array;
  original: Uint8Array;
}

export function PackageEntryList({
  entries,
  added,
  removed,
  replaced,
  contentType,
  picked,
  onPick,
  onToggleRemoved,
  onRemoveAdded,
  onAddFiles,
  onNewEntry,
}: {
  entries: ArchiveEntry[];
  added: AddedEntry[];
  removed: ReadonlySet<number>;
  replaced: ReadonlyMap<number, Uint8Array>;
  contentType: ReadonlyMap<number, { label: string; img: boolean }>;
  picked: string | null;
  onPick: (key: string) => void;
  onToggleRemoved: (index: number) => void;
  onRemoveAdded: (index: number) => void;
  onAddFiles: (files: FileList | File[] | null) => void;
  onNewEntry: (entry: { kind: 'sprite' | 'bound'; name: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [dropOver, setDropOver] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(640);
  const [rowHeight, setRowHeight] = useState(55);
  const addRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef(0);
  const deferredQuery = useDeferredValue(query).trim().toLowerCase();
  const rows = useMemo(
    () => [
      ...entries.filter((entry) => !deferredQuery || entry.name.toLowerCase().includes(deferredQuery)).map((entry) => ({ kind: 'original' as const, entry })),
      ...added
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !deferredQuery || entry.name.toLowerCase().includes(deferredQuery))
        .map(({ entry, index }) => ({ kind: 'added' as const, entry, index })),
    ],
    [entries, added, deferredQuery]
  );
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 12);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / rowHeight) + 12);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewHeight(element.clientHeight));
    observer.observe(element);
    setViewHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const row = listRef.current?.querySelector('.rows > li');
    if (!row) return;
    const height = row.getBoundingClientRect().height;
    if (height > 0 && Math.abs(height - rowHeight) > 0.5) setRowHeight(height);
  });

  const onScroll = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      setScrollTop(listRef.current?.scrollTop ?? 0);
    });
  }, []);

  return (
    <div
      className={`archive-listwrap${dropOver ? ' dropover' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropOver(false);
        void collectDropped(event.dataTransfer).then(onAddFiles);
      }}
    >
      <div className="archive-pin">
        <div className="toolbar">
          <div className="toolbar-left">
            <SplitButton
              icon={<Plus size={14} />}
              label="ADD FILES"
              onClick={() => addRef.current?.click()}
              items={[
                { icon: <Plus size={14} />, label: 'Add files', onClick: () => addRef.current?.click() },
                { icon: <Image size={14} />, label: 'New sprite', onClick: () => onNewEntry({ kind: 'sprite', name: 'Sprite.ojs' }) },
                { icon: <Square size={14} />, label: 'New bounds', onClick: () => onNewEntry({ kind: 'bound', name: 'Bounds.bnd' }) },
              ]}
            />
            <span className="dz-hint" style={{ whiteSpace: 'nowrap' }}>or drop files here</span>
            <input ref={addRef} type="file" multiple hidden onChange={(event) => onAddFiles(event.target.files)} />
          </div>
          <div className="toolbar-right">
            <FilterBox value={query} onChange={setQuery} placeholder="Filter" />
          </div>
        </div>
        <div className="reg-head" style={{ '--cols': COLS } as CSSProperties}>
          <span>#</span><span>Name</span><span>Type</span><span className="r">Size</span><span />
        </div>
      </div>
      <div className="archive-list" ref={listRef} onScroll={onScroll}>
        {rows.length === 0 ? (
          <div className="empty">NO MATCH</div>
        ) : (
          <ul className="rows" style={{ paddingTop: start * rowHeight, paddingBottom: Math.max(0, (rows.length - end) * rowHeight) }}>
            {rows.slice(start, end).map((row) =>
              row.kind === 'original' ? (
                <OrigRow
                  key={row.entry.index}
                  e={row.entry}
                  on={picked === `o${row.entry.index}`}
                  removed={removed.has(row.entry.index)}
                  replaced={replaced.has(row.entry.index)}
                  size={replaced.get(row.entry.index)?.length ?? row.entry.size}
                  type={contentType.get(row.entry.index)?.label ?? (row.entry.ext ? row.entry.ext.toUpperCase() : '—')}
                  img={contentType.get(row.entry.index)?.img ?? isSprite(row.entry.ext)}
                  onPick={onPick}
                  onToggle={onToggleRemoved}
                />
              ) : (
                <AddedRow
                  key={`a${row.index}`}
                  a={row.entry}
                  i={row.index}
                  on={picked === `a${row.index}`}
                  edited={!bytesEqual(row.entry.data, row.entry.original)}
                  onPick={onPick}
                  onRemove={onRemoveAdded}
                />
              )
            )}
          </ul>
        )}
      </div>
      {dropOver && <div className="dropmsg">Drop files to add them to this package</div>}
    </div>
  );
}
