import { asBytes, ByteReader, ByteWriter, FormatError, type BinarySource } from '../../o2jam/binary.ts';
import { encodeOjnPan, OJN_HEADER_SIZE, writeOjnHeader, type OjnHeader } from '../../o2jam/ojn.ts';
import { decodeText, type O2Encoding } from '../../o2jam/text.ts';
import { chartEndPosition } from './document.ts';
import { positionToSeconds } from './playback.ts';
import type { ChartMetadata, Difficulty, EditorChart, EditorDocument, PreviewImage } from './types';
import type { OjmEncryption, OjmFormat, OjmSample } from './model';
import { SAMPLE_LANE_COUNT } from './settings.ts';

const EVENT_SLOTS = 192;
const LANE_KEYS = ['S', 'D', 'F', 'Space', 'J', 'K', 'L'] as const;

export type WriteOjnInput = {
  metadata: ChartMetadata;
  levels: Record<Difficulty, number>;
  document: EditorDocument;
  coverImage?: PreviewImage | null;
  thumbnailImage?: PreviewImage | null;
  baseHeader?: OjnHeader;
  encoding?: O2Encoding;
};

type EncodedChart = {
  bytes: Uint8Array;
  blockCount: number;
  eventCount: number;
  noteCount: number;
  measureCount: number;
  duration: number;
};

type EventCell = { value?: number; sampleId?: number; audio?: number; type?: number };
type EventBlock = { measure: number; channel: number; eventCount: number; cells: Map<number, EventCell> };

export type ParsedOjmBank = {
  format: OjmFormat;
  encryption: OjmEncryption;
  samples: OjmSample[];
};

export function writeOjnFile(input: WriteOjnInput): Uint8Array {
  const ex = encodeChart(input.document.EX, input.metadata.bpm);
  const nx = encodeChart(input.document.NX, input.metadata.bpm);
  const hx = encodeChart(input.document.HX, input.metadata.bpm);
  const cover = input.coverImage?.bytes ?? new Uint8Array();
  const thumbnail = input.thumbnailImage?.bytes ?? new Uint8Array();
  const blockOffsetEx = OJN_HEADER_SIZE;
  const blockOffsetNx = blockOffsetEx + ex.bytes.byteLength;
  const blockOffsetHx = blockOffsetNx + nx.bytes.byteLength;
  const coverOffset = blockOffsetHx + hx.bytes.byteLength;
  const header: OjnHeader = {
    ...emptyHeader(),
    ...input.baseHeader,
    id: input.metadata.musicId,
    signature: 'ojn',
    encodingVersion: input.metadata.ojnVersion,
    genre: input.metadata.genre,
    bpm: input.metadata.bpm,
    levelEx: input.levels.EX,
    levelNx: input.levels.NX,
    levelHx: input.levels.HX,
    eventCountEx: ex.eventCount,
    eventCountNx: nx.eventCount,
    eventCountHx: hx.eventCount,
    noteCountEx: ex.noteCount,
    noteCountNx: nx.noteCount,
    noteCountHx: hx.noteCount,
    measureCountEx: ex.measureCount,
    measureCountNx: nx.measureCount,
    measureCountHx: hx.measureCount,
    blockCountEx: ex.blockCount,
    blockCountNx: nx.blockCount,
    blockCountHx: hx.blockCount,
    thumbnailSize: thumbnail.byteLength,
    fileVersion: input.metadata.revision,
    title: input.metadata.title,
    artist: input.metadata.artist,
    noteDesigner: input.metadata.noteDesigner,
    ojm: input.metadata.ojmFileName,
    coverSize: cover.byteLength,
    durationEx: ex.duration,
    durationNx: nx.duration,
    durationHx: hx.duration,
    blockOffsetEx,
    blockOffsetNx,
    blockOffsetHx,
    coverOffset,
  };
  const writer = new ByteWriter(coverOffset + cover.byteLength + thumbnail.byteLength);
  writer.bytes(writeOjnHeader(header, input.encoding));
  writer.bytes(ex.bytes).bytes(nx.bytes).bytes(hx.bytes).bytes(cover).bytes(thumbnail);
  const plain = writer.toUint8Array();
  return input.metadata.ojnFormat === 'encrypted-new' ? encryptOjnNew(plain) : plain;
}

