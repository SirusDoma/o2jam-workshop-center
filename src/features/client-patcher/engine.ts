import { align, bytesFromHex, fileOffset, parseHex, type Executable } from './pe.ts';
import { operationKey, resolveVariant } from './matching.ts';
import { equalValues, matches, validateValues } from './validation.ts';
import { stringBytes } from './strings.ts';
import { checkHook, encodeHook, hookJump } from './hooks.ts';
import type {
  CompatiblePatch,
  Locator,
  Operation,
  PatchDefinition,
  Selection,
  ValueSource,
  Values,
  Write,
} from './types.ts';

const encoder = new TextEncoder();
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);
const slice = (pe: Executable, offset: number, size: number) => {
  if (offset < pe.headerSize || offset + size > pe.bytes.length) {
    throw new Error('Write is outside executable data.');
  }

  return pe.bytes.slice(offset, offset + size);
};

function locate(pe: Executable, at: Locator, size: number): number {
  if (at.rva === undefined) {
    throw new Error('Patch target has not been resolved.');
  }

  const pattern = parseHex(at.signature, true);
  const start = fileOffset(pe, at.rva, pattern.length);
  const offset = start + (at.offset ?? 0);
  const section = pe.sections.find((s) => start >= s.offset && start < s.offset + s.size)!;

  if (at.section && section.name !== at.section) {
    throw new Error('Patch target is in a different section.');
  }

  if (!pattern.every((byte, i) => byte === null || pe.bytes[start + i] === byte)) {
    throw new Error('Patch signature changed after matching.');
  }

  if (offset + size > section.offset + section.size) {
    throw new Error('Write exceeds its section.');
  }

  return offset;
}

function uint32(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('Address exceeds PE32 limits.');
  }

  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);

  return bytes;
}

function sourceValue(source: ValueSource, values: Values): string | number | boolean {
  const value = values[source.input];

  if (Array.isArray(value)) throw new Error('Row inputs require a row hook fixup.');

  if (value === undefined) {
    throw new Error(`Missing input: ${source.input}`);
  }

  return source.prefix !== undefined || source.suffix !== undefined
    ? `${source.prefix ?? ''}${value}${source.suffix ?? ''}`
    : value;
}

function encodeValue(op: Extract<Operation, { type: 'value' }>, values: Values): Uint8Array {
  const value = sourceValue(op.value, values);
  let encoded: Uint8Array;

  if (op.encoding === 'hex') {
    encoded = bytesFromHex(String(value));
  } else if (op.encoding === 'ascii' || op.encoding === 'utf16le') {
    encoded = stringBytes(String(value), op.encoding);
  } else {
    const number = op.encoding.startsWith('length') ? String(value).length : value;

    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new Error('A numeric operation requires a finite number.');
    }

    let width = 4;

    if (op.encoding.endsWith('8')) {
      width = 1;
    } else if (op.encoding.endsWith('16le')) {
      width = 2;
    }

    if (op.size !== width) {
      throw new Error('Numeric storage size does not match its encoding.');
    }

    encoded = new Uint8Array(width);
    const view = new DataView(encoded.buffer);

    if (op.encoding === 'f32le') {
      view.setFloat32(0, number, true);

      if (!Number.isFinite(view.getFloat32(0, true))) {
        throw new Error('Number exceeds float32 range.');
      }
    } else {
      if (!Number.isInteger(number) || number < 0 || number >= 2 ** (width * 8)) {
        throw new Error('Number exceeds integer storage range.');
      }

      if (width === 1) {
        view.setUint8(0, number);
      } else if (width === 2) {
        view.setUint16(0, number, true);
      } else {
        view.setUint32(0, number, true);
      }
    }
  }

  if (encoded.length > op.size) {
    throw new Error('Value exceeds its allocated storage.');
  }

  const result = new Uint8Array(op.size);
  result.set(encoded);

  return result;
}

