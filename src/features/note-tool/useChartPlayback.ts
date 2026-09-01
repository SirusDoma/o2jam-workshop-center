import { useCallback, useEffect, useRef, useState } from 'react';
import type { OjmSample } from './model';
import type { EditorMeasureFraction } from './types';
import {
  buildPlaybackSchedule,
  playableAudioContext,
  positionAfterTransportCommand,
  positionToSeconds,
  secondsToPosition,
  type PlaybackEvent,
  type TempoChange,
} from './playback';

type DecodedSample = {
  data: ArrayBuffer;
  buffer: AudioBuffer;
};

export type PlaybackPositionListener = (position: number) => void;
export type PlaybackPositionSubscription = (listener: PlaybackPositionListener) => () => void;

export function useChartPlayback({
  baseBpm,
  bpmChanges,
  events,
  measureFractions,
  samples,
  endPosition,
}: {
  baseBpm: number;
  bpmChanges: readonly TempoChange[];
  events: readonly PlaybackEvent[];
  measureFractions: readonly EditorMeasureFraction[];
  samples: readonly OjmSample[];
  endPosition: number;
}) {
  const context = useRef<AudioContext | null>(null);
  const decoded = useRef(new Map<number, DecodedSample>());
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const animation = useRef<number | null>(null);
  const startedAt = useRef(0);
  const startedFromSeconds = useRef(0);
  const positionRef = useRef(0);
  const playbackRun = useRef(0);
  const positionListeners = useRef(new Set<PlaybackPositionListener>());
  const [position, setPositionState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const emitPosition = useCallback((next: number) => {
    positionRef.current = next;
    positionListeners.current.forEach((listener) => listener(next));
  }, []);

  const commitPosition = useCallback((next: number) => {
    emitPosition(next);
    setPositionState(next);
  }, [emitPosition]);

  const subscribePosition = useCallback<PlaybackPositionSubscription>((listener) => {
    positionListeners.current.add(listener);
    listener(positionRef.current);
    return () => positionListeners.current.delete(listener);
  }, []);

  const stopSources = useCallback(() => {
    playbackRun.current += 1;
    for (const source of sources.current) {
      try {
        source.stop();
      }
      catch {
        // The source may already have ended.
      }
    }
    sources.current = [];
    if (animation.current !== null) {
      cancelAnimationFrame(animation.current);
      animation.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    stopSources();
    setPlaying(false);
    commitPosition(positionAfterTransportCommand(positionRef.current, 'pause'));
  }, [commitPosition, stopSources]);

  const stop = useCallback(() => {
    stopSources();
    setPlaying(false);
    commitPosition(positionAfterTransportCommand(positionRef.current, 'stop'));
  }, [commitPosition, stopSources]);

  const setPosition = useCallback((next: number) => {
    stopSources();
    setPlaying(false);
    commitPosition(Math.max(0, Math.min(endPosition, next)));
  }, [commitPosition, endPosition, stopSources]);

  const play = useCallback(async () => {
    stopSources();
    const run = playbackRun.current;
    setMessage(null);
    const startPosition = positionRef.current >= endPosition ? 0 : positionRef.current;
    if (startPosition !== positionRef.current) {
      commitPosition(startPosition);
    }

    const AudioContextClass = window.AudioContext;
    const audioContext = playableAudioContext(context.current, () => new AudioContextClass());
    context.current = audioContext;
    await audioContext.resume();

    const sampleById = new Map(samples.map((sample) => [sample.id, sample]));
    const usedIds = [...new Set(events.map((event) => event.sampleId))];

    try {
      await Promise.all(usedIds.map(async (id) => {
        const sample = sampleById.get(id);
        if (!sample) {
          return;
        }

        const cached = decoded.current.get(id);
        if (cached?.data === sample.data) {
          return;
        }

        const buffer = await audioContext.decodeAudioData(sample.data.slice(0));
        decoded.current.set(id, { data: sample.data, buffer });
      }));
    }
    catch {
      if (run === playbackRun.current) {
        setPlaying(false);
        setMessage('One or more samples could not be decoded by this browser.');
      }
      return;
    }

    if (run !== playbackRun.current) {
      return;
    }

    const durations = new Map<number, number>();
    decoded.current.forEach((sample, id) => durations.set(id, sample.buffer.duration));
    const schedule = buildPlaybackSchedule({
      startPosition,
      baseBpm,
      bpmChanges,
      events,
      measureFractions,
      sampleDurations: durations,
    });
    const eventById = new Map(events.map((event) => [event.id, event]));
    const now = audioContext.currentTime;

    for (const item of schedule) {
      const decodedSample = decoded.current.get(item.sampleId);
      const event = eventById.get(item.eventId);
      if (!decodedSample || !event || item.offset >= decodedSample.buffer.duration) {
        continue;
      }

      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      const panner = audioContext.createStereoPanner();
      source.buffer = decodedSample.buffer;
      gain.gain.value = Math.max(0, Math.min(1, (event.volume ?? 100) / 100));
      panner.pan.value = Math.max(-1, Math.min(1, (event.pan ?? 0) / 7));
      source.connect(gain).connect(panner).connect(audioContext.destination);
      source.start(now + item.delay, item.offset);
      sources.current.push(source);
    }

    startedAt.current = now;
    startedFromSeconds.current = positionToSeconds(startPosition, baseBpm, bpmChanges, measureFractions);
    setPlaying(true);

    const update = () => {
      const elapsed = audioContext.currentTime - startedAt.current;
      const next = secondsToPosition(startedFromSeconds.current + elapsed, baseBpm, bpmChanges, measureFractions);

      if (next >= endPosition) {
        commitPosition(endPosition);
        stopSources();
        setPlaying(false);
        return;
      }

      emitPosition(next);
      animation.current = requestAnimationFrame(update);
    };
    animation.current = requestAnimationFrame(update);
  }, [baseBpm, bpmChanges, commitPosition, emitPosition, endPosition, events, measureFractions, samples, stopSources]);

  useEffect(() => {
    if (playing) {
      void play();
    }
  }, [baseBpm, bpmChanges, endPosition, events, measureFractions, samples]);

  useEffect(() => () => {
    stopSources();
    const audioContext = context.current;
    context.current = null;
    void audioContext?.close();
  }, [stopSources]);

  return {
    position,
    playing,
    message,
    play,
    pause,
    stop,
    setPosition,
    subscribePosition,
  };
}
