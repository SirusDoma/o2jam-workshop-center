import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageDown, ImageUp, Images, Pause, Play, Plus, Replace, RotateCcw, X } from 'lucide-react';
import { decodeFrame, writeSprite, type Sprite, type SpriteFrameInput, type SpriteWriteCodec } from '../../o2jam';
import { decodeBmp } from '../../bmp';
import { FrameCell, FrameGrid } from '../FrameCell';
import { SplitButton } from '../SplitButton';
import { SpriteCanvas } from '../SpriteCanvas';
import { useToolActive } from '../../context/ToolActiveContext';
import { playback } from '../../features/packages/constants';
import { baseName, extractAll, extractBmp, spriteToInputs } from '../../features/packages/packageUtils';

function FrameThumb({
  data,
  sprite,
  index,
  keyOn,
  selected,
  onSelect,
  onReplace,
  onRemove,
}: {
  data: Uint8Array;
  sprite: Sprite;
  index: number;
  keyOn: boolean;
  selected: boolean;
  onSelect: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const decoded = useMemo(() => {
    try {
      return decodeFrame(data, sprite, index, { colorKey: keyOn ? undefined : null });
    } catch {
      return null;
    }
  }, [data, sprite, index, keyOn]);
  const frame = sprite.frames[index];

  return (
    <FrameCell
      index={index}
      width={frame?.width ?? 0}
      height={frame?.height ?? 0}
      bitmap={decoded}
      on={selected}
      onSelect={onSelect}
      onReplace={onReplace}
      onRemove={onRemove}
    />
  );
}

export function SpriteEntryView({
  active,
  data,
  sprite,
  name,
  edited,
  onRevert,
  onReplace,
}: {
  active: boolean;
  data: Uint8Array;
  sprite: Sprite;
  name: string;
  edited: boolean;
  onRevert: () => void;
  onReplace: (bytes: Uint8Array) => void;
}) {
  const [frame, setFrame] = useState(0);
  const [keyOn, setKeyOn] = useState(true);
  const [playing, setPlaying] = useState(playback.playing);
  const [fps, setFps] = useState(playback.fps);
  const oneRef = useRef<HTMLInputElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const toolActive = useToolActive();
  const codec: SpriteWriteCodec = sprite.codec !== 'rgb555' ? 'runlist' : 'rgb555';

  useEffect(() => setFrame(0), [data]);
  useEffect(() => {
    playback.playing = playing;
    playback.fps = fps;
  }, [playing, fps]);
  useEffect(() => {
    if (!playing || !toolActive || sprite.frameCount < 2) return;
    const count = sprite.frameCount;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % count), Math.max(60, 1000 / fps));
    return () => window.clearInterval(id);
  }, [playing, fps, sprite, toolActive]);

  const decoded = useMemo(() => {
    if (sprite.frameCount === 0) return null;
    try {
      return decodeFrame(data, sprite, frame, { colorKey: keyOn ? undefined : null });
    } catch {
      return null;
    }
  }, [data, sprite, frame, keyOn]);

  const addFrames = async (files: File[]) => {
    if (!files.length) return;
    const inputs = spriteToInputs(data, sprite);
    const before = inputs.length;
    for (const file of files) {
      const bitmap = decodeBmp(new Uint8Array(await file.arrayBuffer()));
      if (bitmap) inputs.push({ width: bitmap.width, height: bitmap.height, rgba: bitmap.rgba });
    }
    if (inputs.length > before) onReplace(writeSprite(inputs, sprite.colorKey, 8, codec));
  };

  if (!active) return null;

  return (
    <>
      <div className="stagebar">
        <div className="sb-line">
          <span className="sb-fmt">{sprite.formatLabel}</span>
          <label className="checkline">
            <input type="checkbox" checked={keyOn} onChange={(event) => setKeyOn(event.target.checked)} />
            <span>Transparency</span>
          </label>
          <button
            className="icon-btn"
            type="button"
            style={{ marginLeft: 'auto' }}
            disabled={sprite.frameCount < 2}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="zoom">
            <input type="range" min={1} max={24} value={fps} aria-label="Speed" onChange={(event) => setFps(Number(event.target.value))} />
            <span className="mono">{fps} fps</span>
          </span>
        </div>
        <div className="sb-line">
          <button className="btn" type="button" onClick={() => moreRef.current?.click()}>
            <Plus size={14} />
            ADD FRAMES
          </button>
          <button
            className="btn"
            type="button"
            disabled={sprite.frameCount === 0}
            onClick={() => {
              const inputs = spriteToInputs(data, sprite);
              inputs.splice(frame, 1);
              onReplace(writeSprite(inputs, sprite.colorKey, 8, codec));
            }}
          >
            <X size={14} />
            REMOVE FRAME
          </button>
          <SplitButton
            icon={<ImageDown size={14} />}
            label="EXTRACT"
            onClick={() => extractBmp(data, sprite, frame, `${baseName(name)}_${frame}.bmp`, keyOn)}
            items={[
              {
                icon: <ImageDown size={14} />,
                label: 'Extract frame',
                onClick: () => extractBmp(data, sprite, frame, `${baseName(name)}_${frame}.bmp`, keyOn),
              },
              {
                icon: <Images size={14} />,
                label: 'Extract all frames',
                disabled: sprite.frameCount <= 1,
                onClick: () => extractAll(data, sprite, name, keyOn),
              },
            ]}
          />
          <SplitButton
            icon={<ImageUp size={14} />}
            label="REPLACE"
            onClick={() => oneRef.current?.click()}
            items={[
              { icon: <ImageUp size={14} />, label: 'Replace frame', onClick: () => oneRef.current?.click() },
              { icon: <Replace size={14} />, label: 'Replace all frames', onClick: () => allRef.current?.click() },
            ]}
          />
          <button className="btn" type="button" disabled={!edited} onClick={onRevert}>
            <RotateCcw size={14} />
            REVERT
          </button>
          <input
            ref={moreRef}
            type="file"
            accept=".bmp"
            multiple
            hidden
            onChange={async (event) => {
              await addFrames(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <input
            ref={oneRef}
            type="file"
            accept=".bmp"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const bitmap = decodeBmp(new Uint8Array(await file.arrayBuffer()));
              if (!bitmap) return;
              const inputs = spriteToInputs(data, sprite);
              const original = sprite.frames[frame];
              inputs[frame] = {
                width: bitmap.width,
                height: bitmap.height,
                x: original?.x ?? 0,
                y: original?.y ?? 0,
                rgba: bitmap.rgba,
              };
              onReplace(writeSprite(inputs, sprite.colorKey, 8, codec));
              event.target.value = '';
            }}
          />
          <input
            ref={allRef}
            type="file"
            accept=".bmp"
            multiple
            hidden
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              if (!files.length) return;
              const inputs: SpriteFrameInput[] = [];
              for (const file of files) {
                const bitmap = decodeBmp(new Uint8Array(await file.arrayBuffer()));
                if (bitmap) inputs.push({ width: bitmap.width, height: bitmap.height, rgba: bitmap.rgba });
              }
              if (inputs.length) onReplace(writeSprite(inputs, sprite.colorKey, 8, codec));
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="pad stage-pad">
        <div className="spriteframe" style={{ minHeight: 180 }}>
          <SpriteCanvas bitmap={decoded} />
        </div>
      </div>
      <FrameGrid className="spritegrid" onAddFiles={(files) => void addFrames(files)}>
        {sprite.frames.map((spriteFrame) => (
          <FrameThumb
            key={spriteFrame.index}
            data={data}
            sprite={sprite}
            index={spriteFrame.index}
            keyOn={keyOn}
            selected={spriteFrame.index === frame}
            onSelect={() => setFrame(spriteFrame.index)}
            onReplace={() => {
              setFrame(spriteFrame.index);
              oneRef.current?.click();
            }}
            onRemove={() => {
              const inputs = spriteToInputs(data, sprite);
              inputs.splice(spriteFrame.index, 1);
              onReplace(writeSprite(inputs, sprite.colorKey, 8, codec));
            }}
          />
        ))}
        <button type="button" className="spritecell addframe" title="Add a frame from BMP" onClick={() => moreRef.current?.click()}>
          <Plus size={16} />
          <span>Add frame</span>
        </button>
      </FrameGrid>
    </>
  );
}
