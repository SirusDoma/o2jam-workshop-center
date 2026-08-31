
import { asBytes, ByteReader, ByteWriter, FormatError } from './binary';
import type { BinarySource, LabelledId } from './binary';
import { decodeText, DEFAULT_ENCODING } from './text';
import type { O2Encoding } from './text';
import { OJN_HEADER_SIZE, parseOjnHeader, writeOjnHeader } from './ojn';
import type { OjnHeader } from './ojn';

export type MusicListVersionId = '3.10' | '3.82' | '2.33' | '6.65' | '5.89' | '8.02';

export type ListFieldType = 'int32' | 'int16' | 'byte' | 'char' | 'bytes';

export type ListValue = number | string;

export interface ListField {
  key: string;
  offset: number;
  size: number;
  type: ListFieldType;
  label: string;
}

export interface ListSection {
  key: string;
  label: string;
  entrySize: number;
  fields: readonly ListField[];
}

export interface MusicListVersion {
  id: MusicListVersionId;
  label: string;
  client: string;
  filename: string;
  clientVersion: string;
  sections: readonly ListSection[];
}

const f = (
  key: string,
  offset: number,
  size: number,
  type: ListFieldType,
  label: string,
): ListField => ({ key, offset, size, type, label });

const MUSIC_ID = f('musicId', 0, 4, 'int32', 'Music ID');


const NEW_310: ListSection = {
  key: 'new',
  label: 'New',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('newFlag', 4, 4, 'int32', 'New'),
    f('unknown1', 8, 4, 'int32', 'Unknown 1'),
    f('unknown2', 12, 4, 'int32', 'Unknown 2'),
  ],
};

const PREMIUM_310: ListSection = {
  key: 'premium',
  label: 'Premium',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('priceEPoint', 4, 4, 'int32', 'Price (ePoint)'),
    f('priceGem', 8, 4, 'int32', 'Price (GEM)'),
    f('unknown', 12, 4, 'int32', 'Unknown'),
  ],
};

const RELEASE_310: ListSection = {
  key: 'releaseDate',
  label: 'Release Date',
  entrySize: 28,
  fields: [
    MUSIC_ID,
    f('releaseDate', 4, 11, 'char', 'Release Date'),
    f('unused', 15, 13, 'bytes', 'Unused'),
  ],
};


const NEW_382: ListSection = {
  key: 'new',
  label: 'New',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('unknown1', 4, 4, 'int32', 'Unknown 1'),
    f('unknown2', 8, 4, 'int32', 'Unknown 2'),
    f('unknown3', 12, 4, 'int32', 'Unknown 3'),
  ],
};

const PREMIUM_382: ListSection = {
  key: 'premium',
  label: 'Premium',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('priceEPoint', 4, 4, 'int32', 'Price (ePoint)'),
    f('priceGem', 8, 4, 'int32', 'Price (GEM)'),
    f('unknown', 12, 4, 'int32', 'Unknown'),
  ],
};

const RELEASE_382: ListSection = {
  key: 'releaseDate',
  label: 'Release Date',
  entrySize: 28,
  fields: [
    MUSIC_ID,
    f('releaseDate', 4, 11, 'char', 'Release Date'),
    f('unknown1', 15, 1, 'byte', 'Unknown 1'),
    f('unknown2', 16, 4, 'int32', 'Unknown 2'),
    f('constant1', 20, 4, 'int32', 'Constant 1'),
    f('constant2', 24, 4, 'int32', 'Constant 2'),
  ],
};


const NEW_233: ListSection = {
  key: 'new',
  label: 'New',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('unknown1', 4, 4, 'int32', 'Unknown 1'),
    f('unknown2', 8, 4, 'int32', 'Unknown 2'),
    f('unknown3', 12, 4, 'int32', 'Unknown 3'),
  ],
};

const MISSION_233: ListSection = {
  key: 'mission',
  label: 'Mission',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('difficulty', 4, 4, 'int32', 'Difficulty'),
    f('priceGem', 8, 4, 'int32', 'Price (GEM)'),
    f('missionLevel', 12, 4, 'int32', 'Mission Level'),
  ],
};