export function encryptOjnNew(source: Uint8Array): Uint8Array {
  const xorBlockSize = 16;
  const primaryKey = 0x6a;
  const middleKey = 0x3d;
  const initialKey = 0x5c;
  const key = new Uint8Array(xorBlockSize).fill(primaryKey);
  key[0] = initialKey;
  key[Math.floor(xorBlockSize / 2)] = middleKey;
  const result = new Uint8Array(source.byteLength + 8);
  result.set([0x6e, 0x65, 0x77, xorBlockSize, primaryKey, middleKey, initialKey, 0]);
  for (let index = 0; index < source.byteLength; index += 1) {
    result[result.byteLength - 1 - index] = (source[index] ?? 0) ^ (key[index % xorBlockSize] ?? 0);
  }
  return result;
}

export function writeOjmBank(samples: readonly OjmSample[], format: OjmFormat, encryption: OjmEncryption): Uint8Array {
  if (format === 'm30') {
    if (samples.some((sample) => sample.codec !== 'ogg')) {
      throw new FormatError('M30 accepts OGG samples only.');
    }
    return writeM30(samples, encryption);
  }
  return writeOjm(samples, format === 'omc');
}

export function parseOjmBank(source: BinarySource): ParsedOjmBank {
  const bytes = asBytes(source);
  if (bytes.byteLength < 4) {
    throw new FormatError('OJM file is too small.', 0);
  }
  const signature = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0);
  if (signature === 'M30') {
    return parseM30(bytes);
  }
  if (signature === 'OJM' || signature === 'OMC') {
    return parseLegacyOjm(bytes, signature === 'OMC');
  }
  throw new FormatError('Unknown OJM signature.', 0);
}

function writeOjm(samples: readonly OjmSample[], encrypted: boolean): Uint8Array {
  if (samples.some((sample) => sample.codec !== sample.type)) {
    throw new FormatError('OMC/OJM WAV and OGG banks require matching audio codecs.');
  }
  const wav = samples.filter((sample) => sample.type === 'wav').sort((left, right) => left.id - right.id);
  const ogg = samples.filter((sample) => sample.type === 'ogg').sort((left, right) => left.id - right.id);
  const wavCount = wav.length === 0 ? 0 : Math.max(...wav.map((sample) => sample.id)) + 1;
  const oggCount = ogg.length === 0 ? 0 : Math.max(...ogg.map((sample) => sample.id - 1000)) + 1;
  const wavById = new Map(wav.map((sample) => [sample.id, sample]));
  const oggById = new Map(ogg.map((sample) => [sample.id - 1000, sample]));
  const wavWriter = new ByteWriter();
  let omcState: OmcState = { key: 0xff, counter: 0 };
  for (let id = 0; id < wavCount; id += 1) {
    const sample = wavById.get(id);
    if (!sample) {
      wavWriter.zeros(56);
      continue;
    }
    const wavData = parseWav(sample.data);
    let pcm = wavData.data;
    if (encrypted) {
      const encoded = xorOmc(pcm, omcState, true);
      pcm = rearrangeOmc(encoded.bytes, true);
      omcState = encoded.state;
    }
    wavWriter.fixedString(sample.name, 32, 'euc-kr');
    wavWriter.u16(wavData.audioFormat).u16(wavData.channels).u32(wavData.sampleRate).u32(wavData.byteRate);
    wavWriter.u16(wavData.blockAlign).u16(wavData.bitsPerSample).u32(0x61746164).u32(pcm.byteLength).bytes(pcm);
  }
  const oggWriter = new ByteWriter();
  for (let id = 0; id < oggCount; id += 1) {
    const sample = oggById.get(id);
    if (!sample) {
      oggWriter.zeros(36);
      continue;
    }
    const data = asBytes(sample.data);
    oggWriter.fixedString(sample.name, 32, 'euc-kr').u32(data.byteLength).bytes(data);
  }
  const wavBytes = wavWriter.toUint8Array();
  const oggBytes = oggWriter.toUint8Array();
  const oggStart = 20 + wavBytes.byteLength;
  const fileSize = oggStart + oggBytes.byteLength;
  const writer = new ByteWriter(fileSize);
  writer.fixedString(encrypted ? 'OMC' : 'OJM', 4, 'ascii').i16(wavCount).i16(oggCount).u32(20).u32(oggStart).u32(fileSize);
  return writer.bytes(wavBytes).bytes(oggBytes).toUint8Array();
}

