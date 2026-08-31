import { FormatError } from './types';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type TokenEncoding = 'base64-utf16be' | 'plain';

// Launch tokens are UTF-16BE without a BOM.
export function utf16beBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes[i * 2] = (unit >> 8) & 0xff;
    bytes[i * 2 + 1] = unit & 0xff;
  }
  return bytes;
}

export function utf16beText(bytes: Uint8Array): string {
  if (bytes.length % 2 !== 0) {
    throw new FormatError(`UTF-16BE payload is ${bytes.length} bytes; an odd length cannot hold whole code units`);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    out += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
  }
  return out;
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += BASE64_ALPHABET[(triple >> 18) & 0x3f] ?? '';
    out += BASE64_ALPHABET[(triple >> 12) & 0x3f] ?? '';
    out += b1 === undefined ? '=' : BASE64_ALPHABET[(triple >> 6) & 0x3f] ?? '';
    out += b2 === undefined ? '=' : BASE64_ALPHABET[triple & 0x3f] ?? '';
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  const trimmed = text.trim().replace(/=+$/, '');
  if (/[^A-Za-z0-9+/]/.test(trimmed)) {
    throw new FormatError('value is not valid Base64');
  }

  const bytes = new Uint8Array(Math.floor((trimmed.length * 3) / 4));
  let accumulator = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    const value = char === undefined ? -1 : BASE64_ALPHABET.indexOf(char);
    if (value < 0) throw new FormatError(`invalid Base64 character at position ${i}`, undefined, i);
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (accumulator >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, out);
}

export function encodeLaunchToken(token: string): string {
  return encodeBase64(utf16beBytes(token));
}

export function decodeLaunchToken(encoded: string): string {
  return utf16beText(decodeBase64(encoded));
}

export function tryDecodeLaunchToken(encoded: string): string | null {
  try {
    return decodeLaunchToken(encoded);
  } catch {
    return null;
  }
}

export function applyTokenEncoding(token: string, encoding: TokenEncoding): string {
  return encoding === 'base64-utf16be' ? encodeLaunchToken(token) : token;
}
