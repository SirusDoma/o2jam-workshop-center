import { useLayoutEffect, useRef } from 'react';
import type { DecodedFrame } from '../o2jam';

export type DecodedBitmap = Pick<DecodedFrame, 'width' | 'height' | 'rgba'>;

const imageCache = new WeakMap<DecodedBitmap, ImageData>();

export function SpriteCanvas({
  bitmap,
  scale = 1,
  className,
  style,
}: {
  bitmap: DecodedBitmap | null;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Layout timing prevents a stale-frame flash in Firefox.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    let image = imageCache.get(bitmap);
    if (!image) {
      image = ctx.createImageData(bitmap.width, bitmap.height);
      image.data.set(bitmap.rgba);
      imageCache.set(bitmap, image);
    }

    ctx.putImageData(image, 0, 0);
  }, [bitmap]);

  if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
    return <span className="dz-hint">no pixels</span>;
  }

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ ...(scale !== 1 ? { width: bitmap.width * scale } : {}), ...style }}
    />
  );
}