function writeM30(samples: readonly OjmSample[], encryption: OjmEncryption): Uint8Array {
  const flag = m30EncryptionFlag(encryption);
  const payload = new ByteWriter();
  for (const sample of [...samples].sort((left, right) => left.id - right.id)) {
    const plain = asBytes(sample.data);
    const data = encodeM30(plain, encryption);
    const background = sample.id >= 1000;
    payload.fixedString(sample.name, 32, 'euc-kr').u32(data.byteLength);
    payload.i16(background ? 0 : 5).i16(0).i32(background ? 1 : 0).i16(background ? sample.id - 1000 : sample.id).i16(0).i32(0).bytes(data);
  }
  const payloadBytes = payload.toUint8Array();
  const writer = new ByteWriter(28 + payloadBytes.byteLength);
  writer.fixedString('M30', 4, 'ascii').i32(1).i32(flag).i32(samples.length).i32(28).i32(payloadBytes.byteLength).i32(0).bytes(payloadBytes);
  return writer.toUint8Array();
}

function parseLegacyOjm(bytes: Uint8Array, encrypted: boolean): ParsedOjmBank {
  if (bytes.byteLength < 20) {
    throw new FormatError('OJM header is truncated.', 0);
  }
  const reader = new ByteReader(bytes).seek(4);
  reader.i16();
  reader.i16();
  const wavStart = reader.u32();
  const oggStart = reader.u32();
  const fileSize = Math.min(reader.u32(), bytes.byteLength);
  if (wavStart < 20 || oggStart < wavStart || fileSize < oggStart) {
    throw new FormatError('OJM section offsets are invalid.', 8);
  }
  const samples: OjmSample[] = [];
  let offset = wavStart;
  let id = 0;
  let omcState: OmcState = { key: 0xff, counter: 0 };
  while (offset < oggStart) {
    if (offset + 56 > oggStart) {
      throw new FormatError('OJM WAV header is truncated.', offset);
    }
    const entry = new ByteReader(bytes).seek(offset);
    const name = sampleName(entry.bytes(32), 'wav', id);
    const audioFormat = entry.u16();
    const channels = entry.u16();
    const sampleRate = entry.u32();
    const byteRate = entry.u32();
    const blockAlign = entry.u16();
    const bitsPerSample = entry.u16();
    entry.u32();
    const size = entry.u32();
    offset += 56;
    if (offset + size > oggStart) {
      throw new FormatError('OJM WAV sample is truncated.', offset);
    }
    if (size > 0) {
      let pcm: Uint8Array = bytes.slice(offset, offset + size);
      if (encrypted) {
        pcm = rearrangeOmc(pcm);
        const decoded = xorOmc(pcm, omcState, false);
        pcm = decoded.bytes;
        omcState = decoded.state;
      }
      const data = buildWav({ audioFormat, channels, sampleRate, byteRate, blockAlign, bitsPerSample, data: pcm });
      samples.push({ id, name, type: 'wav', codec: 'wav', size: data.byteLength, mime: 'audio/wav', data: ownedBuffer(data) });
    }
    offset += size;
    id += 1;
  }
  offset = oggStart;
  id = 1000;
  while (offset < fileSize) {
    if (offset + 36 > fileSize) {
      throw new FormatError('OJM OGG header is truncated.', offset);
    }
    const entry = new ByteReader(bytes).seek(offset);
    const name = sampleName(entry.bytes(32), 'ogg', id);
    const size = entry.u32();
    offset += 36;
    if (offset + size > fileSize) {
      throw new FormatError('OJM OGG sample is truncated.', offset);
    }
    if (size > 0) {
      const data = bytes.slice(offset, offset + size);
      samples.push({ id, name, type: 'ogg', codec: 'ogg', size, mime: 'audio/ogg', data: ownedBuffer(data) });
    }
    offset += size;
    id += 1;
  }
  return { format: encrypted ? 'omc' : 'ojm', encryption: 'none', samples };
}

