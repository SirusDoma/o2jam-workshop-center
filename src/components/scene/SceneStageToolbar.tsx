import { Minus, Move, MousePointer2, Pause, Pencil, Play, Plus, ZoomIn } from 'lucide-react';

export function SceneStageToolbar({ scenes, active, zoom, playing, fps, transparent, showBounds, moveMode, onScene, onAdd, onDelete, onRename, onZoom, onPlaying, onFps, onTransparent, onShowBounds, onMoveMode }: {
  scenes: { name: string; label: string }[];
  active: string;
  zoom: number;
  playing: boolean;
  fps: number;
  transparent: boolean;
  showBounds: boolean;
  moveMode: boolean;
  onScene: (name: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onRename: () => void;
  onZoom: (zoom: number) => void;
  onPlaying: (playing: boolean) => void;
  onFps: (fps: number) => void;
  onTransparent: (transparent: boolean) => void;
  onShowBounds: (show: boolean) => void;
  onMoveMode: (move: boolean) => void;
}) {
  return (
    <div className="stagebar">
      <div className="sb-line">
        <select className="selctl" style={{ width: 280 }} value={active} aria-label="Scene" onChange={(event) => onScene(event.target.value)}>
          {scenes.map((scene) => <option key={scene.name} value={scene.name}>{scene.label}</option>)}
        </select>
        <button className="icon-btn" type="button" title="Add scene" aria-label="Add scene" onClick={onAdd}><Plus size={14} /></button>
        <button className="icon-btn" type="button" title="Delete scene" aria-label="Delete scene" disabled={scenes.length <= 1} onClick={onDelete}><Minus size={14} /></button>
        <button className="icon-btn" type="button" title="Rename scene" aria-label="Rename scene" onClick={onRename}><Pencil size={14} /></button>
        <span className="zoom" style={{ marginLeft: 'auto' }} title="Zoom"><ZoomIn size={14} /><input type="range" min={25} max={200} step={5} value={zoom * 100} aria-label="Zoom" onChange={(event) => onZoom(Number(event.target.value) / 100)} /><span className="mono">{Math.round(zoom * 100)}%</span></span>
      </div>
      <div className="sb-line">
        <button className="icon-btn" type="button" onClick={() => onPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
        <label className="animctl"><input type="range" min={1} max={24} value={fps} aria-label="Speed" onChange={(event) => onFps(Number(event.target.value))} /><span className="mono">{fps} fps</span></label>
        <label className="checkline"><input type="checkbox" checked={transparent} onChange={(event) => onTransparent(event.target.checked)} /><span>Transparency</span></label>
        <label className="checkline"><input type="checkbox" checked={showBounds} onChange={(event) => onShowBounds(event.target.checked)} /><span>Bounds</span></label>
        <span className="modeswitch" style={{ marginLeft: 'auto' }} role="radiogroup" aria-label="Pointer mode">
          <button className={`icon-btn${moveMode ? '' : ' on'}`} type="button" title="Select mode" aria-pressed={!moveMode} onClick={() => onMoveMode(false)}><MousePointer2 size={14} /></button>
          <button className={`icon-btn${moveMode ? ' on' : ''}`} type="button" title="Move mode" aria-pressed={moveMode} onClick={() => onMoveMode(true)}><Move size={14} /></button>
        </span>
      </div>
    </div>
  );
}
