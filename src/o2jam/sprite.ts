
import { asBytes, ByteWriter, FormatError } from './binary';
import type { BinarySource } from './binary';

export const SPRITE_HEADER_SIZE = 8;
export const FRAME_HEADER_SIZE = 20;

export const FORMAT_RGB555 = 0x0555;
export const FORMAT_RUNLIST = 0x555a;

export type SpriteCodec = 'rgb555' | 'runlist' | 'masked-runlist';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const DEFAULT_COLOR_KEY: Rgb = { r: 255, g: 82, b: 255 };

export const DEFAULT_COLOR_KEY_THRESHOLD = 30;
export const FILE_COLOR_KEY_THRESHOLD = 20;

export interface SpriteFrame {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bitmapOffset: number;
  bitmapSize: number;
  dataOffset: number;
  unused: number;
  npot: boolean;
  headerOffset: number;
}

export interface Sprite {
  signature: number;
  format: number;
  formatLabel: string;
  codec: SpriteCodec;
  frameCount: number;
  colorKey: number;
  colorKeyRgb: Rgb;
  frames: SpriteFrame[];
  npot: boolean;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function expandScaled(c5: number): number {
  return Math.floor((c5 * 255) / 31);
}

function expandReplicated(c5: number): number {
  return ((c5 << 3) | (c5 >> 2)) & 0xff;
}

function rgb555(word: number, replicate: boolean): Rgb {
  const r5 = (word >> 10) & 0x1f;
  const g5 = (word >> 5) & 0x1f;
  const b5 = word & 0x1f;
  const expand = replicate ? expandReplicated : expandScaled;
  return { r: expand(r5), g: expand(g5), b: expand(b5) };
}

const rasterLuts = new Map<string, Uint32Array>();
const clampByte = new Uint8ClampedArray(1);

function rasterLut(key: Rgb | null, threshold: number): Uint32Array {
  const id = key && threshold > 0 ? `${key.r},${key.g},${key.b}:${threshold}` : 'opaque';
  const hit = rasterLuts.get(id);
  if (hit) return hit;
  const lut = new Uint32Array(65536);
  for (let word = 0; word < 65536; word++) {
    const r = expandScaled((word >> 10) & 0x1f);
    const g = expandScaled((word >> 5) & 0x1f);
    const b = expandScaled(word & 0x1f);
    let a = 255;
    if (key && threshold > 0) {
      const dr = r - key.r;
      const dg = g - key.g;
      const db = b - key.b;
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance < threshold) {
        clampByte[0] = (distance / threshold) * 255;
        a = clampByte[0];
      }
    }
    lut[word] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  if (rasterLuts.size >= 8) rasterLuts.clear();
  rasterLuts.set(id, lut);
  return lut;
}

function codecFor(format: number, filename: string): SpriteCodec {
  const name = filename.toLowerCase();
  if (name.endsWith('.oji')) return 'masked-runlist';
  if (name.endsWith('.ojt')) return 'rgb555';
  return format === FORMAT_RUNLIST ? 'runlist' : 'rgb555';
}

function codecLabel(codec: SpriteCodec, format: number): string {
  switch (codec) {
    case 'masked-runlist':
      return 'Masked run-list (.oji)';
    case 'runlist':
      return 'Run-list (0x555A)';
    default:
      return format === FORMAT_RGB555 ? 'RGB555 raster (0x0555)' : `RGB555 raster (0x${format.toString(16)})`;
  }
}

export function isSpriteData(source: BinarySource, filename = ''): boolean {
  try {
    parseSprite(source, filename);
    return true;
  } catch {
    return false;
  }
}

export function parseSprite(source: BinarySource, filename: string): Sprite {
  const bytes = asBytes(source);
  if (bytes.byteLength < SPRITE_HEADER_SIZE) {
    throw new FormatError(
      `sprite needs at least ${SPRITE_HEADER_SIZE} bytes, got ${bytes.byteLength}`,
      0,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const signature = view.getInt16(0, true);
  const format = view.getUint16(2, true);
  const frameCount = view.getUint16(4, true);
  const colorKey = view.getUint16(6, true);
  if (signature !== 0 && signature !== 1) throw new FormatError(`invalid sprite signature ${signature}`, 0);
  if (format !== FORMAT_RGB555 && format !== FORMAT_RUNLIST) throw new FormatError(`unsupported sprite format 0x${format.toString(16)}`, 2);

  const capacity = Math.floor((bytes.byteLength - SPRITE_HEADER_SIZE) / FRAME_HEADER_SIZE);
  if (frameCount > capacity) throw new FormatError(`sprite declares ${frameCount} frames but only ${capacity} headers fit`, 4);

  // Bitmap offsets are relative to the end of the frame headers.
  const dataBase = SPRITE_HEADER_SIZE + FRAME_HEADER_SIZE * frameCount;
  const codec = codecFor(format, filename);

  const frames: SpriteFrame[] = [];
  let npot = false;

  for (let i = 0; i < frameCount; i++) {
    const at = SPRITE_HEADER_SIZE + i * FRAME_HEADER_SIZE;
    const width = view.getUint16(at + 4, true);
    const height = view.getUint16(at + 6, true);
    const bitmapOffset = view.getUint32(at + 8, true);
    const bitmapSize = view.getUint32(at + 12, true);
    const dataOffset = dataBase + bitmapOffset;
    if (dataOffset > bytes.byteLength || bitmapSize > bytes.byteLength - dataOffset) {
      throw new FormatError(`frame ${i} bitmap exceeds the sprite data`, at + 8);
    }
    if (codec === 'rgb555' && bitmapSize < width * height * 2) {
      throw new FormatError(`frame ${i} needs ${width * height * 2} bitmap bytes, got ${bitmapSize}`, at + 12);
    }
    const frameNpot = width > 0 && !isPowerOfTwo(width);
    if (frameNpot) npot = true;

    frames.push({
      index: i,
      x: view.getInt16(at, true),
      y: view.getInt16(at + 2, true),
      width,
      height,
      bitmapOffset,
      bitmapSize,
      dataOffset,
      unused: view.getInt32(at + 16, true),
      npot: frameNpot,
      headerOffset: at,
    });
  }

  return {
    signature,
    format,
    formatLabel: codecLabel(codec, format),
    codec,
    frameCount,
    colorKey,
    colorKeyRgb: colorKey === 0 ? DEFAULT_COLOR_KEY : rgb555(colorKey, false),
    frames,
    npot,
  };
}


export interface DecodeFrameOptions {
  colorKey?: Rgb | null;
  threshold?: number;
  scanlinePad?: boolean;
}

export interface DecodedFrame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

function applyKey(
  rgba: Uint8ClampedArray,
  at: number,
  color: Rgb,
  key: Rgb | null,
  threshold: number,
): void {
  rgba[at] = color.r;
  rgba[at + 1] = color.g;
  rgba[at + 2] = color.b;

  if (!key || threshold <= 0) {
    rgba[at + 3] = 255;
    return;
  }

  const dr = color.r - key.r;
  const dg = color.g - key.g;
  const db = color.b - key.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  rgba[at + 3] = distance < threshold ? Math.min(255, (distance / threshold) * 255) : 255;
}

function decodeRaster(
  data: Uint8Array,
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  key: Rgb | null,
  threshold: number,
  scanlinePad: boolean,
): void {
  const stride = scanlinePad ? (width * 2 + 3) & ~3 : width * 2;

  const lut = rasterLut(key, threshold);
  const out = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);

  if (data.byteOffset % 2 === 0) {
    const half = stride >> 1;
    const words = new Uint16Array(data.buffer, data.byteOffset, data.byteLength >> 1);
    for (let y = 0; y < height; y++) {
      const row = y * half;
      const dst = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        if (idx >= words.length) return;
        out[dst + x] = lut[words[idx]!]!;
      }
    }
    return;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = y * stride + x * 2;
      if (src + 2 > data.byteLength) return;
      out[y * width + x] = lut[view.getUint16(src, true)]!;
    }
  }
}