function parseM30(bytes: Uint8Array): ParsedOjmBank {
  if (bytes.byteLength < 28) {
    throw new FormatError('M30 header is truncated.', 0);
  }
  const reader = new ByteReader(bytes).seek(4);
  reader.i32();
  const flag = reader.i32();
  const count = reader.i32();
  const sampleOffset = reader.i32();
  reader.i32();
  reader.i32();
  const encryption = m30EncryptionFromFlag(flag);
  if (!encryption) {
    throw new FormatError(`Unsupported M30 encryption flag ${flag}.`, 8);
  }
  if (count < 0 || sampleOffset < 28 || sampleOffset > bytes.byteLength) {
    throw new FormatError('M30 header values are invalid.', 12);
  }
  const samples: OjmSample[] = [];
  let offset = sampleOffset;
  for (let index = 0; index < count; index += 1) {
    if (offset + 52 > bytes.byteLength) {
      throw new FormatError('M30 sample header is truncated.', offset);
    }
    const entry = new ByteReader(bytes).seek(offset);
    const nameBytes = entry.bytes(32);
    const size = entry.i32();
    const codec = entry.i16();
    entry.i16();
    entry.i32();
    const ref = entry.i16();
    entry.i16();
    entry.i32();
    offset += 52;
    if (size < 0 || offset + size > bytes.byteLength) {
      throw new FormatError('M30 sample is truncated.', offset);
    }
    const id = codec === 0 ? 1000 + ref : ref;
    const type = id >= 1000 ? 'ogg' as const : 'wav' as const;
    const encryptedData = bytes.slice(offset, offset + size);
    const data = decodeM30(encryptedData, encryption);
    samples.push({ id, name: sampleName(nameBytes, 'ogg', id), type, codec: 'ogg', size: data.byteLength, mime: 'audio/ogg', data: ownedBuffer(data) });
    offset += size;
  }
  return { format: 'm30', encryption, samples };
}

type WavData = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Uint8Array;
};

function parseWav(source: BinarySource): WavData {
  const bytes = asBytes(source);
  if (bytes.byteLength < 44 || textAt(bytes, 0, 4) !== 'RIFF' || textAt(bytes, 8, 4) !== 'WAVE') {
    throw new FormatError('WAV sample has an invalid RIFF header.', 0);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: Omit<WavData, 'data'> | null = null;
  let data: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const id = textAt(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > bytes.byteLength) {
      throw new FormatError('WAV chunk is truncated.', offset);
    }
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    }
    else if (id === 'data') {
      data = bytes.slice(body, body + size);
    }
    offset = body + size + (size & 1);
  }
  if (!format || !data) {
    throw new FormatError('WAV sample needs fmt and data chunks.', 12);
  }
  return { ...format, data };
}

function buildWav(wav: WavData): Uint8Array {
  const writer = new ByteWriter(44 + wav.data.byteLength);
  writer.fixedString('RIFF', 4, 'ascii').u32(36 + wav.data.byteLength).fixedString('WAVE', 4, 'ascii');
  writer.fixedString('fmt ', 4, 'ascii').u32(16).u16(wav.audioFormat).u16(wav.channels).u32(wav.sampleRate).u32(wav.byteRate).u16(wav.blockAlign).u16(wav.bitsPerSample);
  writer.fixedString('data', 4, 'ascii').u32(wav.data.byteLength).bytes(wav.data);
  return writer.toUint8Array();
}

function xorNami(source: Uint8Array): Uint8Array {
  const mask = [0x6e, 0x61, 0x6d, 0x69];
  const result = source.slice();
  for (let index = 0; index + 3 < result.byteLength; index += 4) {
    result[index] = (result[index] ?? 0) ^ (mask[0] ?? 0);
    result[index + 1] = (result[index + 1] ?? 0) ^ (mask[1] ?? 0);
    result[index + 2] = (result[index + 2] ?? 0) ^ (mask[2] ?? 0);
    result[index + 3] = (result[index + 3] ?? 0) ^ (mask[3] ?? 0);
  }
  return result;
}

