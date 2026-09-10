import { bytesFromHex, fileOffset, hex, parseHex, type Executable } from './pe.ts';
import { equalValues } from './validation.ts';
import type { HookFixup, HookOperation, Locator, Row, Values } from './types.ts';

type FindLocations = (pe: Executable, at: Locator) => number[];

function rvaAt(pe: Executable, offset: number): number {
  const section = pe.sections.find((s) => offset >= s.offset && offset < s.offset + s.size);

  if (!section) {
    throw new Error('Hook target is outside file-backed sections.');
  }

  return section.rva + offset - section.offset;
}

function readTarget(bytes: Uint8Array, offset: number, address: number, relative: boolean): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return relative ? address + 4 + view.getInt32(offset, true) : view.getUint32(offset, true);
}

function checkRelocations(pe: Executable, target: number, size: number): void {
  const view = new DataView(pe.bytes.buffer, pe.bytes.byteOffset, pe.bytes.byteLength);
  const address = view.getUint32(pe.optional + 136, true);
  const length = view.getUint32(pe.optional + 140, true);

  if (!address || !length) {
    return;
  }

  const start = fileOffset(pe, address, length);

  for (let block = start; block < start + length;) {
    if (block + 8 > start + length) {
      throw new Error('Invalid base relocation block.');
    }

    const page = view.getUint32(block, true);
    const blockSize = view.getUint32(block + 4, true);

    if (blockSize < 8 || blockSize % 2 || block + blockSize > start + length) {
      throw new Error('Invalid base relocation block size.');
    }

    for (let entry = block + 8; entry < block + blockSize; entry += 2) {
      const relocation = view.getUint16(entry, true);
      const type = relocation >>> 12;
      const rva = page + (relocation & 0xfff);
      const width = type === 3 ? 4 : type === 10 ? 8 : 2;

      if (type && rva < target + size && rva + width > target) {
        throw new Error('Hook target overlaps a base relocation; choose a different instruction span.');
      }
    }

    block += blockSize;
  }
}

function fixupTarget(pe: Executable, op: HookOperation, fixup: HookFixup, values: Values, codeRva: number): number {
  const source = fixup.value;

  if ('input' in source) {
    return Number(values[source.input]);
  }

  if ('continuation' in source) {
    return pe.imageBase + op.at.rva! + (op.at.offset ?? 0) + bytesFromHex(op.original).length;
  }

  if ('codeOffset' in source) {
    return pe.imageBase + codeRva + source.codeOffset;
  }

  if ('originalOffset' in source) {
    const address = pe.imageBase + op.at.rva! + (op.at.offset ?? 0) + source.originalOffset;
    return readTarget(bytesFromHex(op.original), source.originalOffset, address, source.read === 'rel32');
  }

  const pattern = bytesFromHex(source.at.signature);
  const start = fileOffset(pe, source.at.rva!, pattern.length);

  if (!pattern.every((byte, i) => pe.bytes[start + i] === byte)) {
    throw new Error('Hook binding changed after matching.');
  }

  const position = source.at.offset ?? 0;
  const address = pe.imageBase + source.at.rva! + position;
  return source.read
    ? readTarget(pe.bytes, start + position, address, source.read === 'rel32')
    : address;
}

export function encodeHook(pe: Executable, op: HookOperation, values: Values, codeRva: number): Uint8Array {
  const code = bytesFromHex(op.code);
  const view = new DataView(code.buffer);

  for (const fixup of op.fixups ?? []) {
    if (fixup.encoding === 'rows-u32le') {
      const rows = 'input' in fixup.value ? values[fixup.value.input] : undefined;
      if (!Array.isArray(rows) || rows.length > fixup.capacity!) throw new Error('Invalid hook row count.');
      const fields = fixup.fields!;
      code.fill(0, fixup.offset, fixup.offset + 4 + fixup.capacity! * fields.length * 4);
      view.setUint32(fixup.offset, rows.length, true);
      rows.forEach((row, i) => fields.forEach((field, j) => {
        const value = row[field];
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
          throw new Error('Hook row values must be unsigned 32-bit integers.');
        }
        view.setUint32(fixup.offset + 4 + (i * fields.length + j) * 4, value, true);
      }));
      continue;
    }
    let value = fixupTarget(pe, op, fixup, values, codeRva);

    if (fixup.encoding === 'rel32') {
      value -= pe.imageBase + codeRva + (fixup.relativeTo ?? fixup.offset + 4);

      if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
        throw new Error('Hook branch is outside the rel32 range.');
      }

      view.setInt32(fixup.offset, value, true);
    } else {
      const max = fixup.encoding === 'u8' ? 0xff : 0xffffffff;

      if (!Number.isSafeInteger(value) || value < 0 || value > max) {
        throw new Error('Hook value exceeds its storage range.');
      }

      if (fixup.encoding === 'u8') {
        view.setUint8(fixup.offset, value);
      } else {
        view.setUint32(fixup.offset, value, true);
      }
    }
  }

  return code;
}

export function hookJump(pe: Executable, op: HookOperation, codeRva: number): Uint8Array {
  const bytes = new Uint8Array(bytesFromHex(op.original).length).fill(0x90);
  const relative = codeRva - op.at.rva! - (op.at.offset ?? 0) - 5;

  if (relative < -0x80000000 || relative > 0x7fffffff) {
    throw new Error('Hook destination is outside the rel32 range.');
  }

  bytes[0] = 0xe9;
  new DataView(bytes.buffer).setInt32(1, relative, true);
  return bytes;
}

