import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Funnel } from 'lucide-react';
import type { ItemEntry } from '../../o2jam';
import { COLS } from '../../features/avatar/constants';
import { AvatarItemRow } from './AvatarItemRow';
import { AvatarTableToolbar, type AvatarTableSource } from './AvatarTableToolbar';
import type { ItemEdit } from '../../features/avatar/types';

const ITEM_ROW_PITCH = 55;

export function AvatarItemsTable({
  items,
  sources,
  query,
  selected,
  edits,
  removed,
  onPick,
  onRemove,
  onRestore,
  onSource,
  onQuery,
  onAdd,
}: {
  items: ItemEntry[];
  sources: AvatarTableSource[];
  query: string;
  selected: number | null;
  edits: Record<number, ItemEdit> | undefined;
  removed: ReadonlySet<number> | undefined;
  onPick: (index: number) => void;
  onRemove: (index: number) => void;
  onRestore: (index: number) => void;
  onSource: (name: string) => void;
  onQuery: (query: string) => void;
  onAdd: () => void;
}) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenGenders, setHiddenGenders] = useState<Set<string>>(new Set());
  const [hiddenPlanets, setHiddenPlanets] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState<'type' | 'gender' | 'planet' | null>(null);
  const [filterPosition, setFilterPosition] = useState({ x: 0, y: 0 });
  const [view, setView] = useState({ top: 0, h: 800 });
  const typeRef = useRef<HTMLSpanElement>(null);
  const genderRef = useRef<HTMLSpanElement>(null);
  const planetRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeOptions = useMemo(() => [...new Set(items.map((item) => item.itemTypeLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const planetOptions = useMemo(() => [...new Set(items.map((item) => item.planetLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!term || `${item.itemId} ${item.name}`.toLowerCase().includes(term)) &&
        !hiddenTypes.has(item.itemTypeLabel) &&
        !hiddenGenders.has(item.gender) &&
        !hiddenPlanets.has(item.planetLabel)
    );
  }, [items, query, hiddenTypes, hiddenGenders, hiddenPlanets]);
  const start = Math.max(0, Math.floor(view.top / ITEM_ROW_PITCH) - 8);
  const end = Math.min(visible.length, Math.ceil((view.top + view.h) / ITEM_ROW_PITCH) + 8);

  useEffect(() => {
    if (!filterOpen) return;
    const withinPopup = (target: Node) =>
      !!typeRef.current?.contains(target) || !!genderRef.current?.contains(target) || !!planetRef.current?.contains(target);
    const onMouseDown = (event: MouseEvent) => {
      if (!withinPopup(event.target as Node)) setFilterOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(null);
    };
    const onScroll = (event: Event) => {
      if (!withinPopup(event.target as Node)) setFilterOpen(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [filterOpen]);

  const openFilter = (filter: 'type' | 'gender' | 'planet') => (event: React.MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setFilterPosition({ x: Math.min(bounds.left, window.innerWidth - 210), y: bounds.bottom + 8 });
    setFilterOpen((current) => current === filter ? null : filter);
  };
  const cycle = (current: Set<string>, value: string, all: readonly string[]) => {
    if (current.size === 0) return new Set(all.filter((entry) => entry !== value));
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next.size >= all.length ? new Set<string>() : next;
  };

  return (
    <>
      <div className="archive-pin">
      <AvatarTableToolbar
        sources={sources.map((source) => ({ ...source, onSelect: () => onSource(source.name) }))}
        query={query}
        addLabel="ADD ITEM"
        onQuery={onQuery}
        onAdd={onAdd}
      />
      <div className="reg-head" style={{ '--cols': COLS } as CSSProperties}>
        <span>ID</span>
        <FilterHeader label="Name" kind="planet" options={planetOptions} hidden={hiddenPlanets} open={filterOpen} position={filterPosition} anchor={planetRef} onOpen={openFilter} onCycle={(value) => setHiddenPlanets((current) => cycle(current, value, planetOptions))} />
        <FilterHeader label="Type" kind="type" options={typeOptions} hidden={hiddenTypes} open={filterOpen} position={filterPosition} anchor={typeRef} onOpen={openFilter} onCycle={(value) => setHiddenTypes((current) => cycle(current, value, typeOptions))} />
        <FilterHeader label="Gender" kind="gender" options={['male', 'female', 'any']} labels={{ male: 'Male', female: 'Female', any: 'Any' }} hidden={hiddenGenders} open={filterOpen} position={filterPosition} anchor={genderRef} onOpen={openFilter} onCycle={(value) => setHiddenGenders((current) => cycle(current, value, ['male', 'female', 'any']))} />
        <span />
      </div>
      </div>
      <div className="archive-list" ref={listRef} onScroll={(event) => setView({ top: event.currentTarget.scrollTop, h: event.currentTarget.clientHeight })}>
        {visible.length === 0 ? (
          <div className="empty">NO MATCH</div>
        ) : (
          <ul className="rows">
            {start > 0 && <li aria-hidden style={{ height: start * ITEM_ROW_PITCH, borderBottom: 'none' }} />}
            {visible.slice(start, end).map((item) => (
              <AvatarItemRow key={item.index} it={item} on={selected === item.index} edited={!!edits?.[item.index]} removed={!!removed?.has(item.index)} onPick={onPick} onRemove={onRemove} onRestore={onRestore} />
            ))}
            {end < visible.length && <li aria-hidden style={{ height: (visible.length - end) * ITEM_ROW_PITCH, borderBottom: 'none' }} />}
          </ul>
        )}
      </div>
    </>
  );
}

function FilterHeader({ label, kind, options, labels, hidden, open, position, anchor, onOpen, onCycle }: {
  label: string;
  kind: 'type' | 'gender' | 'planet';
  options: readonly string[];
  labels?: Record<string, string>;
  hidden: ReadonlySet<string>;
  open: 'type' | 'gender' | 'planet' | null;
  position: { x: number; y: number };
  anchor: React.RefObject<HTMLSpanElement | null>;
  onOpen: (kind: 'type' | 'gender' | 'planet') => (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCycle: (value: string) => void;
}) {
  return (
    <span className="hd-f">
      {label}
      <span className="filterpop" ref={anchor}>
        <button className={`hd-funnel${hidden.size ? ' on' : ''}`} type="button" aria-label={`Filter ${label.toLowerCase()}`} aria-expanded={open === kind} onClick={onOpen(kind)}><Funnel size={12} /></button>
        {open === kind && (
          <div className="menu filtermenu" style={{ position: 'fixed', top: position.y, left: position.x }}>
            {options.map((option) => <label key={option} className="checkline"><input type="checkbox" checked={!hidden.has(option)} onChange={() => onCycle(option)} />{labels?.[option] ?? option}</label>)}
          </div>
        )}
      </span>
    </span>
  );
}
