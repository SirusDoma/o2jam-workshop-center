import { OJN_HEADER_SIZE, decodeFrame, decodeText, type Sprite, type SpriteFrameInput } from '../../o2jam';
import { encodeBmp } from '../../bmp';

export function looksLikeMusicList(data: Uint8Array): boolean {
  return data.length >= 4 + OJN_HEADER_SIZE && decodeText(data.subarray(8, 12), 'ascii').startsWith('ojn');
}

export function quickTextish(data: Uint8Array): boolean {
  const sample = data.subarray(0, Math.min(256, data.length));
  if (sample.length === 0 || sample.indexOf(0) !== -1) {
    return false;
  }

  let printable = 0;
  for (const b of sample) if (b === 9 || b === 10 || b === 13 || b >= 0x20) {
    printable++;
  }
  return printable / sample.length > 0.95;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
    return false;
  }
  return true;
}

export function isSprite(ext: string): boolean {
  return ext === 'ojs' || ext === 'oji' || ext === 'ojt' || ext === 'oja';
}
export function extOf(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
}
export function baseName(name: string): string {
  return name.replace(/\.[^.]*$/, '');
}
export function download(data: Uint8Array, filename: string) {
  const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function extractBmp(data: Uint8Array, sprite: Sprite, index: number, filename: string, keyOn: boolean) {
  const f = decodeFrame(data, sprite, index, { colorKey: keyOn ? undefined : null });
  if (f.width <= 0) {
    return;
  }

  download(encodeBmp({ width: f.width, height: f.height, rgba: f.rgba }), filename);
}

export function extractAll(data: Uint8Array, sprite: Sprite, name: string, keyOn: boolean) {
  const base = baseName(name);
  sprite.frames.forEach((_, i) => {
    try {
      extractBmp(data, sprite, i, `${base}_${i}.bmp`, keyOn);
    } catch {
    }
  });
}

export function spriteToInputs(data: Uint8Array, sprite: Sprite): SpriteFrameInput[] {
  return sprite.frames.map((f, i) => {
    const d = decodeFrame(data, sprite, i, {});
    return { width: f.width, height: f.height, x: f.x, y: f.y, rgba: d.rgba };
  });
}
