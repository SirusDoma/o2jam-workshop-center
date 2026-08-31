
import { asBytes, ByteReader, ByteWriter, FormatError } from './binary';
import type { BinarySource } from './binary';
import { DEFAULT_ENCODING, detectEncoding } from './text';
import type { O2Encoding } from './text';

export type ArchiveKind = 'opi' | 'opa';

export const ARCHIVE_SIGNATURES: Record<ArchiveKind, number> = { opa: 1, opi: 2 };
export const ARCHIVE_HEADER_SIZE = 16;
export const FILE_HEADER_SIZE = 152;
export const FILENAME_SIZE = 128;

export const FILE_SIGNATURE_VALID = 1;

export interface ArchiveEntry {
  index: number;
  name: string;
  offset: number;
  size: number;
  reservedSize: number;
  signature: number;
  ext: string;
  headerOffset: number;
  unknown1: number;
  unknown2: number;
}

export interface Archive {
  kind: ArchiveKind;
  signature: number;
  fileCount: number;
  declaredCount: number;
  entries: ArchiveEntry[];
  tableOffset: number;
  slack: number;
}

function trimName(value: string): string {
  const nul = value.indexOf('\0');
  return (nul < 0 ? value : value.slice(0, nul)).trim();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function parseArchive(
  source: BinarySource,
  encoding: O2Encoding = DEFAULT_ENCODING,
): Archive {
  const reader = new ByteReader(source);
  if (reader.size < ARCHIVE_HEADER_SIZE) {
    throw new FormatError(
      `archive needs at least ${ARCHIVE_HEADER_SIZE} bytes, got ${reader.size}`,
      0,
    );
  }

  const signature = reader.view.getInt32(0, true);
  const declaredCount = reader.view.getInt32(4, true);

  let kind: ArchiveKind;
  if (signature === ARCHIVE_SIGNATURES.opa) kind = 'opa';
  else if (signature === ARCHIVE_SIGNATURES.opi) kind = 'opi';
  else kind = 'opi';

  const capacity = Math.max(0, Math.floor((reader.size - ARCHIVE_HEADER_SIZE) / FILE_HEADER_SIZE));
  const slots = Math.max(0, Math.min(capacity, declaredCount));

  const tableOffset = reader.size - FILE_HEADER_SIZE * slots;
  const entries: ArchiveEntry[] = [];
  let reserved = 0;

  for (let i = 0; i < slots; i++) {
    const headerOffset = tableOffset + i * FILE_HEADER_SIZE;
    const fileSignature = reader.view.getInt32(headerOffset, true);
    const name = trimName(
      reader.seek(headerOffset + 4).fixedString(FILENAME_SIZE, encoding),
    );
    const offset = reader.view.getInt32(headerOffset + 132, true);
    let size = reader.view.getInt32(headerOffset + 136, true);
    const reservedSize = reader.view.getInt32(headerOffset + 140, true);
    const unknown1 = reader.view.getInt32(headerOffset + 144, true);
    const unknown2 = reader.view.getInt32(headerOffset + 148, true);

    if (fileSignature !== FILE_SIGNATURE_VALID) continue;

    if (offset < ARCHIVE_HEADER_SIZE || offset > tableOffset) continue;
    if (size < 0 || offset + size > tableOffset) {
      size = Math.max(0, tableOffset - offset);
    }

    reserved += Math.max(reservedSize, size);
    entries.push({
      index: entries.length,
      name,
      offset,
      size,
      reservedSize,
      signature: fileSignature,
      ext: extensionOf(name),
      headerOffset,
      unknown1,
      unknown2,
    });
  }


  return {
    kind,
    signature,
    fileCount: slots,
    declaredCount,
    entries,
    tableOffset,
    slack: Math.max(0, tableOffset - ARCHIVE_HEADER_SIZE - reserved),
  };
}

export function detectArchiveEncoding(source: BinarySource): O2Encoding | null {
  const bytes = asBytes(source);
  const archive = parseArchive(bytes, 'ascii');
  return detectEncoding(
    archive.entries.map((e) => bytes.subarray(e.headerOffset + 4, e.headerOffset + 4 + FILENAME_SIZE)),
  );
}

export function readEntry(source: BinarySource, entry: ArchiveEntry): Uint8Array {
  const bytes = asBytes(source);
  const start = Math.max(0, Math.min(entry.offset, bytes.byteLength));
  const end = Math.max(start, Math.min(entry.offset + entry.size, bytes.byteLength));
  return bytes.slice(start, end);
}

export function findEntry(
  entries: readonly ArchiveEntry[],
  name: string,
): ArchiveEntry | undefined {
  const wanted = trimName(name).toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase() === wanted);
}