function decodeRunList(
  data: Uint8Array,
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  key: Rgb | null,
  threshold: number,
  masked: boolean,
): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  while (pos + 6 <= data.byteLength) {
    const count = view.getUint16(pos, true);
    if (count === 0) break;

    const x = view.getUint16(pos + 2, true);
    const y = view.getUint16(pos + 4, true);
    pos += 6;

    if (masked && (x >= width || y >= height)) {
      pos += count * 2;
      continue;
    }

    for (let i = 0; i < count; i++) {
      const src = pos + i * 2;
      if (src + 2 > data.byteLength) return;
      const px = x + i;
      if (px >= width || y >= height) break;
      applyKey(rgba, (y * width + px) * 4, rgb555(view.getUint16(src, true), true), key, threshold);
    }

    pos += count * 2;
  }
}

export function decodeFrame(
  source: BinarySource,
  sprite: Sprite,
  index: number,
  opts: DecodeFrameOptions = {},
): DecodedFrame {
  const frame = sprite.frames[index];

  if (!frame) return { width: 0, height: 0, rgba: new Uint8ClampedArray(0) };
  if (frame.width <= 0 || frame.height <= 0) {
    return {
      width: 0,
      height: 0,
      rgba: new Uint8ClampedArray(0),
    };
  }
  const bytes = asBytes(source);
  const start = frame.dataOffset;
  const end = start + frame.bitmapSize;
  const rgbaSize = frame.width * frame.height * 4;
  if (start < 0 || start >= bytes.byteLength || frame.bitmapSize <= 0 || end > bytes.byteLength || rgbaSize > 0xffffffff) {
    return { width: 0, height: 0, rgba: new Uint8ClampedArray(0) };
  }

  const data = bytes.subarray(start, end);
  const key = opts.colorKey === undefined ? sprite.colorKeyRgb : opts.colorKey;
  const threshold = opts.threshold ?? DEFAULT_COLOR_KEY_THRESHOLD;

  let scanlinePad = false;
  if (sprite.codec === 'rgb555') {
    // Odd-width frames shear unless padding is inferred from the bitmap size.
    const flat = frame.width * 2 * frame.height;
    const padded = ((frame.width * 2 + 3) & ~3) * frame.height;
    scanlinePad = opts.scanlinePad ?? (padded !== flat && frame.bitmapSize >= padded);
    if (data.byteLength < (scanlinePad ? padded : flat)) return { width: 0, height: 0, rgba: new Uint8ClampedArray(0) };
  }

  const rgba = new Uint8ClampedArray(rgbaSize);
  if (sprite.codec === 'rgb555') {
    decodeRaster(data, frame.width, frame.height, rgba, key, threshold, scanlinePad);
  } else {
    decodeRunList(
      data,
      frame.width,
      frame.height,
      rgba,
      key,
      threshold,
      sprite.codec === 'masked-runlist',
    );
  }

  return { width: frame.width, height: frame.height, rgba };
}


