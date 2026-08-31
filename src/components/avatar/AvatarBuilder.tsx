import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Eraser, Funnel, Layers, Pause, Play, X } from 'lucide-react';
import {
  SET_INFO_MAX_ITEMS,
  type ItemEntry,
  type SetGender,
  type SpriteGender,
  type SpriteInstrument,
} from '../../o2jam';
import { FilterBox } from '../FilterBox';
import { Tabs } from '../Tabs';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { AvatarFig, SlotThumb } from './AvatarPreview';
import { INSTRUMENTS, baseBodyIds, playback } from '../../features/avatar/constants';
import { buildLayers, instrumentOf } from '../../features/avatar/utils';
import { AvatarItemIcon } from './AvatarItemIcon';

const BUILD_COLS = '56px minmax(0, 1fr) 80px 30px';
const BUILDER_CATEGORIES: { id: string; label: string; types: number[]; }[] = [
  { id: 'special', label: 'Special', types: [28, 20, 22] },
  { id: 'fashion', label: 'Fashion', types: [19, 13, 10, 14] },
  { id: 'accessory', label: 'Accessory', types: [11, 8, 9, 7, 12] },
  { id: 'beauty', label: 'Beauty', types: [6, 23, 5] },
  { id: 'instrument', label: 'Instrument', types: [16, 18, 15, 17, 21] },
];

const BuilderCard = memo(function BuilderCard({
  file,
  it,
  on,
  onToggle,
}: {
  file: WorkspaceFile;
  it: ItemEntry;
  on: boolean;
  onToggle: (it: ItemEntry) => void;
}) {
  const small = it.sprites[1]?.present ? it.sprites[1].filename : '';
  const thumb = small || (it.sprites[0]?.present ? it.sprites[0].filename : '');
  const [seen, setSeen] = useState(false);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = thumbRef.current;
    if (!el || seen) {
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <button type="button" className={`bcard${on ? ' on' : ''}`} onClick={() => onToggle(it)}>
      <span className="bcard-thumb" ref={thumbRef}>
        {thumb && seen ? <SlotThumb file={file} name={thumb} /> : <AvatarItemIcon item={it} />}
      </span>
      <span className="bcard-name" title={it.name}>
        {it.name || `Item ${it.itemId}`}
      </span>
      <span className="bcard-sub">{it.planetLabel}</span>
    </button>
  );
});