const M30_SCRAMBLE_16 = [
  [14, 2, 9, 4, 0, 7, 1, 6, 8, 15, 10, 5, 12, 3, 13, 11],
  [7, 2, 10, 11, 3, 5, 13, 8, 4, 0, 12, 6, 15, 14, 1, 9],
  [12, 13, 3, 0, 6, 9, 10, 1, 7, 8, 2, 11, 14, 4, 15, 5],
  [8, 3, 4, 13, 6, 5, 11, 2, 12, 7, 9, 10, 15, 14, 0, 1],
  [15, 2, 12, 13, 0, 4, 1, 5, 7, 3, 9, 6, 11, 10, 8, 14],
  [0, 4, 11, 15, 13, 12, 6, 5, 7, 1, 2, 3, 8, 9, 10, 14],
  [3, 8, 7, 6, 9, 14, 13, 0, 10, 11, 4, 5, 12, 2, 1, 15],
  [4, 14, 15, 5, 8, 7, 11, 0, 1, 6, 2, 12, 9, 3, 10, 13],
  [6, 13, 14, 7, 10, 11, 0, 1, 12, 15, 2, 3, 8, 9, 4, 5],
  [10, 12, 0, 8, 9, 13, 3, 4, 5, 14, 15, 1, 2, 11, 6, 7],
  [5, 6, 12, 4, 13, 15, 7, 14, 8, 1, 9, 2, 10, 11, 0, 3],
  [11, 15, 4, 14, 3, 1, 0, 2, 13, 12, 6, 7, 5, 9, 8, 10],
  [3, 2, 1, 0, 4, 12, 13, 11, 5, 6, 15, 14, 7, 9, 10, 8],
  [9, 10, 0, 7, 8, 6, 3, 4, 1, 2, 5, 11, 14, 15, 13, 12],
  [10, 6, 9, 12, 11, 7, 8, 0, 15, 3, 1, 2, 5, 13, 14, 4],
  [13, 0, 1, 14, 2, 3, 8, 11, 7, 12, 9, 5, 10, 15, 4, 6],
] as const;
const M30_SCRAMBLE_17_INSERT = [0, 14, 10, 7, 11, 3, 1, 2, 4, 9, 12, 13, 8, 6, 5, 16] as const;
const M30_SCRAMBLE_17_LAST = [1, 14, 2, 3, 13, 11, 7, 0, 8, 12, 9, 6, 15, 16, 5, 10, 4] as const;

function m30EncryptionFlag(encryption: OjmEncryption): number {
  return {
    none: 0,
    scramble1: 1,
    scramble2: 2,
    decode: 4,
    decrypt: 8,
    nami: 16,
  }[encryption];
}

function m30EncryptionFromFlag(flag: number): OjmEncryption | null {
  return ({ 0: 'none', 1: 'scramble1', 2: 'scramble2', 4: 'decode', 8: 'decrypt', 16: 'nami' } as Record<number, OjmEncryption>)[flag] ?? null;
}

function encodeM30(source: Uint8Array, encryption: OjmEncryption): Uint8Array {
  switch (encryption) {
    case 'none': return source.slice();
    case 'scramble1': return scrambleM30(source, 16, true);
    case 'scramble2': return scrambleM30(source, 17, true);
    case 'decode': return xorOmc(source, { key: 0xff, counter: 0 }, true).bytes;
    case 'decrypt': return reverseBits(source);
    case 'nami': return xorNami(source);
  }
}

function decodeM30(source: Uint8Array, encryption: OjmEncryption): Uint8Array {
  switch (encryption) {
    case 'none': return source.slice();
    case 'scramble1': return scrambleM30(source, 16, false);
    case 'scramble2': return scrambleM30(source, 17, false);
    case 'decode': return xorOmc(source, { key: 0xff, counter: 0 }, false).bytes;
    case 'decrypt': return reverseBits(source);
    case 'nami': return xorNami(source);
  }
}

