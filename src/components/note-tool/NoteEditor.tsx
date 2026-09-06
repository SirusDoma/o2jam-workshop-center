import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Eraser, MousePointer2, Pause, Pencil, Play, Redo2, Square, Undo2 } from 'lucide-react';
import { NOTE_LANE_KEYS, NOTE_LANE_KEYS_3, formatNoteLabel, type NoteLaneKey, type NoteToolSettings } from '../../features/note-tool/settings';
import { playbackEvents, tempoChanges } from '../../features/note-tool/chart';
import {
  chartEndPosition,
  copyChartNotes,
  defaultBpmAtPosition,
  findChartEvent,
  moveChartEvents,
  pasteChartNotes,
  placeAutoplayNote,
  placeBpmChange,
  placeMeasureFraction,
  removeChartEvent,
  updateChartEvent,
  type CopiedChartNotes,
} from '../../features/note-tool/document';
import { findNote, placeLongNote, placeTapNote, volumeLevelToPercent } from '../../features/note-tool/editor';
import { EventInspector } from './EventInspector';
import { ChartSummary } from './ChartSummary';
import type { OjmSample } from '../../features/note-tool/model';
import { NoteRoll, type LongNoteGridEvent, type NoteGridEvent } from './NoteRoll';
import { RollViewControls } from './RollViewControls';
import { SampleBankPicker } from './SampleBankPicker';
import { TimingValueDialog } from './TimingValueDialog';
import { DEFAULT_FRACTION_VALUE } from '../../features/note-tool/timingValues';
import type { Difficulty, EditorChart, EditorChartNote, EditorMeasureFraction, EditTool, InspectorEvent, KeyMode } from '../../features/note-tool/types';
import { updateEventSelection, updateMarqueeSelection } from '../../features/note-tool/selection';
import { bpmAtPosition, playbackEndPosition, positionToSeconds, shouldRefreshPlaybackReadout, type TempoChange } from '../../features/note-tool/playback';
import { useChartPlayback, type PlaybackPositionSubscription } from '../../features/note-tool/useChartPlayback';
import { formatShortcut, hasPrimaryModifier, historyShortcut, isMacPlatform, playbackShortcut } from '../../features/note-tool/shortcuts';
import { useToolActive } from '../../context/ToolActiveContext';

type PendingTimingEvent = {
  kind: 'bpm' | 'fraction';
  id: string;
  absolutePosition: number;
  measure: number;
  position: number;
  defaultValue: number;
};

