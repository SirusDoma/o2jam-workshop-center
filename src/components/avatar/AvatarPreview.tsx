import { memo, useEffect, useState } from 'react';
import { SpriteCanvas } from '../SpriteCanvas';
import { useToolActive } from '../../context/ToolActiveContext';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import type { DecodedAt, Layer } from '../../features/avatar/utils';
import { renderSprite } from '../../features/avatar/utils';

// One clock keeps every layer in sync.
export function AvatarFig({ layers, playing, fps }: { layers: Layer[]; playing: boolean; fps: number }) {
  const [tick, setTick] = useState(0);
  const toolActive = useToolActive();
  useEffect(() => {
    if (!playing || !toolActive) return;
    let id = 0;
    const onVis = () => {
      window.clearInterval(id);
      if (!document.hidden) id = window.setInterval(() => setTick((t) => t + 1), Math.max(30, 1000 / fps));
    };
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [playing, fps, toolActive]);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = 1;
  let y1 = 1;
  for (const l of layers)
    for (const f of l.frames) {
      x0 = Math.min(x0, f.x);
      y0 = Math.min(y0, f.y);
      x1 = Math.max(x1, f.x + f.width);
      y1 = Math.max(y1, f.y + f.height);
    }
  const fx = Number.isFinite(x0) ? x0 : 0;
  const fy = Number.isFinite(y0) ? y0 : 0;
  return (
    <div className="avatarfig" style={{ width: x1 - fx, height: y1 - fy }}>
      {layers.map((l, i) => (
        <AvatarLayer key={i} frames={l.frames} tick={tick} playing={playing} dx={-fx} dy={-fy} />
      ))}
    </div>
  );
}

interface LayerProps {
  frames: DecodedAt[];
  tick: number;
  playing: boolean;
  dx: number;
  dy: number;
}

const frameIx = (p: LayerProps) => (p.playing && p.frames.length > 1 ? p.tick % p.frames.length : 0);

const AvatarLayer = memo(
  function AvatarLayer(p: LayerProps) {
    const frame = p.frames[frameIx(p)]!;
    return (
      <div style={{ position: 'absolute', left: frame.x + p.dx, top: frame.y + p.dy }}>
        <SpriteCanvas bitmap={frame} />
      </div>
    );
  },
  (a, b) => a.frames === b.frames && a.dx === b.dx && a.dy === b.dy && frameIx(a) === frameIx(b)
);

export function SlotThumb({ file, name }: { file: WorkspaceFile; name: string }) {
  const frame = renderSprite(file, name, true)?.[0];
  if (!frame || frame.width <= 0) return null;
  return <SpriteCanvas bitmap={frame} />;
}
