import { bytesFromHex, hex, parseHex, type Executable } from './pe.ts';
import { equalValues } from './validation.ts';
import type { InputDefinition, Locator, Operation, PatchVariant, Value } from './types.ts';
import { decodeString, type StringEncoding } from './strings.ts';
import { resolveHook } from './hooks.ts';

export function findLocations(pe: Executable, at: Locator): number[] {
  const pattern = parseHex(at.signature, true);
  const first = pattern.findIndex((byte) => byte !== null);
  const result: number[] = [];

  for (const section of pe.sections) {
    if (at.section && section.name !== at.section) {
      continue;
    }

    const end = section.offset + section.size - pattern.length;
    let start = section.offset;

    while (start <= end) {
      const found = pe.bytes.indexOf(pattern[first]!, start + first);
      const offset = found - first;

      if (found < 0 || offset > end) {
        break;
      }

      if (pattern.every((byte, i) => byte === null || pe.bytes[offset + i] === byte)) {
        result.push(offset);
      }

      start = offset + 1;
    }
  }

  return result;
}

function rvaAt(pe: Executable, offset: number): number {
  const section = pe.sections.find((s) => offset >= s.offset && offset < s.offset + s.size);

  if (!section) {
    throw new Error('Target is outside file-backed sections.');
  }

  return section.rva + offset - section.offset;
}

function readString(pe: Executable, address: number, encoding: StringEncoding = 'ascii'): string {
  const rva = address - pe.imageBase;
  const section = pe.sections.find((s) => rva >= s.rva && rva < s.rva + s.size);

  if (!section) {
    throw new Error('String pointer is outside file-backed sections.');
  }

  const start = section.offset + rva - section.rva;
  const width = encoding === 'utf16le' ? 2 : 1;
  const end = Math.min(section.offset + section.size, start + 4096 * width);

  for (let offset = start; offset + width <= end; offset += width) {
    const code = pe.bytes[offset]! | (width === 2 ? pe.bytes[offset + 1]! << 8 : 0);

    if (code === 0) {
      return decodeString(pe.bytes.subarray(start, offset), encoding);
    }
  }

  throw new Error('String is not terminated inside its section.');
}

function resolveString(
  pe: Executable,
  op: Extract<Operation, { type: 'string' }>
): (Extract<Operation, { type: 'string' }> & { original: string })[] {
  const view = new DataView(pe.bytes.buffer, pe.bytes.byteOffset, pe.bytes.byteLength);
  const groups: { address: number; original: string; at: Locator }[][] = [];

  for (const reference of op.references) {
    const pattern = parseHex(reference.signature, true);
    const position = reference.offset ?? 0;
    pattern.fill(null, position, position + 4);

    if (pattern.every((byte) => byte === null)) {
      throw new Error('String reference needs callsite instructions outside its pointer.');
    }

    const signature = pattern
      .map((byte) => byte === null ? '??' : byte.toString(16).padStart(2, '0'))
      .join(' ');
    const candidates = [];

    for (const start of findLocations(pe, { ...reference, signature })) {
      const address = view.getUint32(start + position, true);

      try {
        candidates.push({
          address,
          original: readString(pe, address, op.encoding),
          at: {
            ...reference,
            rva: rvaAt(pe, start),
            signature: hex(pe.bytes.subarray(start, start + pattern.length)),
          },
        });
      } catch {
        continue;
      }
    }

    if (!candidates.length) {
      throw new Error('String callsite or its referenced text was not found.');
    }

    groups.push(candidates);
  }

  const addresses = new Set(groups[0]!.map((candidate) => candidate.address));

  for (const group of groups) {
    for (const address of addresses) {
      if (!group.some((candidate) => candidate.address === address)) {
        addresses.delete(address);
      }
    }
  }

  if (addresses.size !== 1) {
    throw new Error(
      addresses.size
        ? 'String callsites match multiple targets.'
        : 'String callsites do not reference the same target.'
    );
  }

  const address = [...addresses][0]!;
  const references = new Map<number, Locator>();

  for (const group of groups) {
    for (const candidate of group) {
      if (candidate.address === address) {
        references.set(candidate.at.rva! + (candidate.at.offset ?? 0), candidate.at);
      }
    }
  }

  const pointer = new Uint8Array(4);
  new DataView(pointer.buffer).setUint32(0, address, true);

  if (op.referenceScope !== 'listed') {
    for (const offset of findLocations(pe, { signature: hex(pointer) })) {
      const rva = rvaAt(pe, offset);

      if (!references.has(rva)) {
        throw new Error(`String has an unmatched reference at 0x${rva.toString(16)}.`);
      }
    }
  }

  const original = readString(pe, address, op.encoding);
  let value = op.value;

  if (value.part === 'origin') {
    const url = original.match(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)(.*)$/i);

    if (!url) {
      throw new Error('String callsite does not reference a URL.');
    }

    value = { input: value.input, suffix: url[2]! };
  }

  return [{
    ...op,
    original,
    value,
    sourceRva: address - pe.imageBase,
    references: [...references.values()],
  }];
}

