import { controlTypeLabel, type Bound, type ControlEntry, type DecodedFrame } from '../../o2jam';

// The declaration line is the stable control key.
export const ckey = (c: ControlEntry) => `L${c.line}`;

export interface FieldEdit {
  token?: string;
  id?: number;
  sprite?: string;
  setId?: number | null;
}

export const idHex = (id: number) => `0x${(id >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

const SCROLL_RE = /^(O2_SBS_HORZ|O2_SBS_VERT)(?:\s+(-?\d+))?(?:\s+(-?\d+))?\s*$/;
export function parseScroll(s: string): { orient: 'O2_SBS_HORZ' | 'O2_SBS_VERT'; w: number; h: number; } | null {
  const m = SCROLL_RE.exec(s.trim());
  return m ? { orient: m[1] as 'O2_SBS_HORZ' | 'O2_SBS_VERT', w: Number(m[2] ?? 0), h: Number(m[3] ?? 0) } : null;
}

export function makeControl(id: number, token: string, sprite: string, line: number): ControlEntry {
  return {
    token,
    id,
    idHex: idHex(id),
    stateId: (id >>> 24) & 0xff,
    type: (id >>> 16) & 0xff,
    typeLabel: controlTypeLabel((id >>> 16) & 0xff),
    groupId: (id >>> 8) & 0xff,
    nodeId: id & 0xff,
    sprite,
    setId: null,
    boundIndex: -1,
    line,
  };
}

export function applyEdits(c: ControlEntry, edit: FieldEdit | undefined): ControlEntry {
  if (!edit || (edit.token === undefined && edit.id === undefined && edit.sprite === undefined && edit.setId === undefined)) {
    return c;
  }

  const id = edit.id ?? c.id;
  return {
    ...c,
    token: edit.token ?? c.token,
    sprite: edit.sprite ?? c.sprite,
    setId: edit.setId !== undefined ? edit.setId : c.setId,
    id,
    idHex: idHex(id),
    stateId: (id >>> 24) & 0xff,
    type: (id >>> 16) & 0xff,
    typeLabel: controlTypeLabel((id >>> 16) & 0xff),
    groupId: (id >>> 8) & 0xff,
    nodeId: id & 0xff,
  };
}

export function sortByOrder(list: ControlEntry[], ord: string[] | undefined): ControlEntry[] {
  if (!ord) {
    return list;
  }

  const pos = new Map(ord.map((k, i) => [k, i]));
  return [...list].sort((a, b) => (pos.get(ckey(a)) ?? Number.MAX_SAFE_INTEGER) - (pos.get(ckey(b)) ?? Number.MAX_SAFE_INTEGER));
}

export function boundFileFor(state: { name: string; boundFile: string | null; }, edits: Record<string, string | null>): string | null {
  return edits[state.name] !== undefined ? edits[state.name]! : state.boundFile;
}

export function boundWithSize(bound: Bound): Bound {
  return { ...bound, width: bound.right - bound.left, height: bound.bottom - bound.top };
}

const FRAME_FIT_BOX = 84;
export function fitScale(w: number, h: number): number {
  if (w <= 0 || h <= 0) {
    return 1;
  }

  return Math.min(FRAME_FIT_BOX / w, FRAME_FIT_BOX / h, 8);
}

export function defaultSource(c: ControlEntry): PosSource {
  return c.type === 0x20 || c.type === 0x01 ? 'sprite' : 'bound';
}

export function basePos(sx: number, sy: number, b: Bound | undefined, source: PosSource): { x: number; y: number; } {
  const spritePlaced = sx !== 0 || sy !== 0;
  if (source === 'sprite') {
    if (spritePlaced) {
      return { x: sx, y: sy };
    }

    if (b) {
      return { x: b.left, y: b.top };
    }

    return { x: 0, y: 0 };
  }

  if (b) {
    return { x: b.left, y: b.top };
  }

  if (spritePlaced) {
    return { x: sx, y: sy };
  }

  return { x: 0, y: 0 };
}

export function shifted(x: number, y: number, boundIndex: number, origin: BlockOrigin): { x: number; y: number; } {
  if (origin && boundIndex !== origin.idx) {
    return { x: x + origin.x, y: y + origin.y };
  }

  return { x, y };
}

export function boundOfIn(c: ControlEntry, bounds: (Bound | undefined)[], addedBounds: Record<string, Bound>): Bound | undefined {
  return c.boundIndex >= 0 ? bounds[c.boundIndex] : addedBounds[ckey(c)];
}

export interface Decoded {
  control: ControlEntry;
  frames: DecodedFrame[];
  fpos: { x: number; y: number; }[];
  fx: number;
  fy: number;
}

export function frameOff(d: { fpos: { x: number; y: number; }[]; }, idx: number): { x: number; y: number; } {
  const a = d.fpos[idx];
  const z = d.fpos[0];
  return a && z ? { x: a.x - z.x, y: a.y - z.y } : { x: 0, y: 0 };
}
export interface Placed extends Decoded {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface BoundRect extends Rect {
  key: string | null;
}
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export interface TextStyle {
  text: string;
  color: string;
  size: number;
  halign: HAlign;
  valign: VAlign;
  outline: boolean;
}
export const DEFAULT_TEXT: TextStyle = { text: '', color: '#ffffff', size: 12, halign: 'left', valign: 'middle', outline: true };
export interface LabelDraw extends Rect {
  style: TextStyle;
}
export type BlockOrigin = { idx: number; x: number; y: number; } | null;
export type PosSource = 'bound' | 'sprite';
export interface EditFrame {
  width: number;
  height: number;
  x: number;
  y: number;
  rgba: Uint8ClampedArray | Uint8Array;
}


export type Row =
  | { kind: 'control'; control: ControlEntry; }
  | { kind: 'set'; setId: number; members: ControlEntry[]; }
  | { kind: 'deadset'; setId: number; };
