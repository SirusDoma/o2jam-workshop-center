import { useEffect, useMemo, useState } from 'react';
import { useToolActive } from '../../context/ToolActiveContext';
import type { BoundRect, LabelDraw, Placed, Rect } from '../../features/scene/model';
import { SceneStageToolbar } from './SceneStageToolbar';
import { StageCanvas } from './StageCanvas';

export function SceneStage({
  scenes,
  active,
  placed,
  boundRects,
  hitRects,
  labelDraws,
  selectedRects,
  extent,
  zoom,
  playing,
  fps,
  transparent,
  showBounds,
  moveMode,
  frameSelection,
  onScene,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onZoom,
  onPlaying,
  onFps,
  onTransparent,
  onShowBounds,
  onMoveMode,
  onSelect,
  onGrab,
  onDrag,
  onDrop,
}: {
  scenes: { name: string; label: string }[];
  active: string;
  placed: Placed[];
  boundRects: BoundRect[];
  hitRects: BoundRect[];
  labelDraws: LabelDraw[];
  selectedRects: Rect[];
  extent: { w: number; h: number };
  zoom: number;
  playing: boolean;
  fps: number;
  transparent: boolean;
  showBounds: boolean;
  moveMode: boolean;
  frameSelection: Record<string, number>;
  onScene: (name: string) => void;
  onAddScene: () => void;
  onDeleteScene: () => void;
  onRenameScene: () => void;
  onZoom: (zoom: number) => void;
  onPlaying: (playing: boolean) => void;
  onFps: (fps: number) => void;
  onTransparent: (transparent: boolean) => void;
  onShowBounds: (show: boolean) => void;
  onMoveMode: (move: boolean) => void;
  onSelect: (key: string) => void;
  onGrab: (key: string, x: number, y: number) => void;
  onDrag: (x: number, y: number) => void;
  onDrop: () => void;
}) {
  const [tick, setTick] = useState(0);
  const toolActive = useToolActive();
  const animated = useMemo(() => placed.some((entry) => entry.frames.length > 1), [placed]);

  useEffect(() => {
    if (!playing || !animated || !toolActive) return;
    const id = window.setInterval(() => setTick((current) => current + 1), Math.max(60, 1000 / fps));
    return () => window.clearInterval(id);
  }, [playing, fps, animated, toolActive]);

  return (
    <div className="composer-stage">
      <SceneStageToolbar
        scenes={scenes}
        active={active}
        zoom={zoom}
        playing={playing}
        fps={fps}
        transparent={transparent}
        showBounds={showBounds}
        moveMode={moveMode}
        onScene={onScene}
        onAdd={onAddScene}
        onDelete={onDeleteScene}
        onRename={onRenameScene}
        onZoom={onZoom}
        onPlaying={onPlaying}
        onFps={onFps}
        onTransparent={onTransparent}
        onShowBounds={onShowBounds}
        onMoveMode={onMoveMode}
      />
      {placed.length === 0 && hitRects.length === 0 ? (
        <div className="archive-empty">NOTHING TO COMPOSE ON THIS SCREEN</div>
      ) : (
        <StageCanvas
          placed={placed}
          boundRects={showBounds ? boundRects : []}
          hitRects={hitRects}
          labelDraws={labelDraws}
          selectedRects={selectedRects}
          extent={extent}
          zoom={zoom}
          tick={tick}
          playing={playing}
          frameSel={frameSelection}
          moveOn={moveMode}
          onSelect={onSelect}
          onGrab={onGrab}
          onDrag={onDrag}
          onDrop={onDrop}
        />
      )}
    </div>
  );
}
