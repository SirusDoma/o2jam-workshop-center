import {
  DEFAULT_ENCODING,
  decodeFrame,
  decodeText,
  detectEncoding,
  findEntry,
  parseArchive,
  parseBounds,
  parseControlList,
  parseSprite,
  readEntry,
  type Bound,
  type ControlEntry,
  type ControlList,
  type ControlState,
  type DecodedFrame,
  type O2Encoding,
} from '../../o2jam';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import {
  applyEdits,
  basePos,
  boundOfIn,
  ckey,
  defaultSource,
  frameOff,
  shifted,
  sortByOrder,
  type BlockOrigin,
  type BoundRect,
  type Decoded,
  type EditFrame,
  type FieldEdit,
  type LabelDraw,
  type Placed,
  type PosSource,
  type Rect,
  type Row,
  type TextStyle,
} from './model';

export const CONTROL_LIST_NAMES = ['ControlList_Interface.txt', 'ControlList_Playing.txt'];

export function readScene(file: WorkspaceFile): { list?: ControlList; encoding?: O2Encoding; error?: string } {
  try {
    const archive = parseArchive(file.buffer, DEFAULT_ENCODING);
    for (const name of CONTROL_LIST_NAMES) {
      const entry = findEntry(archive.entries, name);
      if (!entry) continue;
      const bytes = readEntry(file.buffer, entry);
      const encoding = detectEncoding([bytes]) ?? 'ascii';
      return { list: parseControlList(decodeText(bytes, encoding)), encoding };
    }
    return { error: 'No ControlList in this archive.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not read this archive.' };
  }
}

export function readBounds(file: WorkspaceFile, name: string): Bound[] {
  try {
    const archive = parseArchive(file.buffer, DEFAULT_ENCODING);
    const entry = findEntry(archive.entries, name);
    return entry ? parseBounds(readEntry(file.buffer, entry)).bounds : [];
  } catch {
    return [];
  }
}

export function decodeSpriteFrames(file: WorkspaceFile, name: string): EditFrame[] {
  try {
    const archive = parseArchive(file.buffer, DEFAULT_ENCODING);
    const entry = findEntry(archive.entries, name);
    if (!entry) return [];
    const data = readEntry(file.buffer, entry);
    const sprite = parseSprite(data, entry.name);
    const frames: EditFrame[] = [];
    for (let index = 0; index < sprite.frameCount; index++) {
      try {
        const decoded = decodeFrame(data, sprite, index, {});
        const metadata = sprite.frames[index]!;
        frames.push({ width: decoded.width, height: decoded.height, x: metadata.x, y: metadata.y, rgba: decoded.rgba });
      } catch {
      }
    }
    return frames;
  } catch {
    return [];
  }
}

export function allControls(state: ControlState): ControlEntry[] {
  return state.base ? [state.base, ...state.controls] : state.controls;
}

export function anchorBounds(controls: ControlEntry[], setId: number, bounds: (Bound | undefined)[]): Bound[] {
  const type = (setId >> 16) & 0xff;
  const group = (setId >> 8) & 0xff;
  return controls
    .filter((c) => c.setId === null && ((c.id >> 16) & 0xff) === type && ((c.id >> 8) & 0xff) === group && c.boundIndex >= 0)
    .map((c) => bounds[c.boundIndex])
    .filter((b): b is Bound => Boolean(b) && (b!.left !== 0 || b!.top !== 0));
}

export function withinAnchor(member: Bound, anchor: Bound): boolean {
  const aw = anchor.right - anchor.left;
  const ah = anchor.bottom - anchor.top;
  return member.left >= 0 && member.top >= 0 && member.left <= aw && member.top <= ah;
}

export function toRows(controls: ControlEntry[]): Row[] {
  const rows: Row[] = [];
  const groups = new Map<number, Row & { kind: 'set' }>();
  for (const c of controls) {
    if (c.setId === null) {
      rows.push({ kind: 'control', control: c });
    } else {
      let g = groups.get(c.setId);
      if (!g) {
        g = { kind: 'set', setId: c.setId, members: [] };
        groups.set(c.setId, g);
        rows.push(g);
      }
      g.members.push(c);
    }
  }
  return rows;
}

export function filterRows(rows: Row[], query: string): Row[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const hit = (c: ControlEntry) => `${c.token} ${c.idHex} ${c.sprite}`.toLowerCase().includes(q);
  const out: Row[] = [];
  for (const row of rows) {
    if (row.kind === 'control') {
      if (hit(row.control)) out.push(row);
    } else if (row.kind === 'deadset') {
      if (`set 0x${row.setId.toString(16)}`.includes(q)) out.push(row);
    } else {
      const members = row.members.filter(hit);
      if (members.length || `set 0x${row.setId.toString(16)}`.includes(q)) {
        out.push({ ...row, members: members.length ? members : row.members });
      }
    }
  }
  return out;
}

