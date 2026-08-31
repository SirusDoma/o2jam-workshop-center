import { FormatError } from './types';

export const RSA_P = 251;
export const RSA_Q = 269;
export const RSA_N = RSA_P * RSA_Q;
export const RSA_D = 68711;

export const IDENTITY_P2_E = 54391;
export const MEMORYER_E = 20891;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const SAFE_TOKEN_ALPHABET = '0123456789';

export function modPow(value: number, exp: number, mod: number): number {
  if (mod <= 1) return 0;
  const m = BigInt(mod);
  let result = 1n;
  let base = BigInt(value) % m;
  let e = BigInt(exp);
  while (e > 0n) {
    if (e & 1n) result = (result * base) % m;
    base = (base * base) % m;
    e >>= 1n;
  }
  return Number(result);
}

export function logCeil(value: number, mod: number): number {
  if (value <= 1 || mod <= 1) return 0;
  for (let k = 1; k <= 4096; k++) {
    const raised = Math.pow(value, k);
    if (!Number.isFinite(raised) || raised === mod) return 0;
    if (raised > mod) return k;
  }
  return 0;
}

// The client cipher depends on uint32 overflow.
function mulMod32(a: number, b: number, mod: number): number {
  return (Math.imul(a, b) >>> 0) % mod;
}

function toUint32(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
}

// The client cipher also depends on its floating-point exponentiation bug.
export function bugCompatibleModExp(value: number, exp: number, mod: number): number {
  let current = value % mod;
  let remaining = exp;
  let acc = 1;
  let completed = false;

  while (!completed && current !== 1) {
    const k = logCeil(current, mod);
    if (k === 0) return 0;
    const r = remaining % k;
    remaining = (remaining - r) / k;
    acc = mulMod32(acc, toUint32(Math.pow(current, r)), mod);
    if (remaining === 0) return acc;
    completed = remaining === 1;
    current = toUint32(Math.pow(current, k) % mod);
  }

  return mulMod32(current, acc, mod);
}

function hexDigit(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return 0;
}

// Unpadded client hex makes some byte pairs lossy.
function unpackWord(value: number): [number, number] {
  const hex = value.toString(16);
  return [hexByteAt(hex, 0), hexByteAt(hex, 2)];
}

function hexByteAt(hex: string, offset: number): number {
  const high = hex[offset];
  if (high === undefined) return 0;
  const low = hex[offset + 1];
  if (low === undefined) return hexDigit(high);
  return ((hexDigit(high) << 4) | hexDigit(low)) & 0xff;
}

export interface CipherOptions {
  readonly e: number;
  readonly padByte: number;
  readonly uppercase: boolean;
  readonly bugCompatible: boolean;
  readonly n?: number;
  readonly d?: number;
}

export interface RoundTripResult {
  readonly ok: boolean;
  readonly decrypted: string;
}

export interface Cipher {
  readonly options: Required<CipherOptions>;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  roundTrip(plaintext: string): RoundTripResult;
  generateSafeToken(length: number, rng?: () => number): string;
  hasPreimage(word: number): boolean;
}

const NO_PREIMAGE = -1;