export function AvatarBuilder({
  file,
  items,
  hasSetInfo,
  onCreateSet,
}: {
  file: WorkspaceFile;
  items: ItemEntry[];
  hasSetInfo: boolean;
  onCreateSet: (items: ItemEntry[], gender: SetGender) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');
  const [hiddenPlanets, setHiddenPlanets] = useState<Set<string>>(new Set());
  const [gender, setGender] = useState<SpriteGender>('male');
  const [instrument, setInstrument] = useState<SpriteInstrument>('none');
  const [transparent, setTransparent] = useState(true);
  const [playing, setPlaying] = useState(playback.playing);
  const [fps, setFps] = useState(playback.fps);
  const [query, setQuery] = useState('');
  const [planetFilterOpen, setPlanetFilterOpen] = useState(false);
  const [filterPosition, setFilterPosition] = useState({ x: 0, y: 0 });
  const [view, setView] = useState({ top: 0, h: 800 });
  const [gridMetrics, setGridMetrics] = useState({ cols: 4, pitch: 210 });
  const planetRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playback.playing = playing;
    playback.fps = fps;
  }, [playing, fps]);

  useEffect(() => {
    if (!planetFilterOpen) {
      return;
    }

    const close = (event: MouseEvent) => {
      if (!planetRef.current?.contains(event.target as Node)) {
        setPlanetFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [planetFilterOpen]);

  const byIndex = useMemo(() => new Map(items.map((item) => [item.index, item])), [items]);
  const byId = useMemo(() => {
    const result = new Map<number, ItemEntry>();
    for (const item of items) if (!result.has(item.itemId)) {
      result.set(item.itemId, item);
    }
    return result;
  }, [items]);
  const presentTypes = useMemo(() => {
    const result = new Map<number, string>();
    const baseIds = new Set([...baseBodyIds('male'), ...baseBodyIds('female')]);
    for (const item of items) {
      if (baseIds.has(item.itemId) || item.itemType === 24 || result.has(item.itemType)) {
        continue;
      }

      result.set(item.itemType, item.itemTypeLabel);
    }
    return result;
  }, [items]);
  const categoryTabs = useMemo(
    () => BUILDER_CATEGORIES.filter((entry) => entry.types.some((itemType) => presentTypes.has(itemType))),
    [presentTypes]
  );
  const subTabs = useMemo(() => {
    if (category === 'all') {
      return [];
    }

    const current = BUILDER_CATEGORIES.find((entry) => entry.id === category);
    return (current?.types ?? []).filter((itemType) => presentTypes.has(itemType)).map((itemType) => presentTypes.get(itemType)!);
  }, [category, presentTypes]);
  const planetOptions = useMemo(
    () => [...new Set(items.map((item) => item.planetLabel))].sort((a, b) => a.localeCompare(b)),
    [items]
  );
  const shown = useMemo(() => {
    const categoryTypes = category === 'all' ? null : BUILDER_CATEGORIES.find((entry) => entry.id === category)?.types ?? [];
    const term = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.itemType !== 24 &&
        (item.gender === gender || item.gender === 'any') &&
        (categoryTypes === null || categoryTypes.includes(item.itemType)) &&
        (type === 'all' || item.itemTypeLabel === type) &&
        !hiddenPlanets.has(item.planetLabel) &&
        (!term || `${item.itemId} ${item.name}`.toLowerCase().includes(term))
    );
  }, [items, gender, category, type, hiddenPlanets, query]);
  const wearing = useMemo(
    () => selected.map((index) => byIndex.get(index)).filter((item): item is ItemEntry => !!item),
    [selected, byIndex]
  );
  const layers = useMemo(
    () => buildLayers(file, wearing, byId, true, instrument, gender, transparent),
    [file, wearing, byId, instrument, gender, transparent]
  );

  useEffect(() => {
    const grid = gridRef.current;
    const card = grid?.querySelector('.bcard');
    if (!grid || !card) {
      return;
    }

    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const pitch = (card as HTMLElement).offsetHeight + 8;
    if (cols !== gridMetrics.cols || Math.abs(pitch - gridMetrics.pitch) > 1) {
      setGridMetrics({ cols, pitch });
    }
  });

  const rowCount = Math.ceil(shown.length / gridMetrics.cols);
  const rowStart = Math.max(0, Math.floor(view.top / gridMetrics.pitch) - 2);
  const rowEnd = Math.min(rowCount, Math.ceil((view.top + view.h) / gridMetrics.pitch) + 2);
  const canCreateSet = useMemo(() => {
    const genders = new Set(wearing.map((item) => item.gender));
    return wearing.length <= SET_INFO_MAX_ITEMS && !(genders.has('male') && genders.has('female')) && hasSetInfo;
  }, [wearing, hasSetInfo]);

  const toggle = (item: ItemEntry) => {
    const isInstrument = (itemType: number) => itemType >= 15 && itemType <= 18;
    setSelected((current) => {
      if (current.includes(item.index)) {
        return current.filter((index) => index !== item.index);
      }

      if (item.itemType === 28) {
        return [item.index];
      }

      return [
        ...current.filter((index) => {
          const selectedItem = byIndex.get(index);
          return !!selectedItem && selectedItem.itemType !== 28 && selectedItem.itemType !== item.itemType && !(isInstrument(selectedItem.itemType) && isInstrument(item.itemType));
        }),
        item.index,
      ];
    });
    const equipped = instrumentOf(item);
    if (equipped !== 'none') {
      setInstrument(equipped);
    }
  };
  const pickGender = (value: SpriteGender) => {
    setGender(value);
    setSelected((current) => current.filter((index) => {
      const item = byIndex.get(index);
      return !!item && (item.gender === value || item.gender === 'any');
    }));
  };
  const cyclePlanet = (value: string) => {
    setHiddenPlanets((current) => {
      if (current.size === 0) {
        return new Set(planetOptions.filter((planet) => planet !== value));
      }

      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      }
      else {
        next.add(value);
      }

      return next.size >= planetOptions.length ? new Set<string>() : next;
    });
  };
  const createSet = () => {
    if (wearing.length === 0 || !canCreateSet) {
      return;
    }

    const genders = new Set(wearing.map((item) => item.gender));
    const setGender: SetGender = genders.has('male') ? 'male' : genders.has('female') ? 'female' : 'any';
    onCreateSet(wearing, setGender);
  };

  return (
    <>
      <div className="archive-listwrap builderwrap">
        <div className="archive-pin">
          <div className="builder-tabs">
            <Tabs
              sub
              tabs={[{ id: 'all', label: 'All' }, ...categoryTabs.map((entry) => ({ id: entry.id, label: entry.label }))]}
              active={category}
              onChange={(value) => {
                setCategory(value);
                const current = BUILDER_CATEGORIES.find((entry) => entry.id === value);
                const first = (current?.types ?? []).find((itemType) => presentTypes.has(itemType));
                setType(value === 'all' || first === undefined ? 'all' : presentTypes.get(first)!);
              }}
            />
          </div>
          {category !== 'all' && subTabs.length > 0 && (
            <div className="builder-tabs">
              <Tabs sub tabs={subTabs.map((label) => ({ id: label, label }))} active={type} onChange={setType} />
            </div>
          )}
          <div className="toolbar">
            <div className="toolbar-right">
              <span className="filterpop" ref={planetRef}>
                <button
                  className={`icon-btn${hiddenPlanets.size ? ' on' : ''}`}
                  type="button"
                  aria-label="Filter planets"
                  aria-expanded={planetFilterOpen}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setFilterPosition({ x: Math.min(bounds.left, window.innerWidth - 210), y: bounds.bottom + 8 });
                    setPlanetFilterOpen((open) => !open);
                  }}
                >
                  <Funnel size={15} />
                </button>
                {planetFilterOpen && (
                  <div className="menu filtermenu" style={{ position: 'fixed', top: filterPosition.y, left: filterPosition.x }}>
                    {planetOptions.map((planet) => (
                      <label key={planet} className="checkline">
                        <input type="checkbox" checked={!hiddenPlanets.has(planet)} onChange={() => cyclePlanet(planet)} />
                        {planet}
                      </label>
                    ))}
                  </div>
                )}
              </span>
              <FilterBox value={query} onChange={setQuery} placeholder="Filter" />
            </div>
          </div>
        </div>
        <div className="archive-list" onScroll={(event) => setView({ top: event.currentTarget.scrollTop, h: event.currentTarget.clientHeight })}>
          {shown.length === 0 ? (
            <div className="empty">NO ITEMS FOR THIS GENDER</div>
          ) : (
            <div className="buildergrid" ref={gridRef}>
              {rowStart > 0 && <div aria-hidden style={{ gridColumn: '1 / -1', height: rowStart * gridMetrics.pitch - 8 }} />}
              {shown.slice(rowStart * gridMetrics.cols, rowEnd * gridMetrics.cols).map((item) => (
                <BuilderCard key={item.index} file={file} it={item} on={selected.includes(item.index)} onToggle={toggle} />
              ))}
              {rowEnd < rowCount && <div aria-hidden style={{ gridColumn: '1 / -1', height: (rowCount - rowEnd) * gridMetrics.pitch - 8 }} />}
            </div>
          )}
        </div>
      </div>

      <div className="archive-view">
        <div className="view-body">
          <div className="stagebar">
            <select className="selctl" style={{ width: 140 }} value={instrument} aria-label="Pose" onChange={(event) => setInstrument(event.target.value as SpriteInstrument)}>
              {INSTRUMENTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
            <select className="selctl" style={{ width: 96 }} value={gender} aria-label="Gender" onChange={(event) => pickGender(event.target.value as SpriteGender)}>
              <option value="male">Male</option><option value="female">Female</option>
            </select>
            <label className="checkline"><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} /><span>Transparency</span></label>
            <button className="icon-btn" type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <label className="animctl"><input type="range" min={1} max={24} value={fps} aria-label="Speed" onChange={(event) => setFps(Number(event.target.value))} /><span className="mono">{fps} fps</span></label>
          </div>
          <div className="avatarstage">
            {layers.length === 0 ? <span className="dz-hint">Pick items on the left.</span> : <AvatarFig layers={layers} playing={playing} fps={fps} />}
          </div>
          {wearing.length > 0 && (
            <>
              <div className="reg-head" style={{ '--cols': BUILD_COLS } as CSSProperties}><span>ID</span><span>Name</span><span>Price</span><span /></div>
              <ul className="rows setrows capped">
                {wearing.map((item) => (
                  <li key={item.index}>
                    <div className="reg-row" style={{ '--cols': BUILD_COLS } as CSSProperties}>
                      <span className="cell-mono">{item.itemId}</span>
                      <div className="cell-lead"><span className="ico"><AvatarItemIcon item={item} /></span><div className="nm-stack"><span className="nm-text" title={item.name}>{item.name || '—'}</span><span className="nm-sub">{item.itemTypeLabel}</span></div></div>
                      <span className="cell-mono">{item.priceGem || item.priceEPoint}</span>
                      <div className="acts"><button className="rowact danger" type="button" aria-label="Remove from outfit" onClick={() => setSelected((current) => current.filter((index) => index !== item.index))}><X size={14} /></button></div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="createset">
                <button className={`btn block${canCreateSet ? '' : ' blocked'}`} type="button" onClick={createSet}><Layers size={14} />CREATE SET</button>
                <button className="btn small" type="button" onClick={() => setSelected([])}><Eraser size={13} />Clear all</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
