import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, Funnel, Layers, Pause, Play, Plus, Repeat, RotateCcw, X } from 'lucide-react';
import {
  PLANET_ORIGINS,
  SET_CURRENCIES,
  SET_INFO_MAX_ITEMS,
  type ItemEntry,
  type SetGender,
  type SetInfoEntry,
  type SpriteGender,
  type SpriteInstrument,
} from '../../o2jam';
import { CloseButton, Overlay } from '../Overlay';
import { Tabs } from '../Tabs';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { fmtOffset } from '../../format';
import { AvatarFig } from './AvatarPreview';
import { INSTRUMENTS, playback } from '../../features/avatar/constants';
import type { SetEdit } from '../../features/avatar/types';
import { buildLayers, instrumentOf } from '../../features/avatar/utils';
import { AvatarItemIcon } from './AvatarItemIcon';

const SETITEM_COLS = '56px minmax(0, 1fr) 80px 90px 64px';
const PICK_COLS = '56px minmax(0, 1fr) 140px';

function SetItemPicker({
  items,
  exclude,
  gender,
  onPick,
  onClose,
}: {
  items: ItemEntry[];
  exclude: Set<number>;
  gender: SetGender;
  onPick: (it: ItemEntry) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hideTypes, setHideTypes] = useState<Set<string>>(new Set());
  const [hidePlanets, setHidePlanets] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState<'type' | 'planet' | null>(null);
  const typeRef = useRef<HTMLSpanElement>(null);
  const planetRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!typeRef.current?.contains(t) && !planetRef.current?.contains(t)) setFilterOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  const term = q.trim().toLowerCase();
  const eligible = useMemo(
    () => items.filter((it) => it.itemType !== 24 && (it.gender === 'any' || it.gender === gender) && !exclude.has(it.itemType)),
    [items, exclude, gender]
  );
  const typeOptions = useMemo(() => {
    const byType = new Map<string, { id: number; disabled: boolean }>();
    for (const it of items) {
      if ((it.gender !== 'any' && it.gender !== gender) || it.itemType === 24) continue;
      const cur = byType.get(it.itemTypeLabel);
      if (!cur) byType.set(it.itemTypeLabel, { id: it.itemType, disabled: exclude.has(it.itemType) });
    }
    return [...byType.entries()].sort((a, b) => a[1].id - b[1].id).map(([label, v]) => ({ label, disabled: v.disabled }));
  }, [items, exclude, gender]);
  const enabledTypeLabels = useMemo(() => typeOptions.filter((t) => !t.disabled).map((t) => t.label), [typeOptions]);
  const planetOptions = useMemo(() => {
    const byPlanet = new Map<string, number>();
    for (const it of eligible) if (!byPlanet.has(it.planetLabel)) byPlanet.set(it.planetLabel, it.planetOrigin);
    return [...byPlanet.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  }, [eligible]);
  const cycle = (hidden: Set<string>, v: string, all: readonly string[]) => {
    if (hidden.size === 0) return new Set(all.filter((x) => x !== v));
    const next = new Set(hidden);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next.size >= all.length ? new Set<string>() : next;
  };
  const shown = eligible.filter(
    (it) =>
      !hideTypes.has(it.itemTypeLabel) &&
      !hidePlanets.has(it.planetLabel) &&
      (!term || `${it.itemId} ${it.name}`.toLowerCase().includes(term))
  );

  return (
    <Overlay onClose={onClose} label="Pick an item" width="mid">
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="overlay-title">Pick an item</span>
          </div>
        </div>
        <div className="overlay-actions">
          <CloseButton onClose={onClose} />
        </div>
      </div>
      <div className="pad">
        <input
          className="secinput"
          autoFocus
          type="search"
          value={q}
          placeholder={`Search ${eligible.length} items`}
          aria-label="Search items"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="pickerlist">
        <div className="reg-head pick-head" style={{ '--cols': PICK_COLS } as CSSProperties}>
          <span>ID</span>
          <span className="hd-f">
            Name
            <span className="filterpop" ref={planetRef}>
              <button
                className={`hd-funnel${hidePlanets.size ? ' on' : ''}`}
                type="button"
                aria-label="Filter planets"
                aria-expanded={filterOpen === 'planet'}
                onClick={() => setFilterOpen((v) => (v === 'planet' ? null : 'planet'))}
              >
                <Funnel size={12} />
              </button>
              {filterOpen === 'planet' && (
                <div className="menu filtermenu local">
                  {planetOptions.map((p) => (
                    <label key={p} className="checkline">
                      <input type="checkbox" checked={!hidePlanets.has(p)} onChange={() => setHidePlanets((s) => cycle(s, p, planetOptions))} />
                      {p}
                    </label>
                  ))}
                </div>
              )}
            </span>
          </span>
          <span className="hd-f">
            Type
            <span className="filterpop" ref={typeRef}>
              <button
                className={`hd-funnel${hideTypes.size ? ' on' : ''}`}
                type="button"
                aria-label="Filter types"
                aria-expanded={filterOpen === 'type'}
                onClick={() => setFilterOpen((v) => (v === 'type' ? null : 'type'))}
              >
                <Funnel size={12} />
              </button>
              {filterOpen === 'type' && (
                <div className="menu filtermenu local right">
                  {typeOptions.map((t) => (
                    <label key={t.label} className={`checkline${t.disabled ? ' disabled' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={t.disabled}
                        checked={!t.disabled && !hideTypes.has(t.label)}
                        onChange={() => setHideTypes((s) => cycle(s, t.label, enabledTypeLabels))}
                      />
                      <span style={t.disabled ? { textDecoration: 'line-through' } : undefined}>{t.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </span>
          </span>
        </div>
        <ul className="rows">
          {shown.slice(0, 500).map((it) => (
            <li key={it.index}>
              <div
                className="reg-row"
                style={{ '--cols': PICK_COLS } as CSSProperties}
                role="button"
                tabIndex={0}
                onClick={() => onPick(it)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPick(it);
                  }
                }}
              >
                <span className="cell-mono">{it.itemId}</span>
                <div className="cell-lead">
                  <span className="ico"><AvatarItemIcon item={it} /></span>
                  <div className="nm-stack">
                    <span className="nm-text" title={it.name}>
                      {it.name || '—'}
                    </span>
                    <span className="nm-sub">{it.planetLabel}</span>
                  </div>
                </div>
                <span className="chips">
                  <span className="chip">{it.itemTypeLabel}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Overlay>
  );
}

export function AvatarSetDetail({
  file,
  set,
  allItems,
  edited,
  onField,
  onItems,
  onRevert,
}: {
  file: WorkspaceFile;
  set: SetInfoEntry;
  allItems: ItemEntry[];
  edited: boolean;
  onField: (fields: NonNullable<SetEdit['fields']>) => void;
  onItems: (items: NonNullable<SetEdit['items']>) => void;
  onRevert: () => void;
}) {
  const [tab, setTab] = useState<'render' | 'meta' | 'items'>('render');
  const [instrument, setInstrument] = useState<SpriteInstrument>(() => {
    for (const entry of set.items) {
      const item = entry.active ? allItems.find((candidate) => candidate.itemId === entry.itemId) : undefined;
      const equipped = item ? instrumentOf(item) : 'none';
      if (equipped !== 'none') return equipped;
    }
    return 'none';
  });
  const [gender, setGender] = useState<SpriteGender>(set.gender === 'female' ? 'female' : 'male');
  const [showBase, setShowBase] = useState(true);
  const [keyOn, setKeyOn] = useState(true);
  const [playing, setPlaying] = useState(playback.playing);
  const [fps, setFps] = useState(playback.fps);
  useEffect(() => {
    playback.playing = playing;
    playback.fps = fps;
  }, [playing, fps]);
  const byId = useMemo(() => {
    const m = new Map<number, ItemEntry>();
    for (const it of allItems) if (!m.has(it.itemId)) m.set(it.itemId, it);
    return m;
  }, [allItems]);
  const [picking, setPicking] = useState<number | 'add' | null>(null);
  const active = set.items.filter((i) => i.active);
  const plain = active.map((i) => ({ itemId: i.itemId, price: i.price, salePrice: i.salePrice }));
  const typesInSet = (skipRow?: number) => {
    const taken = new Set<number>();
    active.forEach((i, j) => {
      if (j === skipRow) return;
      const linked = byId.get(i.itemId);
      if (linked) taken.add(linked.itemType);
    });
    return taken;
  };
  const wearing = useMemo(
    () => active.map((i) => byId.get(i.itemId)).filter((x): x is ItemEntry => !!x),
    [set, byId]
  );
  const layers = useMemo(
    () => buildLayers(file, wearing, byId, showBase, instrument, gender, keyOn),
    [file, wearing, byId, showBase, instrument, gender, keyOn]
  );

  return (
    <>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="ico acc">
              <Layers size={15} />
            </span>
            <span className="overlay-title">{set.name || `Set ${set.id}`}</span>
            {edited && <span className="chip warn">EDITED</span>}
          </div>
          <span className="overlay-path">
            Set {set.id} · {fmtOffset(set.offset)}
          </span>
        </div>
        <div className="overlay-actions">
          <button className="icon-btn" type="button" title="Revert this set's edits" disabled={!edited} onClick={onRevert}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'render', label: 'Render' },
          { id: 'meta', label: 'Metadata' },
          { id: 'items', label: 'Items' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="view-body">
        {tab === 'render' && (
          <>
            <div className="stagebar">
              <select className="selctl" style={{ width: 140 }} value={instrument} aria-label="Instrument" onChange={(e) => setInstrument(e.target.value as SpriteInstrument)}>
                {INSTRUMENTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              <select className="selctl" style={{ width: 96 }} value={gender} aria-label="Gender" onChange={(e) => setGender(e.target.value as SpriteGender)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <label className="checkline">
                <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
                <span>Base body</span>
              </label>
              <label className="checkline">
                <input type="checkbox" checked={keyOn} onChange={(e) => setKeyOn(e.target.checked)} />
                <span>Transparency</span>
              </label>
              <button className="icon-btn" type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <label className="animctl">
                <input type="range" min={1} max={24} value={fps} aria-label="Speed" onChange={(e) => setFps(Number(e.target.value))} />
                <span className="mono">{fps} fps</span>
              </label>
            </div>
            <div className="avatarstage">
              {layers.length === 0 ? (
                <span className="dz-hint">Nothing for {instrument} / {gender}.</span>
              ) : (
                <AvatarFig layers={layers} playing={playing} fps={fps} />
              )}
            </div>
          </>
        )}

        {tab === 'meta' && (
          <div className="deflist editlist">
            <div className="defrow">
              <span className="dk">Name</span>
              <span className="de">
                <input className="secinput" value={set.name} spellCheck={false} onChange={(e) => onField({ name: e.target.value })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Description</span>
              <span className="de">
                <textarea className="secinput ctsel-text" rows={2} value={set.description} onChange={(e) => onField({ description: e.target.value })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Planet</span>
              <span className="de">
                <select className="secinput" value={set.planet} onChange={(e) => onField({ planet: Number(e.target.value) })}>
                  {PLANET_ORIGINS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Gender</span>
              <span className="de">
                <select className="secinput" value={set.gender} onChange={(e) => onField({ gender: e.target.value as SetGender })}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="any">Any</option>
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">New</span>
              <span className="de">
                <label className="checkline">
                  <input type="checkbox" checked={set.isNew} onChange={(e) => onField({ isNew: e.target.checked })} />
                  <span>Show the NEW badge</span>
                </label>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Currency</span>
              <span className="de">
                <select className="secinput" value={set.currency === 0 ? 0 : 1} onChange={(e) => onField({ currency: Number(e.target.value) })}>
                  {SET_CURRENCIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        )}

        {tab === 'items' && (
          <>
            <div className="reg-head" style={{ '--cols': SETITEM_COLS } as CSSProperties}>
              <span>ID</span>
              <span>Name</span>
              <span>Price</span>
              <span>Sale price</span>
              <span />
            </div>
            <ul className="rows setrows">
              {active.map((i, ix) => {
                const linked = byId.get(i.itemId);
                return (
                  <li key={i.slot}>
                    <div className="reg-row setitemrow" style={{ '--cols': SETITEM_COLS } as CSSProperties}>
                      <span className="cell-mono">{i.itemId}</span>
                      <div className="cell-lead">
                        <span className="ico">{linked ? <AvatarItemIcon item={linked} /> : <AlertTriangle size={15} />}</span>
                        <div className="nm-stack">
                          <span className="nm-text" title={linked?.name}>
                            {linked?.name ?? 'Unknown item'}
                          </span>
                          <span className="nm-sub">{linked?.itemTypeLabel ?? '—'}</span>
                        </div>
                      </div>
                      <span className="cell-mono">{i.price}</span>
                      <input
                        className="secinput mono"
                        inputMode="numeric"
                        value={String(i.salePrice)}
                        aria-label="Sale price"
                        onChange={(e) =>
                          onItems(
                            plain.map((x, j) => (j === ix ? { ...x, salePrice: Math.min(x.price, Math.max(0, Number(e.target.value) || 0)) } : x))
                          )
                        }
                      />
                      <div className="acts">
                        <button className="rowact" type="button" aria-label="Replace with another item" onClick={() => setPicking(ix)}>
                          <Repeat size={14} />
                        </button>
                        <button className="rowact danger" type="button" aria-label="Remove from set" onClick={() => onItems(plain.filter((_, j) => j !== ix))}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="setacts" style={{ '--cols': SETITEM_COLS } as CSSProperties}>
              <button className="btn" type="button" disabled={active.length >= SET_INFO_MAX_ITEMS} onClick={() => setPicking('add')}>
                <Plus size={14} />
                ADD ITEM
              </button>
              <span className="cell-mono">{active.reduce((a, i) => a + i.price, 0)}</span>
              <span className="cell-mono">{active.reduce((a, i) => a + i.salePrice, 0)}</span>
              <span />
            </div>
          </>
        )}
        {picking !== null && (
          <SetItemPicker
            items={allItems}
            exclude={typesInSet(picking === 'add' ? undefined : picking)}
            gender={set.gender}
            onPick={(it) => {
              const price = set.currency === 1 ? it.priceGem : it.priceEPoint;
              const entry = { itemId: it.itemId, price, salePrice: price };
              onItems(picking === 'add' ? [...plain, entry] : plain.map((x, j) => (j === picking ? entry : x)));
              setPicking(null);
            }}
            onClose={() => setPicking(null)}
          />
        )}
      </div>
    </>
  );
}