export function resolveVariant(pe: Executable, variant: PatchVariant, inputs: InputDefinition[]): PatchVariant {
  const operations: Operation[] = [];
  const defaults = { ...variant.defaults };
  const discovered = new Map<string, Value>();
  const hookValues = new Map<string, Value>();

  for (const op of variant.operations) {
    if (op.type === 'hook') {
      const resolved = resolveHook(pe, op, defaults, findLocations);

      for (const [input, value] of Object.entries(resolved.values)) {
        if (hookValues.has(input) && !equalValues(hookValues.get(input), value)) {
          throw new Error(`Hook input copies disagree for ${input}.`);
        }

        hookValues.set(input, value);
        defaults[input] = value;
      }

      operations.push(resolved.operation);
      continue;
    }
    if (op.type === 'string') {
      const resolved = resolveString(pe, op);

      for (const target of resolved) {
        const { input, prefix = '', suffix = '' } = target.value;
        if (!target.original.startsWith(prefix) || !target.original.endsWith(suffix)) {
          throw new Error('Matched string does not fit its value template.');
        }

        const text = target.original.slice(prefix.length, target.original.length - suffix.length);
        const value = inputs.find((field) => field.id === input)?.control === 'number'
          ? (text.trim() ? Number(text) : NaN)
          : text;

        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new Error(`String callsite does not contain a number for ${input}.`);
        }

        if (discovered.has(input) && !equalValues(discovered.get(input), value)) {
          throw new Error(`String callsites contain different values for ${input}.`);
        }
        if (hookValues.has(input) && !equalValues(hookValues.get(input), value)) {
          throw new Error(`Captured values disagree for ${input}.`);
        }

        discovered.set(input, value);
        defaults[input] = value;
      }

      operations.push(...resolved);
      continue;
    }

    const original = parseHex(op.original, op.type === 'bytes');
    const replacement = op.type === 'bytes' ? parseHex(op.replacement, true) : undefined;
    const at = { ...op.at };

    if (op.type === 'value' && op.readCurrent) {
      const pattern = parseHex(at.signature, true);
      pattern.fill(null, at.offset ?? 0, (at.offset ?? 0) + op.size);
      at.signature = pattern.map((byte) => byte === null ? '??' : byte.toString(16).padStart(2, '0')).join(' ');
    }

    const matches = findLocations(pe, at).filter((start) => {
      if (op.type === 'value' && op.readCurrent) {
        return true;
      }

      const target = start + (op.at.offset ?? 0);
      const matchesBytes = (bytes: (number | null)[]) =>
        bytes.every((byte, i) => byte === null || pe.bytes[target + i] === byte);

      return matchesBytes(original) || (replacement && matchesBytes(replacement));
    });

    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? 'Signature and target bytes have multiple matches.'
          : 'Signature or expected target bytes were not found.'
      );
    }

    const start = matches[0]!;
    const size = original.length;
    const target = start + (op.at.offset ?? 0);
    const section = pe.sections.find((s) => start >= s.offset && start < s.offset + s.size)!;

    if (target + size > section.offset + section.size) {
      throw new Error('Write exceeds its section.');
    }

    const resolved = { ...op, at: { ...at, rva: rvaAt(pe, start) } };

    if (resolved.type === 'bytes') {
      resolved.original = hex(Uint8Array.from(original.map((byte, i) => byte ?? pe.bytes[target + i]!)));
      resolved.replacement = hex(Uint8Array.from(replacement!.map((byte, i) => byte ?? pe.bytes[target + i]!)));
    } else if (resolved.readCurrent) {
      const view = new DataView(pe.bytes.buffer, pe.bytes.byteOffset + target, resolved.size);
      const value = resolved.encoding === 'u8' ? view.getUint8(0)
        : resolved.encoding === 'u16le' ? view.getUint16(0, true)
        : resolved.encoding === 'f32le' ? view.getFloat32(0, true)
        : view.getUint32(0, true);
      const input = resolved.value.input;

      if (hookValues.has(input) && !equalValues(hookValues.get(input), value) ||
          discovered.has(input) && !equalValues(discovered.get(input), value)) {
        throw new Error(`Captured values disagree for ${input}.`);
      }

      hookValues.set(input, value);
      defaults[input] = value;
      resolved.original = hex(pe.bytes.subarray(target, target + resolved.size));
    }

    operations.push(resolved);
  }

  return { ...variant, defaults, operations };
}

export function operationKey(op: Operation): string {
  if (op.type === 'hook') {
    const { at, matchedBytes, matchedCode, payloadRva, ...rest } = op;
    return stableKey({ ...rest, target: at.rva! + (at.offset ?? 0) });
  }

  if (op.type === 'string') {
    return stableKey({
      type: op.type,
      source: op.sourceRva,
      original: op.original,
      value: op.value,
      encoding: op.encoding ?? 'ascii',
      when: op.when,
      references: op.references.map((r) => r.rva! + (r.offset ?? 0)).sort((a, b) => a - b),
    });
  }

  const { at, ...rest } = op;
  return stableKey({ ...rest, target: at.rva! + (at.offset ?? 0) });
}

function stableKey(value: unknown): string {
  return JSON.stringify(value, (_, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }

    return item;
  });
}
