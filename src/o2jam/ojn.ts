
import { asBytes, ByteReader, FormatError } from './binary';
import type { BinarySource, LabelledId } from './binary';
import { decodeText, detectEncoding, encodeText, DEFAULT_ENCODING } from './text';
import type { O2Encoding } from './text';

export const OJN_HEADER_SIZE = 300;
export const OJN_SIGNATURE = 'ojn';

export type OjnDifficulty = 'ex' | 'nx' | 'hx';

export interface DifficultyInfo {
  id: OjnDifficulty;
  label: string;
  index: number;
}

export const DIFFICULTIES: readonly DifficultyInfo[] = [
  { id: 'ex', label: 'Easy (EX)', index: 0 },
  { id: 'nx', label: 'Normal (NX)', index: 1 },
  { id: 'hx', label: 'Hard (HX)', index: 2 },
];

export const GENRES: readonly LabelledId[] = [
  { id: 0, label: 'Ballad' },
  { id: 1, label: 'Rock' },
  { id: 2, label: 'Dance' },
  { id: 3, label: 'Techno' },
  { id: 4, label: 'Hip-Hop' },
  { id: 5, label: 'Soul' },
  { id: 6, label: 'Jazz' },
  { id: 7, label: 'Funk' },
  { id: 8, label: 'Classical' },
  { id: 9, label: 'Traditional' },
  { id: 10, label: 'Etc' },
];

export function genreLabel(id: number): string {
  return GENRES.find((g) => g.id === id)?.label ?? `Unknown (${id})`;
}


export interface OjnHeader {
  id: number;
  signature: string;
  encodingVersion: number;
  genre: number;
  bpm: number;
  levelEx: number;
  levelNx: number;
  levelHx: number;
  unk1: number;
  eventCountEx: number;
  eventCountNx: number;
  eventCountHx: number;
  noteCountEx: number;
  noteCountNx: number;
  noteCountHx: number;
  measureCountEx: number;
  measureCountNx: number;
  measureCountHx: number;
  blockCountEx: number;
  blockCountNx: number;
  blockCountHx: number;
  oldEncodingVersion: number;
  oldSongId: number;
  oldGenre: string;
  thumbnailSize: number;
  fileVersion: number;
  title: string;
  artist: string;
  noteDesigner: string;
  ojm: string;
  coverSize: number;
  durationEx: number;
  durationNx: number;
  durationHx: number;
  blockOffsetEx: number;
  blockOffsetNx: number;
  blockOffsetHx: number;
  coverOffset: number;
}

export type OjnFieldType = 'uint32' | 'int32' | 'uint16' | 'int16' | 'float' | 'char';

export interface OjnField {
  key: keyof OjnHeader;
  offset: number;
  size: number;
  type: OjnFieldType;
  label: string;
}