const RELEASE_233: ListSection = {
  key: 'releaseDate',
  label: 'Release Date',
  entrySize: 28,
  fields: [
    MUSIC_ID,
    f('releaseDate', 4, 11, 'char', 'Release Date'),
    f('unknown1', 15, 1, 'byte', 'Unknown 1'),
    f('constant1', 16, 4, 'int32', 'Constant 1'),
    f('constant2', 20, 4, 'int32', 'Constant 2'),
    f('constant3', 24, 4, 'int32', 'Constant 3'),
  ],
};


const NEW_589: ListSection = {
  key: 'new',
  label: 'New',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('premiumNewFlag', 4, 4, 'int32', 'Premium New'),
    f('newType', 8, 4, 'int32', 'New Type'),
    f('newOverride', 12, 4, 'int32', 'New Override'),
  ],
};

const PLANET_589: ListSection = {
  key: 'planet',
  label: 'Planet',
  entrySize: 20,
  fields: [
    MUSIC_ID,
    f('standardPlanets', 4, 4, 'int32', 'Standard Planets'),
    f('superEasy', 8, 4, 'int32', 'SuperEasy'),
    f('easy', 12, 4, 'int32', 'Easy'),
    f('unknown', 16, 4, 'int32', 'Unknown'),
  ],
};

const PLANET_665: ListSection = {
  key: 'planet',
  label: 'Planet',
  entrySize: 20,
  fields: [
    MUSIC_ID,
    f('standardPlanets', 4, 4, 'int32', 'Standard Planets'),
    f('superEasy', 8, 4, 'int32', 'SuperEasy'),
    f('easy', 12, 4, 'int32', 'Easy'),
    f('fallbackAvailability', 16, 4, 'int32', 'Fallback Availability'),
  ],
};

const PREMIUM_589: ListSection = {
  key: 'premium',
  label: 'Premium',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('priceO2Cash', 4, 4, 'int32', 'Price (O2Cash)'),
    f('priceGem', 8, 4, 'int32', 'Price (GEM)'),
    f('unused', 12, 4, 'int32', 'Unused'),
  ],
};

const PREMIUM_665: ListSection = {
  key: 'premium',
  label: 'Premium',
  entrySize: 16,
  fields: [
    MUSIC_ID,
    f('priceO2Cash', 4, 4, 'int32', 'Price (O2Cash)'),
    f('priceGem', 8, 4, 'int32', 'Price (GEM)'),
    f('unused', 12, 4, 'int32', 'Unused'),
  ],
};

const SUPEREASY_589: ListSection = {
  key: 'superEasy',
  label: 'SuperEasy',
  entrySize: 12,
  fields: [
    MUSIC_ID,
    f('unknown', 4, 4, 'int32', 'Unknown'),
    f('availability', 8, 4, 'int32', 'Availability'),
  ],
};

const VIP_EXCLUSION: ListSection = {
  key: 'vipExclusion',
  label: 'VIP Exclusion',
  entrySize: 12,
  fields: [
    MUSIC_ID,
    f('availability', 4, 4, 'int32', 'Availability'),
    f('unused', 8, 4, 'int32', 'Unused'),
  ],
};

const MUSIC_LABEL: ListSection = {
  key: 'musicLabel',
  label: 'Music Label',
  entrySize: 8,
  fields: [MUSIC_ID, f('labelId', 4, 4, 'int32', 'Label')],
};

const DISCOUNT_589: ListSection = {
  key: 'discount',
  label: 'Discount',
  entrySize: 8,
  fields: [MUSIC_ID, f('discountPercent', 4, 4, 'int32', 'Discount %')],
};

const DISCOUNT_665: ListSection = {
  key: 'discount',
  label: 'Discount',
  entrySize: 12,
  fields: [
    MUSIC_ID,
    f('o2CashDiscountPercent', 4, 4, 'int32', 'O2Cash Discount %'),
    f('gemDiscountPercent', 8, 4, 'int32', 'GEM Discount %'),
  ],
};

const FREE_MUSIC: ListSection = {
  key: 'freeMusic',
  label: 'Free Music',
  entrySize: 8,
  fields: [
    MUSIC_ID,
    f('freeFlag', 4, 2, 'int16', 'Free'),
    f('unused', 6, 2, 'int16', 'Unused'),
  ],
};