const restoreDissolvedSet = (state: ControlState, control: ControlEntry, dissolvedSets: ReadonlySet<string>): ControlEntry =>
  control.setId !== null && dissolvedSets.has(`${state.name}:${control.setId}`) ? { ...control, setId: null } : control;

export function effectiveControls(
  state: ControlState,
  fieldEdits: Record<string, FieldEdit>,
  removed: ReadonlySet<string>,
  added: Record<string, ControlEntry[]>,
  orderKeys: Record<string, string[]>,
  dissolvedSets: ReadonlySet<string>
): ControlEntry[] {
  const result: ControlEntry[] = [];
  if (state.base && !removed.has(ckey(state.base))) result.push(applyEdits(state.base, fieldEdits[ckey(state.base)]));
  const controls: ControlEntry[] = [];
  for (const control of state.controls) {
    if (!removed.has(ckey(control))) controls.push(restoreDissolvedSet(state, applyEdits(control, fieldEdits[ckey(control)]), dissolvedSets));
  }
  for (const control of added[state.name] ?? []) {
    if (!removed.has(ckey(control))) controls.push(restoreDissolvedSet(state, applyEdits(control, fieldEdits[ckey(control)]), dissolvedSets));
  }
  return [...result, ...sortByOrder(controls, orderKeys[state.name])];
}

export function sceneRows(
  state: ControlState,
  fieldEdits: Record<string, FieldEdit>,
  added: Record<string, ControlEntry[]>,
  orderKeys: Record<string, string[]>,
  dissolvedSets: ReadonlySet<string>
): { rows: Row[]; ordered: ControlEntry[] } {
  const ordered: ControlEntry[] = [];
  if (state.base) ordered.push(applyEdits(state.base, fieldEdits[ckey(state.base)]));
  const controls = [
    ...state.controls.map((control) => restoreDissolvedSet(state, applyEdits(control, fieldEdits[ckey(control)]), dissolvedSets)),
    ...(added[state.name] ?? []).map((control) => restoreDissolvedSet(state, applyEdits(control, fieldEdits[ckey(control)]), dissolvedSets)),
  ];
  ordered.push(...sortByOrder(controls, orderKeys[state.name]));
  const rows = toRows(ordered);
  const dead = [...dissolvedSets]
    .filter((key) => key.startsWith(`${state.name}:`))
    .map((key) => Number(key.slice(state.name.length + 1)));
  if (!dead.length) return { rows, ordered };
  const originalSetIds = new Map<string, number>();
  for (const control of [...state.controls, ...(added[state.name] ?? [])]) {
    if (control.setId !== null) originalSetIds.set(ckey(control), control.setId);
  }
  for (const setId of dead) {
    const index = rows.findIndex((row) => row.kind === 'control' && originalSetIds.get(ckey(row.control)) === setId);
    rows.splice(index < 0 ? rows.length : index, 0, { kind: 'deadset', setId });
  }
  return { rows, ordered };
}

export function leftoverBounds(
  state: ControlState,
  bounds: Bound[],
  removed: ReadonlySet<string>,
  extra: Record<string, Bound[]>
): Bound[] {
  const kept = bounds.filter((bound) => bound.index >= state.controls.length && !removed.has(`${state.name}:${bound.index}`));
  return [...kept, ...(extra[state.name] ?? [])];
}

export function blockOrigin(controls: ControlEntry[], bounds: (Bound | undefined)[]): BlockOrigin {
  let index = -1;
  for (const control of controls) if (control.boundIndex >= 0 && (index < 0 || control.boundIndex < index)) index = control.boundIndex;
  const bound = index >= 0 ? bounds[index] : undefined;
  return bound ? { idx: index, x: bound.left, y: bound.top } : null;
}