export const OJN_HEADER_FIELDS: readonly OjnField[] = [
  { key: 'id', offset: 0, size: 4, type: 'uint32', label: 'Music ID' },
  { key: 'signature', offset: 4, size: 4, type: 'char', label: 'Signature' },
  { key: 'encodingVersion', offset: 8, size: 4, type: 'float', label: 'Encoding Version' },
  { key: 'genre', offset: 12, size: 4, type: 'uint32', label: 'Genre' },
  { key: 'bpm', offset: 16, size: 4, type: 'float', label: 'BPM' },
  { key: 'levelEx', offset: 20, size: 2, type: 'uint16', label: 'Level (EX)' },
  { key: 'levelNx', offset: 22, size: 2, type: 'uint16', label: 'Level (NX)' },
  { key: 'levelHx', offset: 24, size: 2, type: 'uint16', label: 'Level (HX)' },
  { key: 'unk1', offset: 26, size: 2, type: 'int16', label: 'Unknown' },
  { key: 'eventCountEx', offset: 28, size: 4, type: 'uint32', label: 'Event Count (EX)' },
  { key: 'eventCountNx', offset: 32, size: 4, type: 'uint32', label: 'Event Count (NX)' },
  { key: 'eventCountHx', offset: 36, size: 4, type: 'uint32', label: 'Event Count (HX)' },
  { key: 'noteCountEx', offset: 40, size: 4, type: 'uint32', label: 'Note Count (EX)' },
  { key: 'noteCountNx', offset: 44, size: 4, type: 'uint32', label: 'Note Count (NX)' },
  { key: 'noteCountHx', offset: 48, size: 4, type: 'uint32', label: 'Note Count (HX)' },
  { key: 'measureCountEx', offset: 52, size: 4, type: 'uint32', label: 'Measure Count (EX)' },
  { key: 'measureCountNx', offset: 56, size: 4, type: 'uint32', label: 'Measure Count (NX)' },
  { key: 'measureCountHx', offset: 60, size: 4, type: 'uint32', label: 'Measure Count (HX)' },
  { key: 'blockCountEx', offset: 64, size: 4, type: 'uint32', label: 'Block Count (EX)' },
  { key: 'blockCountNx', offset: 68, size: 4, type: 'uint32', label: 'Block Count (NX)' },
  { key: 'blockCountHx', offset: 72, size: 4, type: 'uint32', label: 'Block Count (HX)' },
  { key: 'oldEncodingVersion', offset: 76, size: 2, type: 'int16', label: 'Old Encoding Version' },
  { key: 'oldSongId', offset: 78, size: 2, type: 'int16', label: 'Old Song ID' },
  { key: 'oldGenre', offset: 80, size: 20, type: 'char', label: 'Old Genre' },
  { key: 'thumbnailSize', offset: 100, size: 4, type: 'uint32', label: 'Thumbnail Size' },
  { key: 'fileVersion', offset: 104, size: 4, type: 'uint32', label: 'File Version' },
  { key: 'title', offset: 108, size: 64, type: 'char', label: 'Title' },
  { key: 'artist', offset: 172, size: 32, type: 'char', label: 'Artist' },
  { key: 'noteDesigner', offset: 204, size: 32, type: 'char', label: 'Note Designer' },
  { key: 'ojm', offset: 236, size: 32, type: 'char', label: 'OJM Filename' },
  { key: 'coverSize', offset: 268, size: 4, type: 'uint32', label: 'Cover Size' },
  { key: 'durationEx', offset: 272, size: 4, type: 'uint32', label: 'Duration (EX)' },
  { key: 'durationNx', offset: 276, size: 4, type: 'uint32', label: 'Duration (NX)' },
  { key: 'durationHx', offset: 280, size: 4, type: 'uint32', label: 'Duration (HX)' },
  { key: 'blockOffsetEx', offset: 284, size: 4, type: 'uint32', label: 'Block Offset (EX)' },
  { key: 'blockOffsetNx', offset: 288, size: 4, type: 'uint32', label: 'Block Offset (NX)' },
  { key: 'blockOffsetHx', offset: 292, size: 4, type: 'uint32', label: 'Block Offset (HX)' },
  { key: 'coverOffset', offset: 296, size: 4, type: 'uint32', label: 'Cover Offset' },
];