const KEY_MODE: ListSection = {
  key: 'keyMode',
  label: 'Key Mode',
  entrySize: 8,
  fields: [
    MUSIC_ID,
    f('keyMode', 4, 1, 'byte', 'Key Mode'),
    f('unused1', 5, 1, 'byte', 'Unused'),
    f('unused2', 6, 2, 'int16', 'Unused'),
  ],
};

const RELEASE_589: ListSection = {
  key: 'releaseDate',
  label: 'Release Date',
  entrySize: 28,
  fields: [
    MUSIC_ID,
    f('releaseDate', 4, 10, 'char', 'Release Date'),
    f('unknown', 14, 2, 'int16', 'Unknown'),
    f('constant1', 16, 4, 'int32', 'Constant 1'),
    f('constant2', 20, 4, 'int32', 'Constant 2'),
    f('constant3', 24, 4, 'int32', 'Constant 3'),
  ],
};

const RELEASE_665: ListSection = {
  key: 'releaseDate',
  label: 'Release Date',
  entrySize: 28,
  fields: [
    MUSIC_ID,
    f('releaseDate', 4, 10, 'char', 'Release Date'),
    f('unknown', 14, 2, 'int16', 'Unknown'),
    f('constant1', 16, 4, 'int32', 'Constant 1'),
    f('constant2', 20, 4, 'int32', 'Constant 2'),
    f('constant3', 24, 4, 'int32', 'Constant 3'),
  ],
};

const SECTIONS_665: readonly ListSection[] = [
  NEW_589,
  PLANET_665,
  PREMIUM_665,
  VIP_EXCLUSION,
  MUSIC_LABEL,
  DISCOUNT_665,
  FREE_MUSIC,
  KEY_MODE,
  RELEASE_665,
];

export const MUSIC_LABELS: readonly LabelledId[] = [
  { id: 0, label: 'Unlabeled' },
  { id: 1, label: 'Gold' },
  { id: 2, label: 'Black' },
  { id: 3, label: 'Blue' },
  { id: 4, label: 'Red' },
  { id: 5, label: 'Silver' },
];


export const MUSIC_LIST_VERSIONS: readonly MusicListVersion[] = [
  {
    id: '3.10',
    label: 'v3.10 — O2Jam Original',
    client: 'O2Jam',
    filename: 'OJNList.dat',
    clientVersion: '3.10',
    sections: [NEW_310, PREMIUM_310, RELEASE_310],
  },
  {
    id: '3.82',
    label: 'v3.82 — O2Jam NX',
    client: 'O2Jam NX',
    filename: 'OJNList.dat',
    clientVersion: '3.82',
    sections: [NEW_382, PREMIUM_382, RELEASE_382],
  },
  {
    id: '2.33',
    label: 'v2.33 — O2Jam X2',
    client: 'O2Jam X2',
    filename: 'X2OJNList.dat',
    clientVersion: '2.33',
    sections: [NEW_233, MISSION_233, RELEASE_233],
  },
  {
    id: '5.89',
    label: 'v5.89 — O2JamO2',
    client: 'O2JamO2',
    filename: 'OJNList.dat',
    clientVersion: '5.89',
    sections: [
      NEW_589,
      PLANET_589,
      PREMIUM_589,
      SUPEREASY_589,
      MUSIC_LABEL,
      DISCOUNT_589,
      RELEASE_589,
    ],
  },
  {
    id: '6.65',
    label: 'v6.65 — O2JamO2',
    client: 'O2JamO2',
    filename: 'OJNList.dat',
    clientVersion: '6.65',
    sections: SECTIONS_665,
  },
  {
    id: '8.02',
    label: 'v8.02 — O2Jam Classic',
    client: 'O2Jam Classic',
    filename: 'OJNList.dat',
    clientVersion: '8.02',
    sections: SECTIONS_665,
  },
];

export function musicListVersion(id: MusicListVersionId): MusicListVersion {
  const found = MUSIC_LIST_VERSIONS.find((v) => v.id === id);
  if (!found) throw new FormatError(`unknown music list version "${id}"`);
  return found;
}