export function NoteEditor({
  chart,
  difficulty,
  baseBpm,
  samples,
  selectedSample,
  keyMode,
  initialHiSpeed,
  onKeyModeChange,
  onHiSpeedChange,
  settings,
  onSettingsChange,
  onSelectedSampleChange,
  onPlaybackChange,
  onChartChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleMaximized,
}: {
  chart: EditorChart;
  difficulty: Difficulty;
  baseBpm: number;
  samples: OjmSample[];
  selectedSample: Pick<OjmSample, 'id' | 'type'>;
  keyMode: KeyMode;
  initialHiSpeed: string;
  onKeyModeChange: (mode: KeyMode) => void;
  onHiSpeedChange: (value: string) => void;
  settings: NoteToolSettings;
  onSettingsChange: (settings: NoteToolSettings) => void;
  onSelectedSampleChange: (sample: Pick<OjmSample, 'id' | 'type'>) => void;
  onPlaybackChange: (playing: boolean) => void;
  onChartChange: (chart: EditorChart) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMaximized: () => void;
}) {
  const active = useToolActive();
  const [tool, setTool] = useState<EditTool>('select');
  const [longNote, setLongNote] = useState(false);
  const [noteVolume, setNoteVolume] = useState('16');
  const [notePan, setNotePan] = useState('0');
  const [hiSpeed, setHiSpeed] = useState(initialHiSpeed);
  const [subGrid, setSubGrid] = useState('1/4');
  const [grid, setGrid] = useState('1/16');
  const [shiftLongNote, setShiftLongNote] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<InspectorEvent[]>([]);
  const [pendingTimingEvent, setPendingTimingEvent] = useState<PendingTimingEvent | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'summary'>('inspector');
  const [seekingDuringPlayback, setSeekingDuringPlayback] = useState(false);
  const [measureScrollRequest, setMeasureScrollRequest] = useState<{ direction: 1 | -1 } | null>(null);
  const noteSequence = useRef(0);
  const copiedNotes = useRef<CopiedChartNotes | null>(null);
  const readCursorPosition = useRef<(() => number) | null>(null);
  const resumeAfterSeek = useRef(false);
  const editorNotes = chart.notes;
  const endPosition = playbackEndPosition(chartEndPosition(chart));
  const bpmChanges = useMemo(() => tempoChanges(chart), [chart]);
  const events = useMemo(() => playbackEvents(chart), [chart]);
  const playback = useChartPlayback({
    baseBpm,
    bpmChanges,
    events,
    measureFractions: chart.measureFractions,
    samples,
    endPosition,
  });

  const playbackLocked = playback.playing || seekingDuringPlayback;
  const keys: NoteLaneKey[] = keyMode === 3 ? [...NOTE_LANE_KEYS_3] : [...NOTE_LANE_KEYS];
  const selectedSampleId = selectedSample.id;
  const selectedSampleType = selectedSample.type;
  const selectedEvent = selectedEvents.length === 1 ? selectedEvents[0] ?? null : null;
  const inspectedEvent = selectedEvent ? findChartEvent(chart, selectedEvent) : null;
  const effectiveLongNote = longNote || shiftLongNote;
  const updateHiSpeed = useCallback((value: string) => {
    setHiSpeed(value);
    onHiSpeedChange(value);
  }, [onHiSpeedChange]);

  const restoreHistory = useCallback((redo: boolean) => {
    if (playbackLocked || (redo ? !canRedo : !canUndo)) {
      return;
    }

    if (redo) {
      onRedo();
    } else {
      onUndo();
    }
    setSelectedEvents([]);
    setPendingTimingEvent(null);
  }, [canRedo, canUndo, onRedo, onUndo, playbackLocked]);

  useEffect(() => {
    onPlaybackChange(playbackLocked);
    if (playbackLocked) {
      setSelectedEvents([]);
      setShiftLongNote(false);
    }
  }, [onPlaybackChange, playbackLocked]);

  useEffect(() => {
    setSelectedEvents([]);
    setPendingTimingEvent(null);
  }, [difficulty]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const press = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('[role="dialog"], [role="alertdialog"], .nt-image-preview-overlay')) {
        return;
      }

      if (event.key === 'Escape') {
        if (playback.playing) {
          event.preventDefault();
          playback.stop();
        }

        setSelectedEvents([]);
        return;
      }

      if (isEditableTarget(event.target) || event.altKey) {
        return;
      }

      const historyAction = historyShortcut(event);
      if (historyAction) {
        event.preventDefault();
        if (!event.repeat) {
          restoreHistory(historyAction === 'redo');
        }
        return;
      }

      const primaryModifier = hasPrimaryModifier(event);
      if ((event.ctrlKey || event.metaKey) && !primaryModifier) {
        return;
      }

      if (event.key === 'Shift' && tool === 'note' && !playbackLocked) {
        setShiftLongNote(true);
      }

      if (event.code === 'Space') {
        const action = playbackShortcut(event);
        if (!action) {
          return;
        }

        event.preventDefault();
        if (event.repeat || seekingDuringPlayback) {
          return;
        }

        if (action === 'restart') {
          playback.stop();
          if (!playback.playing) {
            void playback.play();
          }
        } else if (playback.playing) {
          playback.pause();
        } else {
          void playback.play();
        }

        return;
      }

      if (!primaryModifier) {
        if (event.shiftKey) {
          return;
        }

        const key = isMacPlatform() && event.key === 'Backspace' ? 'delete' : event.key.toLowerCase();
        if (key === 'f2') {
          event.preventDefault();
          if (!event.repeat) {
            onToggleMaximized();
          }

          return;
        }

        if (key !== 's' && key !== 'e' && key !== 'd' && key !== 'delete' && key !== 'pageup' && key !== 'pagedown') {
          return;
        }

        event.preventDefault();
        if (event.repeat) {
          return;
        }

        if (key === 'pageup' || key === 'pagedown') {
          setMeasureScrollRequest({ direction: key === 'pageup' ? 1 : -1 });
          return;
        }

        if (playbackLocked) {
          return;
        }

        if (key === 'delete') {
          const noteIds = new Set(selectedEvents.filter((item) => item.kind === 'note').map((item) => item.id));
          const autoplayIds = new Set(selectedEvents.filter((item) => item.kind === 'autoplay').map((item) => item.id));
          if (noteIds.size === 0 && autoplayIds.size === 0) {
            return;
          }

          onChartChange({
            ...chart,
            notes: chart.notes.filter((note) => !noteIds.has(note.id)),
            autoplayNotes: chart.autoplayNotes.filter((note) => !autoplayIds.has(note.id)),
          });
          setSelectedEvents((current) => current.filter((item) => item.kind !== 'note' && item.kind !== 'autoplay'));
        } else {
          setTool(key === 's' ? 'select' : key === 'e' ? 'note' : 'erase');
        }

        return;
      }

      const key = event.key.toLowerCase();
      if ((event.shiftKey && key !== 'v') || (key !== 'a' && key !== 'c' && key !== 'd' && key !== 'v')) {
        return;
      }

      event.preventDefault();
      if (event.repeat || playbackLocked) {
        return;
      }

      if (key === 'a') {
        setSelectedEvents([
          ...chart.notes.map((note) => ({ kind: 'note' as const, id: note.id })),
          ...chart.autoplayNotes.map((note) => ({ kind: 'autoplay' as const, id: note.id })),
        ]);
      } else if (key === 'd') {
        setSelectedEvents([]);
      } else if (key === 'c') {
        const copied = copyChartNotes(chart, selectedEvents);
        if (copied.notes.length > 0 || copied.autoplayNotes.length > 0) {
          copiedNotes.current = copied;
        }
      } else if (key === 'v') {
        const position = event.shiftKey ? null : readCursorPosition.current?.();
        if (!copiedNotes.current || position === undefined) {
          return;
        }

        const pasted = pasteChartNotes(chart, copiedNotes.current, position, () => `placed-${Date.now()}-${noteSequence.current += 1}`);
        onChartChange(pasted.chart);
        setSelectedEvents(pasted.selection);
        setTool('select');
        setShiftLongNote(false);
      }
    };

    const release = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftLongNote(false);
      }
    };

    const blur = () => {
      setShiftLongNote(false);
    };

    window.addEventListener('keydown', press);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', press);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', blur);
    };
  }, [active, chart, onChartChange, onToggleMaximized, playback.play, playback.pause, playback.stop, playback.playing, playbackLocked, restoreHistory, seekingDuringPlayback, selectedEvents, tool]);

  const selectTool = (nextTool: EditTool) => {
    setTool(nextTool);
  };

  const handleGridEvent = (kind: InspectorEvent['kind'], event: NoteGridEvent) => {
    const absolutePosition = event.measure + event.position;
    const tolerance = 1 / Number(grid.split('/')[1]) / 3;
    const key = kind === 'note' ? NOTE_LANE_KEYS[event.lane - 1] : undefined;
    if (kind === 'note' && !key) {
      return;
    }

    const target = kind === 'note'
      ? findNote(editorNotes, key!, absolutePosition, tolerance)
      : kind === 'autoplay'
        ? chart.autoplayNotes.find((item) => item.lane === event.lane && Math.abs(item.absolutePosition - absolutePosition) <= tolerance)
        : kind === 'bpm'
          ? chart.bpmChanges.find((item) => Math.abs(item.absolutePosition - absolutePosition) <= tolerance)
          : chart.measureFractions.find((item) => item.measure === event.measure);

    const targetSelection = target ? { kind, id: target.id } as InspectorEvent : null;

    if (tool === 'select') {
      setSelectedEvents((current) => updateEventSelection(current, targetSelection, event.additive));
      return;
    }

    if (tool === 'erase') {
      if (!targetSelection) {
        return;
      }

      onChartChange(removeChartEvent(chart, targetSelection));
      setSelectedEvents((current) => current.filter((item) => item.kind !== targetSelection.kind || item.id !== targetSelection.id));
      return;
    }

    if (kind === 'bpm') {
      setPendingTimingEvent({
        kind,
        id: target?.id ?? `placed-${Date.now()}-${noteSequence.current += 1}`,
        absolutePosition,
        measure: event.measure,
        position: event.position,
        defaultValue: defaultBpmAtPosition(chart, absolutePosition, baseBpm),
      });

      return;
    }

    if (kind === 'fraction') {
      setPendingTimingEvent({
        kind,
        id: target?.id ?? `placed-${Date.now()}-${noteSequence.current += 1}`,
        absolutePosition,
        measure: event.measure,
        position: event.position,
        defaultValue: target && 'fraction' in target ? target.fraction : DEFAULT_FRACTION_VALUE,
      });

      return;
    }

    const id = `placed-${Date.now()}-${noteSequence.current += 1}`;
    if (kind === 'autoplay') {
      onChartChange(placeAutoplayNote(chart, {
        id,
        lane: event.lane,
        absolutePosition,
        sampleType: selectedSampleType,
        sampleId: selectedSampleId,
        volume: volumeLevelToPercent(Number(noteVolume)),
        pan: Number(notePan),
      }));

      setSelectedEvents([{ kind, id }]);
      return;
    }

    const nextNote: EditorChartNote = {
      id,
      key: key!,
      absolutePosition,
      sampleType: selectedSampleType,
      sampleId: selectedSampleId,
      volume: volumeLevelToPercent(Number(noteVolume)),
      pan: Number(notePan),
    };

    onChartChange({ ...chart, notes: placeTapNote(editorNotes, nextNote) });
    setSelectedEvents([{ kind: 'note', id }]);
  };

  const handleLongNoteDrag = (event: LongNoteGridEvent) => {
    const key = NOTE_LANE_KEYS[event.lane - 1];
    if (!key || event.endPosition <= event.startPosition) {
      return;
    }

    const id = `placed-${Date.now()}-${noteSequence.current += 1}`;
    const note: EditorChartNote = {
      id,
      key,
      absolutePosition: event.startPosition,
      sampleType: selectedSampleType,
      sampleId: selectedSampleId,
      volume: volumeLevelToPercent(Number(noteVolume)),
      pan: Number(notePan),
    };

    onChartChange({ ...chart, notes: placeLongNote(editorNotes, note, event.endPosition) });
    setSelectedEvents([{ kind: 'note', id }]);
  };

  const deleteEvent = (selection: InspectorEvent) => {
    onChartChange(removeChartEvent(chart, selection));
    setSelectedEvents((current) => current.filter((item) => item.kind !== selection.kind || item.id !== selection.id));
  };

  const confirmTimingEvent = (value: number) => {
    if (!pendingTimingEvent) {
      return;
    }

    if (pendingTimingEvent.kind === 'bpm') {
      onChartChange(placeBpmChange(chart, {
        id: pendingTimingEvent.id,
        absolutePosition: pendingTimingEvent.absolutePosition,
        bpm: value,
      }));
    } else {
      onChartChange(placeMeasureFraction(chart, {
        id: pendingTimingEvent.id,
        measure: pendingTimingEvent.measure,
        fraction: value,
      }));
    }

    setSelectedEvents([{ kind: pendingTimingEvent.kind, id: pendingTimingEvent.id }]);
    setPendingTimingEvent(null);
  };

  const startPlaybackSeek = () => {
    resumeAfterSeek.current = playback.playing;
    if (playback.playing) {
      setSeekingDuringPlayback(true);
      playback.pause();
    }
  };

  const finishPlaybackSeek = () => {
    if (!resumeAfterSeek.current) {
      return;
    }

    resumeAfterSeek.current = false;
    void playback.play().finally(() => setSeekingDuringPlayback(false));
  };

  return (
    <section className="nt-editor" aria-label="Note editor">
      <div className="nt-transport" aria-label="Transport controls">
        <div className="nt-transport-group">
          <button
            className="icon-btn nt-play"
            type="button"
            aria-label={playback.playing ? 'Pause' : 'Play'}
            title={playback.playing ? 'Pause (Space)' : 'Play (Space)'}
            onClick={() => playback.playing ? playback.pause() : void playback.play()}
          >
            {playback.playing ? <Pause /> : <Play />}
          </button>
          <button className="icon-btn" type="button" disabled={!playback.playing && playback.position <= 0} aria-label="Stop and return to start" title={`Stop and return to start (${formatShortcut('Ctrl + Space')} / Esc)`} onClick={playback.stop}>
            <Square />
          </button>
        </div>
        <PlaybackReadout
          initialPosition={playback.position}
          playing={playback.playing}
          endPosition={endPosition}
          baseBpm={baseBpm}
          bpmChanges={bpmChanges}
          measureFractions={chart.measureFractions}
          subscribePosition={playback.subscribePosition}
          onSeek={playback.setPosition}
          onSeekStart={startPlaybackSeek}
          onSeekEnd={finishPlaybackSeek}
        />
        {playback.message ? <span className="nt-transport-status" role="status">{playback.message}</span> : null}
        <div className="nt-transport-options">
          <label className="nt-grid-option">
            <span>Mode</span>
            <select className="selctl" value={keyMode} disabled={playback.playing} aria-label="Key mode" onChange={(event) => onKeyModeChange(Number(event.currentTarget.value) as KeyMode)}>
              <option value="7">7K</option><option value="3">3K</option>
            </select>
          </label>
          <RollViewControls
            grid={grid}
            subGrid={subGrid}
            hiSpeed={hiSpeed}
            onGridChange={setGrid}
            onSubGridChange={setSubGrid}
            onHiSpeedChange={updateHiSpeed}
          />
        </div>
      </div>

      <div className="nt-editbar" aria-label="Editing tools" aria-disabled={playbackLocked} inert={playbackLocked}>
        <div className="nt-tools">
          <EditButton icon={<MousePointer2 />} label="Select" id="select" active={tool} onSelect={selectTool} />
          <EditButton icon={<Pencil />} label="Note" id="note" active={tool} onSelect={selectTool} />
          <EditButton icon={<Eraser />} label="Erase" id="erase" active={tool} onSelect={selectTool} />
        </div>
        <div className="nt-tools" role="group" aria-label="Event history">
          <button className="icon-btn" type="button" aria-label="Undo" title={`Undo (${formatShortcut('Ctrl + Z')})`} disabled={playbackLocked || !canUndo} onClick={() => restoreHistory(false)}><Undo2 /></button>
          <button className="icon-btn" type="button" aria-label="Redo" title={`Redo (${formatShortcut('Ctrl + Shift + Z')})`} disabled={playbackLocked || !canRedo} onClick={() => restoreHistory(true)}><Redo2 /></button>
        </div>
        {tool === 'note' ? (
          <>
            <div className="nt-note-kind" role="group" aria-label="Note length">
              <button className={`icon-btn${!effectiveLongNote ? ' on' : ''}`} type="button" aria-label="Normal note mode" aria-pressed={!effectiveLongNote} title="Normal note mode" onClick={() => setLongNote(false)}>
                <NoteModeIcon />
              </button>
              <button className={`icon-btn${effectiveLongNote ? ' on' : ''}`} type="button" aria-label="Long note mode" aria-pressed={effectiveLongNote} title="Long note mode. Hold Shift for temporary long note mode." onClick={() => setLongNote(true)}>
                <NoteModeIcon long />
              </button>
            </div>
            <div className="nt-note-options">
              <SampleBankPicker
                className="nt-note-sample"
                samples={samples}
                sampleId={selectedSampleId}
                sampleType={selectedSampleType}
                overlay
                onChange={onSelectedSampleChange}
              />
              <label className="nt-note-value" onContextMenu={(event) => { event.preventDefault(); setNoteVolume('16'); }}>
                <span>Volume</span>
                <input type="range" min="1" max="16" step="1" value={noteVolume} onChange={(event) => setNoteVolume(event.currentTarget.value)} />
                <output className="mono">{noteVolume}</output>
              </label>
              <label className="nt-note-value" onContextMenu={(event) => { event.preventDefault(); setNotePan('0'); }}>
                <span>Pan</span>
                <input className="nt-pan-slider" type="range" min="-7" max="7" step="1" value={notePan} onChange={(event) => setNotePan(event.currentTarget.value)} />
                <output className="mono">{notePan}</output>
              </label>
            </div>
          </>
        ) : null}
      </div>

      <div className="nt-roll-stage">
        <NoteRoll
          keyMode={keyMode}
          hiSpeed={hiSpeed}
          grid={grid}
          subGrid={subGrid}
          chart={chart}
          endPosition={endPosition}
          settings={settings}
          selectedEvents={selectedEvents}
          selectMode={tool === 'select'}
          notePlacementMode={tool === 'note'}
          longNoteMode={effectiveLongNote}
          subscribePosition={playback.subscribePosition}
          onSeek={playback.setPosition}
          onHiSpeedChange={(value) => updateHiSpeed(value.toFixed(1))}
          onSettingsChange={onSettingsChange}
          readOnly={playbackLocked}
          playing={playback.playing}
          measureScrollRequest={measureScrollRequest}
          onGridEvent={handleGridEvent}
          onLongNoteDrag={handleLongNoteDrag}
          formatDraftNoteLabel={(lane) => formatNoteLabel(settings.noteTemplate, { lane, sampleId: selectedSampleId, sampleType: selectedSampleType })}
          onCursorMove={(readPosition) => { readCursorPosition.current = readPosition; }}
          onSelectEvent={(selection, additive) => setSelectedEvents((current) => updateEventSelection(current, selection, additive))}
          onSelectEvents={(selection, additive) => setSelectedEvents((current) => updateMarqueeSelection(current, selection, additive))}
          onDeleteEvent={deleteEvent}
          onMoveEvents={(selection, movement) => {
            const next = moveChartEvents(chart, selection, { ...movement, noteLanes: NOTE_LANE_KEYS });
            const mainIds = new Set(next.notes.map((note) => note.id));
            onChartChange(next);
            setSelectedEvents((current) => current.map((event) => event.kind === 'note' || event.kind === 'autoplay'
              ? { kind: mainIds.has(event.id) ? 'note' : 'autoplay', id: event.id }
              : event));
          }}
        />
        {!playbackLocked ? <details className="nt-floating-inspector" open={inspectorOpen} onToggle={(event) => setInspectorOpen(event.currentTarget.open)}>
          <summary>
            <span>{inspectorTab === 'inspector' ? 'Inspector' : 'Summary'}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="nt-panel-tabs nt-inspector-tabs" role="tablist" aria-label="Inspector panel">
            <button className={inspectorTab === 'inspector' ? 'on' : ''} type="button" role="tab" aria-selected={inspectorTab === 'inspector'} onClick={() => setInspectorTab('inspector')}>Inspector</button>
            <button className={inspectorTab === 'summary' ? 'on' : ''} type="button" role="tab" aria-selected={inspectorTab === 'summary'} onClick={() => setInspectorTab('summary')}>Summary</button>
          </div>
          {inspectorTab === 'inspector' ? (
            <EventInspector
              event={inspectedEvent}
              selectionCount={selectedEvents.length}
              keys={keys}
              gridDivision={Number(grid.split('/')[1])}
              measureFractions={chart.measureFractions}
              samples={samples}
              onChange={(patch) => {
                if (selectedEvent) {
                  onChartChange(updateChartEvent(chart, selectedEvent, patch));
                }
              }}
            />
          ) : (
            <ChartSummary difficulty={difficulty} chart={chart} baseBpm={baseBpm} />
          )}
        </details> : null}
      </div>
      {pendingTimingEvent ? (
        <TimingValueDialog
          kind={pendingTimingEvent.kind}
          location={formatTimingLocation(pendingTimingEvent, Number(grid.split('/')[1]))}
          defaultValue={pendingTimingEvent.defaultValue}
          onConfirm={confirmTimingEvent}
          onClose={() => setPendingTimingEvent(null)}
        />
      ) : null}
    </section>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('input:not([type="range"]), textarea, select') !== null);
}