export function placeControls({
  state,
  decoded,
  controls,
  bounds,
  addedBounds,
  hidden,
  origin,
  sources,
  spritePositions,
  setIdEdits,
}: {
  state: ControlState;
  decoded: Decoded[];
  controls: ControlEntry[];
  bounds: (Bound | undefined)[];
  addedBounds: Record<string, Bound>;
  hidden: ReadonlySet<string>;
  origin: BlockOrigin;
  sources: Record<string, PosSource>;
  spritePositions: Record<string, { x: number; y: number }>;
  setIdEdits: Record<string, number>;
}): Placed[] {
  const result: Placed[] = [];
  const anchorsBySet = new Map<number, Bound[]>();
  for (const decodedControl of decoded) {
    const control = decodedControl.control;
    if (hidden.has(ckey(control))) continue;
    const firstFrame = decodedControl.frames[0]!;
    const base = { ...decodedControl, w: firstFrame.width, h: firstFrame.height };
    const bound = boundOfIn(control, bounds, addedBounds);
    const spritePosition = spritePositions[control.sprite.toLowerCase()];
    const spriteX = spritePosition ? spritePosition.x : decodedControl.fx;
    const spriteY = spritePosition ? spritePosition.y : decodedControl.fy;

    if (control.setId !== null) {
      let anchors = anchorsBySet.get(control.setId);
      if (!anchors) {
        const mappedSetId = setIdEdits[`${state.name}:${control.setId}`] ?? control.setId;
        anchors = anchorBounds(controls, mappedSetId, bounds);
        anchorsBySet.set(control.setId, anchors);
      }
      if (anchors.length && bound) {
        anchors.forEach((anchor, index) => {
          if (!withinAnchor(bound, anchor)) return;
          const position = shifted(anchor.left + bound.left, anchor.top + bound.top, control.boundIndex, origin);
          result.push({ ...base, key: `${ckey(control)}#${index}`, x: position.x, y: position.y });
        });
        continue;
      }
      if (spriteX || spriteY) {
        const position = shifted(spriteX, spriteY, control.boundIndex, origin);
        result.push({ ...base, key: ckey(control), x: position.x, y: position.y });
      }
      continue;
    }

    const source = sources[ckey(control)] ?? defaultSource(control);
    const basePosition = basePos(spriteX, spriteY, bound, source);
    const position = shifted(basePosition.x, basePosition.y, control.boundIndex, origin);
    result.push({ ...base, key: ckey(control), x: position.x, y: position.y });
  }
  return result;
}

export function createBoundRects({
  state,
  controls,
  bounds,
  addedBounds,
  leftovers,
  origin,
  setIdEdits,
}: {
  state: ControlState;
  controls: ControlEntry[];
  bounds: (Bound | undefined)[];
  addedBounds: Record<string, Bound>;
  leftovers: Bound[];
  origin: BlockOrigin;
  setIdEdits: Record<string, number>;
}): BoundRect[] {
  const result: BoundRect[] = [];
  const anchorsBySet = new Map<number, Bound[]>();
  for (const control of controls) {
    const bound = boundOfIn(control, bounds, addedBounds);
    if (!bound) continue;
    const key = ckey(control);
    if (control.setId !== null) {
      let anchors = anchorsBySet.get(control.setId);
      if (!anchors) {
        anchors = anchorBounds(controls, setIdEdits[`${state.name}:${control.setId}`] ?? control.setId, bounds);
        anchorsBySet.set(control.setId, anchors);
      }
      if (anchors.length) {
        for (const anchor of anchors) {
          if (!withinAnchor(bound, anchor)) continue;
          const position = shifted(anchor.left + bound.left, anchor.top + bound.top, control.boundIndex, origin);
          result.push({ key, left: position.x, top: position.y, width: bound.width, height: bound.height });
        }
      }
      continue;
    }
    const position = shifted(bound.left, bound.top, control.boundIndex, origin);
    result.push({ key, left: position.x, top: position.y, width: bound.width, height: bound.height });
  }
  for (const bound of leftovers) {
    const position = shifted(bound.left, bound.top, bound.index, origin);
    result.push({ key: null, left: position.x, top: position.y, width: bound.width, height: bound.height });
  }
  return result;
}

export function createBoundRows(
  controls: ControlEntry[],
  bounds: (Bound | undefined)[],
  addedBounds: Record<string, Bound>,
  leftovers: Bound[]
): { key: string; token: string; bound: Bound; control: ControlEntry | null }[] {
  const result: { key: string; token: string; bound: Bound; control: ControlEntry | null }[] = [];
  for (const control of controls) {
    const bound = boundOfIn(control, bounds, addedBounds);
    if (bound) result.push({ key: `c${ckey(control)}`, token: control.token, bound, control });
  }
  for (const bound of leftovers) result.push({ key: `l${bound.index}`, token: '—', bound, control: null });
  return result;
}

export function sceneExtent(placed: Placed[], bounds: BoundRect[]): { w: number; h: number } {
  let width = 640;
  let height = 480;
  for (const placedControl of placed) {
    for (let index = 0; index < placedControl.frames.length; index++) {
      const offset = frameOff(placedControl, index);
      width = Math.max(width, placedControl.x + offset.x + placedControl.frames[index]!.width);
      height = Math.max(height, placedControl.y + offset.y + placedControl.frames[index]!.height);
    }
  }
  for (const bound of bounds) {
    width = Math.max(width, bound.left + bound.width);
    height = Math.max(height, bound.top + bound.height);
  }
  return { w: width + 8, h: height + 8 };
}

