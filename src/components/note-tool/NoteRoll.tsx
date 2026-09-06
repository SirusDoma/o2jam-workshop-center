import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type UIEvent, type WheelEvent } from 'react';
import {
  DEFAULT_NOTE_TOOL_SETTINGS,
  MAX_LANE_WIDTH,
  NOTE_LANE_KEYS,
  SAMPLE_LANE_KEYS,
  clampLaneWidth,
  effectiveNoteLaneWidth,
  formatNoteLabel,
  playheadPositionFromChartPosition,
  playheadPositionStep,
  playheadTopRatio,
  updateNoteLaneSettings,
  type NoteAreaLaneKey,
  type NoteLaneKey,
  type NoteToolSettings,
  type NoteLaneSettings,
  type SampleLaneKey,
} from '../../features/note-tool/settings';
import type { AutoplayChartNote, EditorChart, EditorChartNote, InspectorEvent, KeyMode } from '../../features/note-tool/types';
import { clampNoteLaneDelta, type EventMovement } from '../../features/note-tool/document';
import { listenForControlWheel } from '../../features/note-tool/dom';
import { alignToDevicePixel, chartPositionAtY, chartPositionY, edgeScrollDelta, edgeScrollTop, gridLineHeight, gridPositionAtY, laneLabelFits, longNoteBox, measurePixelHeight, nextHiSpeed, noteCellBox, playbackRenderWindow } from '../../features/note-tool/rollLayout';
import { formatBpmValue } from '../../features/note-tool/timingValues';
import { isEventSelected, playbackScrollTop, selectionForEventDrag, updateMarqueeSelection } from '../../features/note-tool/selection';
import type { PlaybackPositionSubscription } from '../../features/note-tool/useChartPlayback';

const KEYS_7: NoteLaneKey[] = [...NOTE_LANE_KEYS];
const AUDIO_LANE_KEYS = [...NOTE_LANE_KEYS, ...SAMPLE_LANE_KEYS];
const SAMPLE_LANES = SAMPLE_LANE_KEYS.map((_, index) => index + 1);

type ResizableLaneKey = NoteLaneKey | SampleLaneKey;

export type NoteGridEvent = {
  measure: number;
  position: number;
  lane: number;
  additive: boolean;
};

export type LongNoteGridEvent = {
  lane: number;
  startPosition: number;
  endPosition: number;
};

function LaneHeaderLabel({ children, width }: { children: string; width: number }) {
  const label = useRef<HTMLSpanElement>(null);
  const [requiredWidth, setRequiredWidth] = useState(Infinity);

  useLayoutEffect(() => {
    const element = label.current;
    const column = element?.parentElement;
    if (!element || !column) {
      return;
    }

    const update = () => {
      const style = getComputedStyle(column);
      setRequiredWidth(element.getBoundingClientRect().width + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth));
    };

    const observer = new ResizeObserver(update);
    observer.observe(column);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [children, width]);

  const visible = width > 0 && laneLabelFits(width, requiredWidth);
  return <span ref={label} className={`nt-lane-head-label${visible ? '' : ' is-hidden'}`} aria-hidden={!visible}>{children}</span>;
}

type EventHandlers = {
  'data-event-kind': InspectorEvent['kind'];
  'data-event-id': string;
  onPointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLSpanElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLSpanElement>) => void;
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void;
};