export function parseOjnHeader(
  source: BinarySource,
  encoding: O2Encoding = DEFAULT_ENCODING,
): OjnHeader {
  const bytes = asBytes(source);
  if (bytes.byteLength < OJN_HEADER_SIZE) {
    throw new FormatError(`OJN header needs ${OJN_HEADER_SIZE} bytes, got ${bytes.byteLength}`, 0);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, number | string> = {};

  for (const field of OJN_HEADER_FIELDS) {
    switch (field.type) {
      case 'uint32':
        out[field.key] = view.getUint32(field.offset, true);
        break;
      case 'int32':
        out[field.key] = view.getInt32(field.offset, true);
        break;
      case 'uint16':
        out[field.key] = view.getUint16(field.offset, true);
        break;
      case 'int16':
        out[field.key] = view.getInt16(field.offset, true);
        break;
      case 'float':
        out[field.key] = view.getFloat32(field.offset, true);
        break;
      case 'char':
        out[field.key] = decodeText(
          bytes.subarray(field.offset, field.offset + field.size),
          encoding,
        );
        break;
    }
  }

  return out as unknown as OjnHeader;
}

export function writeOjnHeader(
  header: OjnHeader,
  encoding: O2Encoding = DEFAULT_ENCODING,
): Uint8Array {
  const out = new Uint8Array(OJN_HEADER_SIZE);
  const view = new DataView(out.buffer);

  for (const field of OJN_HEADER_FIELDS) {
    const value = header[field.key];
    if (field.type === 'char') {
      const text = encodeText(typeof value === 'string' ? value : '', encoding).bytes;
      out.set(text.subarray(0, field.size), field.offset);
      continue;
    }

    const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    switch (field.type) {
      case 'uint32':
        view.setUint32(field.offset, n >>> 0, true);
        break;
      case 'int32':
        view.setInt32(field.offset, n | 0, true);
        break;
      case 'uint16':
        view.setUint16(field.offset, n & 0xffff, true);
        break;
      case 'int16':
        view.setInt16(field.offset, n | 0, true);
        break;
      case 'float':
        view.setFloat32(field.offset, n, true);
        break;
    }
  }

  return out;
}

export function detectOjnHeaderEncoding(source: BinarySource): O2Encoding | null {
  const bytes = asBytes(source);
  if (bytes.byteLength < OJN_HEADER_SIZE) {
    return null;
  }

  const samples = OJN_HEADER_FIELDS.filter(
    (f) => f.key === 'title' || f.key === 'artist' || f.key === 'noteDesigner',
  ).map((f) => bytes.subarray(f.offset, f.offset + f.size));
  return detectEncoding(samples);
}

export function isOjnHeader(source: BinarySource): boolean {
  const bytes = asBytes(source);
  if (bytes.byteLength < OJN_HEADER_SIZE) {
    return false;
  }

  return bytes[4] === 0x6f && bytes[5] === 0x6a && bytes[6] === 0x6e;
}


export interface OjnEncryption {
  xorBlockSize: number;
  primaryKey: number;
  middleKey: number;
  initialKey: number;
}

export function isEncryptedOjn(source: BinarySource): boolean {
  const bytes = asBytes(source);
  if (bytes.byteLength < 8) {
    return false;
  }

  if (bytes[0] !== 0x6e || bytes[1] !== 0x65 || bytes[2] !== 0x77) {
    return false;
  }

  return (bytes[3] ?? 0) !== 0;
}

export function readOjnEncryption(source: BinarySource): OjnEncryption | null {
  const bytes = asBytes(source);
  if (!isEncryptedOjn(bytes)) {
    return null;
  }

  return {
    xorBlockSize: bytes[3] ?? 0,
    primaryKey: bytes[4] ?? 0,
    middleKey: bytes[5] ?? 0,
    initialKey: bytes[6] ?? 0,
  };
}

export function decryptOjn(source: BinarySource): ArrayBuffer {
  const bytes = asBytes(source);
  const keying = readOjnEncryption(bytes);
  if (!keying) {
    return bytes.slice().buffer;
  }

  const { xorBlockSize, primaryKey, middleKey, initialKey } = keying;
  const key = new Uint8Array(xorBlockSize).fill(primaryKey);
  key[0] = initialKey;
  key[Math.floor(xorBlockSize / 2)] = middleKey;

  // The client skips 8 wrapper bytes, despite the 7-byte spec.
  const total = bytes.byteLength;
  const out = new Uint8Array(Math.max(0, total - 8));
  for (let i = 0; i < out.length; i++) {
    out[i] = (bytes[total - 1 - i] ?? 0) ^ (key[i % xorBlockSize] ?? 0);
  }
  return out.buffer;
}


export interface OjnImage {
  bytes: Uint8Array;
  mime: string;
  offset: number;
  size: number;
}

export interface OjnFile {
  header: OjnHeader;
  encrypted: boolean;
  encryption?: OjnEncryption;
  data: Uint8Array;
  cover?: OjnImage;
  thumbnail?: OjnImage;
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return 'image/png';
  }

  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  return 'application/octet-stream';
}

export function sniffImageMime(source: BinarySource): string | null {
  const bytes = asBytes(source);
  if (bytes.byteLength < 4) {
    return null;
  }

  const mime = sniffMime(bytes);
  return mime === 'application/octet-stream' ? null : mime;
}

function sliceImage(
  data: Uint8Array,
  offset: number,
  size: number,
): OjnImage | undefined {
  if (size <= 0) {
    return undefined;
  }

  if (offset <= 0 || offset >= data.byteLength) {
    return undefined;
  }

  const end = Math.min(data.byteLength, offset + size);
  const bytes = data.slice(offset, end);
  return { bytes, mime: sniffMime(bytes), offset, size: bytes.byteLength };
}

export function parseOjn(source: BinarySource, encoding: O2Encoding = DEFAULT_ENCODING): OjnFile {
  const raw = asBytes(source);
  const encrypted = isEncryptedOjn(raw);
  const encryption = readOjnEncryption(raw);
  const data = encrypted ? new Uint8Array(decryptOjn(raw)) : raw;

  const header = parseOjnHeader(data, encoding);
  const cover = sliceImage(data, header.coverOffset, header.coverSize);
  const thumbnail = sliceImage(
    data,
    header.coverOffset + header.coverSize,
    header.thumbnailSize,
  );

  const result: OjnFile = { header, encrypted, data };
  if (encryption) {
    result.encryption = encryption;
  }

  if (cover) {
    result.cover = cover;
  }

  if (thumbnail) {
    result.thumbnail = thumbnail;
  }

  return result;
}


export type NoteKind = 'tap' | 'hold' | 'release';

export const CHANNEL_MEASURE = 0;
export const CHANNEL_BPM = 1;
export const CHANNEL_LANE_FIRST = 2;
export const CHANNEL_LANE_LAST = 8;

export interface ChartNote {
  measure: number;
  position: number;
  channel: number;
  lane: number;
  kind: NoteKind;
  sampleId: number;
  background: boolean;
  volume: number;
  pan: number;
  offset: number;
}

