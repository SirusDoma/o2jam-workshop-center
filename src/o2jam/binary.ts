
import { decodeText, encodeText } from './text';
import type { O2Encoding } from './text';

export class FormatError extends Error {
  readonly offset?: number;

  constructor(message: string, offset?: number) {
    super(message);
    this.name = 'FormatError';
    this.offset = offset;
  }
}

export interface LabelledId {
  id: number;
  label: string;
}

export type BinarySource = ArrayBuffer | ArrayBufferView;

export function asBytes(source: BinarySource): Uint8Array {
  if (source instanceof Uint8Array) {
    return source;
  }

  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }

  return new Uint8Array(source);
}


export class ByteReader {
  readonly data: Uint8Array;
  readonly view: DataView;
  private pos = 0;

  constructor(source: BinarySource) {
    this.data = asBytes(source);
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }

  get size(): number {
    return this.data.byteLength;
  }

  tell(): number {
    return this.pos;
  }

  seek(pos: number): this {
    this.pos = pos;
    return this;
  }

  skip(n: number): this {
    this.pos += n;
    return this;
  }

  remaining(): number {
    return Math.max(0, this.size - this.pos);
  }

  eof(): boolean {
    return this.pos >= this.size;
  }

  has(n: number): boolean {
    return this.pos >= 0 && this.pos + n <= this.size;
  }

  private take(n: number): number {
    if (this.pos < 0 || this.pos + n > this.size) {
      throw new FormatError(`read of ${n} byte(s) past end of ${this.size}-byte buffer`, this.pos);
    }

    const at = this.pos;
    this.pos += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  i8(): number {
    return this.view.getInt8(this.take(1));
  }

  u16(): number {
    return this.view.getUint16(this.take(2), true);
  }

  i16(): number {
    return this.view.getInt16(this.take(2), true);
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  i32(): number {
    return this.view.getInt32(this.take(4), true);
  }

  f32(): number {
    return this.view.getFloat32(this.take(4), true);
  }

  bytes(n: number): Uint8Array {
    const at = this.take(n);
    return this.data.slice(at, at + n);
  }

  subarray(n: number): Uint8Array {
    const at = this.take(n);
    return this.data.subarray(at, at + n);
  }

  fixedString(n: number, encoding: O2Encoding): string {
    const at = this.take(n);
    return decodeText(this.data.subarray(at, at + n), encoding);
  }

  peekU32(pos: number): number | null {
    if (pos < 0 || pos + 4 > this.size) {
      return null;
    }

    return this.view.getUint32(pos, true);
  }

  peekI32(pos: number): number | null {
    if (pos < 0 || pos + 4 > this.size) {
      return null;
    }

    return this.view.getInt32(pos, true);
  }

  peekI16(pos: number): number | null {
    if (pos < 0 || pos + 2 > this.size) {
      return null;
    }

    return this.view.getInt16(pos, true);
  }
}


export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private len = 0;

  constructor(capacity = 4096) {
    this.buf = new Uint8Array(Math.max(16, capacity));
    this.view = new DataView(this.buf.buffer);
  }

  get length(): number {
    return this.len;
  }

  tell(): number {
    return this.len;
  }

  private grow(n: number): number {
    const at = this.len;
    if (at + n > this.buf.byteLength) {
      let cap = this.buf.byteLength * 2;
      while (cap < at + n) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
      this.view = new DataView(next.buffer);
    }

    this.len = at + n;
    return at;
  }

  // grow() may replace this.view.
  u8(value: number): this {
    const at = this.grow(1);
    this.view.setUint8(at, value & 0xff);
    return this;
  }

  i8(value: number): this {
    const at = this.grow(1);
    this.view.setInt8(at, value);
    return this;
  }

  u16(value: number): this {
    const at = this.grow(2);
    this.view.setUint16(at, value & 0xffff, true);
    return this;
  }

  i16(value: number): this {
    const at = this.grow(2);
    this.view.setInt16(at, value, true);
    return this;
  }

  u32(value: number): this {
    const at = this.grow(4);
    this.view.setUint32(at, value >>> 0, true);
    return this;
  }

  i32(value: number): this {
    const at = this.grow(4);
    this.view.setInt32(at, value | 0, true);
    return this;
  }

  f32(value: number): this {
    const at = this.grow(4);
    this.view.setFloat32(at, value, true);
    return this;
  }

  bytes(src: Uint8Array): this {
    const at = this.grow(src.byteLength);
    this.buf.set(src, at);
    return this;
  }

  zeros(n: number): this {
    const at = this.grow(n);
    this.buf.fill(0, at, at + n);
    return this;
  }

  fixedString(value: string, n: number, encoding: O2Encoding): this {
    const at = this.grow(n);
    this.buf.fill(0, at, at + n);
    const src = encodeText(value, encoding).bytes;
    this.buf.set(src.subarray(0, n), at);
    return this;
  }

  patchU32(pos: number, value: number): this {
    if (pos >= 0 && pos + 4 <= this.len) {
      this.view.setUint32(pos, value >>> 0, true);
    }

    return this;
  }

  toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}
