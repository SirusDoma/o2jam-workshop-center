import {
  SPRITE_SLOTS,
  decodeFrame,
  findEntry,
  isItemDataFilename,
  parseArchive,
  parseSprite,
  readEntry,
  type ArchiveEntry,
  type DecodedFrame,
  type ItemEntry,
  type SpriteGender,
  type SpriteInstrument,
  type SpriteRegion,
} from '../../o2jam';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { REGION_ORDER, baseBodyIds } from './constants';

export interface Layer {
  frames: DecodedAt[];
  order: number;
}

export function spriteNameStem(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot < 0 ? name : name.slice(0, dot)).toLowerCase();
}

export function ojiReferenceName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot < 0 ? name : name.slice(0, dot)}.oji`;
}


export function buildLayers(
  file: WorkspaceFile,
  wearing: readonly ItemEntry[],
  byId: Map<number, ItemEntry>,
  showBase: boolean,
  instrument: SpriteInstrument,
  gender: SpriteGender,
  keyOn: boolean
): Layer[] {
  const sources: { item: ItemEntry; overrides: Record<number, string | null>; }[] = [];
  const isCostume = wearing.some((w) => w.itemType === 28);
  if (showBase && !isCostume) {
    for (const id of baseBodyIds(gender)) {
      const base = byId.get(id);
      if (base && !wearing.some((w) => w.index === base.index)) {
        sources.push({ item: base, overrides: {} });
      }
    }
  }

  for (const w of wearing) sources.push({ item: w, overrides: {} });

  const out: Layer[] = [];
  for (const src of sources) {
    const equip = equipTypeOf(src.item, instrument);
    const regions: readonly SpriteRegion[] = equip === 'Costume' ? ['back', 'body'] : REGION_ORDER;
    for (const region of regions) {
      const l = regionLayer(file, src.item, src.overrides, region, instrument, gender, keyOn);
      if (l) {
        out.push({ ...l, order: layerOrder(equip, region, instrument) });
      }
    }
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}


export interface DecodedAt extends DecodedFrame {
  x: number;
  y: number;
}

function slotIndex(region: SpriteRegion, instrument: SpriteInstrument, gender: SpriteGender): number | null {
  const s = SPRITE_SLOTS.find((x) => x.region === region && x.instrument === instrument && x.gender === gender);
  return s ? s.index : null;
}

function regionLayer(
  file: WorkspaceFile,
  item: ItemEntry,
  overrides: Record<number, string | null>,
  region: SpriteRegion,
  instrument: SpriteInstrument,
  gender: SpriteGender,
  keyOn: boolean
): { frames: DecodedAt[]; } | null {
  const idx = slotIndex(region, instrument, gender);
  const noneIdx = slotIndex(region, 'none', gender);
  let name = '';
  if (idx !== null && overrides[idx] !== undefined) {
    name = overrides[idx] ?? '';
  }
  else if (idx !== null && item.sprites[idx]?.present) {
    name = item.sprites[idx]!.filename;
  }

  if (!name && noneIdx !== null) {
    if (overrides[noneIdx] !== undefined) {
      name = overrides[noneIdx] ?? '';
    }
    else if (item.sprites[noneIdx]?.present) {
      name = item.sprites[noneIdx]!.filename;
    }
  }

  if (!name) {
    return null;
  }

  const frames = renderSprite(file, name, keyOn);
  return frames && frames.length && frames[0]!.width > 0 ? { frames } : null;
}


const RENDER_ORDER: string[] = [
  'Costume', 'Accessories', 'Wings',
  'Body:Back', 'Hair:Back', 'Top:Back', 'Body:Body', 'Body:LeftArm', 'Body:RightArm',
  'Shoes', 'Pants', 'ClothesAccessories', 'LeftArm', 'Keyboard',
  'Top:Body', 'Top:LeftArm', 'Bass', 'Guitar', 'RightArm', 'Top:RightArm',
  'Necklace', 'LeftHand', 'RightHand', 'Gloves', 'Face', 'Earrings', 'Glasses',
  'Hair:Body', 'Hair:LeftArm', 'Hair:RightArm', 'HairAccessories', 'Drum',
  'InstrumentAccessories', 'Pet',
].flatMap((e) => (e.includes(':') ? [e] : ['Back', 'Body', 'LeftArm', 'RightArm'].map((p) => `${e}:${p}`)));
const RENDER_ORDER_INDEX = new Map(RENDER_ORDER.map((k, i) => [k, i]));
const PART_OF: Record<SpriteRegion, string> = { back: 'Back', body: 'Body', leftArm: 'LeftArm', rightArm: 'RightArm', preview: 'Body' };

function layerOrder(equip: string, region: SpriteRegion, instrument: SpriteInstrument): number {
  let e = equip;
  if (instrument === 'keyboard' && PART_OF[region] === 'Body') {
    if (e === 'LeftArm') {
      e = 'Top';
    }
    else if (e === 'Top') {
      e = 'LeftArm';
    }
  }

  return RENDER_ORDER_INDEX.get(`${e}:${PART_OF[region]}`) ?? 999;
}

export function instrumentOf(item: ItemEntry): SpriteInstrument {
  switch (item.itemType) {
    case 15:
      return 'keyboard';
    case 16:
      return 'guitar';
    case 17:
      return 'drum';
    case 18:
      return 'bass';
    default:
      return 'none';
  }
}

function equipTypeOf(item: ItemEntry, instrument: SpriteInstrument): string {
  if (item.itemType === 28) {
    return 'Costume';
  }

  if (item.itemPart === 0) {
    const map: Record<SpriteInstrument, string> = { keyboard: 'Keyboard', guitar: 'Guitar', bass: 'Bass', drum: 'Drum', none: 'Keyboard' };
    return map[instrumentOf(item)] ?? map[instrument] ?? 'Keyboard';
  }

  const partMap: Record<number, string> = {
    1: 'Hair', 2: 'Accessories', 3: 'Gloves', 4: 'Necklace', 5: 'Top', 6: 'Pants',
    7: 'Glasses', 8: 'Earrings', 9: 'ClothesAccessories', 10: 'Shoes', 11: 'Face',
    12: 'Wings', 13: 'InstrumentAccessories', 14: 'Pet', 15: 'HairAccessories', 16: 'Body',
  };
  if (item.itemPart in partMap) {
    return partMap[item.itemPart]!;
  }

  const typeMap: Record<number, string> = { 0: 'Body', 1: 'LeftArm', 2: 'RightArm', 3: 'LeftHand', 4: 'RightHand', 5: 'Face', 6: 'Hair' };
  return typeMap[item.itemType] ?? 'Body';
}

export const spriteCache = new Map<string, DecodedAt[] | null>();
export const importedSprites = new Map<string, Uint8Array>();

function resolveImportedSprite(fileId: string, name: string): { name: string; data: Uint8Array; } | null {
  const prefix = `${fileId}:`;
  const exact = importedSprites.get(`${prefix}${name.toLowerCase()}`);
  if (exact) {
    return { name, data: exact };
  }

  const stem = spriteNameStem(name);
  for (const [key, data] of importedSprites) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const candidate = key.slice(prefix.length);
    if (spriteNameStem(candidate) === stem) {
      return { name: candidate, data };
    }
  }

  return null;
}

export function renderSprite(file: WorkspaceFile, name: string, keyOn: boolean): DecodedAt[] | null {
  const cacheKey = `${file.id}:${name}:${keyOn}`;
  const hit = spriteCache.get(cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  let result: DecodedAt[] | null = null;
  try {
    const imported = resolveImportedSprite(file.id, name);
    let sname = imported?.name ?? name;
    let data = imported?.data ?? null;
    if (!data) {
      const archive = parseArchive(file.buffer, 'ascii');
      const entry = resolveSprite(archive.entries, name);
      if (entry) {
        data = readEntry(file.buffer, entry);
        sname = entry.name;
      }
    }

    if (data) {
      const sprite = parseSprite(data, sname);
      if (sprite.frameCount > 0) {
        const n = sprite.frameCount;
        const out: DecodedAt[] = [];
        for (let i = 0; i < n; i++) {
          const meta = sprite.frames[i];
          if (!meta) {
            continue;
          }

          const f = decodeFrame(data, sprite, i, { colorKey: keyOn ? undefined : null });
          out.push({ ...f, x: meta.x, y: meta.y });
        }
        result = out.length ? out : null;
      }
    }
  } catch {
    result = null;
  }
  if (spriteCache.size > 400) {
    spriteCache.clear();
  }

  spriteCache.set(cacheKey, result);
  return result;
}

function resolveSprite(entries: ArchiveEntry[], name: string): ArchiveEntry | null {
  const exact = findEntry(entries, name);
  if (exact) {
    return exact;
  }

  const base = name.replace(/\.[^.]*$/, '');
  for (const ext of ['ojs', 'oji', 'ojt', 'oja']) {
    const e = findEntry(entries, `${base}.${ext}`);
    if (e) {
      return e;
    }
  }
  return null;
}


export function findTables(file: WorkspaceFile): ArchiveEntry[] {
  try {
    return parseArchive(file.buffer, 'ascii').entries.filter((e) => isItemDataFilename(e.name));
  } catch {
    return [];
  }
}

export function archiveSpriteNames(file: WorkspaceFile): string[] {
  try {
    return parseArchive(file.buffer, 'ascii')
      .entries.filter((e) => /\.(ojs|oji|ojt|oja)$/i.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