export interface BpmChange {
  measure: number;
  position: number;
  bpm: number;
  offset: number;
}

export interface MeasureFraction {
  measure: number;
  fraction: number;
  offset: number;
}

export interface OjnChart {
  difficulty: OjnDifficulty;
  notes: ChartNote[];
  bpmChanges: BpmChange[];
  measureFractions: MeasureFraction[];
  laneCounts: number[];
  noteCount: number;
  autoplayCount: number;
  measureCount: number;
  blockCount: number;
  duration: number;
  range: { start: number; end: number; };
}

function sectionRange(header: OjnHeader, difficulty: OjnDifficulty) {
  switch (difficulty) {
    case 'ex':
      return {
        start: header.blockOffsetEx,
        end: header.blockOffsetNx,
        blocks: header.blockCountEx,
        measures: header.measureCountEx,
        duration: header.durationEx,
      };
    case 'nx':
      return {
        start: header.blockOffsetNx,
        end: header.blockOffsetHx,
        blocks: header.blockCountNx,
        measures: header.measureCountNx,
        duration: header.durationNx,
      };
    default:
      return {
        start: header.blockOffsetHx,
        end: header.coverOffset,
        blocks: header.blockCountHx,
        measures: header.measureCountHx,
        duration: header.durationHx,
      };
  }
}

export function parseOjnChart(source: BinarySource, difficulty: OjnDifficulty): OjnChart {
  const raw = asBytes(source);
  const data = isEncryptedOjn(raw) ? new Uint8Array(decryptOjn(raw)) : raw;
  const header = parseOjnHeader(data);

  const notes: ChartNote[] = [];
  const bpmChanges: BpmChange[] = [];
  const measureFractions: MeasureFraction[] = [];
  const laneCounts = [0, 0, 0, 0, 0, 0, 0];
  let autoplayCount = 0;

  const section = sectionRange(header, difficulty);
  const reader = new ByteReader(data);
  const end = Math.min(section.end, reader.size);
  let pos = section.start;

  if (section.start > 0 && section.start < reader.size && end > section.start) {
    for (let block = 0; block < section.blocks; block++) {
      if (pos + 8 > end) {
        break;
      }

      const measure = reader.view.getUint32(pos, true);
      const channel = reader.view.getUint16(pos + 4, true);
      const eventCount = reader.view.getUint16(pos + 6, true);
      const body = pos + 8;
      const bodyEnd = body + eventCount * 4;

      if (bodyEnd > end) {
        break;
      }

      for (let i = 0; i < eventCount; i++) {
        const at = body + i * 4;
        const position = measure + i / eventCount;

        if (channel === CHANNEL_MEASURE || channel === CHANNEL_BPM) {
          const value = reader.view.getFloat32(at, true);
          if (value === 0) {
            continue;
          }

          if (channel === CHANNEL_MEASURE) {
            measureFractions.push({ measure: measure + 1, fraction: value, offset: at });
          } else {
            bpmChanges.push({ measure, position, bpm: value, offset: at });
          }

          continue;
        }

        const id = reader.view.getUint16(at, true);
        if (id === 0) {
          continue;
        }

        const audio = reader.view.getInt8(at + 2);
        const type = reader.view.getInt8(at + 3);

        const rawVolume = (audio >> 4) & 0x0f;
        const volume = rawVolume === 0 ? 100 : (rawVolume / 16) * 100;
        const rawPan = (audio & 0x0f) || 8;
        const pan = ((rawPan - 1) / 14) * 2 - 1;

        const background = type % 8 > 3;
        const kindCode = type % 4;
        const kind: NoteKind = kindCode === 2 ? 'hold' : kindCode === 3 ? 'release' : 'tap';
        const lane =
          channel >= CHANNEL_LANE_FIRST && channel <= CHANNEL_LANE_LAST ? channel - 1 : 0;

        notes.push({
          measure,
          position,
          channel,
          lane,
          kind,
          sampleId: id - 1 + (background ? 1000 : 0),
          background,
          volume,
          pan,
          offset: at,
        });

        if (lane === 0) {
          autoplayCount++;
        } else if (kind !== 'release') {
          laneCounts[lane - 1] = (laneCounts[lane - 1] ?? 0) + 1;
        }
      }

      pos = bodyEnd;
    }
  }

  return {
    difficulty,
    notes,
    bpmChanges,
    measureFractions,
    laneCounts,
    noteCount: laneCounts.reduce((a, b) => a + b, 0),
    autoplayCount,
    measureCount: section.measures,
    blockCount: section.blocks,
    duration: section.duration,
    range: { start: section.start, end: section.end },
  };
}
