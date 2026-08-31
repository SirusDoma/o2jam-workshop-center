
export interface Bitmap {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

const MAX_IMAGE_DIMENSION = 4096;

export function encodeBmp(bmp: Bitmap): Uint8Array {
  const { width, height, rgba } = bmp;
  const rowBytes = width * 4;
  const size = 54 + rowBytes * height;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);

  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, -height, true); // BMP uses a negative height for top-down rows.
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 32, true);
  dv.setUint32(30, 0, true);
  dv.setUint32(34, rowBytes * height, true);

  let p = 54;
  for (let i = 0; i < width * height; i++) {
    out[p++] = rgba[i * 4 + 2] ?? 0;
    out[p++] = rgba[i * 4 + 1] ?? 0;
    out[p++] = rgba[i * 4] ?? 0;
    out[p++] = rgba[i * 4 + 3] ?? 255;
  }
  return out;
}

export function decodeBmp(data: Uint8Array): Bitmap | null {
  if (data.length < 54 || data[0] !== 0x42 || data[1] !== 0x4d) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const dataOffset = dv.getUint32(10, true);
  const width = dv.getInt32(18, true);
  const rawHeight = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  if (width <= 0 || rawHeight === 0 || (bpp !== 24 && bpp !== 32)) return null;

  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) return null;
  const bytesPP = bpp / 8;
  const rowBytes = ((width * bytesPP + 3) & ~3) >>> 0;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    let src = dataOffset + srcRow * rowBytes;
    let dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      const b = data[src++] ?? 0;
      const g = data[src++] ?? 0;
      const r = data[src++] ?? 0;
      const a = bpp === 32 ? data[src++] ?? 255 : 255;
      rgba[dst++] = r;
      rgba[dst++] = g;
      rgba[dst++] = b;
      rgba[dst++] = bpp === 32 ? a : 255;
    }
  }
  return { width, height, rgba };
}