function checkOperation(pe: Executable, op: Operation): boolean {
  if (op.type === 'hook') {
    checkHook(pe, op);
    return op.payloadRva !== undefined;
  }

  if (op.type === 'string') {
    if (op.original === undefined) {
      throw new Error('String value has not been resolved.');
    }

    const expected = stringBytes(op.original, op.encoding);
    if (op.sourceRva === undefined) {
      throw new Error('String target has not been resolved.');
    }

    const offset = fileOffset(pe, op.sourceRva, expected.length);

    if (!same(slice(pe, offset, expected.length), expected)) {
      throw new Error('Original string does not match.');
    }

    for (const reference of op.references) {
      const offset = locate(pe, reference, 4);

      if (!same(slice(pe, offset, 4), uint32(pe.imageBase + op.sourceRva))) {
        throw new Error('String reference does not match.');
      }
    }

    return false;
  }

  const original = bytesFromHex(op.original);
  const current = slice(pe, locate(pe, op.at, original.length), original.length);

  if (same(current, original)) {
    return false;
  }

  if (op.type === 'bytes' && same(current, bytesFromHex(op.replacement))) {
    return true;
  }

  throw new Error('Patch target contains unexpected bytes.');
}

export interface PatchInspection {
  compatible: CompatiblePatch[];
  unavailable: { definition: PatchDefinition; reasons: string[] }[];
}

export function inspectDefinitions(pe: Executable, definitions: PatchDefinition[]): PatchInspection {
  const compatible: CompatiblePatch[] = [];
  const unavailable: PatchInspection['unavailable'] = [];

  for (const definition of definitions) {
    const candidates: CompatiblePatch[] = [];
    const reasons = new Set<string>();

    for (const source of definition.variants) {
      try {
        const variant = resolveVariant(pe, {
          ...source,
          defaults: {
            ...Object.fromEntries(definition.inputs
              .filter((input) => input.default !== undefined)
              .map((input) => [input.id, input.default!])),
            ...source.defaults,
          },
        }, definition.inputs);
        const values = {
          ...Object.fromEntries(definition.inputs
            .filter((input) => input.default !== undefined)
            .map((input) => [input.id, input.default!])),
          ...variant.defaults,
        };

        for (const op of variant.operations) {
          const applied = checkOperation(pe, op);

          if ((op.type === 'bytes' || op.type === 'hook') && op.when && 'input' in op.when && 'equals' in op.when) {
            if (applied) {
              values[op.when.input] = op.when.equals;
            }
          } else if (applied && !matches(op.when, values)) {
            throw new Error('Unrecognized patch input state.');
          }
        }

        validateValues(definition.inputs, values);
        let identified = false;
        const client = source.client;

        try {
          identified = client.version !== '*' &&
            client.entryPoint === pe.entryPoint &&
            client.imageBase === pe.imageBase &&
            Boolean(client.anchors?.length) &&
            client.anchors!.every((anchor) => {
              const bytes = bytesFromHex(anchor.bytes);
              return same(slice(pe, fileOffset(pe, anchor.rva, bytes.length), bytes.length), bytes);
            });
        } catch {
          identified = false;
        }

        candidates.push({
          definition,
          variant: { ...variant, client: identified ? client : { version: '*' } },
          values,
        });
      } catch (error) {
        reasons.add(error instanceof Error ? error.message : 'Could not match definition.');
      }
    }

    const selected = candidates[0];

    if (!selected) {
      unavailable.push({ definition, reasons: [...reasons] });
      continue;
    }

    const key = (patch: CompatiblePatch) => JSON.stringify({
      values: definition.inputs.map((input) => patch.values[input.id]),
      operations: patch.variant.operations.map(operationKey).sort(),
    });
    const equivalent = candidates.every((candidate) => key(candidate) === key(selected));
    const stringsOnly = candidates.every((candidate) =>
      candidate.variant.operations.every((op) => op.type === 'string') &&
      definition.inputs.every((input) => equalValues(candidate.values[input.id], selected.values[input.id]))
    );

    if (!equivalent && !stringsOnly) {
      unavailable.push({ definition, reasons: ['Matching variants disagree on the changes.'] });
      continue;
    }

    const operations = new Map<string, Operation>();

    for (const candidate of candidates) {
      for (const op of candidate.variant.operations) {
        operations.set(operationKey(op), op);
      }
    }

    const pointers = new Set<number>();
    let overlap = false;

    if (!equivalent && stringsOnly) {
      for (const op of operations.values()) {
        if (op.type !== 'string') {
          continue;
        }

        for (const reference of op.references) {
          const target = reference.rva! + (reference.offset ?? 0);
          overlap ||= pointers.has(target);
          pointers.add(target);
        }
      }
    }

    if (overlap) {
      unavailable.push({ definition, reasons: ['Matching variants disagree on string references.'] });
      continue;
    }

    const versions = new Set(candidates.map((candidate) => candidate.variant.client.version));
    versions.delete('*');
    compatible.push({
      ...selected,
      variant: {
        ...selected.variant,
        client: { version: versions.size === 1 ? [...versions][0]! : '*' },
        operations: equivalent ? selected.variant.operations : [...operations.values()],
      },
    });
  }

  return { compatible, unavailable };
}