function PlaybackReadout({
  initialPosition,
  playing,
  endPosition,
  baseBpm,
  bpmChanges,
  measureFractions,
  subscribePosition,
  onSeek,
  onSeekStart,
  onSeekEnd,
}: {
  initialPosition: number;
  playing: boolean;
  endPosition: number;
  baseBpm: number;
  bpmChanges: readonly TempoChange[];
  measureFractions: readonly EditorMeasureFraction[];
  subscribePosition: PlaybackPositionSubscription;
  onSeek: (position: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
}) {
  const [position, setPosition] = useState(initialPosition);
  const previousRefresh = useRef(0);

  useEffect(() => {
    if (!playing) {
      setPosition(initialPosition);
    }
  }, [initialPosition, playing]);

  useEffect(() => subscribePosition((next) => {
    const now = performance.now();
    if (next === 0 || next === endPosition || shouldRefreshPlaybackReadout(previousRefresh.current, now)) {
      previousRefresh.current = now;
      setPosition(next);
    }
  }), [playing, endPosition, subscribePosition]);

  const measure = Math.floor(position);
  const fraction = Math.floor((position - measure) * 16) + 1;
  const maxPosition = Math.max(endPosition, 1 / 64);

  return (
    <>
      <label
        className="nt-clock-seek"
        style={{ '--nt-seek-progress': `${endPosition > 0 ? position / endPosition * 100 : 0}%` } as CSSProperties}
      >
        <span className="sr-only">Playback position</span>
        <input
          type="range"
          min="0"
          max={maxPosition}
          step={1 / 64}
          value={Math.min(position, maxPosition)}
          onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.currentTarget.setPointerCapture(event.pointerId);
              onSeekStart();
            }
          }}
          onPointerUp={onSeekEnd}
          onPointerCancel={onSeekEnd}
        />
        <output className="nt-clock">{formatClock(positionToSeconds(position, baseBpm, bpmChanges, measureFractions))}</output>
      </label>
      <div className="nt-transport-readout">
        <span>Measure</span>
        <b>{String(measure).padStart(3, '0')} : {String(fraction).padStart(2, '0')}</b>
      </div>
      <div className="nt-transport-readout">
        <span>BPM</span>
        <b>{bpmAtPosition(position, baseBpm, bpmChanges).toFixed(2)}</b>
      </div>
    </>
  );
}

function EditButton({
  icon,
  label,
  id,
  active,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  id: EditTool;
  active: EditTool;
  onSelect: (tool: EditTool) => void;
}) {
  return (
    <button className={`nt-tool${active === id ? ' on' : ''}`} type="button" aria-pressed={active === id} aria-label={label} title={label} onClick={() => onSelect(id)}>
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function NoteModeIcon({ long = false }: { long?: boolean }) {
  return (
    <svg
      className={`nt-note-mode-icon${long ? ' long' : ''}`}
      viewBox={long ? '0 0 16 18' : '0 0 16 16'}
      aria-hidden="true"
      focusable="false"
    >
      {long ? (
        <>
          <rect x="3" y="3" width="10" height="12" />
          <path d="M3 0v18M13 0v18" />
        </>
      ) : (
        <>
          <rect x="3" y="7" width="10" height="2" />
          <path d="M3 4v8M13 4v8" />
        </>
      )}
    </svg>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function formatTimingLocation(event: PendingTimingEvent, gridDivision: number): string {
  const measure = String(event.measure).padStart(3, '0');
  if (event.kind === 'fraction') {
    return `Measure ${measure}`;
  }

  return `Measure ${measure} · ${Math.round(event.position * gridDivision)}/${gridDivision}`;
}
