import { useEffect, useRef } from 'react';
import type { DecodedFrame } from '../../o2jam';
import { ckey, frameOff, type BoundRect, type LabelDraw, type Placed, type Rect } from '../../features/scene/model';

const frameCanvasCache = new WeakMap<DecodedFrame, HTMLCanvasElement>();
function frameCanvas(f: DecodedFrame): HTMLCanvasElement | null {
  if (f.width <= 0 || f.height <= 0) return null;
  let cv = frameCanvasCache.get(f);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = f.width;
  cv.height = f.height;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(f.width, f.height);
  img.data.set(f.rgba);
  ctx.putImageData(img, 0, 0);
  frameCanvasCache.set(f, cv);
  return cv;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function drawLabel(ctx: CanvasRenderingContext2D, l: LabelDraw): void {
  const s = l.style;
  const pad = 1;
  const maxW = Math.max(1, l.width - pad * 2);
  ctx.font = `${s.size}px sans-serif`;
  ctx.textBaseline = 'middle';
  const lineH = s.size * 1.25;
  const lines = wrapText(ctx, s.text, maxW);
  const blockH = lines.length * lineH;
  const top = s.valign === 'top' ? l.top + pad : s.valign === 'bottom' ? l.top + l.height - blockH - pad : l.top + (l.height - blockH) / 2;
  const x = s.halign === 'center' ? l.left + l.width / 2 : s.halign === 'right' ? l.left + l.width - pad : l.left + pad;

  ctx.save();
  ctx.beginPath();
  ctx.rect(l.left, l.top, l.width, l.height);
  ctx.clip();
  ctx.textAlign = s.halign;
  if (s.outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, s.size / 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
  }
  ctx.fillStyle = s.color;
  for (let i = 0; i < lines.length; i++) {
    const cy = top + i * lineH + lineH / 2;
    if (s.outline) ctx.strokeText(lines[i]!, x, cy);
    ctx.fillText(lines[i]!, x, cy);
  }
  ctx.restore();
}

export function StageCanvas({
  placed,
  boundRects,
  hitRects,
  labelDraws,
  selectedRects,
  extent,
  zoom,
  tick,
  playing,
  frameSel,
  moveOn,
  onSelect,
  onGrab,
  onDrag,
  onDrop,
}: {
  placed: Placed[];
  boundRects: BoundRect[];
  hitRects: BoundRect[];
  labelDraws: LabelDraw[];
  selectedRects: Rect[];
  extent: { w: number; h: number };
  zoom: number;
  tick: number;
  playing: boolean;
  frameSel: Record<string, number>;
  moveOn: boolean;
  onSelect: (id: string) => void;
  onGrab: (key: string, wx: number, wy: number) => void;
  onDrag: (wx: number, wy: number) => void;
  onDrop: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = zoom * dpr;
    canvas.width = Math.max(1, Math.round(extent.w * scale));
    canvas.height = Math.max(1, Math.round(extent.h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, extent.w, extent.h);

    for (const p of placed) {
      const n = p.frames.length;
      let idx = playing && n > 1 ? tick % n : Math.min(frameSel[ckey(p.control)] ?? 0, n - 1);
      if (!p.frames[idx]) idx = 0;
      const cv = frameCanvas(p.frames[idx]!);
      const o = frameOff(p, idx);
      if (cv) ctx.drawImage(cv, p.x + o.x, p.y + o.y);
    }

    if (boundRects.length) {
      ctx.lineWidth = 1;
      for (const r of boundRects) {
        const w = Math.max(0, r.width);
        const h = Math.max(0, r.height);
        ctx.fillStyle = 'rgba(255,45,120,0.10)';
        ctx.fillRect(r.left, r.top, w, h);
        ctx.strokeStyle = 'rgba(255,45,120,0.85)';
        ctx.strokeRect(r.left + 0.5, r.top + 0.5, w, h);
      }
    }

    for (const l of labelDraws) drawLabel(ctx, l);

    if (selectedRects.length) {
      ctx.strokeStyle = '#ff6a2c';
      ctx.lineWidth = 2;
      for (const r of selectedRects) ctx.strokeRect(r.left, r.top, Math.max(0, r.width), Math.max(0, r.height));
    }
  }, [placed, boundRects, labelDraws, selectedRects, extent, zoom, tick, playing, frameSel]);

  const toWorld = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { wx: (e.clientX - rect.left) / zoom, wy: (e.clientY - rect.top) / zoom };
  };

  const pick = (wx: number, wy: number): string | null => {
    const inside = (x: number, y: number, w: number, h: number) => wx >= x && wx < x + w && wy >= y && wy < y + h;

    let top: string | null = null;
    for (const p of placed) {
      const n = p.frames.length;
      let idx = playing && n > 1 ? tick % n : Math.min(frameSel[ckey(p.control)] ?? 0, n - 1);
      if (!p.frames[idx]) idx = 0;
      const f = p.frames[idx]!;
      const o = frameOff(p, idx);
      if (inside(p.x + o.x, p.y + o.y, f.width, f.height)) top = ckey(p.control);
    }
    if (top) return top;

    let best: string | null = null;
    let bestArea = Infinity;
    for (const r of hitRects) {
      if (!r.key || !inside(r.left, r.top, r.width, r.height)) continue;
      const area = Math.max(1, r.width) * Math.max(1, r.height);
      if (area < bestArea) {
        bestArea = area;
        best = r.key;
      }
    }
    return best;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (moveOn) return;
    const { wx, wy } = toWorld(e);
    const key = pick(wx, wy);
    if (key) onSelect(key);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!moveOn) return;
    const { wx, wy } = toWorld(e);
    const key = pick(wx, wy);
    if (!key) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onGrab(key, wx, wy);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const { wx, wy } = toWorld(e);
    onDrag(wx, wy);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onDrop();
  };

  return (
    <div className="stage">
      <canvas
        ref={ref}
        className={`stage-canvas${moveOn ? ' movable' : ''}`}
        style={{ width: extent.w * zoom, height: extent.h * zoom }}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
