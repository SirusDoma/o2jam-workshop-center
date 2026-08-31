import {
  DEFAULT_ENCODING,
  buildArchive,
  detectItemDataEncoding,
  detectItemDataVersion,
  isItemDataFilename,
  itemDataVersion,
  parseArchive,
  parseItemData,
  parseSetInfo,
  readEntry,
  writeItemData,
  writeSetInfo,
  type ItemDataVersionId,
  type ItemEntry,
  type O2Encoding,
  type SetInfoEntry,
} from '../../o2jam';
import { applyItemEdit, applySetEdit } from './model';
import type { ItemEdit, SetEdit } from './types';

interface BuildAvatarArchiveOptions {
  buffer: ArrayBuffer;
  activeTableName: string | null;
  versionId: ItemDataVersionId;
  activeEncoding: O2Encoding;
  itemEdits: Record<string, Record<number, ItemEdit>>;
  addedItems: Record<string, ItemEntry[]>;
  removedItems: Record<string, Set<number>>;
  setEdits: Record<number, SetEdit>;
  addedSets: SetInfoEntry[];
  removedSets: ReadonlySet<number>;
  addedFiles: Record<string, Uint8Array>;
  usedAddedFiles: ReadonlySet<string>;
}

export function buildAvatarPackage(options: BuildAvatarArchiveOptions): Uint8Array {
  const archive = parseArchive(options.buffer, DEFAULT_ENCODING);
  const replaced = new Map<string, Uint8Array>();
  const touchedTables = new Set([
    ...Object.entries(options.itemEdits).filter(([, edits]) => Object.keys(edits).length).map(([name]) => name),
    ...Object.entries(options.addedItems).filter(([, items]) => items.length).map(([name]) => name),
    ...Object.entries(options.removedItems).filter(([, items]) => items.size).map(([name]) => name),
  ]);

  for (const name of touchedTables) {
    const entry = archive.entries.find((candidate) => candidate.name === name);
    if (!entry) {
      continue;
    }

    const bytes = readEntry(options.buffer, entry);
    const active = name === options.activeTableName;
    const versionId = active ? options.versionId : detectItemDataVersion(bytes) ?? options.versionId;
    const encoding = active ? options.activeEncoding : detectItemDataEncoding(bytes, versionId) ?? 'ascii';
    const parsed = parseItemData(bytes, versionId, encoding);
    const version = itemDataVersion(versionId);
    const removed = options.removedItems[name] ?? new Set<number>();
    const items = [...parsed.items, ...(options.addedItems[name] ?? [])]
      .filter((item) => !removed.has(item.index))
      .map((item) => applyItemEdit(item, options.itemEdits[name]?.[item.index], version, encoding));
    const body = writeItemData(items, versionId, encoding);
    const tail = bytes.subarray(parsed.bytesConsumed);
    const output = new Uint8Array(body.length + tail.length);
    output.set(body, 0);
    output.set(tail, body.length);
    replaced.set(name.toLowerCase(), output);
  }

  if (Object.keys(options.setEdits).length || options.addedSets.length || options.removedSets.size) {
    const entry = archive.entries.find((candidate) => candidate.name.toLowerCase() === 'setinfodata.ojs');
    if (entry) {
      const bytes = readEntry(options.buffer, entry);
      const parsed = parseSetInfo(bytes, options.activeEncoding);
      const sets = [...parsed.sets, ...options.addedSets]
        .filter((set) => !options.removedSets.has(set.index))
        .map((set) => applySetEdit(set, options.setEdits[set.index], options.activeEncoding));
      const body = writeSetInfo(sets, options.activeEncoding);
      const tail = bytes.subarray(parsed.bytesConsumed);
      const output = new Uint8Array(body.length + tail.length);
      output.set(body, 0);
      output.set(tail, body.length);
      replaced.set(entry.name.toLowerCase(), output);
    }
  }

  const addedByName = new Map(Object.entries(options.addedFiles).map(([name, bytes]) => [name.toLowerCase(), bytes] as const));
  const entries = archive.entries.map((entry) => ({
    name: entry.name,
    data: replaced.get(entry.name.toLowerCase()) ?? addedByName.get(entry.name.toLowerCase()) ?? readEntry(options.buffer, entry),
  }));
  let insertAt = entries.findIndex((entry) => entry.name.toLowerCase() === 'setinfodata.ojs' || isItemDataFilename(entry.name));
  if (insertAt < 0) {
    insertAt = entries.length;
  }

  for (const [name, bytes] of Object.entries(options.addedFiles)) {
    const exists = archive.entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!exists && options.usedAddedFiles.has(name)) {
      entries.splice(insertAt++, 0, { name, data: bytes });
    }
  }
  return buildArchive(archive.kind, entries, DEFAULT_ENCODING);
}