export function NoteRoll({
  keyMode,
  hiSpeed,
  grid,
  subGrid,
  chart,
  endPosition,
  settings,
  selectedEvents,
  selectMode,
  notePlacementMode,
  readOnly = false,
  playing = false,
  measureScrollRequest,
  allowColumnResize = false,
  subscribePosition,
  onSeek,
  onHiSpeedChange,
  onSettingsChange,
  onGridEvent,
  onLongNoteDrag,
  formatDraftNoteLabel,
  onCursorMove,
  onSelectEvent,
  onDeleteEvent,
  onMoveEvents,
  onSelectEvents,
  onPlayheadPositionChange,
}: {
  keyMode: KeyMode;
  hiSpeed: string;
  grid: string;
  subGrid: string;
  chart: EditorChart;
  endPosition: number;
  settings: NoteToolSettings;
  selectedEvents: readonly InspectorEvent[];
  selectMode: boolean;
  notePlacementMode: boolean;
  longNoteMode: boolean;
  readOnly?: boolean;
  playing?: boolean;
  measureScrollRequest?: { direction: 1 | -1 } | null;
  allowColumnResize?: boolean;
  subscribePosition: PlaybackPositionSubscription;
  onSeek: (position: number) => void;
  onHiSpeedChange: (value: number) => void;
  onSettingsChange: (settings: NoteToolSettings) => void;
  onGridEvent: (kind: InspectorEvent['kind'], event: NoteGridEvent) => void;
  onLongNoteDrag: (event: LongNoteGridEvent) => void;
  formatDraftNoteLabel?: (key: NoteLaneKey) => string;
  onCursorMove?: (readPosition: (() => number) | null) => void;
  onSelectEvent: (selection: InspectorEvent, additive: boolean) => void;
  onDeleteEvent: (selection: InspectorEvent) => void;
  onMoveEvents: (selection: readonly InspectorEvent[], movement: EventMovement) => void;
  onSelectEvents: (selection: readonly InspectorEvent[], additive: boolean) => void;
  onPlayheadPositionChange?: (position: number) => void;
}) {
  const { notes, autoplayNotes } = chart;
  const chartMeasures = Math.max(readOnly ? 1 : 4, Math.ceil(endPosition), chart.measureCount, maxEventMeasure(notes, autoplayNotes));
  const [measureCount, setMeasureCount] = useState(chartMeasures);
  const wrapper = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef(0);
  const previousScrollTop = useRef(0);
  const manualScrollUntil = useRef(0);
  const previousFollowDistance = useRef<number | null>(null);
  const previousPlaybackPosition = useRef<number | null>(null);
  const scrollbarHeld = useRef(false);
  const viewport = useRef({ height: 0, maxScrollTop: 0 });
  const renderWindowRef = useRef<ReturnType<typeof playbackRenderWindow> | null>(null);
  const [renderWindow, setRenderWindow] = useState<ReturnType<typeof playbackRenderWindow> | null>(null);
  const loadingMeasures = useRef(false);
  const suppressGridClick = useRef(false);
  const rulerSeek = useRef<{ pointerId: number; target: HTMLDivElement; clientY: number } | null>(null);
  const rulerSeekAnimation = useRef<number | null>(null);
  const playheadDrag = useRef<number | null>(null);
  const suppressPlayheadScroll = useRef(false);
  const timingDrag = useRef<{ x: number; width: number; lane: 'fraction' | 'bpm' }>({ x: 0, width: 58, lane: 'fraction' });
  const laneDrag = useRef<{ x: number; width: number; key: ResizableLaneKey }>({ x: 0, width: 70, key: 'S' });
  const longNoteDrag = useRef<{
    pointerId: number;
    target: HTMLDivElement;
    key: NoteLaneKey;
    lane: number;
    startPosition: number;
    endPosition: number;
    startClientY: number;
    clientY: number;
  } | null>(null);

  const longNoteAnimation = useRef<number | null>(null);
  const [longNoteDraft, setLongNoteDraft] = useState<{
    key: NoteLaneKey;
    startPosition: number;
    endPosition: number;
  } | null>(null);

  const eventDrag = useRef<{
    pointerId: number;
    selection: InspectorEvent[];
    target: InspectorEvent;
    kind: InspectorEvent['kind'];
    body: Element;
    clientX: number;
    clientY: number;
    grabOffsetY: number;
    startPosition: number;
    startLane: number;
    positionDelta: number;
    laneDelta: number;
  } | null>(null);

  const eventDragAnimation = useRef<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    selection: InspectorEvent[];
    positionDelta: number;
    laneDelta: number;
  } | null>(null);

  const [marquee, setMarquee] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
  } | null>(null);

  const keys = KEYS_7;
  const marqueeDrag = useRef<{
    pointerId: number;
    target: HTMLDivElement;
    startX: number;
    startPosition: number;
    clientX: number;
    clientY: number;
    additive: boolean;
    initialSelection: readonly InspectorEvent[];
    selection: readonly InspectorEvent[];
  } | null>(null);

  const marqueeAnimation = useRef<number | null>(null);
  const rulerWidth = settings.lanes.measure.width;
  const measureWidth = settings.lanes.fraction.width;
  const bpmWidth = settings.lanes.bpm.width;
  const currentKeyWidths = keys.map((key) => effectiveNoteLaneWidth(keyMode, key, settings.lanes[key].width));
  const keyWidth = currentKeyWidths.reduce((total, width) => total + width, 0);
  const keyColumns = currentKeyWidths.map((width) => `${width}px`).join(' ');
  const currentSampleWidths = SAMPLE_LANE_KEYS.map((key) => settings.lanes[key].width);
  const sampleWidth = currentSampleWidths.reduce((total, width) => total + width, 0);
  const sampleColumns = currentSampleWidths.map((width) => `${width}px`).join(' ');
  const measures = useMemo(() => Array.from({ length: measureCount }, (_, index) => measureCount - index - 1), [measureCount]);
  const measureHeight = 320 * Number(hiSpeed);
  const gridDivision = Number(grid.split('/')[1]);
  const measureFractions = chart.measureFractions;
  const rollBodyHeight = chartPositionY(0, measureCount, measureHeight, measureFractions);
  const positionY = (position: number) => chartPositionY(position, measureCount, measureHeight, measureFractions);
  const cellHeightAt = (_position: number) => gridLineHeight(measureHeight, grid);
  const gridGeometry = useRef({ measureCount, measureHeight, gridDivision, measureFractions });
  gridGeometry.current = { measureCount, measureHeight, gridDivision, measureFractions };
  const canResizeColumns = !readOnly || allowColumnResize;

  const renderedChart = useMemo(() => {
    if (!playing || !renderWindow) {
      return chart;
    }

    const visible = (position: number, duration = 0, height = settings.noteHeight) => {
      const bottom = chartPositionY(position, measureCount, measureHeight, measureFractions);
      const end = chartPositionY(position + duration, measureCount, measureHeight, measureFractions);
      const box = longNoteBox(bottom, 0, bottom - end, height);
      return box.top <= renderWindow.bottom && box.top + box.height >= renderWindow.top;
    };

    return {
      ...chart,
      notes: chart.notes.filter((note) => visible(note.absolutePosition, note.duration)),
      autoplayNotes: chart.autoplayNotes.filter((note) => visible(note.absolutePosition)),
      bpmChanges: chart.bpmChanges.filter((item) => visible(item.absolutePosition, 0, DEFAULT_NOTE_TOOL_SETTINGS.noteHeight)),
      measureFractions: chart.measureFractions.filter((item) => visible(item.measure, 0, DEFAULT_NOTE_TOOL_SETTINGS.noteHeight)),
    };
  }, [chart, playing, renderWindow, measureCount, measureHeight, measureFractions, settings.noteHeight]);

  const notesByKey = useMemo(() => new Map(KEYS_7.map((key) => [key, renderedChart.notes.filter((note) => note.key === key)])), [renderedChart.notes]);
  const autoplayByLane = useMemo(() => new Map(SAMPLE_LANES.map((lane) => [lane, renderedChart.autoplayNotes.filter((note) => note.lane === lane)])), [renderedChart.autoplayNotes]);
  const measureRows = measures.map((measure) => `${measurePixelHeight(measure, measureHeight, measureFractions)}px`).join(' ');
  const renderedMeasures = playing && renderWindow
    ? measures.filter((measure) => positionY(measure + 1) <= renderWindow.bottom && positionY(measure) >= renderWindow.top)
    : measures;

  const updateRenderWindow = useCallback((scrollTop: number) => {
    if (!playing) {
      return;
    }

    // Update by viewport-sized steps, with enough overscan to cover the next React commit.
    const next = playbackRenderWindow(scrollTop, viewport.current.height);
    const current = renderWindowRef.current;
    if (!current || current.top !== next.top || current.bottom !== next.bottom) {
      renderWindowRef.current = next;
      setRenderWindow(next);
    }
  }, [playing]);

  useEffect(() => {
    const element = wrapper.current;
    return element
      ? listenForControlWheel(element, (deltaY) => onHiSpeedChange(nextHiSpeed(Number(hiSpeed), deltaY)))
      : undefined;
  }, [hiSpeed, onHiSpeedChange]);

  useLayoutEffect(() => {
    manualScrollUntil.current = 0;
    previousFollowDistance.current = null;
    scrollbarHeld.current = false;
  }, [playing]);

  useEffect(() => {
    const releaseScrollbar = () => {
      if (scrollbarHeld.current) {
        scrollbarHeld.current = false;
        manualScrollUntil.current = performance.now() + 400;
      }
    };

    window.addEventListener('pointerup', releaseScrollbar);
    window.addEventListener('pointercancel', releaseScrollbar);
    window.addEventListener('blur', releaseScrollbar);
    return () => {
      window.removeEventListener('pointerup', releaseScrollbar);
      window.removeEventListener('pointercancel', releaseScrollbar);
      window.removeEventListener('blur', releaseScrollbar);
    };
  }, []);

  useEffect(() => {
    const element = wrapper.current;
    if (!element || !measureScrollRequest) {
      return;
    }

    const { measureCount, measureHeight, measureFractions } = gridGeometry.current;
    const position = chartPositionAtY(element.scrollTop, measureCount, measureHeight, measureCount, measureFractions);
    const next = Math.max(0, Math.min(measureCount, position + measureScrollRequest.direction));
    element.scrollTop = chartPositionY(next, measureCount, measureHeight, measureFractions);
  }, [measureScrollRequest]);

  useLayoutEffect(() => {
    setMeasureCount((count) => Math.max(count, chartMeasures));
  }, [chartMeasures]);

  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) {
      return;
    }

    const fillViewport = () => {
      const height = element.clientHeight;
      viewport.current = { height, maxScrollTop: Math.max(0, element.scrollHeight - height) };
      updateRenderWindow(element.scrollTop);
      if (!readOnly) {
        const missingHeight = Math.max(0, height - 34 - rollBodyHeight);
        setMeasureCount((count) => Math.max(count, chartMeasures, count + Math.ceil(missingHeight / measureHeight)));
      }
    };

    const observer = new ResizeObserver(fillViewport);
    fillViewport();
    observer.observe(element);
    return () => observer.disconnect();
  }, [chartMeasures, measureHeight, readOnly, rollBodyHeight, updateRenderWindow]);

  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) {
      return;
    }

    const height = element.clientHeight;
    const scrollHeight = element.scrollHeight;
    const maxScrollTop = Math.max(0, scrollHeight - height);
    let scrollTop = element.scrollTop;
    if (previousScrollHeight.current === 0) {
      scrollTop = maxScrollTop;
    } else if (scrollHeight > previousScrollHeight.current) {
      scrollTop += scrollHeight - previousScrollHeight.current;
    }

    scrollTop = Math.max(0, Math.min(maxScrollTop, scrollTop));
    viewport.current = { height, maxScrollTop };
    element.scrollTop = scrollTop;
    previousScrollHeight.current = scrollHeight;
    previousScrollTop.current = scrollTop;
    updateRenderWindow(scrollTop);
    if (loadingMeasures.current) {
      suppressPlayheadScroll.current = true;
    }

    loadingMeasures.current = false;
  }, [measureCount, hiSpeed, rollBodyHeight, updateRenderWindow]);

  useLayoutEffect(() => subscribePosition((position, scrollIntoView = false) => {
    const now = performance.now();
    const advancing = previousPlaybackPosition.current !== null && position > previousPlaybackPosition.current;
    previousPlaybackPosition.current = position;
    const geometry = gridGeometry.current;
    const pixelRatio = window.devicePixelRatio || 1;
    const offset = alignToDevicePixel(chartPositionY(position, geometry.measureCount, geometry.measureHeight, geometry.measureFractions), pixelRatio);
    const element = wrapper.current;
    const preserveScroll = suppressPlayheadScroll.current;
    suppressPlayheadScroll.current = false;
    if (element && (scrollIntoView || (playing && !preserveScroll))) {
      const { height, maxScrollTop } = viewport.current;
      const current = element.scrollTop;
      if (Math.abs(current - previousScrollTop.current) > 1) {
        manualScrollUntil.current = now + 400;
        previousFollowDistance.current = null;
      }

      const target = Math.max(0, Math.min(maxScrollTop, playbackScrollTop(34 + offset, height, settings.playheadPosition, settings.playheadGrid)));
      const manual = manualScrollUntil.current > 0;
      const distance = offset - current - Math.max(0, height - 34) * playheadTopRatio(settings.playheadPosition, settings.playheadGrid);
      const idle = !scrollbarHeld.current && now >= manualScrollUntil.current;
      const resume = idle && previousFollowDistance.current !== null && previousFollowDistance.current >= 0 && distance <= 0;
      previousFollowDistance.current = manual && idle ? distance : null;

      if (scrollIntoView || (advancing && (!manual || resume))) {
        manualScrollUntil.current = 0;
        previousFollowDistance.current = null;
        element.scrollTop = alignToDevicePixel(target, pixelRatio);
      }

      previousScrollTop.current = element.scrollTop;
      updateRenderWindow(element.scrollTop);
    }

    if (playhead.current) {
      playhead.current.style.transform = `translateY(${offset}px) translateY(-50%)`;
    }
  }), [measureCount, measureFractions, measureHeight, playing, settings.playheadGrid, settings.playheadPosition, subscribePosition, updateRenderWindow]);

  const resetLaneWidth = (lane: NoteAreaLaneKey, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    onSettingsChange(updateNoteLaneSettings(settings, lane, { width: DEFAULT_NOTE_TOOL_SETTINGS.lanes[lane].width }));
  };

  const startTimingResize = (lane: 'fraction' | 'bpm', event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    timingDrag.current = { x: event.clientX, width: settings.lanes[lane].width, lane };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeTiming = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const lane = timingDrag.current.lane;
    const width = clampLaneWidth(timingDrag.current.width + event.clientX - timingDrag.current.x);
    onSettingsChange({ ...settings, lanes: { ...settings.lanes, [lane]: { ...settings.lanes[lane], width } } });
  };

  const resizeTimingWithKeyboard = (lane: 'fraction' | 'bpm', event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const change = event.key === 'ArrowLeft' ? -4 : 4;
    onSettingsChange({
      ...settings,
      lanes: {
        ...settings.lanes,
        [lane]: { ...settings.lanes[lane], width: clampLaneWidth(settings.lanes[lane].width + change) },
      },
    });
  };

  const startLaneResize = (key: ResizableLaneKey, event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    laneDrag.current = { x: event.clientX, width: settings.lanes[key].width, key };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeLane = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    const key = laneDrag.current.key;
    const width = clampLaneWidth(laneDrag.current.width + event.clientX - laneDrag.current.x);
    onSettingsChange(updateNoteLaneSettings(settings, key, { width }));
  };

  const resizeLaneWithKeyboard = (key: ResizableLaneKey, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const change = event.key === 'ArrowLeft' ? -4 : 4;
    onSettingsChange(updateNoteLaneSettings(settings, key, { width: clampLaneWidth(settings.lanes[key].width + change) }));
  };

  const loadMoreMeasures = (event: UIEvent<HTMLDivElement>) => {
    updateEventDrag();
    updateMarquee();
    const top = event.currentTarget.scrollTop;
    if (playing && Math.abs(top - previousScrollTop.current) > 1) {
      manualScrollUntil.current = performance.now() + 400;
      previousFollowDistance.current = null;
    }

    const scrollingUp = top < previousScrollTop.current;
    previousScrollTop.current = top;
    updateRenderWindow(top);
    if (!readOnly && scrollingUp && top <= 96 && !loadingMeasures.current) {
      loadingMeasures.current = true;
      setMeasureCount((count) => count + 4);
    }
  };

  const loadMoreMeasuresWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      return;
    }

    if (playing && event.deltaY !== 0) {
      manualScrollUntil.current = performance.now() + 400;
      previousFollowDistance.current = null;
    }

    if (readOnly) {
      return;
    }

    if (event.deltaY < 0 && event.currentTarget.scrollTop <= 96 && !loadingMeasures.current) {
      loadingMeasures.current = true;
      setMeasureCount((count) => count + 4);
    }
  };

  const seekFromRuler = (target: HTMLDivElement, clientY: number) => {
    const bounds = target.getBoundingClientRect();
    const geometry = gridGeometry.current;
    suppressPlayheadScroll.current = true;
    onSeek(chartPositionAtY(clientY - bounds.top, geometry.measureCount, geometry.measureHeight, endPosition, geometry.measureFractions));
  };

  const runRulerSeekAutoScroll = () => {
    rulerSeekAnimation.current = null;
    const drag = rulerSeek.current;
    const element = wrapper.current;
    if (!drag || !element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const delta = edgeScrollDelta(drag.clientY, bounds.top + 34, bounds.bottom - 16);
    if (delta === 0) {
      return;
    }

    element.scrollTop = edgeScrollTop(element.scrollTop, element.scrollHeight, element.clientHeight, delta);
    seekFromRuler(drag.target, drag.clientY);
    rulerSeekAnimation.current = window.requestAnimationFrame(runRulerSeekAutoScroll);
  };

  const queueRulerSeekAutoScroll = () => {
    if (rulerSeekAnimation.current === null) {
      rulerSeekAnimation.current = window.requestAnimationFrame(runRulerSeekAutoScroll);
    }
  };

  const startRulerSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    rulerSeek.current = { pointerId: event.pointerId, target: event.currentTarget, clientY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromRuler(event.currentTarget, event.clientY);
    queueRulerSeekAutoScroll();
  };

  const moveRulerSeek = (event: PointerEvent<HTMLDivElement>) => {
    const drag = rulerSeek.current;
    if (drag?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      drag.clientY = event.clientY;
      seekFromRuler(drag.target, drag.clientY);
      queueRulerSeekAutoScroll();
    }
  };

  const finishRulerSeek = (event: PointerEvent<HTMLDivElement>) => {
    const drag = rulerSeek.current;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    drag.clientY = event.clientY;
    seekFromRuler(drag.target, drag.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (rulerSeekAnimation.current !== null) {
      window.cancelAnimationFrame(rulerSeekAnimation.current);
      rulerSeekAnimation.current = null;
    }

    rulerSeek.current = null;
    window.setTimeout(() => { suppressPlayheadScroll.current = false; }, 0);
  };

  const updatePlayheadPosition = (clientY: number) => {
    const body = playhead.current?.parentElement;
    if (!body || !onPlayheadPositionChange) {
      return;
    }

    const bounds = body.getBoundingClientRect();
    const geometry = gridGeometry.current;
    const chartPosition = chartPositionAtY(clientY - bounds.top, geometry.measureCount, geometry.measureHeight, endPosition, geometry.measureFractions);
    onPlayheadPositionChange(playheadPositionFromChartPosition(chartPosition, settings.playheadGrid));
  };

  const startPlayheadDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !onPlayheadPositionChange) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    playheadDrag.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePlayheadPosition(event.clientY);
  };

  const movePlayheadDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (playheadDrag.current === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      updatePlayheadPosition(event.clientY);
    }
  };

  const finishPlayheadDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (playheadDrag.current !== event.pointerId) {
      return;
    }

    updatePlayheadPosition(event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    playheadDrag.current = null;
  };

  const movePlayheadWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onPlayheadPositionChange || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const grid = settings.playheadGrid;
    const current = playheadPositionStep(settings.playheadPosition, grid);
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? grid : current + (event.key === 'ArrowUp' ? 1 : -1);
    onPlayheadPositionChange(Math.max(1, Math.min(grid, next)) / grid);
  };

  const selectGridEvent = (kind: InspectorEvent['kind'], event: MouseEvent<HTMLDivElement>) => {
    if (suppressGridClick.current) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const absolutePosition = gridPositionAtY(event.clientY - bounds.top, measureCount, measureHeight, gridDivision, measureFractions);
    const measure = Math.floor(absolutePosition);
    const position = kind === 'fraction' ? 0 : absolutePosition - measure;

    if (kind === 'note' || kind === 'autoplay') {
      const widths = kind === 'note' ? currentKeyWidths : currentSampleWidths;
      const x = Math.max(0, Math.min(bounds.width - 1, event.clientX - bounds.left));
      let lane = widths.length;
      let laneEnd = 0;

      for (const [index, width] of widths.entries()) {
        laneEnd += width;
        if (x < laneEnd) {
          lane = index + 1;
          break;
        }
      }

      onGridEvent(kind, { measure, position, lane, additive: event.shiftKey || event.ctrlKey || event.metaKey });
      return;
    }

    onGridEvent(kind, { measure, position, lane: 0, additive: event.shiftKey || event.ctrlKey || event.metaKey });
  };

  const updateLongNoteDraft = () => {
    const drag = longNoteDrag.current;
    if (!drag) {
      return;
    }

    const bounds = drag.target.getBoundingClientRect();
    const geometry = gridGeometry.current;
    drag.endPosition = Math.max(
      drag.startPosition,
      gridPositionAtY(drag.clientY - bounds.top, geometry.measureCount, geometry.measureHeight, geometry.gridDivision, geometry.measureFractions),
    );

    setLongNoteDraft({ key: drag.key, startPosition: drag.startPosition, endPosition: drag.endPosition });
  };

  const runLongNoteAutoScroll = () => {
    longNoteAnimation.current = null;
    const drag = longNoteDrag.current;
    const element = wrapper.current;
    if (!drag || !element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const delta = Math.min(0, edgeScrollDelta(drag.clientY, bounds.top + 34, bounds.bottom - 16));
    if (delta === 0 || drag.clientY >= drag.startClientY) {
      return;
    }

    element.scrollTop = edgeScrollTop(element.scrollTop, element.scrollHeight, element.clientHeight, delta);
    updateLongNoteDraft();
    longNoteAnimation.current = window.requestAnimationFrame(runLongNoteAutoScroll);
  };

  const queueLongNoteAutoScroll = () => {
    if (longNoteAnimation.current === null) {
      longNoteAnimation.current = window.requestAnimationFrame(runLongNoteAutoScroll);
    }
  };

  const startLongNoteDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!notePlacementMode || event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const lane = laneIndexAt(event.clientX - bounds.left, currentKeyWidths);
    const key = keys[lane];
    if (!key || currentKeyWidths[lane] === 0) {
      return;
    }

    const startPosition = gridPositionAtY(event.clientY - bounds.top, measureCount, measureHeight, gridDivision, measureFractions);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    longNoteDrag.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      key,
      lane,
      startPosition,
      endPosition: startPosition,
      startClientY: event.clientY,
      clientY: event.clientY,
    };

    setLongNoteDraft({ key, startPosition, endPosition: startPosition });
    queueLongNoteAutoScroll();
  };

  const moveLongNoteDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = longNoteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    event.preventDefault();
    drag.clientY = event.clientY;
    updateLongNoteDraft();
    queueLongNoteAutoScroll();
  };

  const finishLongNoteDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = longNoteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.clientY = event.clientY;
    updateLongNoteDraft();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (longNoteAnimation.current !== null) {
      window.cancelAnimationFrame(longNoteAnimation.current);
      longNoteAnimation.current = null;
    }

    if (commit && drag.endPosition > drag.startPosition) {
      onLongNoteDrag({ lane: drag.lane + 1, startPosition: drag.startPosition, endPosition: drag.endPosition });
    } else if (commit) {
      const measure = Math.floor(drag.startPosition);
      onGridEvent('note', { measure, position: drag.startPosition - measure, lane: drag.lane + 1, additive: false });
    }

    longNoteDrag.current = null;
    setLongNoteDraft(null);
    suppressGridClick.current = true;
    window.setTimeout(() => { suppressGridClick.current = false; }, 0);
  };

  useLayoutEffect(() => () => {
    if (eventDragAnimation.current !== null) {
      window.cancelAnimationFrame(eventDragAnimation.current);
    }

    if (marqueeAnimation.current !== null) {
      window.cancelAnimationFrame(marqueeAnimation.current);
    }

    if (rulerSeekAnimation.current !== null) {
      window.cancelAnimationFrame(rulerSeekAnimation.current);
    }

    if (longNoteAnimation.current !== null) {
      window.cancelAnimationFrame(longNoteAnimation.current);
    }
  }, []);

  const updateEventDrag = () => {
    const drag = eventDrag.current;
    if (!drag) {
      return;
    }

    const geometry = gridGeometry.current;
    const targetY = drag.clientY - drag.body.getBoundingClientRect().top - drag.grabOffsetY;
    const targetPosition = drag.kind === 'fraction'
      ? Math.floor(chartPositionAtY(targetY, geometry.measureCount, geometry.measureHeight, geometry.measureCount, geometry.measureFractions))
      : gridPositionAtY(targetY, geometry.measureCount, geometry.measureHeight, geometry.gridDivision, geometry.measureFractions);

    let positionDelta = targetPosition - drag.startPosition;
    positionDelta = clampSelectionPositionDelta(drag.selection, positionDelta, chart);
    let laneDelta = 0;
    if (drag.kind === 'note' || drag.kind === 'autoplay') {
      const body = drag.body;
      const sampleBounds = body.querySelector('.nt-sample-lanes')?.getBoundingClientRect();
      const mainBounds = body.querySelector('.nt-lanes')?.getBoundingClientRect();
      if (sampleBounds && drag.clientX >= sampleBounds.left) {
        laneDelta = keys.length + laneIndexAt(drag.clientX - sampleBounds.left, currentSampleWidths) - drag.startLane;
      } else if (mainBounds) {
        laneDelta = laneIndexAt(drag.clientX - mainBounds.left, currentKeyWidths) - drag.startLane;
      }
    }

    laneDelta = clampNoteLaneDelta(chart, drag.selection, laneDelta, keys);

    drag.positionDelta = positionDelta;
    drag.laneDelta = laneDelta;
    setDragPreview({
      selection: drag.selection,
      positionDelta,
      laneDelta,
    });
  };

  const runEventDragAutoScroll = () => {
    eventDragAnimation.current = null;
    const drag = eventDrag.current;
    const element = wrapper.current;
    if (!drag || !element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const deltaY = edgeScrollDelta(drag.clientY, bounds.top + 34, bounds.bottom - 16);
    const deltaX = drag.kind === 'note' || drag.kind === 'autoplay'
      ? edgeScrollDelta(drag.clientX, bounds.left, bounds.right - 16)
      : 0;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    if (deltaY < 0 && element.scrollTop <= 96 && !loadingMeasures.current) {
      loadingMeasures.current = true;
      setMeasureCount((count) => count + 4);
    }

    element.scrollLeft = edgeScrollTop(element.scrollLeft, element.scrollWidth, element.clientWidth, deltaX);
    element.scrollTop = edgeScrollTop(element.scrollTop, element.scrollHeight, element.clientHeight, deltaY);
    updateEventDrag();
    eventDragAnimation.current = window.requestAnimationFrame(runEventDragAutoScroll);
  };

  useLayoutEffect(() => {
    updateEventDrag();
  }, [measureCount, measureHeight, measureFractions, gridDivision]);

  const eventHandlers = (selection: InspectorEvent, lane: number): EventHandlers => readOnly ? {
    'data-event-kind': selection.kind,
    'data-event-id': selection.id,
  } : ({
    'data-event-kind': selection.kind,
    'data-event-id': selection.id,
    onPointerDown: (event) => {
      if (!selectMode || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (additive) {
        onSelectEvent(selection, true);
        return;
      }

      const dragSelection = selectionForEventDrag(selectedEvents, selection);
      const startPosition = eventPosition(chart, selection);
      const body = event.currentTarget.closest('.nt-roll-body');
      if (startPosition === null || !body) {
        return;
      }

      if (!isEventSelected(selectedEvents, selection)) {
        onSelectEvent(selection, false);
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      eventDrag.current = {
        pointerId: event.pointerId,
        selection: dragSelection,
        target: selection,
        kind: selection.kind,
        body,
        clientX: event.clientX,
        clientY: event.clientY,
        grabOffsetY: event.clientY - body.getBoundingClientRect().top - positionY(startPosition),
        startPosition,
        startLane: lane + (selection.kind === 'autoplay' ? keys.length : 0),
        positionDelta: 0,
        laneDelta: 0,
      };

      setDragPreview({
        selection: dragSelection,
        positionDelta: 0,
        laneDelta: 0,
      });

      eventDragAnimation.current = window.requestAnimationFrame(runEventDragAutoScroll);
    },
    onPointerMove: (event) => {
      const drag = eventDrag.current;
      if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }

      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      updateEventDrag();
      if (eventDragAnimation.current === null) {
        eventDragAnimation.current = window.requestAnimationFrame(runEventDragAutoScroll);
      }
    },
    onPointerUp: (event) => finishEventDrag(event, true),
    onPointerCancel: (event) => finishEventDrag(event, false),
    onContextMenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (notePlacementMode) {
        onDeleteEvent(selection);
      }
    },
    onClick: (event) => {
      if (selectMode) {
        event.stopPropagation();
      }
    },
  });

  const finishEventDrag = (event: PointerEvent<HTMLSpanElement>, commit: boolean) => {
    const drag = eventDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (eventDragAnimation.current !== null) {
      window.cancelAnimationFrame(eventDragAnimation.current);
      eventDragAnimation.current = null;
    }

    if (commit) {
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      updateEventDrag();
    }

    if (commit && (drag.positionDelta !== 0 || drag.laneDelta !== 0)) {
      onMoveEvents(drag.selection, {
        positionDelta: drag.positionDelta,
        laneDelta: drag.laneDelta,
      });

      suppressGridClick.current = true;
      window.setTimeout(() => { suppressGridClick.current = false; }, 0);
    } else if (commit) {
      onSelectEvent(drag.target, false);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (eventDrag.current?.pointerId === event.pointerId) {
      eventDrag.current = null;
    }

    setDragPreview(null);
  };

  const dragLane = (selection: InspectorEvent, lane: number): ResizableLaneKey | undefined => {
    if (!dragPreview || !isEventSelected(dragPreview.selection, selection)) {
      return undefined;
    }

    if (selection.kind === 'note' || selection.kind === 'autoplay') {
      const source = lane + (selection.kind === 'autoplay' ? keys.length : 0);
      return AUDIO_LANE_KEYS[source + dragPreview.laneDelta];
    }

    return undefined;
  };

  const dragStyle = (selection: InspectorEvent, lane: number): CSSProperties => {
    if (!dragPreview || !isEventSelected(dragPreview.selection, selection)) {
      return {};
    }

    let laneDelta = 0;
    if (selection.kind === 'note' || selection.kind === 'autoplay') {
      const source = lane + (selection.kind === 'autoplay' ? keys.length : 0);
      const target = source + dragPreview.laneDelta;
      const borderOffset = (target >= keys.length ? 2 : 0) - (source >= keys.length ? 2 : 0);
      laneDelta = laneDragOffset([...currentKeyWidths, ...currentSampleWidths], source, dragPreview.laneDelta) + borderOffset;
    }

    const originalPosition = eventPosition(chart, selection);
    const positionDelta = selection.kind === 'fraction' ? Math.round(dragPreview.positionDelta) : dragPreview.positionDelta;
    const translateY = originalPosition === null ? 0 : positionY(originalPosition + positionDelta) - positionY(originalPosition);
    const targetKey = dragLane(selection, lane);
    const targetNoteLane = keys.findIndex((key) => key === targetKey);
    const targetWidth = targetKey
      ? targetNoteLane >= 0 ? currentKeyWidths[targetNoteLane]! : settings.lanes[targetKey].width
      : 0;

    return {
      ...(targetKey ? {
        ...getLaneStyle(settings.lanes[targetKey]),
        width: Math.max(0, targetWidth - (targetKey === 'L' ? 2 : 3)),
        right: 'auto',
        visibility: targetWidth === 0 ? 'hidden' : 'visible',
      } : {}),
      zIndex: 4,
      transform: `translate(${laneDelta}px, ${translateY}px)`,
    };
  };

  const updateMarquee = () => {
    const drag = marqueeDrag.current;
    if (!drag) {
      return;
    }

    const bounds = drag.target.getBoundingClientRect();
    const geometry = gridGeometry.current;
    const startY = chartPositionY(drag.startPosition, geometry.measureCount, geometry.measureHeight, geometry.measureFractions);
    const point = localPoint(drag.clientX, drag.clientY, bounds);
    const box = {
      left: Math.min(drag.startX, point.x),
      right: Math.max(drag.startX, point.x),
      top: Math.min(startY, point.y),
      bottom: Math.max(startY, point.y),
    };

    const targets = box.right - box.left >= 4 || box.bottom - box.top >= 4
      ? Array.from(drag.target.querySelectorAll<HTMLElement>('[data-event-kind][data-event-id]'))
        .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && intersectsMarquee(element.getBoundingClientRect(), bounds, box))
        .map((element) => ({ kind: element.dataset.eventKind as InspectorEvent['kind'], id: element.dataset.eventId ?? '' }))
        .filter((item) => item.id)
      : [];

    const selection = updateMarqueeSelection(drag.initialSelection, targets, drag.additive);
    if (selection.length !== drag.selection.length || selection.some((item, index) => item.kind !== drag.selection[index]?.kind || item.id !== drag.selection[index]?.id)) {
      drag.selection = selection;
      onSelectEvents(selection, false);
    }

    setMarquee({
      pointerId: drag.pointerId,
      startX: drag.startX,
      startY,
      currentX: point.x,
      currentY: point.y,
      additive: drag.additive,
    });
  };

  const runMarqueeAutoScroll = () => {
    marqueeAnimation.current = null;
    const drag = marqueeDrag.current;
    const element = wrapper.current;
    if (!drag || !element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const delta = edgeScrollDelta(drag.clientY, bounds.top + 34, bounds.bottom - 16);
    const deltaX = edgeScrollDelta(drag.clientX, bounds.left, bounds.right - 16);
    if (delta === 0 && deltaX === 0) {
      return;
    }

    if (delta < 0 && element.scrollTop <= 96 && !loadingMeasures.current) {
      loadingMeasures.current = true;
      setMeasureCount((count) => count + 4);
    }

    element.scrollTop = edgeScrollTop(element.scrollTop, element.scrollHeight, element.clientHeight, delta);
    element.scrollLeft = edgeScrollTop(element.scrollLeft, element.scrollWidth, element.clientWidth, deltaX);
    updateMarquee();
    marqueeAnimation.current = window.requestAnimationFrame(runMarqueeAutoScroll);
  };

  const startMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (!selectMode || event.button !== 0 || (event.target as Element).closest('[data-event-kind]')) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const point = localPoint(event.clientX, event.clientY, bounds);
    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeDrag.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: point.x,
      startPosition: chartPositionAtY(point.y, measureCount, measureHeight, measureCount, measureFractions),
      clientX: event.clientX,
      clientY: event.clientY,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      initialSelection: selectedEvents,
      selection: selectedEvents,
    };

    updateMarquee();
    marqueeAnimation.current = window.requestAnimationFrame(runMarqueeAutoScroll);
  };

  const moveMarquee = (event: PointerEvent<HTMLDivElement>) => {
    const drag = marqueeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    drag.clientX = event.clientX;
    drag.clientY = event.clientY;
    updateMarquee();
    if (marqueeAnimation.current === null) {
      marqueeAnimation.current = window.requestAnimationFrame(runMarqueeAutoScroll);
    }
  };

  const finishMarquee = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = marqueeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (commit) {
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      updateMarquee();
      suppressGridClick.current = true;
      window.setTimeout(() => { suppressGridClick.current = false; }, 0);
    } else {
      onSelectEvents(drag.initialSelection, false);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (marqueeAnimation.current !== null) {
      window.cancelAnimationFrame(marqueeAnimation.current);
      marqueeAnimation.current = null;
    }

    marqueeDrag.current = null;
    setMarquee(null);
  };

  return (
    <div className="nt-roll-wrap" ref={wrapper} onScroll={loadMoreMeasures} onWheel={loadMoreMeasuresWithWheel} onPointerDown={(event) => {
      if (playing && event.button === 0 && event.target === event.currentTarget) {
        scrollbarHeld.current = true;
        manualScrollUntil.current = performance.now() + 400;
        previousFollowDistance.current = null;
      }
    }}>
      <div
        className={`nt-roll keys-${keyMode}${selectMode ? ' is-select-mode' : ''}${readOnly ? ' is-read-only' : ''}`}
        role="img"
        aria-label={`${readOnly ? 'Read-only preview, ' : ''}${measureCount} measures with ${grid} grid lines and ${subGrid} sub-grid lines`}
        style={{
          '--nt-speed': hiSpeed,
          '--nt-measure-count': measureCount,
          '--nt-ruler-width': `${rulerWidth}px`,
          '--nt-measure-width': `${measureWidth}px`,
          '--nt-bpm-width': `${bpmWidth}px`,
          '--nt-key-width': `${keyWidth}px`,
          '--nt-key-columns': keyColumns,
          '--nt-sample-width': `${sampleWidth}px`,
          '--nt-sample-columns': sampleColumns,
          '--nt-note-border-width': `${settings.noteBorderWidth}px`,
          '--nt-roll-height': `${34 + rollBodyHeight}px`,
        } as CSSProperties}
      >
        <div className="nt-roll-head">
          <span className="nt-measure-head" style={getLaneStyle(settings.lanes.measure)} onContextMenu={canResizeColumns ? (event) => resetLaneWidth('measure', event) : undefined}><LaneHeaderLabel width={rulerWidth}>#</LaneHeaderLabel></span>
          <div className="nt-timing-heads">
            <span className="nt-resizable-head" style={getLaneStyle(settings.lanes.fraction)} title="Measure events" onContextMenu={canResizeColumns ? (event) => resetLaneWidth('fraction', event) : undefined}>
              <LaneHeaderLabel width={measureWidth}>Measure</LaneHeaderLabel>
              {canResizeColumns ? <button
                className="nt-col-resizer"
                type="button"
                aria-label="Resize Measure event column"
                aria-valuemin={0}
                aria-valuemax={MAX_LANE_WIDTH}
                aria-valuenow={measureWidth}
                onPointerDown={(event) => startTimingResize('fraction', event)}
                onPointerMove={resizeTiming}
                onKeyDown={(event) => resizeTimingWithKeyboard('fraction', event)}
              /> : null}
            </span>
            <span className="nt-resizable-head" style={getLaneStyle(settings.lanes.bpm)} title="BPM change events" onContextMenu={canResizeColumns ? (event) => resetLaneWidth('bpm', event) : undefined}>
              <LaneHeaderLabel width={bpmWidth}>BPM</LaneHeaderLabel>
              {canResizeColumns ? <button
                className="nt-col-resizer"
                type="button"
                aria-label="Resize BPM event column"
                aria-valuemin={0}
                aria-valuemax={MAX_LANE_WIDTH}
                aria-valuenow={bpmWidth}
                onPointerDown={(event) => startTimingResize('bpm', event)}
                onPointerMove={resizeTiming}
                onKeyDown={(event) => resizeTimingWithKeyboard('bpm', event)}
              /> : null}
            </span>
          </div>
          <div className="nt-key-heads">
            {keys.map((key, index) => (
              <span className="nt-resizable-head" style={getLaneStyle(settings.lanes[key])} key={key} onContextMenu={canResizeColumns ? (event) => resetLaneWidth(key, event) : undefined}>
                <LaneHeaderLabel width={effectiveNoteLaneWidth(keyMode, key, settings.lanes[key].width)}>{key}</LaneHeaderLabel>
                {canResizeColumns ? <button
                  className="nt-col-resizer"
                  type="button"
                  aria-label={`Resize ${key} column`}
                  aria-valuemin={0}
                  aria-valuemax={MAX_LANE_WIDTH}
                  aria-valuenow={currentKeyWidths[index]}
                  onPointerDown={(event) => startLaneResize(key, event)}
                  onPointerMove={resizeLane}
                  onKeyDown={(event) => resizeLaneWithKeyboard(key, event)}
                /> : null}
              </span>
            ))}
          </div>
          <div className="nt-sample-heads">
            {SAMPLE_LANES.map((lane, index) => {
              const laneKey = SAMPLE_LANE_KEYS[index];
              return laneKey ? (
                <span className="nt-resizable-head" style={getLaneStyle(settings.lanes[laneKey])} key={lane} onContextMenu={canResizeColumns ? (event) => resetLaneWidth(laneKey, event) : undefined}>
                  {canResizeColumns ? <button
                    className="nt-col-resizer"
                    type="button"
                    aria-label={`Resize autoplay sample lane ${lane}`}
                    aria-valuemin={0}
                    aria-valuemax={MAX_LANE_WIDTH}
                    aria-valuenow={currentSampleWidths[index]}
                    onPointerDown={(event) => startLaneResize(laneKey, event)}
                    onPointerMove={resizeLane}
                    onKeyDown={(event) => resizeLaneWithKeyboard(laneKey, event)}
                  /> : null}
                </span>
              ) : null;
            })}
          </div>
        </div>
        <div
          className="nt-roll-body"
          onPointerMoveCapture={readOnly || !onCursorMove ? undefined : (event) => {
            const target = event.currentTarget;
            const clientY = event.clientY;
            onCursorMove(() => {
              const geometry = gridGeometry.current;
              return gridPositionAtY(clientY - target.getBoundingClientRect().top, geometry.measureCount, geometry.measureHeight, geometry.gridDivision, geometry.measureFractions);
            });
          }}
          onPointerLeave={onCursorMove ? () => onCursorMove(null) : undefined}
          onPointerDown={readOnly ? undefined : startMarquee}
          onPointerMove={readOnly ? undefined : moveMarquee}
          onPointerUp={readOnly ? undefined : (event) => finishMarquee(event, true)}
          onPointerCancel={readOnly ? undefined : (event) => finishMarquee(event, false)}
          onContextMenu={readOnly ? undefined : (event) => event.preventDefault()}
        >
          <div
            className="nt-ruler"
            style={{
              ...getLaneStyle(settings.lanes.measure),
              gridTemplateRows: measureRows,
            }}
            onPointerDown={readOnly ? undefined : startRulerSeek}
            onPointerMove={readOnly ? undefined : moveRulerSeek}
            onPointerUp={readOnly ? undefined : finishRulerSeek}
            onPointerCancel={readOnly ? undefined : finishRulerSeek}
          >
            {renderedMeasures.map((measure) => <span style={{ gridRow: measureCount - measure }} key={measure}>{measure}</span>)}
          </div>
          <div className="nt-roll-grid" aria-hidden="true">
            {renderedMeasures.map((measure) => {
              const height = measurePixelHeight(measure, measureHeight, measureFractions);
              const localSubGridHeight = gridLineHeight(measureHeight, subGrid);
              return (
                <span
                  className={localSubGridHeight > 0 ? '' : 'no-sub-grid'}
                  style={{
                    position: 'absolute',
                    top: positionY(measure + 1),
                    left: 0,
                    right: 0,
                    height,
                    '--nt-local-grid-height': `${gridLineHeight(measureHeight, grid)}px`,
                    '--nt-local-sub-grid-height': `${localSubGridHeight}px`,
                  } as CSSProperties}
                  key={measure}
                />
              );
            })}
          </div>
          <div className="nt-timing-lanes">
            <div className="nt-event-lane measure" style={getLaneStyle(settings.lanes.fraction)} aria-label="Measure fraction event lane" onClick={readOnly ? undefined : (event) => selectGridEvent('fraction', event)}>
              {renderedChart.measureFractions.map((item) => {
                const selection = { kind: 'fraction', id: item.id } as const;
                const box = noteCellBox(positionY(item.measure), cellHeightAt(item.measure));
                return <span className={`nt-timing-event${isEventSelected(selectedEvents, selection) ? ' is-selected' : ''}`} style={{ top: `${box.top}px`, height: `${box.height}px`, ...dragStyle(selection, 0) }} key={item.id} {...eventHandlers(selection, 0)}>{item.fraction.toFixed(2)}</span>;
              })}
            </div>
            <div className="nt-event-lane bpm" style={getLaneStyle(settings.lanes.bpm)} aria-label="BPM event lane" onClick={readOnly ? undefined : (event) => selectGridEvent('bpm', event)}>
              {renderedChart.bpmChanges.map((item) => {
                const selection = { kind: 'bpm', id: item.id } as const;
                const box = noteCellBox(positionY(item.absolutePosition), cellHeightAt(item.absolutePosition));
                return <span className={`nt-timing-event${isEventSelected(selectedEvents, selection) ? ' is-selected' : ''}`} style={{ top: `${box.top}px`, height: `${box.height}px`, ...dragStyle(selection, 0) }} key={item.id} {...eventHandlers(selection, 0)}>{formatBpmValue(item.bpm)}</span>;
              })}
            </div>
          </div>
          <div
            className="nt-lanes"
            aria-label="Playable note lanes"
            onClick={readOnly ? undefined : (event) => selectGridEvent('note', event)}
            onPointerDown={readOnly ? undefined : startLongNoteDrag}
            onPointerMove={readOnly ? undefined : moveLongNoteDrag}
            onPointerUp={readOnly ? undefined : (event) => finishLongNoteDrag(event, true)}
            onPointerCancel={readOnly ? undefined : (event) => finishLongNoteDrag(event, false)}
          >
            {keys.map((key) => (
              <div className={`nt-lane lane-${key.toLowerCase()}`} style={{ ...getLaneStyle(settings.lanes[key]), visibility: effectiveNoteLaneWidth(keyMode, key, settings.lanes[key].width) === 0 ? 'hidden' : undefined }} key={key}>
                {(notesByKey.get(key) ?? []).map((note) => {
                  const selection = { kind: 'note', id: note.id } as const;
                  const lane = keys.indexOf(key);
                  const targetKey = dragLane(selection, lane) ?? key;
                  const previewNote = targetKey.startsWith('sample-') ? { ...note, duration: 0 } : note;
                  return renderNote(previewNote, targetKey.replace('sample-', 'Sample '), positionY, cellHeightAt, settings, isEventSelected(selectedEvents, selection), eventHandlers(selection, lane), dragStyle(selection, lane));
                })}
                {longNoteDraft?.key === key
                  ? renderLongNoteDraft(longNoteDraft, positionY, cellHeightAt, settings, formatDraftNoteLabel?.(key) ?? '')
                  : null}
              </div>
            ))}
          </div>
          <div
            className="nt-measure-watermarks"
            style={{ gridTemplateRows: measureRows }}
            aria-hidden="true"
          >
            {renderedMeasures.map((measure) => <span style={{ gridRow: measureCount - measure }} key={measure}>#{String(measure).padStart(3, '0')}</span>)}
          </div>
          <div className="nt-sample-lanes" aria-label="Autoplay sample lanes" onClick={readOnly ? undefined : (event) => selectGridEvent('autoplay', event)}>
            {SAMPLE_LANES.map((lane, index) => {
              const laneKey = SAMPLE_LANE_KEYS[index];
              if (!laneKey) {
                return null;
              }

              return (
                <div className="nt-sample-lane" style={{ ...getLaneStyle(settings.lanes[laneKey]), visibility: currentSampleWidths[index] === 0 ? 'hidden' : undefined }} key={lane}>
                  {(autoplayByLane.get(lane) ?? []).map((note) => {
                    const box = noteCellBox(positionY(note.absolutePosition), cellHeightAt(note.absolutePosition), settings.noteHeight);
                    const selection = { kind: 'autoplay', id: note.id } as const;
                    const targetKey = dragLane(selection, lane - 1) ?? laneKey;
                    const label = formatNoteLabel(settings.noteTemplate, { lane: targetKey.replace('sample-', 'Sample '), sampleId: note.sampleId, sampleType: note.sampleType });
                    return <span className={`nt-chart-note tap nt-autoplay-note${isEventSelected(selectedEvents, selection) ? ' is-selected' : ''}`} style={{ top: `${box.top}px`, height: `${box.height}px`, ...dragStyle(selection, lane - 1) }} key={note.id} {...eventHandlers(selection, lane - 1)}>{label}</span>;
                  })}
                </div>
              );
            })}
          </div>
          <div
            className={`nt-playhead${onPlayheadPositionChange ? ' is-draggable' : ''}`}
            ref={playhead}
            role={onPlayheadPositionChange ? 'slider' : undefined}
            tabIndex={onPlayheadPositionChange ? 0 : undefined}
            aria-label={onPlayheadPositionChange ? 'Playback line position' : undefined}
            aria-orientation={onPlayheadPositionChange ? 'vertical' : undefined}
            aria-valuemin={onPlayheadPositionChange ? 1 : undefined}
            aria-valuemax={onPlayheadPositionChange ? settings.playheadGrid : undefined}
            aria-valuenow={onPlayheadPositionChange ? playheadPositionStep(settings.playheadPosition, settings.playheadGrid) : undefined}
            onPointerDown={onPlayheadPositionChange ? startPlayheadDrag : undefined}
            onPointerMove={onPlayheadPositionChange ? movePlayheadDrag : undefined}
            onPointerUp={onPlayheadPositionChange ? finishPlayheadDrag : undefined}
            onPointerCancel={onPlayheadPositionChange ? finishPlayheadDrag : undefined}
            onKeyDown={onPlayheadPositionChange ? movePlayheadWithKeyboard : undefined}
            style={{
              '--nt-playhead-color': settings.playheadColor,
              '--nt-playhead-thickness': `${settings.playheadThickness}px`,
            } as CSSProperties}
          />
          {marquee ? <span className="nt-selection-marquee" style={marqueeStyle(marquee)} aria-hidden="true" /> : null}
        </div>
      </div>
    </div>
  );
}

function renderNote(
  note: EditorChartNote,
  laneLabel: string,
  positionY: (position: number) => number,
  cellHeightAt: (position: number) => number,
  settings: NoteToolSettings,
  selected: boolean,
  handlers: EventHandlers,
  dragStyle: CSSProperties,
) {
  const duration = note.duration ?? 0;
  const start = positionY(note.absolutePosition);
  const gridHeight = cellHeightAt(note.absolutePosition);
  const label = formatNoteLabel(settings.noteTemplate, { lane: laneLabel, sampleId: note.sampleId, sampleType: note.sampleType });

  if (duration <= 0) {
    return <span className={`nt-chart-note tap${selected ? ' is-selected' : ''}`} style={{ ...noteCellStyle(start, gridHeight, settings.noteHeight), ...dragStyle }} key={note.id} {...handlers}>{label}</span>;
  }

  const box = longNoteBox(start, gridHeight, start - positionY(note.absolutePosition + duration), settings.noteHeight);

  return (
    <span
      className={`nt-chart-note long nt-long-${settings.longNoteStyle}${selected ? ' is-selected' : ''}`}
      style={{ top: `${box.top}px`, height: `${box.height}px`, ...dragStyle }}
      key={note.id}
      {...handlers}
    >
      <span className="nt-long-note-marker end" style={{ height: `${box.markerHeight}px` }}>{label}</span>
      <span className="nt-long-note-body" style={{ top: `${box.markerHeight}px`, bottom: `${box.markerHeight}px` }} />
      <span className="nt-long-note-marker start" style={{ height: `${box.markerHeight}px` }}>{label}</span>
    </span>
  );
}

function renderLongNoteDraft(
  draft: { startPosition: number; endPosition: number },
  positionY: (position: number) => number,
  cellHeightAt: (position: number) => number,
  settings: NoteToolSettings,
  label: string,
) {
  const start = positionY(draft.startPosition);
  const gridHeight = cellHeightAt(draft.startPosition);
  const duration = draft.endPosition - draft.startPosition;
  if (duration <= 0) {
    return <span className="nt-chart-note tap nt-pending-note" style={noteCellStyle(start, gridHeight, settings.noteHeight)} aria-hidden="true">{label}</span>;
  }

  const box = longNoteBox(start, gridHeight, start - positionY(draft.endPosition), settings.noteHeight);
  return (
    <span
      className={`nt-chart-note long nt-long-${settings.longNoteStyle} nt-pending-note`}
      style={{ top: `${box.top}px`, height: `${box.height}px` }}
      aria-hidden="true"
    >
      <span className="nt-long-note-marker end" style={{ height: `${box.markerHeight}px` }}>END</span>
      <span className="nt-long-note-body" style={{ top: `${box.markerHeight}px`, bottom: `${box.markerHeight}px` }} />
      <span className="nt-long-note-marker start" style={{ height: `${box.markerHeight}px` }}>START</span>
    </span>
  );
}

function noteCellStyle(cellBottom: number, cellHeight: number, noteHeight: number): CSSProperties {
  const box = noteCellBox(cellBottom, cellHeight, noteHeight);
  return { top: `${box.top}px`, height: `${box.height}px` };
}

function laneIndexAt(x: number, widths: readonly number[]): number {
  const clamped = Math.max(0, x);
  let laneEnd = 0;
  for (const [index, width] of widths.entries()) {
    laneEnd += width;
    if (clamped < laneEnd) {
      return index;
    }
  }
  return Math.max(0, widths.length - 1);
}

function laneDragOffset(widths: readonly number[], lane: number, delta: number): number {
  const target = Math.max(0, Math.min(widths.length - 1, lane + delta));
  const start = widths.slice(0, lane).reduce((total, width) => total + width, 0);
  const end = widths.slice(0, target).reduce((total, width) => total + width, 0);
  return end - start;
}

function clampSelectionPositionDelta(
  selection: readonly InspectorEvent[],
  requested: number,
  chart: EditorChart,
): number {
  const positions = selection.flatMap((target) => {
    switch (target.kind) {
      case 'note': {
        const event = chart.notes.find((note) => note.id === target.id);
        return event ? [event.absolutePosition] : [];
      }
      case 'autoplay': {
        const event = chart.autoplayNotes.find((note) => note.id === target.id);
        return event ? [event.absolutePosition] : [];
      }
      case 'bpm': {
        const event = chart.bpmChanges.find((item) => item.id === target.id);
        return event ? [event.absolutePosition] : [];
      }
      case 'fraction': {
        const event = chart.measureFractions.find((item) => item.id === target.id);
        return event ? [event.measure] : [];
      }
    }
  });

  return positions.length === 0 ? 0 : Math.max(requested, -Math.min(...positions));
}

function eventPosition(chart: EditorChart, target: InspectorEvent): number | null {
  switch (target.kind) {
    case 'note':
      return chart.notes.find((note) => note.id === target.id)?.absolutePosition ?? null;
    case 'autoplay':
      return chart.autoplayNotes.find((note) => note.id === target.id)?.absolutePosition ?? null;
    case 'bpm':
      return chart.bpmChanges.find((item) => item.id === target.id)?.absolutePosition ?? null;
    case 'fraction':
      return chart.measureFractions.find((item) => item.id === target.id)?.measure ?? null;
  }
}

function localPoint(clientX: number, clientY: number, bounds: DOMRect): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(bounds.width, clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, clientY - bounds.top)),
  };
}

