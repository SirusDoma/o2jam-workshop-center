import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  ATTRIBUTIVE_CATEGORIES,
  ATTRIBUTIVE_EFFECTS,
  ITEM_PARTS,
  PLANET_ORIGINS,
  type ItemDataVersion,
  type ItemEntry,
  type ItemGender,
  type SpriteGender,
  type SpriteInstrument,
} from '../../o2jam';
import { Tabs } from '../Tabs';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { fmtOffset } from '../../format';
import { AvatarFig } from './AvatarPreview';
import { AvatarSpriteEditor } from './AvatarSpriteEditor';
import { GENDER_CODE, INSTRUMENTS, partForType, playback } from '../../features/avatar/constants';
import type { ItemFieldPatch } from '../../features/avatar/types';
import { buildLayers, instrumentOf, renderSprite } from '../../features/avatar/utils';
import { AvatarItemIcon } from './AvatarItemIcon';

export function AvatarItemDetail({
  file,
  item,
  allItems,
  spriteNames,
  version,
  edited,
  onField,
  onSlot,
  onImport,
  onRevert,
}: {
  file: WorkspaceFile;
  item: ItemEntry;
  allItems: ItemEntry[];
  spriteNames: string[];
  version: ItemDataVersion;
  edited: boolean;
  onField: (patch: ItemFieldPatch) => void;
  onSlot: (index: number, name: string | null) => void;
  onImport: (f: File) => Promise<string>;
  onRevert: () => void;
}) {
  const [tab, setTab] = useState<'render' | 'meta' | 'sprites'>('render');
  const [instrument, setInstrument] = useState<SpriteInstrument | 'thumb0' | 'thumb1'>(instrumentOf(item));
  const [gender, setGender] = useState<SpriteGender>(item.gender === 'female' ? 'female' : 'male');
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
    for (const it of allItems) if (!m.has(it.itemId)) {
      m.set(it.itemId, it);
    }
    return m;
  }, [allItems]);

  const layers = useMemo(() => {
    if (instrument === 'thumb0' || instrument === 'thumb1') {
      const s = item.sprites[instrument === 'thumb0' ? 0 : 1];
      const frames = s?.present ? renderSprite(file, s.filename, keyOn) : null;
      return frames && frames.length && frames[0]!.width > 0 ? [{ frames, order: 0 }] : [];
    }

    return buildLayers(file, [item], byId, showBase, instrument, gender, keyOn);
  }, [file, item, byId, showBase, instrument, gender, keyOn]);

  return (
    <>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="ico acc"><AvatarItemIcon item={item} /></span>
            <span className="overlay-title">{item.name || `Item ${item.itemId}`}</span>
            <span className="chip img">{item.itemTypeLabel}</span>
            {edited && <span className="chip warn">EDITED</span>}
          </div>
          <span className="overlay-path">
            Item {item.itemId} · {fmtOffset(item.offset)}
          </span>
        </div>
        <div className="overlay-actions">
          <button className="icon-btn" type="button" title="Revert this item's edits" disabled={!edited} onClick={onRevert}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'render', label: 'Render' },
          { id: 'meta', label: 'Metadata' },
          { id: 'sprites', label: 'Sprites', count: item.sprites.filter((s) => s.present && s.filename).length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="view-body">
        {tab === 'render' && (
          <>
            <div className="stagebar">
              <select
                className="selctl"
                style={{ width: 160 }}
                value={instrument}
                aria-label="Instrument"
                onChange={(e) => setInstrument(e.target.value as SpriteInstrument | 'thumb0' | 'thumb1')}
              >
                {INSTRUMENTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
                <option value="thumb0">Thumbnail (Big)</option>
                <option value="thumb1">Thumbnail (Small)</option>
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
                <span className="dz-hint">
                  Nothing for {instrument === 'thumb0' ? 'thumbnail (big)' : instrument === 'thumb1' ? 'thumbnail (small)' : `${instrument} / ${gender}`}.
                </span>
              ) : (
                <AvatarFig layers={layers} playing={playing} fps={fps} />
              )}
            </div>
          </>
        )}

        {tab === 'meta' && (
          <div className="deflist editlist">
            <div className="defrow">
              <span className="dk">ID</span>
              <span className="de">
                <input className="secinput mono" inputMode="numeric" value={String(item.itemId)} onChange={(e) => onField({ itemId: Number(e.target.value) || 0 })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Name</span>
              <span className="de">
                <input className="secinput" value={item.name} spellCheck={false} onChange={(e) => onField({ name: e.target.value })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Description</span>
              <span className="de">
                <textarea className="secinput ctsel-text" rows={2} value={item.description} onChange={(e) => onField({ description: e.target.value })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Type</span>
              <span className="de">
                <select
                  className="secinput"
                  value={item.itemType}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    onField(item.index >= 1_000_000 ? { itemType: t, itemPart: partForType(version, t) } : { itemType: t });
                  }}
                >
                  {version.itemTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Part</span>
              <span className="de">
                <select className="secinput" value={item.itemPart} onChange={(e) => onField({ itemPart: Number(e.target.value) })}>
                  {ITEM_PARTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value={255}>Auto (by type)</option>
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Planet</span>
              <span className="de">
                <select className="secinput" value={item.planetOrigin} onChange={(e) => onField({ planetOrigin: Number(e.target.value) })}>
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
                <select
                  className="secinput"
                  value={item.gender}
                  onChange={(e) => onField({ bitflag: (item.bitflag & ~(0x0f << 7)) | (GENDER_CODE[e.target.value as ItemGender] << 7) })}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="any">Any</option>
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">New</span>
              <span className="de">
                <label className="tcheck" style={{ marginTop: 0 }}>
                  <input
                    type="checkbox"
                    checked={item.isNew}
                    onChange={(e) => onField({ bitflag: e.target.checked ? item.bitflag | (1 << 11) : item.bitflag & ~(1 << 11) })}
                  />
                  <span>Show the NEW badge</span>
                </label>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Quantity</span>
              <span className="de">
                <input className="secinput mono" inputMode="numeric" value={String(item.quantity)} onChange={(e) => onField({ quantity: Number(e.target.value) || 0 })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Payment</span>
              <span className="de">
                <select className="secinput" value={item.paymentMethod} onChange={(e) => onField({ paymentMethod: Number(e.target.value) })}>
                  {version.paymentMethods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Price GEM</span>
              <span className="de">
                <input className="secinput mono" inputMode="numeric" value={String(item.priceGem)} onChange={(e) => onField({ priceGem: Number(e.target.value) || 0 })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Price ePoint</span>
              <span className="de">
                <input className="secinput mono" inputMode="numeric" value={String(item.priceEPoint)} onChange={(e) => onField({ priceEPoint: Number(e.target.value) || 0 })} />
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Attributive Category</span>
              <span className="de">
                <select className="secinput" value={item.attributiveCategory} onChange={(e) => onField({ attributiveCategory: Number(e.target.value) })}>
                  {ATTRIBUTIVE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="defrow">
              <span className="dk">Attributive Effect</span>
              <span className="de">
                <select className="secinput" value={item.attributiveEffect} onChange={(e) => onField({ attributiveEffect: Number(e.target.value) })}>
                  {ATTRIBUTIVE_EFFECTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        )}

        {tab === 'sprites' && <AvatarSpriteEditor file={file} item={item} spriteNames={spriteNames} onSet={onSlot} onImport={onImport} />}
      </div>
    </>
  );
}
