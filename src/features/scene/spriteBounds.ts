import type { EditFrame } from './model';

const pixelsEqual = (a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const framesEqual = (a: EditFrame[], b: EditFrame[]) =>
  a.length === b.length && a.every((frame, index) => {
    const other = b[index];
    return !!other && frame.width === other.width && frame.height === other.height && frame.x === other.x && frame.y === other.y && pixelsEqual(frame.rgba, other.rgba);
  });

export const spriteFrameBoundsChanged = (frames: EditFrame[], original: EditFrame[]) =>
  frames.some((frame, index) => frame.x !== (original[index]?.x ?? 0) || frame.y !== (original[index]?.y ?? 0));

export function revertSpriteFrameBounds(frames: EditFrame[], original: EditFrame[]): EditFrame[] | undefined {
  const reverted = frames.map((frame, index) => ({
    ...frame,
    x: original[index]?.x ?? 0,
    y: original[index]?.y ?? 0,
  }));

  return framesEqual(reverted, original) ? undefined : reverted;
}