export interface SpriteFrameInput {
  width: number;
  height: number;
  x?: number;
  y?: number;
  rgba: Uint8ClampedArray | Uint8Array;
}

const TO5 = new Uint8Array(256);
for (let i = 0; i < 256; i++) TO5[i] = Math.max(0, Math.min(31, Math.round((i / 255) * 31)));

export type SpriteWriteCodec = 'rgb555' | 'runlist';

function encodeRaster(f: SpriteFrameInput, w: number, h: number, key: number, alphaThreshold: number): Uint8Array {
  const words = new Uint16Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = f.rgba[i * 4 + 3] ?? 0;
    words[i] =
      a < alphaThreshold
        ? key
        : (TO5[f.rgba[i * 4] ?? 0]! << 10) | (TO5[f.rgba[i * 4 + 1] ?? 0]! << 5) | TO5[f.rgba[i * 4 + 2] ?? 0]!;
  }
  return new Uint8Array(words.buffer);
}

function encodeRunList(f: SpriteFrameInput, w: number, h: number, alphaThreshold: number): Uint8Array {
  const words: number[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      while (x < w && (f.rgba[(y * w + x) * 4 + 3] ?? 0) < alphaThreshold) x++;
      if (x >= w) break;
      const start = x;
      while (x < w && (f.rgba[(y * w + x) * 4 + 3] ?? 0) >= alphaThreshold) x++;
      words.push(x - start, start, y);
      for (let i = start; i < x; i++) {
        const at = (y * w + i) * 4;
        words.push((((f.rgba[at] ?? 0) >> 3) << 10) | (((f.rgba[at + 1] ?? 0) >> 3) << 5) | ((f.rgba[at + 2] ?? 0) >> 3));
      }
    }
  }
  words.push(0, 0, 0);
  const out = new Uint16Array(words.length);
  out.set(words);
  return new Uint8Array(out.buffer);
}

export function writeSprite(
  frames: readonly SpriteFrameInput[],
  colorKey = 0,
  alphaThreshold = 8,
  codec: SpriteWriteCodec = 'rgb555',
): Uint8Array {
  if (frames.length > 0xffff) throw new FormatError(`sprite has ${frames.length} frames; uint16 allows 65535`);
  const key = colorKey === 0 ? ((31 << 10) | (9 << 5) | 31) : colorKey;
  const dimensions = frames.map((f, i) => {
    const w = Math.trunc(f.width);
    const h = Math.trunc(f.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || w > 0xffff || h < 0 || h > 0xffff) {
      throw new FormatError(`frame ${i} dimensions must fit uint16`);
    }
    const needed = w * h * 4;
    if (f.rgba.byteLength < needed) throw new FormatError(`frame ${i} needs ${needed} RGBA bytes, got ${f.rgba.byteLength}`);
    return { w, h };
  });
  const blobs = frames.map((f, i) => {
    const { w, h } = dimensions[i]!;
    return codec === 'runlist' ? encodeRunList(f, w, h, alphaThreshold) : encodeRaster(f, w, h, key, alphaThreshold);
  });

  const writer = new ByteWriter(SPRITE_HEADER_SIZE + frames.length * FRAME_HEADER_SIZE + 64);
  writer.u16(1);
  writer.u16(codec === 'runlist' ? FORMAT_RUNLIST : FORMAT_RGB555);
  writer.u16(frames.length);
  writer.u16(key);

  let offset = 0;
  frames.forEach((f, i) => {
    const { w, h } = dimensions[i]!;
    writer.i16(f.x ?? 0);
    writer.i16(f.y ?? 0);
    writer.u16(w);
    writer.u16(h);
    writer.i32(offset);
    writer.i32(blobs[i]!.byteLength);
    writer.i32(0);
    offset += blobs[i]!.byteLength;
  });

  for (const blob of blobs) writer.bytes(blob);
  return writer.toUint8Array();
}
