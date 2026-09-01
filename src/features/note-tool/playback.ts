export type TempoChange = {
  position: number;
  bpm: number;
};

export type PlaybackEvent = {
  id: string;
  position: number;
  sampleId: number;
  volume?: number;
  pan?: number;
};

export type ScheduledEvent = {
  eventId: string;
  sampleId: number;
  delay: number;
  offset: number;
};

const BEATS_PER_MEASURE = 4;
const PLAYBACK_READOUT_INTERVAL_MS = 100;

export function playableAudioContext(current: AudioContext | null, create: () => AudioContext): AudioContext {
  return current && current.state !== 'closed' ? current : create();
}

export function positionAfterTransportCommand(position: number, command: 'pause' | 'stop'): number {
  return command === 'stop' ? 0 : position;
}

export function playbackEndPosition(chartEndPosition: number): number {
  return chartEndPosition + 1;
}

export function shouldRefreshPlaybackReadout(previous: number, current: number): boolean {
  return current - previous >= PLAYBACK_READOUT_INTERVAL_MS;
}

export function measuredFrameRate(frameCount: number, elapsedMilliseconds: number): number {
  return elapsedMilliseconds > 0 ? Math.round(frameCount * 1_000 / elapsedMilliseconds) : 0;
}

export function positionToSeconds(
  position: number,
  baseBpm: number,
  bpmChanges: readonly TempoChange[],
  measureFractions: readonly MeasureFraction[] = [],
): number {
  const target = Math.max(0, position);
  const changes = validChanges(bpmChanges).filter((change) => change.position < target);
  let cursor = 0;
  let bpm = validBpm(baseBpm);
  let seconds = 0;

  for (const change of changes) {
    seconds += segmentSeconds(scaledChartPosition(change.position, measureFractions) - scaledChartPosition(cursor, measureFractions), bpm);
    cursor = change.position;
    bpm = change.bpm;
  }

  return seconds + segmentSeconds(scaledChartPosition(target, measureFractions) - scaledChartPosition(cursor, measureFractions), bpm);
}

export function secondsToPosition(
  seconds: number,
  baseBpm: number,
  bpmChanges: readonly TempoChange[],
  measureFractions: readonly MeasureFraction[] = [],
): number {
  let remaining = Math.max(0, seconds);
  let cursor = 0;
  let scaledCursor = 0;
  let bpm = validBpm(baseBpm);

  for (const change of validChanges(bpmChanges)) {
    const scaledChange = scaledChartPosition(change.position, measureFractions);
    const duration = segmentSeconds(scaledChange - scaledCursor, bpm);

    if (remaining <= duration) {
      return chartPositionAtScaledPosition(scaledCursor + secondsToMeasures(remaining, bpm), measureFractions);
    }

    remaining -= duration;
    cursor = change.position;
    scaledCursor = scaledChange;
    bpm = change.bpm;
  }

  return chartPositionAtScaledPosition(scaledCursor + secondsToMeasures(remaining, bpm), measureFractions);
}

export function bpmAtPosition(
  position: number,
  baseBpm: number,
  bpmChanges: readonly TempoChange[],
): number {
  let bpm = validBpm(baseBpm);

  for (const change of validChanges(bpmChanges)) {
    if (change.position > position) {
      break;
    }
    bpm = change.bpm;
  }

  return bpm;
}

export function buildPlaybackSchedule({
  startPosition,
  baseBpm,
  bpmChanges,
  events,
  sampleDurations,
  measureFractions = [],
}: {
  startPosition: number;
  baseBpm: number;
  bpmChanges: readonly TempoChange[];
  events: readonly PlaybackEvent[];
  sampleDurations: ReadonlyMap<number, number>;
  measureFractions?: readonly MeasureFraction[];
}): ScheduledEvent[] {
  const startSeconds = positionToSeconds(startPosition, baseBpm, bpmChanges, measureFractions);
  const scheduled: ScheduledEvent[] = [];

  for (const event of events) {
    const eventSeconds = positionToSeconds(event.position, baseBpm, bpmChanges, measureFractions);

    if (eventSeconds >= startSeconds) {
      scheduled.push({
        eventId: event.id,
        sampleId: event.sampleId,
        delay: eventSeconds - startSeconds,
        offset: 0,
      });
      continue;
    }

    const offset = startSeconds - eventSeconds;
    const duration = sampleDurations.get(event.sampleId) ?? 0;

    if (offset < duration) {
      scheduled.push({ eventId: event.id, sampleId: event.sampleId, delay: 0, offset });
    }
  }

  return scheduled.sort((left, right) => left.delay - right.delay);
}

function validChanges(changes: readonly TempoChange[]): TempoChange[] {
  return changes
    .filter((change) => Number.isFinite(change.position) && change.position >= 0 && Number.isFinite(change.bpm) && change.bpm > 0)
    .sort((left, right) => left.position - right.position);
}

function validBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

function segmentSeconds(measures: number, bpm: number): number {
  return measures * BEATS_PER_MEASURE * 60 / bpm;
}

function secondsToMeasures(seconds: number, bpm: number): number {
  return seconds * bpm / (BEATS_PER_MEASURE * 60);
}
import { chartPositionAtScaledPosition, scaledChartPosition, type MeasureFraction } from './measureScale.ts';