export function inspectPatches(pe: Executable, definitions: PatchDefinition[]): CompatiblePatch[] {
  return inspectDefinitions(pe, definitions).compatible;
}

export interface PatchPlan {
  pe: Executable;
  writes: Write[];
  strings: Uint8Array;
  sectionRva: number;
  executable: boolean;
  writable: boolean;
}

export function createPatchPlan(pe: Executable, selections: Selection[]): PatchPlan {
  const writes: Write[] = [];
  const chunks: Uint8Array[] = [];
  let stringLength = 0;
  let executable = false;
  let writable = false;
  const sectionRva = align(
    Math.max(pe.imageSize, ...pe.sections.map((s) => s.rva + Math.max(s.size, s.virtualSize))),
    pe.sectionAlignment
  );
  const changed = new Set(
    selections
      .filter(({ patch, values }) =>
        patch.definition.inputs.some(
          (input) => !equalValues(values[input.id], patch.variant.defaults?.[input.id] ?? input.default)
        )
      )
      .map(({ patch }) => patch.definition.id)
  );

  for (const { patch, values: inputs } of selections) {
    const { definition, variant } = patch;
    validateValues(definition.inputs, inputs);

    if (changed.has(definition.id)) {
      for (const required of definition.requires ?? []) {
        if (!changed.has(required)) {
          throw new Error(`${definition.title} requires ${required}.`);
        }
      }

      for (const conflict of definition.conflicts ?? []) {
        if (changed.has(conflict)) {
          throw new Error(`${definition.title} conflicts with ${conflict}.`);
        }
      }
    }

    const local = new Map<number, number>();
    const active = new Set<number>();
    const set = (offset: number, bytes: Uint8Array, enabled: boolean) => {
      slice(pe, offset, bytes.length);
      bytes.forEach((byte, i) => {
        if (enabled && active.has(offset + i)) {
          throw new Error(`${definition.title} has overlapping active operations.`);
        }

        if (enabled) {
          active.add(offset + i);
        }

        local.set(offset + i, byte);
      });
    };

    for (const op of variant.operations) {
      checkOperation(pe, op);

      if (op.type !== 'string') {
        const original = bytesFromHex(op.original);
        set(locate(pe, op.at, original.length), original, false);
      }
    }

    for (const op of variant.operations) {
      if (!matches(op.when, inputs)) {
        continue;
      }

      if (op.type === 'hook') {
        const rva = op.payloadRva ?? sectionRva + stringLength;
        const code = encodeHook(pe, op, inputs, rva);
        set(locate(pe, op.at, bytesFromHex(op.original).length), hookJump(pe, op, rva), true);

        if (op.payloadRva !== undefined) {
          set(fileOffset(pe, op.payloadRva, code.length), code, true);
        } else {
          const original = bytesFromHex(op.original);
          chunks.push(code, original);
          stringLength += code.length + original.length;
          executable = true;
          writable ||= op.writable === true;
        }
      } else if (op.type === 'string') {
        const value = String(sourceValue(op.value, inputs));

        if (value === op.original) {
          continue;
        }

        const encoded = stringBytes(value, op.encoding);
        const address = uint32(pe.imageBase + sectionRva + stringLength);

        for (const reference of op.references) {
          set(locate(pe, reference, 4), address, true);
        }

        chunks.push(encoded);
        stringLength += encoded.length;
      } else {
        const bytes = op.type === 'bytes' ? bytesFromHex(op.replacement) : encodeValue(op, inputs);
        set(locate(pe, op.at, bytes.length), bytes, true);
      }
    }

    const offsets = [...local.keys()]
      .filter((offset) => local.get(offset) !== pe.bytes[offset])
      .sort((a, b) => a - b);

    for (let i = 0; i < offsets.length;) {
      const start = offsets[i]!;
      const bytes: number[] = [];
      let expected = start;

      while (i < offsets.length && offsets[i] === expected) {
        bytes.push(local.get(expected)!);
        i++;
        expected++;
      }

      if (writes.some((w) => start < w.offset + w.after.length && w.offset < expected)) {
        throw new Error(`Conflicting patches overlap at 0x${start.toString(16)}.`);
      }

      writes.push({
        offset: start,
        before: pe.bytes.slice(start, expected),
        after: Uint8Array.from(bytes),
        patchId: definition.id,
      });
    }
  }

  const strings = new Uint8Array(stringLength);
  let offset = 0;

  for (const chunk of chunks) {
    strings.set(chunk, offset);
    offset += chunk.length;
  }

  return { pe, writes, strings, sectionRva, executable, writable };
}