function marqueeStyle(marquee: { startX: number; startY: number; currentX: number; currentY: number }): CSSProperties {
  return {
    left: Math.min(marquee.startX, marquee.currentX),
    top: Math.min(marquee.startY, marquee.currentY),
    width: Math.abs(marquee.currentX - marquee.startX),
    height: Math.abs(marquee.currentY - marquee.startY),
  };
}

function intersectsMarquee(
  element: DOMRect,
  container: DOMRect,
  marquee: { left: number; right: number; top: number; bottom: number },
): boolean {
  const left = element.left - container.left;
  const right = element.right - container.left;
  const top = element.top - container.top;
  const bottom = element.bottom - container.top;
  return right >= marquee.left && left <= marquee.right && bottom >= marquee.top && top <= marquee.bottom;
}

function getLaneStyle(settings: NoteLaneSettings): CSSProperties {
  return {
    ...(settings.background ? { '--nt-column-background': settings.background } : {}),
    '--nt-lane-highlight': settings.highlight,
    '--nt-note-color': settings.noteColor,
    '--nt-note-border-color': settings.borderColor,
  } as CSSProperties;
}

function maxEventMeasure(notes: EditorChartNote[], autoplay: AutoplayChartNote[]): number {
  const positions = [
    ...notes.map((note) => note.absolutePosition + (note.duration ?? 0)),
    ...autoplay.map((note) => note.absolutePosition),
  ];

  return Math.max(0, ...positions.map((position) => Math.floor(position) + 1));
}
