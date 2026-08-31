import {
  DEFAULT_ENCODING,
  buildArchive,
  encodeText,
  findEntry,
  parseArchive,
  readEntry,
  writeBounds,
  writeControlList,
  writeSprite,
  type Bound,
  type ControlEntry,
  type ControlList,
  type ControlState,
  type O2Encoding,
} from '../../o2jam';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { applyEdits, boundFileFor, ckey, sortByOrder, type EditFrame, type FieldEdit } from './model';
import { CONTROL_LIST_NAMES, decodeSpriteFrames, readBounds } from './sceneUtils';

interface SceneArchiveOptions {
  file: WorkspaceFile;
  list: ControlList;
  encoding: O2Encoding | undefined;
  fieldEdits: Record<string, FieldEdit>;
  boundEdits: Record<string, Bound>;
  addedControls: Record<string, ControlEntry[]>;
  addedBounds: Record<string, Bound>;
  removedControls: ReadonlySet<string>;
  extraBounds: Record<string, Bound[]>;
  removedBounds: ReadonlySet<string>;
  addedBlocks: ControlState[];
  removedBlocks: ReadonlySet<string>;
  renames: Record<string, string>;
  setIdEdits: Record<string, number>;
  orderKeys: Record<string, string[]>;
  dissolvedSets: ReadonlySet<string>;
  boundFiles: Record<string, string | null>;
  spriteFrames: Record<string, EditFrame[]>;
  spritePositions: Record<string, { x: number; y: number; }>;
  newSprites: Record<string, string>;
  removedSprites: ReadonlySet<string>;
}

function encodeSprite(frames: EditFrame[], position: { x: number; y: number; } | undefined, name: string): Uint8Array | null {
  let output = frames.map((frame) => ({ ...frame }));
  if (!output.length) {
    return null;
  }

  if (position) {
    const dx = position.x - output[0]!.x;
    const dy = position.y - output[0]!.y;
    if (dx || dy) {
      output = output.map((frame) => ({ ...frame, x: frame.x + dx, y: frame.y + dy }));
    }
  }

  return writeSprite(
    output.map(({ width, height, x, y, rgba }) => ({ width, height, x, y, rgba })),
    0,
    8,
    name.toLowerCase().endsWith('.oji') ? 'runlist' : 'rgb555'
  );
}

