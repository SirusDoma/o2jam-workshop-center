import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, Info, RotateCcw, Upload } from 'lucide-react';
import {
  DEFAULT_NOTE_TOOL_SETTINGS,
  MAX_LANE_WIDTH,
  MAX_NOTE_HEIGHT,
  MAX_PLAYHEAD_THICKNESS,
  NOTE_AREA_LANE_GROUPS,
  clampLaneWidth,
  clampNoteHeight,
  clampPlayheadThickness,
  createDefaultNoteToolSettings,
  effectivePlayheadGrid,
  gridCellBottomRatio,
  parseNoteToolSettings,
  playheadPositionStep,
  snapPlayheadPosition,
  updateNoteLaneSettings,
  type LongNoteStyle,
  type NoteAreaLaneKey,
  type NoteToolSettings,
  type NoteLaneSettings,
} from '../../features/note-tool/settings';
import type { EditorChart } from '../../features/note-tool/types';
import type { PlaybackPositionSubscription } from '../../features/note-tool/useChartPlayback';
import { NoteRoll } from './NoteRoll';
import { RollViewControls } from './RollViewControls';
import { CloseButton, Overlay } from '../Overlay';

const MAX_PROFILE_BYTES = 64 * 1024;
const PREVIEW_CHART: EditorChart = {
  measureCount: 3,
  measureFractions: [{ id: 'preview-fraction', measure: 0, fraction: 1 }],
  bpmChanges: [{ id: 'preview-bpm', absolutePosition: 2 + 5 / 16, bpm: 120 }],
  notes: [
    { id: 'preview-d', key: 'D', absolutePosition: 2 / 16, sampleType: 'wav', sampleId: 7, volume: 16, pan: 0 },
    { id: 'preview-s-first', key: 'S', absolutePosition: 5 / 16, sampleType: 'wav', sampleId: 12, volume: 16, pan: 0 },
    { id: 'preview-space-first', key: 'Space', absolutePosition: 8 / 16, sampleType: 'wav', sampleId: 42, volume: 16, pan: 0 },
    { id: 'preview-j-first', key: 'J', absolutePosition: 12 / 16, sampleType: 'wav', sampleId: 18, volume: 16, pan: 0 },
    { id: 'preview-s-second', key: 'S', absolutePosition: 1 + 4 / 16, sampleType: 'wav', sampleId: 7, volume: 16, pan: 0 },
    { id: 'preview-d-second', key: 'D', absolutePosition: 1 + 8 / 16, sampleType: 'wav', sampleId: 12, volume: 16, pan: 0 },
    { id: 'preview-k-second', key: 'K', absolutePosition: 1 + 12 / 16, sampleType: 'wav', sampleId: 18, volume: 16, pan: 0 },
    { id: 'preview-f', key: 'F', absolutePosition: 1 + 14 / 16, sampleType: 'wav', sampleId: 12, volume: 16, pan: 0 },
    { id: 'preview-space', key: 'Space', absolutePosition: 1 + 1 / 16, duration: 12 / 16, sampleType: 'wav', sampleId: 42, volume: 16, pan: 0 },
    { id: 'preview-s-third', key: 'S', absolutePosition: 2 + 3 / 16, sampleType: 'wav', sampleId: 7, volume: 16, pan: 0 },
    { id: 'preview-f-third', key: 'F', absolutePosition: 2 + 7 / 16, sampleType: 'wav', sampleId: 12, volume: 16, pan: 0 },
    { id: 'preview-j', key: 'J', absolutePosition: 2 + 8 / 16, sampleType: 'ogg', sampleId: 4, volume: 16, pan: 0 },
    { id: 'preview-k', key: 'K', absolutePosition: 2 + 11 / 16, sampleType: 'wav', sampleId: 18, volume: 16, pan: 0 },
    { id: 'preview-space-third', key: 'Space', absolutePosition: 2 + 14 / 16, sampleType: 'wav', sampleId: 42, volume: 16, pan: 0 },
  ],
  autoplayNotes: [
    { id: 'preview-sample-1', lane: 1, absolutePosition: 4 / 16, sampleType: 'wav', sampleId: 18, volume: 16, pan: 0 },
    { id: 'preview-sample-4', lane: 4, absolutePosition: 2 + 10 / 16, sampleType: 'ogg', sampleId: 4, volume: 16, pan: 0 },
  ],
};
const noop = () => {};