export function applyPatchPlan(plan: PatchPlan): Uint8Array {
  const { pe, writes, strings, sectionRva, executable, writable } = plan;

  if (!writes.length) {
    return pe.bytes.slice();
  }

  const header = pe.sections[pe.sections.length - 1]!.header + 40;
  const rawOffset = align(pe.bytes.length, pe.fileAlignment);
  const rawSize = align(strings.length, pe.fileAlignment);

  if (strings.length > 0) {
    if (
      header + 40 > pe.headerSize ||
      pe.bytes.subarray(header, header + 40).some((byte) => byte !== 0)
    ) {
      throw new Error('This executable has no room for another PE section header.');
    }

    if (sectionRva + strings.length + pe.imageBase > 0xffffffff) {
      throw new Error('New section exceeds PE32 address limits.');
    }

    if (rawOffset + rawSize > 256 * 1024 * 1024) {
      throw new Error('Patched executable exceeds the 256 MB limit.');
    }
  }

  const output = new Uint8Array(strings.length > 0 ? rawOffset + rawSize : pe.bytes.length);
  output.set(pe.bytes);

  for (const write of writes) {
    if (!same(pe.bytes.subarray(write.offset, write.offset + write.before.length), write.before)) {
      throw new Error('The source changed after preview.');
    }

    output.set(write.after, write.offset);
  }

  const view = new DataView(output.buffer);

  if (strings.length > 0) {
    output.set(encoder.encode(executable ? '.patch' : '.rdata2'), header);
    view.setUint32(header + 8, strings.length, true);
    view.setUint32(header + 12, sectionRva, true);
    view.setUint32(header + 16, rawSize, true);
    view.setUint32(header + 20, rawOffset, true);
    view.setUint32(header + 36, executable ? (writable ? 0xe0000020 : 0x60000020) : 0x40000040, true);
    view.setUint16(pe.peOffset + 6, pe.sections.length + 1, true);
    const sizeField = pe.optional + (executable ? 4 : 8);
    view.setUint32(sizeField, view.getUint32(sizeField, true) + rawSize, true);
    view.setUint32(pe.optional + 56, align(sectionRva + strings.length, pe.sectionAlignment), true);
    output.set(strings, rawOffset);
  }

  return output;
}
