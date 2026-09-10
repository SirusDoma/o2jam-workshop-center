export type StringEncoding = 'ascii' | 'utf16le' | 'euc-kr';

let koreanCharacters: Map<string, number> | undefined;

function koreanTable(): Map<string, number> {
  if (koreanCharacters) {
    return koreanCharacters;
  }

  const table = new Map<string, number>();
  const decoder = new TextDecoder('euc-kr', { fatal: true });

  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x41; trail <= 0xfe; trail++) {
      try {
        const character = decoder.decode(Uint8Array.of(lead, trail));

        if (character.length === 1 && !table.has(character)) {
          table.set(character, (lead << 8) | trail);
        }
      } catch {
        continue;
      }
    }
  }

  koreanCharacters = table;
  return table;
}

export function decodeString(bytes: Uint8Array, encoding: StringEncoding = 'ascii'): string {
  if (encoding === 'ascii' && bytes.some((byte) => byte > 126)) {
    throw new Error('String pointer does not reference ASCII text.');
  }

  const text = new TextDecoder(encoding === 'ascii' ? 'utf-8' : encoding, {
    fatal: true,
  }).decode(bytes);

  if (!text || /[\x00-\x1f\x7f-\x9f]/.test(text)) {
    throw new Error('String pointer does not reference printable text.');
  }

  return text;
}

export function stringBytes(text: string, encoding: StringEncoding = 'ascii'): Uint8Array {
  if (/[\x00-\x1f\x7f-\x9f]/.test(text)) {
    throw new Error('Strings must contain printable text.');
  }

  if (encoding === 'utf16le') {
    const bytes = new Uint8Array((text.length + 1) * 2);
    const view = new DataView(bytes.buffer);

    for (let i = 0; i < text.length; i++) {
      view.setUint16(i * 2, text.charCodeAt(i), true);
    }

    return bytes;
  }

  const bytes: number[] = [];

  for (const character of text) {
    const code = character.charCodeAt(0);

    if (code < 127) {
      bytes.push(code);
    } else if (encoding === 'euc-kr') {
      const pair = koreanTable().get(character);

      if (pair === undefined) {
        throw new Error(`This client cannot encode ${character} in EUC-KR.`);
      }

      bytes.push(pair >> 8, pair & 0xff);
    } else {
      throw new Error('This client string supports ASCII characters only.');
    }
  }

  return Uint8Array.from([...bytes, 0]);
}
