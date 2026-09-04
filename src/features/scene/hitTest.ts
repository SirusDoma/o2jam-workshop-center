export interface HitRect {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpriteHitRect extends HitRect {
  rgba: Uint8Array | Uint8ClampedArray;
}

const inside = (x: number, y: number, rect: HitRect) =>
  x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;

export function pickSceneControl(
  x: number,
  y: number,
  sprites: SpriteHitRect[],
  labels: HitRect[],
  bounds: HitRect[],
  transparency: boolean
): string | null {
  let top: string | null = null;
  const transparentSprites = new Set<string>();
  for (const sprite of sprites) {
    if (!inside(x, y, sprite)) {
      continue;
    }

    const pixelX = Math.floor(x - sprite.left);
    const pixelY = Math.floor(y - sprite.top);
    const alpha = sprite.rgba[(pixelY * sprite.width + pixelX) * 4 + 3] ?? 0;
    if (transparency && alpha === 0) {
      transparentSprites.add(sprite.key);
      continue;
    }

    top = sprite.key;
  }
  for (const label of labels) {
    if (inside(x, y, label)) {
      top = label.key;
    }
  }
  if (top) {
    return top;
  }

  let best: string | null = null;
  let bestArea = Infinity;
  for (const bound of bounds) {
    if (transparentSprites.has(bound.key) || !inside(x, y, bound)) {
      continue;
    }

    const area = Math.max(1, bound.width) * Math.max(1, bound.height);
    if (area < bestArea) {
      bestArea = area;
      best = bound.key;
    }
  }
  return best;
}