const HEX = '0123456789ABCDEF';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    out += HEX[(b >> 4) & 0x0f];
    out += HEX[b & 0x0f];
  }
  return out;
}

function fromHex(text: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  const clean = text.replace(/[^0-9a-fA-F]/g, '');
  for (let i = 0; i < size && i * 2 + 1 < clean.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readField(
  view: DataView,
  bytes: Uint8Array,
  at: number,
  field: ListField,
  encoding: O2Encoding,
): ListValue {
  switch (field.type) {
    case 'int32':
      return view.getInt32(at, true);
    case 'int16':
      return view.getInt16(at, true);
    case 'byte':
      return view.getUint8(at);
    case 'char':
      return decodeText(bytes.subarray(at, at + field.size), encoding);
    case 'bytes':
      return toHex(bytes.subarray(at, at + field.size));
  }
}


export interface MusicListEntry {
  offset: number;
  values: Record<string, ListValue>;
}

export interface MusicListSectionResult {
  key: string;
  label: string;
  present: boolean;
  offset: number;
  entrySize: number;
  entryCount: number;
  entries: MusicListEntry[];
}

export interface MusicListChart {
  index: number;
  offset: number;
  header: OjnHeader;
}

export interface MusicListResult {
  versionId: MusicListVersionId;
  musicCount: number;
  charts: MusicListChart[];
  sections: MusicListSectionResult[];
  bytesConsumed: number;
}

interface Walk {
  sections: MusicListSectionResult[];
  end: number;
  overrun: boolean;
  presentCount: number;
}

function walkSections(
  reader: ByteReader,
  start: number,
  version: MusicListVersion,
  decode: boolean,
  encoding: O2Encoding,
): Walk {
  const sections: MusicListSectionResult[] = [];
  let pos = start;
  let overrun = false;
  let presentCount = 0;

  for (const section of version.sections) {
    const result: MusicListSectionResult = {
      key: section.key,
      label: section.label,
      present: false,
      offset: pos,
      entrySize: section.entrySize,
      entryCount: 0,
      entries: [],
    };
    sections.push(result);

    if (pos + 4 > reader.size) continue;

    const count = reader.view.getUint32(pos, true);
    const body = pos + 4;
    const bodyEnd = body + count * section.entrySize;

    if (bodyEnd > reader.size) {
      overrun = true;
      result.present = true;
      result.entryCount = count;
      pos = reader.size;
      break;
    }

    result.present = true;
    result.entryCount = count;
    presentCount++;

    if (decode) {
      for (let i = 0; i < count; i++) {
        const base = body + i * section.entrySize;
        const values: Record<string, ListValue> = {};
        for (const field of section.fields) {
          values[field.key] = readField(reader.view, reader.data, base + field.offset, field, encoding);
        }
        result.entries.push({ offset: base, values });
      }
    }

    pos = bodyEnd;
  }

  return { sections, end: pos, overrun, presentCount };
}

export function parseMusicList(
  source: BinarySource,
  versionId: MusicListVersionId,
  encoding: O2Encoding = DEFAULT_ENCODING,
): MusicListResult {
  const reader = new ByteReader(source);
  if (reader.size < 4) {
    throw new FormatError(`music list needs at least 4 bytes, got ${reader.size}`, 0);
  }

  const version = musicListVersion(versionId);

  const declared = reader.view.getUint32(0, true);
  const capacity = Math.max(0, Math.floor((reader.size - 4) / OJN_HEADER_SIZE));
  const musicCount = Math.min(declared, capacity);

  const charts: MusicListChart[] = [];
  for (let i = 0; i < musicCount; i++) {
    const offset = 4 + i * OJN_HEADER_SIZE;
    const header = parseOjnHeader(reader.data.subarray(offset, offset + OJN_HEADER_SIZE), encoding);
    charts.push({ index: i, offset, header });
  }

  const walk = walkSections(
    reader,
    4 + musicCount * OJN_HEADER_SIZE,
    version,
    true,
    encoding,
  );

  return {
    versionId,
    musicCount: declared,
    charts,
    sections: walk.sections,
    bytesConsumed: walk.end,
  };
}


export type MusicListChartInput = OjnHeader | Uint8Array;

export interface MusicListSectionInput {
  key: string;
  entries: readonly Record<string, ListValue>[];
}

function writeField(
  view: DataView,
  bytes: Uint8Array,
  at: number,
  field: ListField,
  value: ListValue | undefined,
  encoding: O2Encoding,
): void {
  if (field.type === 'char') {
    const text = typeof value === 'string' ? value : '';
    const src = new ByteWriter(field.size).fixedString(text, field.size, encoding).toUint8Array();
    bytes.set(src, at);
    return;
  }

  if (field.type === 'bytes') {
    bytes.set(fromHex(typeof value === 'string' ? value : '', field.size), at);
    return;
  }

  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (field.type === 'int32') view.setInt32(at, n | 0, true);
  else if (field.type === 'int16') view.setInt16(at, n | 0, true);
  else view.setUint8(at, n & 0xff);
}

export function buildMusicList(
  charts: readonly MusicListChartInput[],
  sections: readonly MusicListSectionInput[],
  versionId: MusicListVersionId,
  encoding: O2Encoding = DEFAULT_ENCODING,
): Uint8Array {
  const version = musicListVersion(versionId);
  const writer = new ByteWriter(4 + charts.length * OJN_HEADER_SIZE + 256);

  writer.u32(charts.length);
  for (const chart of charts) {
    if (chart instanceof Uint8Array) {
      const block = new Uint8Array(OJN_HEADER_SIZE);
      block.set(chart.subarray(0, OJN_HEADER_SIZE));
      writer.bytes(block);
    } else {
      writer.bytes(writeOjnHeader(chart, encoding));
    }
  }

  // Omitted sections still need zero counts to keep later sections aligned.
  const supplied = new Map(sections.map((s) => [s.key, s.entries]));
  let last = -1;
  version.sections.forEach((section, i) => {
    if (supplied.has(section.key)) last = i;
  });

  for (let i = 0; i <= last; i++) {
    const section = version.sections[i];
    if (!section) continue;

    const entries = supplied.get(section.key) ?? [];
    writer.u32(entries.length);

    for (const entry of entries) {
      const block = new Uint8Array(section.entrySize);
      const view = new DataView(block.buffer);
      for (const field of section.fields) {
        writeField(view, block, field.offset, field, entry[field.key], encoding);
      }
      writer.bytes(block);
    }
  }

  return writer.toUint8Array();
}


const AMBIGUOUS_DEFAULTS: readonly MusicListVersionId[] = ['3.82', '8.02'];

export function detectMusicListVersion(source: BinarySource, filename = ''): MusicListVersionId | null {
  const reader = new ByteReader(source);
  if (reader.size < 4) return null;
  if (/(^|[\\/])X2OJNList\.dat$/i.test(filename)) return '2.33';

  const declared = reader.view.getUint32(0, true);
  const capacity = Math.max(0, Math.floor((reader.size - 4) / OJN_HEADER_SIZE));
  const musicCount = Math.min(declared, capacity);
  const headersEnd = 4 + musicCount * OJN_HEADER_SIZE;

  return MUSIC_LIST_VERSIONS.map((version) => {
    const walk = walkSections(reader, headersEnd, version, false, 'ascii');
    let score = 0.3;

    if (walk.presentCount > 0 || walk.overrun) {
      score += Math.min(0.15, walk.presentCount * 0.05);

      if (walk.overrun) {
        score -= 0.35;
      } else if (walk.end === reader.size) {
        score += 0.25;
      } else {
        score -= 0.15;
      }

    }

    return {
      versionId: version.id,
      score: Math.min(1, Math.max(0, score)),
    };
  }).sort(
    (a, b) =>
      b.score - a.score
      || Number(AMBIGUOUS_DEFAULTS.includes(b.versionId)) - Number(AMBIGUOUS_DEFAULTS.includes(a.versionId)),
  )[0]?.versionId ?? null;
}


export function chartHeaderBlock(decrypted: BinarySource): Uint8Array {
  const bytes = asBytes(decrypted);
  const block = new Uint8Array(OJN_HEADER_SIZE);
  block.set(bytes.subarray(0, OJN_HEADER_SIZE));
  return block;
}