export function createCipher(options: CipherOptions): Cipher {
  const resolved: Required<CipherOptions> = {
    e: options.e,
    padByte: options.padByte,
    uppercase: options.uppercase,
    bugCompatible: options.bugCompatible,
    n: options.n ?? RSA_N,
    d: options.d ?? RSA_D,
  };
  const { e, padByte, uppercase, bugCompatible, n, d } = resolved;
  const pow = bugCompatible ? bugCompatibleModExp : modPow;
  const trimsSpace = padByte === 0x20;

  let preimages: Int32Array | null = null;

  function inverseTable(): Int32Array {
    if (preimages) return preimages;
    const table = new Int32Array(n).fill(NO_PREIMAGE);
    for (let cipher = 0; cipher < n; cipher++) {
      const plain = pow(cipher, d, n);
      if (table[plain] === NO_PREIMAGE) table[plain] = cipher;
    }
    preimages = table;
    return table;
  }

  function hasPreimage(word: number): boolean {
    if (!bugCompatible) return true;
    if (word < 0 || word >= n) return false;
    return (inverseTable()[word] ?? NO_PREIMAGE) !== NO_PREIMAGE;
  }

  function encryptWord(word: number): number {
    if (!bugCompatible) return pow(word, e, n);
    const found = word >= 0 && word < n ? inverseTable()[word] ?? NO_PREIMAGE : NO_PREIMAGE;
    return found !== NO_PREIMAGE ? found : pow(word, e, n);
  }

  function encrypt(plaintext: string): string {
    const raw = TEXT_ENCODER.encode(plaintext);
    const length = raw.length + (raw.length % 2);
    const bytes = new Uint8Array(length);
    bytes.set(raw);
    if (length > raw.length) bytes[raw.length] = padByte;

    let out = '';
    for (let i = 0; i < length; i += 2) {
      const word = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
      out += encryptWord(word).toString(16).padStart(6, '0');
    }
    return uppercase ? out.toUpperCase() : out;
  }

  function decrypt(ciphertext: string): string {
    const text = ciphertext.trim();
    if (text.length % 6 !== 0) {
      throw new FormatError(`encrypted blob is ${text.length} hex digits, which is not a multiple of 6`);
    }

    const bytes = new Uint8Array((text.length / 6) * 2);
    for (let i = 0, out = 0; i < text.length; i += 6, out += 2) {
      const block = text.slice(i, i + 6);
      if (!/^[0-9a-fA-F]{6}$/.test(block)) {
        throw new FormatError(`block ${i / 6} ("${block}") is not six hex digits`, undefined, i);
      }
      const [high, low] = unpackWord(pow(parseInt(block, 16), d, n));
      bytes[out] = high;
      bytes[out + 1] = low;
    }

    let end = bytes.length;
    while (end > 0) {
      const byte = bytes[end - 1];
      if (byte === 0 || (trimsSpace && byte === 0x20)) end--;
      else break;
    }
    return TEXT_DECODER.decode(bytes.subarray(0, end));
  }

  function roundTrip(plaintext: string): RoundTripResult {
    try {
      const decrypted = decrypt(encrypt(plaintext));
      return { ok: decrypted === plaintext, decrypted };
    } catch {
      return { ok: false, decrypted: '' };
    }
  }

  function generateSafeToken(length: number, rng: () => number = Math.random): string {
    if (length <= 0) return '';
    let out = '';
    let previous = -1;
    for (let i = 0; i < length; i++) {
      const pool =
        previous < 0
          ? SAFE_TOKEN_ALPHABET
          : [...SAFE_TOKEN_ALPHABET].filter((c) => hasPreimage((previous << 8) | c.charCodeAt(0))).join('');
      const source = pool.length > 0 ? pool : SAFE_TOKEN_ALPHABET;
      const picked = source[Math.min(source.length - 1, Math.floor(rng() * source.length))] ?? '0';
      out += picked;
      previous = picked.charCodeAt(0);
    }
    return out;
  }

  return { options: resolved, encrypt, decrypt, roundTrip, generateSafeToken, hasPreimage };
}

export const IDENTITY_P2_CIPHER_OPTIONS: CipherOptions = {
  e: IDENTITY_P2_E,
  padByte: 0x00,
  uppercase: true,
  bugCompatible: false,
};

export const MEMORYER_CIPHER_OPTIONS: CipherOptions = {
  e: MEMORYER_E,
  padByte: 0x20,
  uppercase: true,
  bugCompatible: true,
};

const cipherCache = new Map<string, Cipher>();

export function getCipher(options: CipherOptions): Cipher {
  const key = [
    options.e,
    options.padByte,
    options.uppercase,
    options.bugCompatible,
    options.n ?? RSA_N,
    options.d ?? RSA_D,
  ].join(':');
  const existing = cipherCache.get(key);
  if (existing) return existing;
  const created = createCipher(options);
  cipherCache.set(key, created);
  return created;
}

export const identityP2Cipher: Cipher = getCipher(IDENTITY_P2_CIPHER_OPTIONS);
export const memoryerCipher: Cipher = getCipher(MEMORYER_CIPHER_OPTIONS);
