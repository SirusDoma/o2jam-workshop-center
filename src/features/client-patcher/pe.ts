export interface PeSection {
  name: string;
  rva: number;
  virtualSize: number;
  offset: number;
  size: number;
  header: number;
}

export interface Executable {
  bytes: Uint8Array;
  peOffset: number;
  optional: number;
  imageBase: number;
  entryPoint: number;
  imageSize: number;
  headerSize: number;
  fileAlignment: number;
  sectionAlignment: number;
  sections: PeSection[];
}

export function readExecutable(bytes: Uint8Array): Executable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (ok: boolean, message: string) => {
    if (!ok) {
      throw new Error(message);
    }
  };
  check(
    bytes.length >= 64 && view.getUint16(0, true) === 0x5a4d,
    'Choose a Windows executable (MZ header missing).'
  );
  const peOffset = view.getUint32(60, true);
  check(peOffset >= 64 && peOffset + 24 <= bytes.length, 'Invalid PE header offset.');
  check(view.getUint32(peOffset, true) === 0x4550, 'Invalid PE signature.');
  check(view.getUint16(peOffset + 4, true) === 0x14c, 'Only 32-bit x86 clients are supported.');
  const count = view.getUint16(peOffset + 6, true);
  const optionalSize = view.getUint16(peOffset + 20, true);
  const optional = peOffset + 24;
  check(
    count > 0 &&
      count < 96 &&
      optionalSize >= 224 &&
      optional + optionalSize + count * 40 <= bytes.length,
    'Invalid PE section table.'
  );
  check(view.getUint16(optional, true) === 0x10b, 'Only PE32 clients are supported.');
  const headerSize = view.getUint32(optional + 60, true);
  const fileAlignment = view.getUint32(optional + 36, true);
  const sectionAlignment = view.getUint32(optional + 32, true);
  const powerOfTwo = (n: number) => n > 0 && n <= 0x100000 && (n & (n - 1)) === 0;
  check(
    powerOfTwo(fileAlignment) && powerOfTwo(sectionAlignment) && sectionAlignment >= fileAlignment,
    'Invalid PE alignment.'
  );
  check(
    headerSize >= optional + optionalSize + count * 40 && headerSize <= bytes.length,
    'Invalid PE header size.'
  );
  const sections: PeSection[] = [];

  for (let i = 0; i < count; i++) {
    const header = optional + optionalSize + i * 40;
    const name = new TextDecoder().decode(bytes.subarray(header, header + 8)).replace(/\0.*$/, '');
    const virtualSize = view.getUint32(header + 8, true);
    const rva = view.getUint32(header + 12, true);
    const size = view.getUint32(header + 16, true);
    const offset = view.getUint32(header + 20, true);
    check(
      !size || (offset >= headerSize && offset + size <= bytes.length),
      `Invalid ${name} section bounds.`
    );
    check(
      rva >= headerSize && rva + Math.max(size, virtualSize) <= 0xffffffff,
      `Invalid ${name} virtual address.`
    );

    for (const section of sections) {
      check(
        !size ||
          !section.size ||
          offset >= section.offset + section.size ||
          section.offset >= offset + size,
        'Overlapping PE sections.'
      );
      check(
        rva >= section.rva + Math.max(section.size, section.virtualSize) ||
          section.rva >= rva + Math.max(size, virtualSize),
        'Overlapping virtual sections.'
      );
    }

    sections.push({ name, rva, virtualSize, offset, size, header });
  }

  return {
    bytes,
    peOffset,
    optional,
    headerSize,
    fileAlignment,
    sectionAlignment,
    sections,
    imageBase: view.getUint32(optional + 28, true),
    entryPoint: view.getUint32(optional + 16, true),
    imageSize: view.getUint32(optional + 56, true),
  };
}

export function fileOffset(pe: Executable, rva: number, length = 1): number {
  if (!Number.isSafeInteger(rva) || !Number.isSafeInteger(length) || rva < 0 || length < 0) {
    throw new Error('Invalid address.');
  }

  const section = pe.sections.find((s) => rva >= s.rva && rva + length <= s.rva + s.size);

  if (!section) {
    throw new Error(`Address 0x${rva.toString(16)} is outside file-backed sections.`);
  }

  return section.offset + rva - section.rva;
}

export function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase();
}

export function parseHex(value: string, wildcards = false, maxBytes = 4096): (number | null)[] {
  const tokens = value.trim().split(/\s+/);

  if (
    !value.trim() ||
    tokens.length > maxBytes ||
    tokens.some((v) => !/^[0-9a-f]{2}$/i.test(v) && !(wildcards && v === '??'))
  ) {
    throw new Error('Bytes must be space-separated hex pairs (?? is allowed in signatures).');
  }

  return tokens.map((v) => (v === '??' ? null : Number.parseInt(v, 16)));
}

export function bytesFromHex(value: string, maxBytes = 4096): Uint8Array {
  return Uint8Array.from(parseHex(value, false, maxBytes) as number[]);
}
