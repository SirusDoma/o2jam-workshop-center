import type {
  AutoplayChartNote,
  EditorBpmChange,
  EditorChart,
  EditorChartNote,
  EditorMeasureFraction,
  InspectorEvent,
} from './types';
import { NOTE_LANE_KEYS, SAMPLE_LANE_COUNT, type NoteLaneKey } from './settings.ts';

const EPSILON = 0.000001;

export type EditorEventPatch = Partial<{
  absolutePosition: number;
  key: EditorChartNote['key'];
  lane: number;
  sampleType: 'wav' | 'ogg';
  sampleId: number;
  volume: number;
  pan: number;
  duration: number | null;
  bpm: number;
  measure: number;
  fraction: number;
}>;

export type FoundChartEvent =
  | { kind: 'note'; event: EditorChartNote }
  | { kind: 'autoplay'; event: AutoplayChartNote }
  | { kind: 'bpm'; event: EditorBpmChange }
  | { kind: 'fraction'; event: EditorMeasureFraction };

export type EventMovement = {
  positionDelta: number;
  noteLaneDelta?: number;
  autoplayLaneDelta?: number;
  noteLanes?: readonly NoteLaneKey[];
  noteToAutoplay?: {
    sourceLane: NoteLaneKey;
    targetLane: number;
  };
  autoplayToNote?: {
    sourceLane: number;
    targetLane: NoteLaneKey;
  };
};

export function clampAutoplayToNoteLane(requested: number, sourceLane: number, lanes: readonly number[], laneCount: number): number | null {
  if (lanes.length === 0) {
    return null;
  }

  const minOffset = Math.min(...lanes) - sourceLane;
  const maxOffset = Math.max(...lanes) - sourceLane;
  if (maxOffset - minOffset >= laneCount) {
    return null;
  }

  return clamp(requested, -minOffset, laneCount - 1 - maxOffset);
}

export function defaultBpmAtPosition(chart: EditorChart, position: number, baseBpm: number): number {
  let value = positive(baseBpm, 120);
  let lastPosition = -Infinity;
  for (const event of chart.bpmChanges) {
    if (event.absolutePosition <= position + EPSILON && event.absolutePosition >= lastPosition) {
      value = positive(event.bpm, value);
      lastPosition = event.absolutePosition;
    }
  }
  return value;
}

export function placeBpmChange(chart: EditorChart, event: EditorBpmChange): EditorChart {
  const bpmChanges = chart.bpmChanges
    .filter((item) => Math.abs(item.absolutePosition - event.absolutePosition) > EPSILON)
    .concat({ ...event, absolutePosition: nonNegative(event.absolutePosition), bpm: positive(event.bpm, 120) })
    .sort(byPosition);

  return withMeasureCount({ ...chart, bpmChanges });
}

export function placeMeasureFraction(chart: EditorChart, event: EditorMeasureFraction): EditorChart {
  const normalized = { ...event, measure: Math.floor(nonNegative(event.measure)), fraction: positive(event.fraction, 1) };
  const measureFractions = chart.measureFractions
    .filter((item) => item.measure !== normalized.measure)
    .concat(normalized)
    .sort((left, right) => left.measure - right.measure);

  return withMeasureCount({ ...chart, measureFractions });
}

export function placeAutoplayNote(chart: EditorChart, event: AutoplayChartNote): EditorChart {
  const normalized = normalizeAudioEvent({ ...event, lane: clamp(Math.round(event.lane), 1, SAMPLE_LANE_COUNT) });
  const autoplayNotes = chart.autoplayNotes
    .filter((item) => item.lane !== normalized.lane || Math.abs(item.absolutePosition - normalized.absolutePosition) > EPSILON)
    .concat(normalized)
    .sort(byPosition);

  return withMeasureCount({ ...chart, autoplayNotes });
}

export function findChartEvent(chart: EditorChart, selection: InspectorEvent): FoundChartEvent | null {
  switch (selection.kind) {
    case 'note': {
      const event = chart.notes.find((item) => item.id === selection.id);
      return event ? { kind: selection.kind, event } : null;
    }
    case 'autoplay': {
      const event = chart.autoplayNotes.find((item) => item.id === selection.id);
      return event ? { kind: selection.kind, event } : null;
    }
    case 'bpm': {
      const event = chart.bpmChanges.find((item) => item.id === selection.id);
      return event ? { kind: selection.kind, event } : null;
    }
    case 'fraction': {
      const event = chart.measureFractions.find((item) => item.id === selection.id);
      return event ? { kind: selection.kind, event } : null;
    }
  }
}

