import { useCallback, useEffect, useRef, useState } from 'react';
import type { OjmSample } from './model';
import type { EditorMeasureFraction } from './types';
import type { PlaybackDiagnostics } from './diagnostics';
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

export type PlaybackPositionListener = (position: number, scrollIntoView?: boolean) => void;
export type PlaybackPositionSubscription = (listener: PlaybackPositionListener) => () => void;

export function useChartPlayback({
  diagnostic,
  baseBpm,
  bpmChanges,
  events,
  measureFractions,
  samples,
  endPosition,
}: {
  diagnostic: PlaybackDiagnostics;
  baseBpm: number;
  bpmChanges: readonly TempoChange[];
  events: readonly PlaybackEvent[];
  measureFractions: readonly EditorMeasureFraction[];
  samples: readonly OjmSample[];
  endPosition: number;
}) {
  const context = useRef<AudioContext | null>(null);
  const decoded = useRef(new Map<number, DecodedSample>());
  const sources = useRef(new Map<AudioBufferSourceNode, () => void>());
  const scheduler = useRef<ReturnType<typeof setInterval> | null>(null);
  const animation = useRef<number | null>(null);
  const startedAt = useRef(0);
  const startedFromSeconds = useRef(0);
  const positionRef = useRef(0);
  const playbackRun = useRef(0);
  const positionListeners = useRef(new Set<PlaybackPositionListener>());
  const [position, setPositionState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const emitPosition = useCallback((next: number, scrollIntoView = false) => {
    positionRef.current = next;
    positionListeners.current.forEach((listener) => listener(next, scrollIntoView));
  }, []);

  const commitPosition = useCallback((next: number, scrollIntoView = false) => {
    emitPosition(next, scrollIntoView);
    setPositionState(next);
  }, [emitPosition]);

  const subscribePosition = useCallback<PlaybackPositionSubscription>((listener) => {
    positionListeners.current.add(listener);
    listener(positionRef.current);
    return () => positionListeners.current.delete(listener);
  }, []);

  const stopSources = useCallback(() => {
    playbackRun.current += 1;
    if (scheduler.current !== null) {
      clearInterval(scheduler.current);
      scheduler.current = null;
    }

    for (const [source, disconnect] of sources.current) {
      try {
        source.stop();
      }
      catch {
        // The source may already have ended.
      }
      finally {
        disconnect();
      }
    }

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
    commitPosition(positionAfterTransportCommand(positionRef.current, 'stop'), true);
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
    const scheduleStarted = diagnostic.recording ? performance.now() : 0;
    const schedule = buildPlaybackSchedule({
      startPosition,
      baseBpm,
      bpmChanges,
      events,
      measureFractions,
      sampleDurations: durations,
    });
    if (diagnostic.enabled) {
      diagnostic.record('audio.buildSchedule', performance.now() - scheduleStarted);
      Object.assign(diagnostic.context, {
        sampleRate: audioContext.sampleRate, baseLatencyMs: audioContext.baseLatency * 1000,
        outputLatencyMs: (audioContext.outputLatency ?? 0) * 1000,
        samples: samples.length, decodedSamples: decoded.current.size,
        events: events.length, tempoChanges: bpmChanges.length, measureFractions: measureFractions.length,
      });
    }

    const eventById = new Map(events.map((event) => [event.id, event]));
    const now = audioContext.currentTime + 0.05;
    let nextEvent = 0;
    let previousSchedulerTime = 0;

    const scheduleAhead = () => {
      if (run !== playbackRun.current) {
        return;
      }

      const scheduleTime = diagnostic.recording ? performance.now() : 0;
      if (diagnostic.recording && previousSchedulerTime) diagnostic.record('audio.schedulerInterval', scheduleTime - previousSchedulerTime);
      previousSchedulerTime = scheduleTime;
      const currentTime = audioContext.currentTime;
      while (nextEvent < schedule.length && now + schedule[nextEvent]!.delay <= currentTime + 0.25) {
        const item = schedule[nextEvent++]!;
        if (diagnostic.mode === 'no-audio') continue;
        const decodedSample = decoded.current.get(item.sampleId);
        const event = eventById.get(item.eventId);
        const when = now + item.delay;
        const offset = item.offset + Math.max(0, currentTime - when);
        if (!sampleById.has(item.sampleId) || !decodedSample || !event || offset >= decodedSample.buffer.duration) {
          continue;
        }

        const startTime = Math.max(when, currentTime);
        if (when < currentTime) diagnostic.count('lateAudioEvents');
        diagnostic.count('scheduledAudioEvents');
        const duration = decodedSample.buffer.duration - offset;
        const volume = Math.max(0, Math.min(1, (event.volume ?? 100) / 100));
        const source = audioContext.createBufferSource();
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        const disconnect = () => {
          source.onended = null;
          source.disconnect();
          gain.disconnect();
          panner.disconnect();
          sources.current.delete(source);
        };

        source.buffer = decodedSample.buffer;

        // Smooth abrupt waveform edges that otherwise produce an audible click.
        const fadeDuration = Math.min(0.002, duration / 2);
        gain.gain.setValueAtTime(offset > 0 ? 0 : volume, startTime);
        if (offset > 0) {
          gain.gain.linearRampToValueAtTime(volume, startTime + fadeDuration);
        }

        gain.gain.setValueAtTime(volume, startTime + duration - fadeDuration);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);

        panner.pan.value = Math.max(-1, Math.min(1, (event.pan ?? 0) / 7));
        source.onended = disconnect;
        source.connect(gain).connect(panner).connect(audioContext.destination);
        sources.current.set(source, disconnect);
        source.start(startTime, offset, duration);
      }
      if (diagnostic.recording) {
        diagnostic.record('audio.schedulerWork', performance.now() - scheduleTime);
        diagnostic.record('audio.activeSources', sources.current.size);
      }
    };

    startedAt.current = now;
    startedFromSeconds.current = positionToSeconds(startPosition, baseBpm, bpmChanges, measureFractions);
    scheduleAhead();
    scheduler.current = setInterval(scheduleAhead, 25);
    setPlaying(true);
    emitPosition(startPosition, true);

    let previousOutputTime = -1;
    const update = (frameTime: number) => {
      diagnostic.frame(frameTime);
      const updateStarted = diagnostic.recording ? performance.now() : 0;
      const outputTimestamp = audioContext.getOutputTimestamp();
      const renderedTime = outputTimestamp.contextTime ?? 0;
      const outputTime = renderedTime > 0
        ? renderedTime
        : audioContext.currentTime - audioContext.baseLatency - audioContext.outputLatency;

      const elapsed = Math.max(0, outputTime - startedAt.current);
      const next = secondsToPosition(startedFromSeconds.current + elapsed, baseBpm, bpmChanges, measureFractions);
      if (diagnostic.recording) {
        diagnostic.record('playback.clockAndPosition', performance.now() - updateStarted);
        diagnostic.record('audio.timestampAge', performance.now() - (outputTimestamp.performanceTime ?? performance.now()));
        if (outputTime === previousOutputTime) diagnostic.count('unchangedAudioTimestamps');
        diagnostic.count('playbackCallbacks');
        diagnostic.context.position = next;
        diagnostic.context.audioState = audioContext.state;
      }
      previousOutputTime = outputTime;

      if (next >= endPosition) {
        commitPosition(endPosition);
        stopSources();
        setPlaying(false);
        return;
      }

      emitPosition(next);
      if (diagnostic.recording) diagnostic.record('playback.callback', performance.now() - updateStarted);
      animation.current = requestAnimationFrame(update);
    };

    animation.current = requestAnimationFrame(update);
  }, [baseBpm, bpmChanges, commitPosition, diagnostic, emitPosition, endPosition, events, measureFractions, samples, stopSources]);

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