export function SettingsDialog({
  settings,
  storageMessage,
  onChange: commitSettings,
  onClose,
}: {
  settings: NoteToolSettings;
  storageMessage: string | null;
  onChange: (settings: NoteToolSettings) => void;
  onClose: () => void;
}) {
  const [colorPreview, setColorPreview] = useState<NoteToolSettings | null>(null);
  const onChange = (next: NoteToolSettings) => {
    setColorPreview(null);
    commitSettings(next);
  };
  const [message, setMessage] = useState<string | null>(null);
  const [previewGrid, setPreviewGrid] = useState('1/16');
  const [previewSubGrid, setPreviewSubGrid] = useState(`1/${settings.playheadGrid}`);
  const [previewHiSpeed, setPreviewHiSpeed] = useState('1.0');
  const previewPlayheadGrid = effectivePlayheadGrid(previewGrid, previewSubGrid);
  const previewSettings = {
    ...(colorPreview ?? settings),
    playheadGrid: previewPlayheadGrid,
    playheadPosition: snapPlayheadPosition(settings.playheadPosition, previewPlayheadGrid),
  };
  const subscribePreviewPosition = useCallback<PlaybackPositionSubscription>((listener) => {
    listener(gridCellBottomRatio(playheadPositionStep(settings.playheadPosition, previewPlayheadGrid), previewPlayheadGrid));
    return noop;
  }, [previewPlayheadGrid, settings.playheadPosition]);

  const updatePreviewGrid = (grid: string) => {
    setPreviewGrid(grid);
    if (previewSubGrid === 'none') {
      const playheadGrid = effectivePlayheadGrid(grid, previewSubGrid);
      onChange({ ...settings, playheadGrid, playheadPosition: snapPlayheadPosition(settings.playheadPosition, playheadGrid) });
    }
  };

  const updatePreviewSubGrid = (subGrid: string) => {
    const playheadGrid = effectivePlayheadGrid(previewGrid, subGrid);
    setPreviewSubGrid(subGrid);
    onChange({ ...settings, playheadGrid, playheadPosition: snapPlayheadPosition(settings.playheadPosition, playheadGrid) });
  };

  const updatePreviewPlayhead = (position: number) => {
    onChange({
      ...settings,
      playheadGrid: previewPlayheadGrid,
      playheadPosition: position,
    });
  };

  const updateLane = (lane: NoteAreaLaneKey, patch: Partial<NoteLaneSettings>) => {
    onChange(updateNoteLaneSettings(settings, lane, patch));
  };

  const previewLane = (lane: NoteAreaLaneKey, patch: Partial<NoteLaneSettings>) => {
    setColorPreview(updateNoteLaneSettings(settings, lane, patch));
  };

  const resetLane = (lane: NoteAreaLaneKey) => {
    updateLane(lane, DEFAULT_NOTE_TOOL_SETTINGS.lanes[lane]);
  };

  const resetNoteAppearance = () => {
    onChange({
      ...settings,
      noteBorderWidth: DEFAULT_NOTE_TOOL_SETTINGS.noteBorderWidth,
      noteHeight: DEFAULT_NOTE_TOOL_SETTINGS.noteHeight,
      longNoteStyle: DEFAULT_NOTE_TOOL_SETTINGS.longNoteStyle,
      noteTemplate: DEFAULT_NOTE_TOOL_SETTINGS.noteTemplate,
    });
  };

  const resetPlaybackAppearance = () => {
    setPreviewSubGrid(`1/${DEFAULT_NOTE_TOOL_SETTINGS.playheadGrid}`);
    onChange({
      ...settings,
      playheadGrid: DEFAULT_NOTE_TOOL_SETTINGS.playheadGrid,
      playheadPosition: DEFAULT_NOTE_TOOL_SETTINGS.playheadPosition,
      playheadThickness: DEFAULT_NOTE_TOOL_SETTINGS.playheadThickness,
      playheadColor: DEFAULT_NOTE_TOOL_SETTINGS.playheadColor,
    });
  };

  const updateWidth = (lane: NoteAreaLaneKey, event: ChangeEvent<HTMLInputElement>) => {
    const width = event.currentTarget.valueAsNumber;

    if (!Number.isFinite(width)) {
      return;
    }

    updateLane(lane, { width: clampLaneWidth(width) });
  };

  const importProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    if (file.size > MAX_PROFILE_BYTES) {
      setMessage('Import failed: profile is larger than 64 KB.');
      return;
    }

    try {
      const profile = parseNoteToolSettings(JSON.parse(await file.text()));

      if (!profile) {
        setMessage('Import failed: this is not a valid settings profile.');
        return;
      }

      setPreviewSubGrid(`1/${profile.playheadGrid}`);
      onChange(profile);
      setMessage(null);
    }
    catch {
      setMessage('Import failed: the selected file is not valid JSON.');
    }
  };

  const exportProfile = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'o2wc-note-tool-settings.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage(null);
  };

  const resetAll = () => {
    const defaults = createDefaultNoteToolSettings();
    setPreviewSubGrid(`1/${defaults.playheadGrid}`);
    onChange(defaults);
    setMessage(null);
  };

  return (
    <Overlay label="Settings" width="wide" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="overlay-title">Settings</span>
          </div>
          <span className="overlay-path">Customize appearances</span>
        </div>
        <div className="overlay-actions">
          <CloseButton onClose={onClose} />
        </div>
      </div>

      <div className="overlay-body nt-settings-body">
        <div className="nt-settings-controls">
          <section className="nt-settings-section">
          <div className="nt-settings-section-head">
            <div>
              <h2>Layout</h2>
            </div>
          </div>
          <div className="nt-lane-settings-table">
            <div className="nt-lane-settings-grid nt-lane-settings-head" aria-hidden="true">
              <span>Lane</span>
              <span>Width</span>
              <span>Background</span>
              <span>Highlight</span>
              <span>Note</span>
              <span>Border</span>
              <span aria-label="Reset column" />
            </div>
            <div className="nt-lane-settings-body">
              {NOTE_AREA_LANE_GROUPS.map((group) => (
                <div className="nt-lane-settings-group" key={group.label}>
                  <div className="nt-lane-settings-group-title">
                    <span>{group.label}</span>
                    {group.label === 'Background' ? (
                      <label className="nt-compact-check nt-uniform-style">
                        <input
                          type="checkbox"
                          checked={settings.uniformAutoplayStyle}
                          onChange={(event) => {
                            const next = { ...settings, uniformAutoplayStyle: event.currentTarget.checked };
                            onChange(next.uniformAutoplayStyle ? updateNoteLaneSettings(next, 'sample-1', settings.lanes['sample-1']) : next);
                          }}
                        />
                        Uniform Style
                      </label>
                    ) : null}
                  </div>
                  {(group.label === 'Background' && settings.uniformAutoplayStyle ? [{ key: 'sample-1' as const, label: 'Samples' }] : group.lanes).map((lane) => {
                    const laneSettings = settings.lanes[lane.key];
                    const hasBackground = laneSettings.background !== null;

                    return (
                      <div className="nt-lane-settings-grid" key={lane.key}>
                        <strong>{lane.label}</strong>
                        <label className="nt-settings-number">
                          <input
                            className="secinput mono"
                            type="number"
                            min="0"
                            max={MAX_LANE_WIDTH}
                            step="1"
                            value={laneSettings.width}
                            aria-label={`${lane.label} column width`}
                            onChange={(event) => updateWidth(lane.key, event)}
                          />
                          <span>px</span>
                        </label>
                        <div className="nt-background-setting">
                          <label className="nt-compact-check">
                            <input
                              type="checkbox"
                              checked={hasBackground}
                              aria-label={`Use ${lane.label} background color`}
                              onChange={(event) => updateLane(lane.key, {
                                background: event.currentTarget.checked ? '#14171c' : null,
                              })}
                            />
                            Fill
                          </label>
                          <ColorInput
                            label={`${lane.label} background color`}
                            value={laneSettings.background ?? '#14171c'}
                            disabled={!hasBackground}
                            onPreview={(background) => previewLane(lane.key, { background })}
                            onChange={(background) => updateLane(lane.key, { background })}
                          />
                        </div>
                        <div className="nt-color-cell">
                          <ColorInput label={`${lane.label} highlight color`} value={laneSettings.highlight} onPreview={(highlight) => previewLane(lane.key, { highlight })} onChange={(highlight) => updateLane(lane.key, { highlight })} />
                        </div>
                        <div className="nt-color-cell">
                          <ColorInput label={`${lane.label} note color`} value={laneSettings.noteColor} onPreview={(noteColor) => previewLane(lane.key, { noteColor })} onChange={(noteColor) => updateLane(lane.key, { noteColor })} />
                        </div>
                        <div className="nt-color-cell">
                          <ColorInput label={`${lane.label} note border color`} value={laneSettings.borderColor} onPreview={(borderColor) => previewLane(lane.key, { borderColor })} onChange={(borderColor) => updateLane(lane.key, { borderColor })} />
                        </div>
                        <button className="icon-btn nt-lane-reset" type="button" title={`Reset ${lane.label} column`} aria-label={`Reset ${lane.label} column`} onClick={() => resetLane(lane.key)}>
                          <RotateCcw />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          </section>

          <section className="nt-settings-section">
          <div className="nt-settings-section-head">
            <div>
              <h2>Appearances</h2>
            </div>
          </div>
          <div className="nt-settings-note-layout">
            <div className="nt-settings-control-group">
              <h3>Note</h3>
              <div className="nt-settings-fields nt-note-settings">
              <label className="nt-field">
                <span>Border width</span>
                <div className="nt-settings-number">
                  <input
                    className="secinput mono"
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={settings.noteBorderWidth}
                    onChange={(event) => {
                      const width = event.currentTarget.valueAsNumber;

                      if (Number.isFinite(width)) {
                        onChange({ ...settings, noteBorderWidth: Math.max(0, Math.min(12, width)) });
                      }
                    }}
                  />
                  <span>px</span>
                </div>
              </label>
              <label className="nt-field">
                <span>Note height</span>
                <div className="nt-settings-number">
                  <input
                    className="secinput mono"
                    type="number"
                    min="1"
                    max={MAX_NOTE_HEIGHT}
                    step="1"
                    value={settings.noteHeight}
                    onChange={(event) => {
                      const height = event.currentTarget.valueAsNumber;

                      if (Number.isFinite(height)) {
                        onChange({ ...settings, noteHeight: clampNoteHeight(height) });
                      }
                    }}
                  />
                  <span>px</span>
                </div>
              </label>
              <label className="nt-field">
                <span>Long note</span>
                <select
                  className="selctl"
                  value={settings.longNoteStyle}
                  onChange={(event) => onChange({ ...settings, longNoteStyle: event.currentTarget.value as LongNoteStyle })}
                >
                  <option value="solid">Solid</option>
                  <option value="rail">Rail</option>
                  <option value="outline">Outline</option>
                </select>
              </label>
              <label className="nt-field nt-template-field">
                <span className="nt-template-label">
                  Note label
                  <span className="nt-template-help" tabIndex={0} aria-describedby="nt-template-tooltip">
                    <Info aria-hidden="true" />
                    <span className="nt-template-tooltip" id="nt-template-tooltip" role="tooltip">
                      <span className="nt-template-help-group">
                        <strong>Tokens</strong>
                        <span><b>{'{prefix}'}</b> W for WAV, M for OGG</span>
                        <span><b>{'{id}'}</b> Four-digit sample ID</span>
                        <span><b>{'{type}'}</b> WAV or OGG</span>
                        <span><b>{'{lane}'}</b> Lane name</span>
                      </span>
                      <span className="nt-template-help-group">
                        <strong>Transformers</strong>
                        <span><b>:upper</b> Uppercase any token</span>
                        <span><b>:lower</b> Lowercase any token</span>
                        <span><b>:8</b> Pad an ID to eight digits</span>
                        <span className="nt-template-example">Examples: {'{prefix:lower}'} {'{type:upper}'} {'{lane:lower}'} {'{id:6}'}</span>
                      </span>
                    </span>
                  </span>
                </span>
                <input
                  className="secinput mono"
                  value={settings.noteTemplate}
                  maxLength={80}
                  placeholder="{prefix}{id}"
                  onChange={(event) => onChange({ ...settings, noteTemplate: event.currentTarget.value })}
                />
              </label>
              <button className="icon-btn nt-appearance-reset" type="button" title="Reset note appearance" aria-label="Reset note appearance" onClick={resetNoteAppearance}>
                <RotateCcw />
              </button>
              </div>
            </div>
            <div className="nt-settings-control-group">
              <h3>Playback line</h3>
              <div className="nt-settings-fields nt-playback-settings">
                <label className="nt-field nt-playhead-position-field">
                  <span>Position</span>
                  <div className="nt-playhead-position-control">
                    <input
                      type="range"
                      min="1"
                      max={previewPlayheadGrid}
                      step="1"
                      value={playheadPositionStep(settings.playheadPosition, previewPlayheadGrid)}
                      onChange={(event) => onChange({
                        ...settings,
                        playheadGrid: previewPlayheadGrid,
                        playheadPosition: event.currentTarget.valueAsNumber / previewPlayheadGrid,
                      })}
                    />
                    <output className="mono">{playheadPositionStep(settings.playheadPosition, previewPlayheadGrid)}/{previewPlayheadGrid}</output>
                  </div>
                </label>
                <label className="nt-field">
                  <span>Thickness</span>
                  <div className="nt-settings-number">
                    <input
                      className="secinput mono"
                      type="number"
                      min="1"
                      max={MAX_PLAYHEAD_THICKNESS}
                      step="0.5"
                      value={settings.playheadThickness}
                      onChange={(event) => onChange({ ...settings, playheadThickness: clampPlayheadThickness(event.currentTarget.valueAsNumber) })}
                    />
                    <span>px</span>
                  </div>
                </label>
                <label className="nt-field nt-playhead-color-field">
                  <span>Color</span>
                  <ColorInput label="Playback line color" value={settings.playheadColor} onPreview={(playheadColor) => setColorPreview({ ...settings, playheadColor })} onChange={(playheadColor) => onChange({ ...settings, playheadColor })} />
                </label>
                <button className="icon-btn nt-appearance-reset" type="button" title="Reset playback line appearance" aria-label="Reset playback line appearance" onClick={resetPlaybackAppearance}>
                  <RotateCcw />
                </button>
              </div>
            </div>
          </div>
          </section>
        </div>

        <aside className="nt-settings-preview" aria-label="Read-only note area preview">
          <div className="nt-settings-preview-toolbar">
            <h2>Preview</h2>
            <div className="nt-settings-preview-options">
              <RollViewControls
                grid={previewGrid}
                subGrid={previewSubGrid}
                hiSpeed={previewHiSpeed}
                onGridChange={updatePreviewGrid}
                onSubGridChange={updatePreviewSubGrid}
                onHiSpeedChange={setPreviewHiSpeed}
              />
            </div>
          </div>
          <div className="nt-settings-roll-preview">
            <NoteRoll
              keyMode={7}
              hiSpeed={previewHiSpeed}
              grid={previewGrid}
              subGrid={previewSubGrid}
              chart={PREVIEW_CHART}
              endPosition={3}
              settings={previewSettings}
              selectedEvents={[]}
              selectMode={false}
              notePlacementMode={false}
              longNoteMode={false}
              readOnly
              allowColumnResize
              subscribePosition={subscribePreviewPosition}
              onSeek={noop}
              onHiSpeedChange={(value) => setPreviewHiSpeed(value.toFixed(1))}
              onSettingsChange={onChange}
              onPlayheadPositionChange={updatePreviewPlayhead}
              onGridEvent={noop}
              onLongNoteDrag={noop}
              onSelectEvent={noop}
              onDeleteEvent={noop}
              onMoveEvents={noop}
              onSelectEvents={noop}
            />
          </div>
        </aside>
      </div>

      <div className="dialogfoot nt-settings-footer">
        {message ?? storageMessage ? <span className="hint warn">{message ?? storageMessage}</span> : null}
        <button className="btn" type="button" onClick={resetAll}>
          <RotateCcw />
          Reset all
        </button>
        <label className="btn nt-settings-import">
          <Upload />
          Import
          <input className="sr-only" type="file" accept="application/json,.json" onChange={importProfile} />
        </label>
        <button className="btn" type="button" onClick={exportProfile}>
          <Download />
          Export
        </button>
      </div>
    </Overlay>
  );
}

function ColorInput({
  label,
  value,
  disabled = false,
  onPreview,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onPreview: (value: string) => void;
  onChange: (value: string) => void;
}) {
  const [displayedValue, setDisplayedValue] = useState(value);
  const pendingChange = useRef<number | null>(null);

  useEffect(() => {
    if (pendingChange.current !== null) {
      window.clearTimeout(pendingChange.current);
      pendingChange.current = null;
    }

    setDisplayedValue(value);
  }, [value]);

  useEffect(() => () => {
    if (pendingChange.current !== null) {
      window.clearTimeout(pendingChange.current);
    }
  }, []);

  const updateColor = (nextValue: string) => {
    setDisplayedValue(nextValue);
    onPreview(nextValue);

    if (pendingChange.current !== null) {
      window.clearTimeout(pendingChange.current);
    }

    pendingChange.current = window.setTimeout(() => {
      pendingChange.current = null;
      onChange(nextValue);
    }, 80);
  };

  const commitColor = () => {
    if (pendingChange.current === null) {
      return;
    }

    window.clearTimeout(pendingChange.current);
    pendingChange.current = null;
    onChange(displayedValue);
  };

  return (
    <input
      className="nt-color-input"
      type="color"
      value={displayedValue}
      disabled={disabled}
      aria-label={label}
      title={label}
      onChange={(event) => updateColor(event.currentTarget.value)}
      onBlur={commitColor}
    />
  );
}
