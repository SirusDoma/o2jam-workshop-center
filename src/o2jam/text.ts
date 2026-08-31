
export type O2Encoding = 'ascii' | 'euc-kr' | 'gbk' | 'shift-jis' | 'utf-8';

export interface EncodingInfo {
  id: O2Encoding;
  label: string;
}

export const ENCODINGS: readonly EncodingInfo[] = [
  {
    id: 'euc-kr',
    label: 'Korean (EUC-KR)',
  },
  {
    id: 'ascii',
    label: 'ASCII / Latin-1',
  },
  { id: 'gbk', label: 'Simplified Chinese (GBK)' },
  { id: 'shift-jis', label: 'Japanese (Shift-JIS)' },
  {
    id: 'utf-8',
    label: 'Unicode (UTF-8)',
  },
];

export const DEFAULT_ENCODING: O2Encoding = 'ascii';

// Latin releases use Windows-1252 for the "ascii" label.
const LABELS: Record<O2Encoding, string> = {
  ascii: 'windows-1252',
  'euc-kr': 'euc-kr',
  gbk: 'gbk',
  'shift-jis': 'shift-jis',
  'utf-8': 'utf-8',
};

const decoders = new Map<O2Encoding, TextDecoder | null>();

function decoderFor(encoding: O2Encoding): TextDecoder | null {
  const cached = decoders.get(encoding);
  if (cached !== undefined) return cached;

  let decoder: TextDecoder | null = null;
  try {
    decoder = new TextDecoder(LABELS[encoding], { fatal: false });
  } catch {
    decoder = null;
  }
  decoders.set(encoding, decoder);
  return decoder;
}

function cutAtNul(bytes: Uint8Array): Uint8Array {
  const end = bytes.indexOf(0);
  return end < 0 ? bytes : bytes.subarray(0, end);
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return out;
}

export function decodeText(bytes: Uint8Array, encoding: O2Encoding): string {
  const body = cutAtNul(bytes);
  if (body.length === 0) return '';

  const decoder = decoderFor(encoding);
  return decoder ? decoder.decode(body) : decodeLatin1(body);
}


const fatalDecoders = new Map<O2Encoding, TextDecoder | null>();

function fatalDecoderFor(encoding: O2Encoding): TextDecoder | null {
  const cached = fatalDecoders.get(encoding);
  if (cached !== undefined) return cached;

  let decoder: TextDecoder | null = null;
  try {
    decoder = new TextDecoder(LABELS[encoding], { fatal: true });
  } catch {
    decoder = null;
  }
  fatalDecoders.set(encoding, decoder);
  return decoder;
}

function scripts(text: string) {
  let hangul = 0;
  let kana = 0;
  let halfKana = 0;
  let cjk = 0;
  let symbol = 0;
  let bad = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f)) hangul++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kana++;
    else if (c >= 0xff61 && c <= 0xff9f) halfKana++;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) cjk++;
    else if (
      (c >= 0x2460 && c <= 0x26ff) ||
      (c >= 0x3000 && c <= 0x303f) ||
      (c >= 0x2190 && c <= 0x21ff) ||
      (c >= 0xff01 && c <= 0xff60) ||
      (c >= 0x2018 && c <= 0x201d) ||
      c === 0x00b7 ||
      c === 0x2015 ||
      c === 0x2026 ||
      c === 0x203b
    ) symbol++;
    else if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff) || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) bad++;
  }
  return { hangul, kana, halfKana, cjk, symbol, bad };
}

function latinScore(text: string): number {
  const chars = [...text];
  let score = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!.codePointAt(0) ?? 0;
    if (
      (c >= 0x2018 && c <= 0x201d) ||
      c === 0x2013 ||
      c === 0x2014 ||
      c === 0x2026 ||
      c === 0x20ac ||
      c === 0x00b0 ||
      c === 0x2122 ||
      c === 0x00a9 ||
      c === 0x00ae
    ) {
      score += 4;
    } else if (c >= 0x00c0 && c <= 0x00ff && c !== 0x00d7 && c !== 0x00f7) {
      const letter = (j: number) => /[A-Za-z]/.test(chars[j] ?? '');
      if (letter(i - 1) || letter(i + 1)) score += 2;
    }
  }
  return score;
}

export function detectEncoding(samples: readonly Uint8Array[]): O2Encoding | null {
  const bodies = samples.map(cutAtNul).filter((b) => b.some((byte) => byte > 0x7f));
  if (bodies.length === 0) return null;

  const joined = new Uint8Array(bodies.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const body of bodies) {
    joined.set(body, at);
    at += body.length;
  }

  const utf8 = fatalDecoderFor('utf-8');
  if (utf8) {
    try {
      utf8.decode(joined);
      return 'utf-8';
    } catch {
    }
  }

  let best: { encoding: O2Encoding; score: number } | null = null;
  for (const encoding of ['euc-kr', 'shift-jis', 'gbk'] as const) {
    const decoder = decoderFor(encoding);
    if (!decoder) continue;

    const text = decoder.decode(joined);
    const s = scripts(text);
    let score = 0;
    if (encoding === 'euc-kr') score = s.hangul * 3 + s.cjk + s.symbol;
    else if (encoding === 'shift-jis') score = s.kana * 3 + s.cjk + s.symbol + s.halfKana * 0.25;
    else score = s.cjk * 1.5 + s.symbol * 0.75;
    score -= s.bad * 10;

    if (score > (best?.score ?? 0)) best = { encoding, score };
  }

  if (!best || best.score < 1) return null;

  const plain = decoderFor('ascii');
  if (plain && latinScore(plain.decode(joined)) >= best.score) return null;

  return best.encoding;
}

export interface EncodedText {
  bytes: Uint8Array;
  lossy: boolean;
}

const reverseMaps = new Map<O2Encoding, Map<string, readonly number[]> | null>();

function reverseMapFor(encoding: O2Encoding): Map<string, readonly number[]> | null {
  const cached = reverseMaps.get(encoding);
  if (cached !== undefined) return cached;

  const decoder = decoderFor(encoding);
  if (!decoder) {
    reverseMaps.set(encoding, null);
    return null;
  }

  const map = new Map<string, readonly number[]>();
  const one = new Uint8Array(1);
  const two = new Uint8Array(2);
  for (let b = 0; b < 256; b++) {
    one[0] = b;
    const s = decoder.decode(one);
    if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, [b]);
  }
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    for (let trail = 0x21; trail <= 0xfe; trail++) {
      two[0] = lead;
      two[1] = trail;
      const s = decoder.decode(two);
      if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, [lead, trail]);
    }
  }
  reverseMaps.set(encoding, map);
  return map;
}

export function encodeText(value: string, encoding: O2Encoding): EncodedText {
  if (encoding === 'utf-8') {
    return { bytes: new TextEncoder().encode(value), lossy: false };
  }

  const map = reverseMapFor(encoding);
  const out: number[] = [];
  let lossy = false;
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x7f) {
      out.push(code);
      continue;
    }
    const seq = map?.get(ch);
    if (seq) {
      for (const b of seq) out.push(b);
    } else {
      if (!map && code <= 0xff) out.push(code);
      else out.push(0x3f);
      lossy = true;
    }
  }
  return { bytes: Uint8Array.from(out), lossy };
}
