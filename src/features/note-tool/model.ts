export type OjnFormat = 'normal' | 'encrypted-new';
export type OjmFormat = 'ojm' | 'omc' | 'm30';
export type OjmEncryption = 'none' | 'scramble1' | 'scramble2' | 'decode' | 'decrypt' | 'nami';
export type OjmSampleType = 'wav' | 'ogg';

export const MAX_SAMPLE_BYTES = 64 * 1024 * 1024;
export const MAX_SAMPLE_BANK_BYTES = 512 * 1024 * 1024;
export const MAX_SAMPLE_FILES = 1999;

export type SampleDescriptor = {
  name: string;
  size: number;
};

export function classifyNoteToolFiles<T extends { name: string; }>(files: readonly T[]) {
  let ojn: T | null = null;
  let ojm: T | null = null;
  const duplicates: T[] = [];
  const unsupported: T[] = [];

  for (const file of files) {
    const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    if (extension === 'ojn') {
      if (ojn) duplicates.push(file);
      else ojn = file;
    }
    else if (extension === 'ojm' || extension === 'omc' || extension === 'm30') {
      if (ojm) duplicates.push(file);
      else ojm = file;
    }
    else {
      unsupported.push(file);
    }
  }

  return { ojn, ojm, duplicates, unsupported };
}

export type OjmSample = {
  id: number;
  name: string;
  type: OjmSampleType;
  codec: OjmSampleType;
  size: number;
  mime: string;
  data: ArrayBuffer;
};

const WAV_SAMPLE_SLOTS = Array.from({ length: 1000 }, (_, index) => index);
const OGG_SAMPLE_SLOTS = Array.from({ length: 999 }, (_, index) => index + 1000);

export function sampleSlotIds(type: OjmSampleType): readonly number[] {
  return type === 'wav' ? WAV_SAMPLE_SLOTS : OGG_SAMPLE_SLOTS;
}

export function formatSampleSlot(type: OjmSampleType, id: number): string {
  const index = type === 'wav' ? id : id - 999;
  return `${type === 'wav' ? 'W' : 'M'}${String(index).padStart(3, '0')}`;
}

export function resolveOjmSettings(format: OjmFormat, encryption: OjmEncryption) {
  if (format === 'm30') {
    return {
      format,
      encryption,
      acceptedTypes: ['ogg'] as OjmSampleType[],
    };
  }

  return {
    format,
    encryption: 'none' as const,
    acceptedTypes: ['wav', 'ogg'] as OjmSampleType[],
  };
}

export function sampleTypeFromName(name: string): OjmSampleType | null {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return extension === 'wav' || extension === 'ogg' ? extension : null;
}

export function sampleBankFileName(name: string, title: string, _format: OjmFormat): string {
  const extension = '.ojm';
  const source = name.trim() || title.trim() || 'Untitled';
  const base = source.replace(/\.(?:ojm|omc|m30)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Untitled';
  return `${base}${extension}`;
}

export function musicFileName(musicId: number, extension: 'ojn' | 'ojm'): string {
  const id = Math.max(0, Math.trunc(musicId));
  return `${id === 0 ? 'Untitled' : `o2ma${id}`}.${extension}`;
}

export function noteToolStatesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    return equalBytes(new Uint8Array(left), new Uint8Array(right));
  }
  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    return equalBytes(
      new Uint8Array(left.buffer, left.byteOffset, left.byteLength),
      new Uint8Array(right.buffer, right.byteOffset, right.byteLength),
    );
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => noteToolStatesEqual(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length
    && keys.every((key) => Object.hasOwn(rightRecord, key) && noteToolStatesEqual(leftRecord[key], rightRecord[key]));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateSampleDescriptor(
  file: SampleDescriptor,
  format: OjmFormat,
): string | null {
  const type = sampleTypeFromName(file.name);

  if (!type) {
    return 'Only WAV and OGG samples are supported.';
  }

  if (file.size > MAX_SAMPLE_BYTES) {
    return `${file.name} is larger than 64 MB.`;
  }

  if (format === 'm30' && type === 'wav') {
    return 'M30 accepts OGG samples only.';
  }

  return null;
}

export function allocateSampleId(
  type: OjmSampleType,
  usedIds: readonly number[],
  fileName: string,
): number {
  const prefix = type === 'wav' ? 'W' : 'M';
  const explicit = new RegExp(`^${prefix}(\\d{1,4})(?:\\.[^.]+)?$`, 'i').exec(fileName)?.[1];
  const bankStart = type === 'wav' ? 0 : 1000;
  const bankEnd = type === 'wav' ? 999 : 1998;
  const explicitId = explicit === undefined ? null : Number(explicit);
  const requested = explicitId === null
    ? null
    : type === 'ogg' && explicitId >= bankStart ? explicitId : bankStart + explicitId;

  if (requested !== null && requested >= bankStart && requested <= bankEnd && !usedIds.includes(requested)) {
    return requested;
  }

  for (let id = bankStart; id <= bankEnd; id += 1) {
    if (!usedIds.includes(id)) {
      return id;
    }
  }

  throw new Error(`${type.toUpperCase()} sample bank is full.`);
}