export interface ArchiveInput {
  name: string;
  data: Uint8Array;
  reservedSize?: number;
}

export function buildArchive(
  kind: ArchiveKind,
  files: readonly ArchiveInput[],
  encoding: O2Encoding = DEFAULT_ENCODING,
): Uint8Array {
  const writer = new ByteWriter(ARCHIVE_HEADER_SIZE + files.length * FILE_HEADER_SIZE + 4096);

  writer.i32(ARCHIVE_SIGNATURES[kind]);
  writer.i32(files.length);
  writer.i32(0);
  writer.i32(0);

  const placed: { file: ArchiveInput; offset: number; reserved: number }[] = [];
  for (const file of files) {
    const reserved = Math.max(file.data.byteLength, file.reservedSize ?? file.data.byteLength);
    const offset = writer.tell();
    writer.bytes(file.data);
    writer.zeros(reserved - file.data.byteLength);
    placed.push({ file, offset, reserved });
  }

  for (const { file, offset, reserved } of placed) {
    writer.i32(FILE_SIGNATURE_VALID);
    writer.fixedString(file.name, FILENAME_SIZE, encoding);
    writer.i32(offset);
    writer.i32(file.data.byteLength);
    writer.i32(reserved);
    writer.i32(0);
    writer.i32(0);
  }

  return writer.toUint8Array();
}


export interface ArchiveRole {
  name: string;
  kind: ArchiveKind;
  label: string;
  match: RegExp;
}

export const ARCHIVE_ROLES: readonly ArchiveRole[] = [
  {
    name: 'Interface1.opi',
    kind: 'opi',
    label: 'Interface',
    match: /^Interface\d*(?:_\d+)?\.opi$/i,
  },
  {
    name: 'Playing1.opi',
    kind: 'opi',
    label: 'Playing',
    match: /^Playing\d*(?:_\d+)?\.opi$/i,
  },
  {
    name: 'Avatar.opa',
    kind: 'opa',
    label: 'Avatar',
    match: /^Avatar\d*(?:_\d+)?\.opa$/i,
  },
];

export const PATCH_TARGETS = ['Interface', 'Playing', 'Avatar'] as const;
export type PatchTarget = (typeof PATCH_TARGETS)[number];

export interface PatchName {
  filename: string;
  target: PatchTarget;
  numeral: number | null;
  patchNumber: number | null;
  ext: string;
}

const PATCH_PATTERN = /^(Interface|Playing|Avatar)(\d+)?(?:_(\d+))?\.(opi|opa)$/i;

export function parsePatchName(filename: string): PatchName | null {
  const match = PATCH_PATTERN.exec(filename.trim());
  if (!match) return null;

  const target = PATCH_TARGETS.find((t) => t.toLowerCase() === (match[1] ?? '').toLowerCase());
  if (!target) return null;

  return {
    filename,
    target,
    numeral: match[2] === undefined ? null : Number(match[2]),
    patchNumber: match[3] === undefined ? null : Number(match[3]),
    ext: (match[4] ?? '').toLowerCase(),
  };
}

export function formatPatchName(
  target: PatchTarget,
  patchNumber: number | null,
  numeral: number | null = target === 'Avatar' ? null : 1,
): string {
  const ext = target === 'Avatar' ? 'opa' : 'opi';
  const stem = `${target}${numeral ?? ''}`;
  return patchNumber === null ? `${stem}.${ext}` : `${stem}_${patchNumber}.${ext}`;
}

export function sortArchivePrecedence(filenames: readonly string[]): string[] {
  return [...filenames].sort((a, b) => {
    const pa = parsePatchName(a);
    const pb = parsePatchName(b);
    const na = pa?.patchNumber ?? -1;
    const nb = pb?.patchNumber ?? -1;
    if (na !== nb) return nb - na;
    return a.localeCompare(b);
  });
}