export function checkHook(pe: Executable, op: HookOperation): void {
  const expected = bytesFromHex(op.matchedBytes!);
  const offset = fileOffset(pe, op.at.rva! + (op.at.offset ?? 0), expected.length);

  if (!expected.every((byte, i) => pe.bytes[offset + i] === byte)) {
    throw new Error('Hook source changed after matching.');
  }

  if (op.payloadRva !== undefined) {
    const code = bytesFromHex(op.matchedCode!);
    const start = fileOffset(pe, op.payloadRva, code.length);

    if (!code.every((byte, i) => pe.bytes[start + i] === byte)) {
      throw new Error('Hook payload changed after matching.');
    }
  }
}

export function resolveHook(
  pe: Executable,
  source: HookOperation,
  defaults: Values,
  find: FindLocations
): { operation: HookOperation; values: Values } {
  const original = parseHex(source.original, true);
  const pattern = parseHex(source.at.signature, true);
  const position = source.at.offset ?? 0;
  pattern.fill(null, position, position + original.length);
  const signature = pattern.map((b) => b === null ? '??' : b.toString(16).padStart(2, '0')).join(' ');
  const fixups = (source.fixups ?? []).map((fixup): HookFixup => {
    if (!('at' in fixup.value)) {
      return fixup;
    }

    const at = fixup.value.at;
    const locations = find(pe, at);

    if (locations.length !== 1) {
      throw new Error('Hook binding needs one signature match.');
    }

    const offset = locations[0]!;
    const size = parseHex(at.signature, true).length;
    return {
      ...fixup,
      value: {
        ...fixup.value,
        at: { ...at, rva: rvaAt(pe, offset), signature: hex(pe.bytes.subarray(offset, offset + size)) },
      },
    };
  });
  const candidates: { operation: HookOperation; values: Values }[] = [];

  for (const start of find(pe, { ...source.at, signature })) {
    const rva = rvaAt(pe, start);
    checkRelocations(pe, rva + position, original.length);
    const target = fileOffset(pe, rva + position, original.length);
    const current = pe.bytes.subarray(target, target + original.length);
    const operation: HookOperation = {
      ...source,
      at: { ...source.at, rva, signature },
      fixups,
      matchedBytes: hex(current),
    };

    if (original.every((byte, i) => byte === null || current[i] === byte)) {
      candidates.push({ operation: { ...operation, original: hex(current) }, values: {} });
      continue;
    }

    if (current[0] !== 0xe9 || current.subarray(5).some((byte) => byte !== 0x90)) {
      continue;
    }

    try {
      const displacement = new DataView(current.buffer, current.byteOffset).getInt32(1, true);
      const payloadRva = rva + position + 5 + displacement;
      const codeSize = bytesFromHex(source.code).length;
      const payloadStart = fileOffset(pe, payloadRva, codeSize + original.length);
      const section = pe.sections.find((section) => payloadStart >= section.offset && payloadStart < section.offset + section.size)!;
      const flags = new DataView(pe.bytes.buffer, pe.bytes.byteOffset).getUint32(section.header + 36, true);

      if (source.writable && (flags & 0x80000000) === 0) {
        continue;
      }

      const saved = pe.bytes.subarray(payloadStart + codeSize, payloadStart + codeSize + original.length);

      if (!original.every((byte, i) => byte === null || saved[i] === byte)) {
        continue;
      }

      operation.original = hex(saved);
      operation.payloadRva = payloadRva;
      operation.matchedCode = hex(pe.bytes.subarray(payloadStart, payloadStart + codeSize + original.length));
      const values: Values = {};
      const view = new DataView(pe.bytes.buffer, pe.bytes.byteOffset + payloadStart, codeSize);

      for (const fixup of fixups) {
        if ('input' in fixup.value) {
          const input = fixup.value.input;
          if (fixup.encoding === 'rows-u32le') {
            const count = view.getUint32(fixup.offset, true);
            if (count > fixup.capacity!) throw new Error('Hook row count exceeds capacity.');
            const fields = fixup.fields!;
            const rows: Row[] = Array.from({ length: count }, (_, i) => Object.fromEntries(
              fields.map((field, j) => [field, view.getUint32(fixup.offset + 4 + (i * fields.length + j) * 4, true)])
            ));
            if (input in values && !equalValues(values[input], rows)) throw new Error('Hook input copies disagree.');
            values[input] = rows;
            continue;
          }
          const value = fixup.encoding === 'u8'
            ? view.getUint8(fixup.offset)
            : view.getUint32(fixup.offset, true);

          if (typeof defaults[input] === 'boolean' && value > 1) {
            throw new Error('Hook contains an invalid checkbox value.');
          }

          const decoded = typeof defaults[input] === 'boolean' ? Boolean(value) : value;

          if (input in values && values[input] !== decoded) {
            throw new Error('Hook input copies disagree.');
          }

          values[input] = decoded;
        }
      }

      const expected = encodeHook(pe, operation, { ...defaults, ...values }, payloadRva);

      if (expected.every((byte, i) => pe.bytes[payloadStart + i] === byte)) {
        candidates.push({ operation, values });
      }
    } catch {
      continue;
    }
  }

  if (candidates.length !== 1) {
    throw new Error(candidates.length ? 'Hook has multiple matches.' : 'Hook signature or original bytes were not found.');
  }

  return candidates[0]!;
}