function scrambleM30(source: Uint8Array, divisor: 16 | 17, encode: boolean): Uint8Array {
  const chunkSize = Math.floor(source.byteLength / divisor);
  const remainder = source.byteLength % divisor;
  if (chunkSize === 0) {
    return source.slice();
  }

  const key = divisor === 16
    ? M30_SCRAMBLE_16[remainder]!
    : m30Scramble17Key(remainder);
  const result = new Uint8Array(source.byteLength);
  for (let index = 0; index < divisor; index += 1) {
    const shuffledIndex = key[index]!;
    const sourceOffset = encode ? shuffledIndex * chunkSize : index * chunkSize;
    const targetOffset = encode ? index * chunkSize : shuffledIndex * chunkSize;
    result.set(source.subarray(sourceOffset, sourceOffset + chunkSize), targetOffset);
  }
  result.set(source.subarray(chunkSize * divisor), chunkSize * divisor);
  return result;
}

function m30Scramble17Key(remainder: number): readonly number[] {
  if (remainder === 16) {
    return M30_SCRAMBLE_17_LAST;
  }
  const key: number[] = [...M30_SCRAMBLE_16[remainder]!];
  key.splice(M30_SCRAMBLE_17_INSERT[remainder]!, 0, 16);
  return key;
}

function reverseBits(source: Uint8Array): Uint8Array {
  return source.map((byte) => {
    let value = byte;
    let reversed = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>= 1;
    }
    return reversed;
  });
}

type OmcState = { key: number; counter: number };

function xorOmc(source: Uint8Array, initial: OmcState, encode: boolean): { bytes: Uint8Array; state: OmcState } {
  const result = source.slice();
  let { key, counter } = initial;
  for (let index = 0; index < result.byteLength; index += 1) {
    const input = result[index] ?? 0;
    const output = ((key << counter) & 0x80) !== 0 ? (~input) & 0xff : input;
    result[index] = output;
    counter += 1;
    if (counter > 7) {
      counter = 0;
      key = encode ? output : input;
    }
  }
  return { bytes: result, state: { key, counter } };
}

function rearrangeOmc(source: Uint8Array, encode = false): Uint8Array {
  const blockSize = Math.floor(source.byteLength / 17);
  if (blockSize === 0) {
    return source.slice();
  }
  const result = source.slice();
  let key = ((source.byteLength % 17) << 4) + source.byteLength % 17;
  for (let block = 0; block < 17; block += 1) {
    const shuffled = OMC_REARRANGE[key] ?? block;
    const sourceOffset = blockSize * (encode ? shuffled : block);
    const destination = blockSize * (encode ? block : shuffled);
    result.set(source.subarray(sourceOffset, sourceOffset + blockSize), destination);
    key += 1;
  }
  return result;
}