export function updateChartEvent(chart: EditorChart, selection: InspectorEvent, patch: EditorEventPatch): EditorChart {
  switch (selection.kind) {
    case 'note': {
      const current = chart.notes.find((item) => item.id === selection.id);
      if (!current) {
        return chart;
      }

      const next: EditorChartNote = normalizeAudioEvent({
        ...current,
        key: patch.key ?? current.key,
        absolutePosition: patch.absolutePosition ?? current.absolutePosition,
        sampleType: patch.sampleType ?? current.sampleType,
        sampleId: patch.sampleId ?? current.sampleId,
        volume: patch.volume ?? current.volume,
        pan: patch.pan ?? current.pan,
        ...(typeof patch.duration === 'number' ? { duration: patch.duration } : {}),
      });

      if (patch.duration === null) {
        delete next.duration;
      }

      const notes = chart.notes
        .filter((item) => item.id === selection.id || item.key !== next.key || Math.abs(item.absolutePosition - next.absolutePosition) > EPSILON)
        .map((item) => item.id === selection.id ? next : item);

      return withMeasureCount({ ...chart, notes });
    }
    case 'autoplay': {
      const current = chart.autoplayNotes.find((item) => item.id === selection.id);
      if (!current) {
        return chart;
      }

      const next = normalizeAudioEvent({ ...current, ...patch, lane: clamp(Math.round(patch.lane ?? current.lane), 1, SAMPLE_LANE_COUNT) });
      const autoplayNotes = chart.autoplayNotes
        .filter((item) => item.id === selection.id || item.lane !== next.lane || Math.abs(item.absolutePosition - next.absolutePosition) > EPSILON)
        .map((item) => item.id === selection.id ? next : item);

      return withMeasureCount({ ...chart, autoplayNotes });
    }
    case 'bpm': {
      const current = chart.bpmChanges.find((item) => item.id === selection.id);
      if (!current) {
        return chart;
      }

      const next = {
        ...current,
        absolutePosition: nonNegative(patch.absolutePosition ?? current.absolutePosition),
        bpm: positive(patch.bpm ?? current.bpm, current.bpm),
      };

      const bpmChanges = chart.bpmChanges
        .filter((item) => item.id === selection.id || Math.abs(item.absolutePosition - next.absolutePosition) > EPSILON)
        .map((item) => item.id === selection.id ? next : item)
        .sort(byPosition);

      return withMeasureCount({ ...chart, bpmChanges });
    }
    case 'fraction': {
      const current = chart.measureFractions.find((item) => item.id === selection.id);
      if (!current) {
        return chart;
      }

      const next = {
        ...current,
        measure: Math.floor(nonNegative(patch.measure ?? current.measure)),
        fraction: positive(patch.fraction ?? current.fraction, current.fraction),
      };

      const measureFractions = chart.measureFractions
        .filter((item) => item.id === selection.id || item.measure !== next.measure)
        .map((item) => item.id === selection.id ? next : item)
        .sort((left, right) => left.measure - right.measure);

      return withMeasureCount({ ...chart, measureFractions });
    }
  }
}

export function removeChartEvent(chart: EditorChart, selection: InspectorEvent): EditorChart {
  switch (selection.kind) {
    case 'note':
      return { ...chart, notes: chart.notes.filter((item) => item.id !== selection.id) };
    case 'autoplay':
      return { ...chart, autoplayNotes: chart.autoplayNotes.filter((item) => item.id !== selection.id) };
    case 'bpm':
      return { ...chart, bpmChanges: chart.bpmChanges.filter((item) => item.id !== selection.id) };
    case 'fraction':
      return { ...chart, measureFractions: chart.measureFractions.filter((item) => item.id !== selection.id) };
  }
}