export function selectedRectangles(
  selected: string | null,
  placed: Placed[],
  bounds: BoundRect[],
  frameSelection: Record<string, number>
): Rect[] {
  if (!selected) return [];
  const sprites = placed.filter((entry) => ckey(entry.control) === selected);
  if (sprites.length) {
    return sprites.map((entry) => {
      let index = Math.min(frameSelection[selected] ?? 0, entry.frames.length - 1);
      if (!entry.frames[index]) index = 0;
      const frame = entry.frames[index]!;
      const offset = frameOff(entry, index);
      return { left: entry.x + offset.x, top: entry.y + offset.y, width: frame.width, height: frame.height };
    });
  }
  return bounds.filter((bound) => bound.key === selected).map(({ left, top, width, height }) => ({ left, top, width, height }));
}

export function labelDraws(labels: Record<string, TextStyle>, bounds: BoundRect[], placed: Placed[]): LabelDraw[] {
  const result: LabelDraw[] = [];
  for (const [key, style] of Object.entries(labels)) {
    if (!style.text.trim()) continue;
    const boundRects = bounds.filter((bound) => bound.key === key);
    const sources = boundRects.length
      ? boundRects
      : placed.filter((entry) => ckey(entry.control) === key).map((entry) => ({ left: entry.x, top: entry.y, width: entry.w, height: entry.h }));
    for (const source of sources) result.push({ style, left: source.left, top: source.top, width: source.width, height: source.height });
  }
  return result;
}

type DecodedEntry = { frames: DecodedFrame[]; fpos: { x: number; y: number }[]; fx: number; fy: number } | null;
export interface DecodeCache {
  file: WorkspaceFile | null;
  map: Map<string, { entry: DecodedEntry; override: EditFrame[] | undefined; keyOn: boolean }>;
}

export function decodeAll(file: WorkspaceFile, controls: ControlEntry[], keyOn: boolean, overrides: Record<string, EditFrame[]>, persist: DecodeCache): Decoded[] {
  let archive;
  try {
    archive = parseArchive(file.buffer, DEFAULT_ENCODING);
  } catch {
    return [];
  }
  if (persist.file !== file) {
    persist.file = file;
    persist.map.clear();
  }
  const cache = new Map<string, DecodedEntry>();
  for (const [k, v] of persist.map) if (v.override === overrides[k] && v.keyOn === keyOn) cache.set(k, v.entry);
  const out: Decoded[] = [];

  for (const control of controls) {
    if (!control.sprite) continue;
    const k = control.sprite.toLowerCase();
    let entry = cache.get(k);
    if (entry === undefined) {
      entry = null;
      const edited = overrides[k];
      if (edited && edited.length) {
        const src = edited;
        const frames: DecodedFrame[] = src.map((f) => ({ width: f.width, height: f.height, rgba: f.rgba instanceof Uint8ClampedArray ? f.rgba : new Uint8ClampedArray(f.rgba) }) as DecodedFrame);
        if (frames[0] && frames[0].width > 0) entry = { frames, fpos: src.map((f) => ({ x: f.x, y: f.y })), fx: src[0]!.x, fy: src[0]!.y };
        cache.set(k, entry);
        persist.map.set(k, { entry, override: overrides[k], keyOn });
        if (!entry) continue;
        out.push({ control, frames: entry.frames, fpos: entry.fpos, fx: entry.fx, fy: entry.fy });
        continue;
      }
      const found = findEntry(archive.entries, control.sprite);
      if (found) {
        try {
          const data = readEntry(file.buffer, found);
          const sprite = parseSprite(data, found.name);
          if (sprite.frameCount > 0) {
            const frames: DecodedFrame[] = [];
            const fpos: { x: number; y: number }[] = [];
            for (let i = 0; i < sprite.frameCount; i++) {
              try {
                frames.push(decodeFrame(data, sprite, i, { colorKey: keyOn ? undefined : null }));
                fpos.push({ x: sprite.frames[i]!.x, y: sprite.frames[i]!.y });
              } catch {
              }
            }
            const meta = sprite.frames[0]!;
            if (frames[0] && frames[0].width > 0) entry = { frames, fpos, fx: meta.x, fy: meta.y };
          }
        } catch {
          entry = null;
        }
      }
      cache.set(k, entry);
      persist.map.set(k, { entry, override: overrides[k], keyOn });
    }
    if (!entry) continue;
    out.push({ control, frames: entry.frames, fpos: entry.fpos, fx: entry.fx, fy: entry.fy });
  }
  return out;
}