function sampleName(bytes: Uint8Array, extension: 'wav' | 'ogg', id: number): string {
  const decoded = decodeText(bytes, 'euc-kr').trim();
  const fallback = `${extension === 'wav' ? 'W' : 'M'}${String(id % 1000).padStart(4, '0')}.${extension}`;
  if (!decoded) {
    return fallback;
  }
  return decoded.includes('.') ? decoded : `${decoded}.${extension}`;
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

const OMC_REARRANGE = Uint8Array.from([
  0x10, 0x0e, 0x02, 0x09, 0x04, 0x00, 0x07, 0x01, 0x06, 0x08, 0x0f, 0x0a, 0x05, 0x0c, 0x03, 0x0d,
  0x0b, 0x07, 0x02, 0x0a, 0x0b, 0x03, 0x05, 0x0d, 0x08, 0x04, 0x00, 0x0c, 0x06, 0x0f, 0x0e, 0x10,
  0x01, 0x09, 0x0c, 0x0d, 0x03, 0x00, 0x06, 0x09, 0x0a, 0x01, 0x07, 0x08, 0x10, 0x02, 0x0b, 0x0e,
  0x04, 0x0f, 0x05, 0x08, 0x03, 0x04, 0x0d, 0x06, 0x05, 0x0b, 0x10, 0x02, 0x0c, 0x07, 0x09, 0x0a,
  0x0f, 0x0e, 0x00, 0x01, 0x0f, 0x02, 0x0c, 0x0d, 0x00, 0x04, 0x01, 0x05, 0x07, 0x03, 0x09, 0x10,
  0x06, 0x0b, 0x0a, 0x08, 0x0e, 0x00, 0x04, 0x0b, 0x10, 0x0f, 0x0d, 0x0c, 0x06, 0x05, 0x07, 0x01,
  0x02, 0x03, 0x08, 0x09, 0x0a, 0x0e, 0x03, 0x10, 0x08, 0x07, 0x06, 0x09, 0x0e, 0x0d, 0x00, 0x0a,
  0x0b, 0x04, 0x05, 0x0c, 0x02, 0x01, 0x0f, 0x04, 0x0e, 0x10, 0x0f, 0x05, 0x08, 0x07, 0x0b, 0x00,
  0x01, 0x06, 0x02, 0x0c, 0x09, 0x03, 0x0a, 0x0d, 0x06, 0x0d, 0x0e, 0x07, 0x10, 0x0a, 0x0b, 0x00,
  0x01, 0x0c, 0x0f, 0x02, 0x03, 0x08, 0x09, 0x04, 0x05, 0x0a, 0x0c, 0x00, 0x08, 0x09, 0x0d, 0x03,
  0x04, 0x05, 0x10, 0x0e, 0x0f, 0x01, 0x02, 0x0b, 0x06, 0x07, 0x05, 0x06, 0x0c, 0x04, 0x0d, 0x0f,
  0x07, 0x0e, 0x08, 0x01, 0x09, 0x02, 0x10, 0x0a, 0x0b, 0x00, 0x03, 0x0b, 0x0f, 0x04, 0x0e, 0x03,
  0x01, 0x00, 0x02, 0x0d, 0x0c, 0x06, 0x07, 0x05, 0x10, 0x09, 0x08, 0x0a, 0x03, 0x02, 0x01, 0x00,
  0x04, 0x0c, 0x0d, 0x0b, 0x10, 0x05, 0x06, 0x0f, 0x0e, 0x07, 0x09, 0x0a, 0x08, 0x09, 0x0a, 0x00,
  0x07, 0x08, 0x06, 0x10, 0x03, 0x04, 0x01, 0x02, 0x05, 0x0b, 0x0e, 0x0f, 0x0d, 0x0c, 0x0a, 0x06,
  0x09, 0x0c, 0x0b, 0x10, 0x07, 0x08, 0x00, 0x0f, 0x03, 0x01, 0x02, 0x05, 0x0d, 0x0e, 0x04, 0x0d,
  0x00, 0x01, 0x0e, 0x02, 0x03, 0x08, 0x0b, 0x07, 0x0c, 0x09, 0x05, 0x0a, 0x0f, 0x04, 0x06, 0x10,
  0x01, 0x0e, 0x02, 0x03, 0x0d, 0x0b, 0x07, 0x00, 0x08, 0x0c, 0x09, 0x06, 0x0f, 0x10, 0x05, 0x0a, 0x04, 0x00,
]);

function encodeChart(chart: EditorChart, baseBpm: number): EncodedChart {
  const blocks = new Map<string, EventBlock>();
  const addCell = (measure: number, channel: number, eventCount: number, slot: number, cell: EventCell) => {
    const key = `${measure}:${channel}`;
    const block = blocks.get(key) ?? { measure, channel, eventCount, cells: new Map<number, EventCell>() };
    block.cells.set(slot, cell);
    blocks.set(key, block);
  };
  let eventCount = 0;

  for (const event of chart.measureFractions) {
    addCell(Math.max(0, Math.floor(event.measure)), 0, 1, 0, { value: event.fraction });
    eventCount += 1;
  }
  for (const event of chart.bpmChanges) {
    const position = splitPosition(event.absolutePosition);
    addCell(position.measure, 1, EVENT_SLOTS, position.slot, { value: event.bpm });
    eventCount += 1;
  }
  for (const note of chart.notes) {
    const lane = LANE_KEYS.indexOf(note.key);
    if (lane < 0) {
      continue;
    }
    const background = note.sampleType === 'ogg';
    const start = splitPosition(note.absolutePosition);
    addCell(start.measure, lane + 2, EVENT_SLOTS, start.slot, noteCell(note.sampleId, note.volume, note.pan, background, note.duration ? 2 : 0));
    eventCount += 1;
    if (note.duration) {
      const end = splitPosition(note.absolutePosition + note.duration);
      addCell(end.measure, lane + 2, EVENT_SLOTS, end.slot, noteCell(note.sampleId, note.volume, note.pan, background, 3));
      eventCount += 1;
    }
  }
  for (const note of chart.autoplayNotes) {
    const position = splitPosition(note.absolutePosition);
    addCell(position.measure, Math.max(1, Math.min(SAMPLE_LANE_COUNT, Math.round(note.lane))) + 8, EVENT_SLOTS, position.slot, noteCell(note.sampleId, note.volume, note.pan, note.sampleType === 'ogg', 0));
    eventCount += 1;
  }

  const ordered = [...blocks.values()].sort((left, right) => left.measure - right.measure || left.channel - right.channel);
  const writer = new ByteWriter();
  for (const block of ordered) {
    writer.u32(block.measure).u16(block.channel).u16(block.eventCount);
    for (let slot = 0; slot < block.eventCount; slot += 1) {
      const cell = block.cells.get(slot);
      if (block.channel <= 1) {
        writer.f32(cell?.value ?? 0);
      }
      else {
        writer.u16(cell?.sampleId ?? 0).i8(cell?.audio ?? 0).i8(cell?.type ?? 0);
      }
    }
  }
  const measureCount = Math.max(4, Math.ceil(chartEndPosition(chart)));
  const duration = Math.max(0, Math.ceil(positionToSeconds(
    measureCount,
    baseBpm,
    chart.bpmChanges.map((event) => ({ position: event.absolutePosition, bpm: event.bpm })),
    chart.measureFractions,
  )));
  return {
    bytes: writer.toUint8Array(),
    blockCount: ordered.length,
    eventCount,
    noteCount: chart.notes.length,
    measureCount,
    duration,
  };
}

function splitPosition(value: number): { measure: number; slot: number } {
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
  let measure = Math.floor(normalized);
  let slot = Math.round((normalized - measure) * EVENT_SLOTS);
  if (slot >= EVENT_SLOTS) {
    measure += 1;
    slot = 0;
  }
  return { measure, slot };
}

function noteCell(sampleId: number, volume: number, pan: number, background: boolean, kind: number): EventCell {
  const bankId = background && sampleId >= 1000 ? sampleId - 1000 : sampleId;
  const rawVolume = volume >= 96.875 ? 0 : Math.max(1, Math.min(15, Math.round(volume / 100 * 16)));
  const rawPan = encodeOjnPan(pan);
  return {
    sampleId: Math.max(1, Math.min(0xffff, Math.round(bankId) + 1)),
    audio: (rawVolume << 4) | rawPan,
    type: kind + (background ? 4 : 0),
  };
}

function emptyHeader(): OjnHeader {
  return {
    id: 0,
    signature: 'ojn',
    encodingVersion: 0,
    genre: 10,
    bpm: 120,
    levelEx: 0,
    levelNx: 0,
    levelHx: 0,
    unk1: 0,
    eventCountEx: 0,
    eventCountNx: 0,
    eventCountHx: 0,
    noteCountEx: 0,
    noteCountNx: 0,
    noteCountHx: 0,
    measureCountEx: 4,
    measureCountNx: 4,
    measureCountHx: 4,
    blockCountEx: 0,
    blockCountNx: 0,
    blockCountHx: 0,
    oldEncodingVersion: 0,
    oldSongId: 0,
    oldGenre: '',
    thumbnailSize: 0,
    fileVersion: 0,
    title: 'Untitled',
    artist: '',
    noteDesigner: '',
    ojm: 'Untitled.ojm',
    coverSize: 0,
    durationEx: 0,
    durationNx: 0,
    durationHx: 0,
    blockOffsetEx: OJN_HEADER_SIZE,
    blockOffsetNx: OJN_HEADER_SIZE,
    blockOffsetHx: OJN_HEADER_SIZE,
    coverOffset: OJN_HEADER_SIZE,
  };
}