export function buildScenePackage(options: SceneArchiveOptions): Uint8Array {
  const editBlock = (state: ControlState): ControlState => {
    const applySet = (control: ControlEntry): ControlEntry => {
      if (control.setId === null) {
        return control;
      }

      if (options.dissolvedSets.has(`${state.name}:${control.setId}`)) {
        return { ...control, setId: null };
      }

      const mapped = options.setIdEdits[`${state.name}:${control.setId}`];
      return mapped !== undefined ? { ...control, setId: mapped } : control;
    };
    const base = state.base && !options.removedControls.has(ckey(state.base))
      ? applyEdits(state.base, options.fieldEdits[ckey(state.base)])
      : null;
    const existing = state.controls
      .filter((control) => !options.removedControls.has(ckey(control)))
      .map((control) => applySet(applyEdits(control, options.fieldEdits[ckey(control)])));
    const added = (options.addedControls[state.name] ?? [])
      .filter((control) => !options.removedControls.has(ckey(control)))
      .map((control) => applySet(applyEdits(control, options.fieldEdits[ckey(control)])));
    return {
      ...state,
      name: options.renames[state.name] ?? state.name,
      boundFile: boundFileFor(state, options.boundFiles),
      base,
      baseId: base ? base.id : state.baseId,
      controls: sortByOrder([...existing, ...added], options.orderKeys[state.name]),
    };
  };
  const keepBlock = (block: ControlState) => !options.removedBlocks.has(block.name);
  const edited: ControlList = {
    ...options.list,
    states: [...options.list.states, ...options.addedBlocks.filter((block) => block.kind === 'state')].filter(keepBlock).map(editBlock),
    dialogs: [...options.list.dialogs, ...options.addedBlocks.filter((block) => block.kind === 'dialog')].filter(keepBlock).map(editBlock),
  };
  const controlListBytes = encodeText(writeControlList(edited), options.encoding ?? 'ascii').bytes;
  const archive = parseArchive(options.file.buffer, DEFAULT_ENCODING);
  const controlListEntry = CONTROL_LIST_NAMES.map((name) => findEntry(archive.entries, name)).find(Boolean);
  const hasEntry = (name: string) => archive.entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase());

  const boundsByName = new Map<string, { name: string; data: Uint8Array; }>();
  for (const block of [...options.list.states, ...options.list.dialogs, ...options.addedBlocks].filter(keepBlock)) {
    const boundFile = boundFileFor(block, options.boundFiles);
    if (!boundFile) {
      continue;
    }

    const structureChanged = (options.addedControls[block.name]?.length ?? 0) > 0 || block.controls.some((control) => options.removedControls.has(ckey(control)));
    const boundsChanged =
      Object.keys(options.boundEdits).some((key) => key.startsWith(`${block.name}:`)) ||
      (options.extraBounds[block.name]?.length ?? 0) > 0 ||
      [...options.removedBounds].some((key) => key.startsWith(`${block.name}:`)) ||
      !!options.orderKeys[block.name] ||
      options.boundFiles[block.name] !== undefined;
    if (!structureChanged && !boundsChanged && hasEntry(boundFile)) {
      continue;
    }

    const raw = readBounds(options.file, boundFile);
    const editedRects = raw.map((bound) => options.boundEdits[`${block.name}:${bound.index}`] ?? bound);
    const nonBase = sortByOrder(
      [
        ...block.controls.filter((control) => !options.removedControls.has(ckey(control))),
        ...(options.addedControls[block.name] ?? []).filter((control) => !options.removedControls.has(ckey(control))),
      ],
      options.orderKeys[block.name]
    );
    const inputs = nonBase.map((control) => {
      const removed = control.boundIndex >= 0 && options.removedBounds.has(`${block.name}:${control.boundIndex}`);
      const bound = removed ? undefined : control.boundIndex >= 0 ? editedRects[control.boundIndex] : options.addedBounds[ckey(control)];
      return bound
        ? { left: bound.left, top: bound.top, right: bound.right, bottom: bound.bottom }
        : { left: 0, top: 0, right: 0, bottom: 0 };
    });
    const extra = [
      ...editedRects.filter((bound) => bound.index >= block.controls.length && !options.removedBounds.has(`${block.name}:${bound.index}`)),
      ...(options.extraBounds[block.name] ?? []),
    ].map(({ left, top, right, bottom }) => ({ left, top, right, bottom }));
    if (!extra.length) {
      const zero = (rect: { left: number; top: number; right: number; bottom: number; }) => !rect.left && !rect.top && !rect.right && !rect.bottom;
      while (inputs.length && zero(inputs[inputs.length - 1]!)) inputs.pop();
    }

    boundsByName.set(boundFile.toLowerCase(), { name: boundFile, data: writeBounds([...inputs, ...extra]) });
  }

  const sprites = new Map<string, Uint8Array>();
  const touchedSprites = new Set([...Object.keys(options.spriteFrames), ...Object.keys(options.spritePositions)]);
  for (const lower of touchedSprites) {
    if (options.newSprites[lower]) {
      continue;
    }

    const entry = archive.entries.find((candidate) => candidate.name.toLowerCase() === lower);
    const frames = options.spriteFrames[lower] ?? (entry ? decodeSpriteFrames(options.file, entry.name) : []);
    const bytes = encodeSprite(frames, options.spritePositions[lower], lower);
    if (bytes) {
      sprites.set(lower, bytes);
    }
  }

  const entries = archive.entries
    .filter((entry) => !options.removedSprites.has(entry.name.toLowerCase()))
    .map((entry) => {
      const lower = entry.name.toLowerCase();
      if (controlListEntry && lower === controlListEntry.name.toLowerCase()) {
        return { name: entry.name, data: controlListBytes };
      }

      const bounds = boundsByName.get(lower);
      if (bounds) {
        return { name: entry.name, data: bounds.data };
      }

      const sprite = sprites.get(lower);
      if (sprite) {
        return { name: entry.name, data: sprite };
      }

      return { name: entry.name, data: readEntry(options.file.buffer, entry) };
    });
  for (const [lower, name] of Object.entries(options.newSprites)) {
    const frames = options.spriteFrames[lower];
    if (!frames?.length) {
      continue;
    }

    const bytes = encodeSprite(frames, options.spritePositions[lower], name);
    if (bytes) {
      entries.push({ name, data: bytes });
    }
  }
  const existing = new Set(archive.entries.map((entry) => entry.name.toLowerCase()));
  for (const [lower, bounds] of boundsByName) {
    if (!existing.has(lower)) {
      entries.push({ name: bounds.name, data: bounds.data });
    }
  }
  return buildArchive(archive.kind, entries, DEFAULT_ENCODING);
}
