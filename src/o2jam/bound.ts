
import { ByteReader, ByteWriter, FormatError } from './binary';
import type { BinarySource } from './binary';

export const BOUND_HEADER_SIZE = 6;
export const BOUND_SIZE = 16;

export interface Bound {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  offset: number;
}

export interface BoundList {
  signature: number;
  totalBounds: number;
  bounds: Bound[];
}

export function parseBounds(source: BinarySource): BoundList {
  const reader = new ByteReader(source);
  if (reader.size < BOUND_HEADER_SIZE) {
    throw new FormatError(`bound file needs ${BOUND_HEADER_SIZE} bytes, got ${reader.size}`, 0);
  }

  const signature = reader.i32();
  const totalBounds = reader.i16();

  const capacity = Math.max(0, Math.floor((reader.size - BOUND_HEADER_SIZE) / BOUND_SIZE));
  const count = Math.max(0, Math.min(capacity, totalBounds));

  const bounds: Bound[] = [];
  for (let i = 0; i < count; i++) {
    const offset = reader.tell();
    const left = reader.i32();
    const top = reader.i32();
    const right = reader.i32();
    const bottom = reader.i32();
    bounds.push({
      index: i,
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      offset,
    });
  }

  return { signature, totalBounds, bounds };
}

export interface BoundInput {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function writeBounds(bounds: readonly BoundInput[], signature = 1): Uint8Array {
  const writer = new ByteWriter(BOUND_HEADER_SIZE + bounds.length * BOUND_SIZE);
  writer.i32(signature);
  writer.i16(bounds.length);
  for (const b of bounds) {
    writer.i32(b.left | 0);
    writer.i32(b.top | 0);
    writer.i32(b.right | 0);
    writer.i32(b.bottom | 0);
  }
  return writer.toUint8Array();
}