export function moveChartEvents(
  chart: EditorChart,
  selection: readonly InspectorEvent[],
  movement: EventMovement,
): EditorChart {
  const selected = new Set(selection.map(eventKey));
  const positions = selection.flatMap((item) => {
    const found = findChartEvent(chart, item);
    return found ? [found.kind === 'fraction' ? found.event.measure : found.event.absolutePosition] : [];
  });

  const requestedPositionDelta = Number.isFinite(movement.positionDelta) ? movement.positionDelta : 0;
  const minimumPosition = positions.length > 0 ? Math.min(...positions) : 0;
  const positionDelta = Math.max(requestedPositionDelta, -minimumPosition);
  const noteLanes = movement.noteLanes ?? NOTE_LANE_KEYS;
  const selectedNotes = chart.notes.filter((note) => selected.has(eventKey({ kind: 'note', id: note.id })));
  const selectedAutoplay = chart.autoplayNotes.filter((note) => selected.has(eventKey({ kind: 'autoplay', id: note.id })));
  const noteLaneDelta = clampLaneDelta(
    movement.noteLaneDelta ?? 0,
    selectedNotes.map((note) => noteLanes.indexOf(note.key)),
    noteLanes.length,
  );

  const autoplayLaneDelta = clampLaneDelta(
    movement.autoplayLaneDelta ?? 0,
    selectedAutoplay.map((note) => note.lane - 1),
    SAMPLE_LANE_COUNT,
  );

  const convertedNotes = movement.noteToAutoplay
    ? selectedNotes.map((note): AutoplayChartNote => {
      const sourceLane = noteLanes.indexOf(movement.noteToAutoplay?.sourceLane ?? note.key);
      const noteLane = noteLanes.indexOf(note.key);
      const { key: _key, duration: _duration, ...audioEvent } = note;
      return {
        ...audioEvent,
        lane: clamp((movement.noteToAutoplay?.targetLane ?? 1) + Math.max(0, noteLane) - Math.max(0, sourceLane), 1, SAMPLE_LANE_COUNT),
        absolutePosition: note.absolutePosition + positionDelta,
      };
    })
    : [];

  const convertedCells = new Set(convertedNotes.map((note) => `${note.lane}:${note.absolutePosition}`));
  const mainLane = movement.autoplayToNote
    ? clampAutoplayToNoteLane(noteLanes.indexOf(movement.autoplayToNote.targetLane), movement.autoplayToNote.sourceLane, selectedAutoplay.map((note) => note.lane), noteLanes.length)
    : null;

  const convertedAutoplay = mainLane !== null && movement.autoplayToNote
    ? selectedAutoplay.map((note): EditorChartNote => {
      const { lane, ...audioEvent } = note;
      return {
        ...audioEvent,
        key: noteLanes[mainLane + lane - movement.autoplayToNote!.sourceLane]!,
        absolutePosition: note.absolutePosition + positionDelta,
      };
    })
    : [];

  const convertedMainCells = new Set(convertedAutoplay.map((note) => `${note.key}:${note.absolutePosition}`));

  return withMeasureCount({
    ...chart,
    notes: chart.notes.flatMap((note) => {
      if (!selected.has(eventKey({ kind: 'note', id: note.id }))) {
        return [note];
      }

      if (movement.noteToAutoplay) {
        return [];
      }

      const laneIndex = noteLanes.indexOf(note.key);
      return [{
        ...note,
        absolutePosition: note.absolutePosition + positionDelta,
        key: laneIndex < 0 ? note.key : noteLanes[laneIndex + noteLaneDelta] ?? note.key,
      }];
    }).filter((note) => !convertedMainCells.has(`${note.key}:${note.absolutePosition}`))
      .concat(convertedAutoplay)
      .sort(byPosition),
    autoplayNotes: chart.autoplayNotes
      .filter((note) => mainLane === null || !selected.has(eventKey({ kind: 'autoplay', id: note.id })))
      .map((note) => selected.has(eventKey({ kind: 'autoplay', id: note.id }))
        ? { ...note, absolutePosition: note.absolutePosition + positionDelta, lane: note.lane + autoplayLaneDelta }
        : note)
      .filter((note) => !convertedCells.has(`${note.lane}:${note.absolutePosition}`))
      .concat(convertedNotes)
      .sort(byPosition),
    bpmChanges: chart.bpmChanges.map((event) => selected.has(eventKey({ kind: 'bpm', id: event.id }))
      ? { ...event, absolutePosition: event.absolutePosition + positionDelta }
      : event),
    measureFractions: chart.measureFractions.map((event) => selected.has(eventKey({ kind: 'fraction', id: event.id }))
      ? { ...event, measure: Math.max(0, event.measure + Math.round(positionDelta)) }
      : event),
  });
}

export function chartEndPosition(chart: EditorChart): number {
  return Math.max(
    4,
    chart.measureCount,
    ...chart.notes.map((note) => note.absolutePosition + (note.duration ?? 0)),
    ...chart.autoplayNotes.map((note) => note.absolutePosition),
    ...chart.bpmChanges.map((event) => event.absolutePosition),
    ...chart.measureFractions.map((event) => event.measure + 1),
  );
}

function withMeasureCount(chart: EditorChart): EditorChart {
  return { ...chart, measureCount: Math.max(chart.measureCount, Math.ceil(chartEndPosition(chart))) };
}

function normalizeAudioEvent<T extends EditorChartNote | AutoplayChartNote>(event: T): T {
  return {
    ...event,
    absolutePosition: nonNegative(event.absolutePosition),
    sampleId: Math.max(0, Math.round(event.sampleId)),
    volume: clamp(event.volume, 0, 100),
    pan: clamp(event.pan, -7, 7),
    ...('duration' in event && typeof event.duration === 'number'
      ? { duration: positive(event.duration, 1 / 16) }
      : {}),
  };
}

function byPosition<T extends { absolutePosition: number }>(left: T, right: T): number {
  return left.absolutePosition - right.absolutePosition;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function eventKey(event: InspectorEvent): string {
  return `${event.kind}:${event.id}`;
}

function clampLaneDelta(delta: number, indexes: number[], laneCount: number): number {
  const validIndexes = indexes.filter((index) => index >= 0);
  if (validIndexes.length === 0) {
    return 0;
  }

  const rounded = Math.round(Number.isFinite(delta) ? delta : 0);
  return clamp(rounded, -Math.min(...validIndexes), laneCount - 1 - Math.max(...validIndexes));
}
