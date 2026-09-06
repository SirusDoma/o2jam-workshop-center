export const DIAGNOSTIC_MODES = {
  normal: 'Normal playback',
  'auto-scrollbar': 'Automatic panel scrollbar',
  'full-sample-layout': 'All sample rows laid out',
  'no-readout': 'Transport readout paused',
  idle: 'Paused baseline',
  'no-follow': 'Auto-scroll off',
  'no-playhead': 'Playhead hidden',
  'no-overlays': 'Grid and watermarks hidden',
  'no-roll': 'Entire roll hidden',
  'no-audio': 'Audio scheduling off',
} as const;

export type DiagnosticMode = keyof typeof DIAGNOSTIC_MODES;
type Context = Record<string, number | string | boolean | null>;
type Samples = { count: number; total: number; max: number; values: number[] };

export function diagnosticEnabled(search: string, hash: string): boolean {
  return new URLSearchParams(search).get('diagnostic') === 'true'
    || new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('diagnostic') === 'true';
}

export function summarizeSamples(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
}

type LongFrame = {
  at: number;
  duration: number;
  blockingDuration: number;
  renderDuration: number;
  styleLayoutDuration: number;
  scripts: { function: string; source: string; position: number; duration: number; forcedStyleLayout: number }[];
};

type LongFrameEntry = PerformanceEntry & {
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  scripts: {
    sourceFunctionName: string; sourceURL: string; sourceCharPosition: number;
    duration: number; forcedStyleAndLayoutDuration: number;
  }[];
};

export type DiagnosticCapture = ReturnType<PlaybackDiagnostics['finish']>;

const MAX_SAMPLES = 4096;

export class PlaybackDiagnostics {
  enabled = false;
  recording = false;
  mode: DiagnosticMode = 'normal';
  context: Context = {};
  private started = 0;
  private previousFrame = 0;
  private metrics = new Map<string, Samples>();
  private counters: Record<string, number> = {};
  private frames: { at: number; interval: number }[] = [];
  private longFrames: LongFrame[] = [];
  private slowWork: { stage: string; at: number; duration: number }[] = [];
  private observers: PerformanceObserver[] = [];
  private initialContext: Context = {};
  private modeListeners = new Set<() => void>();

  subscribeMode = (listener: () => void) => {
    this.modeListeners.add(listener);
    return () => { this.modeListeners.delete(listener); };
  };

  getMode = () => this.mode;

  setMode(mode: DiagnosticMode) {
    const previous = this.mode;
    this.mode = this.enabled ? mode : 'normal';
    if (typeof document !== 'undefined') {
      if (this.mode === 'normal') delete document.documentElement.dataset.ntDiagnostic;
      else document.documentElement.dataset.ntDiagnostic = this.mode;
    }
    if (previous !== this.mode) this.modeListeners.forEach((listener) => listener());
  }

  begin(context: Context = {}) {
    this.disconnect();
    this.started = performance.now();
    this.previousFrame = 0;
    this.metrics.clear();
    this.counters = {};
    this.frames = [];
    this.longFrames = [];
    this.slowWork = [];
    this.initialContext = { ...this.context, ...context };
    this.recording = this.enabled;
    if (!this.recording || typeof PerformanceObserver === 'undefined') return;

    for (const type of ['longtask', 'long-animation-frame']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver((list) => this.observe(list.getEntries()));
      observer.observe({ type });
      this.observers.push(observer);
    }
  }

  private observe(entries: PerformanceEntry[]) {
    for (const entry of entries) {
      if (entry.startTime < this.started) continue;
      this.record(entry.entryType, entry.duration);
      if (entry.entryType !== 'long-animation-frame') continue;
      const frame = entry as LongFrameEntry;
      const end = frame.startTime + frame.duration;
      const detail: LongFrame = {
        at: frame.startTime - this.started,
        duration: frame.duration,
        blockingDuration: frame.blockingDuration,
        renderDuration: frame.renderStart ? end - frame.renderStart : 0,
        styleLayoutDuration: frame.styleAndLayoutStart ? end - frame.styleAndLayoutStart : 0,
        scripts: frame.scripts.map((script) => ({
          function: script.sourceFunctionName,
          source: script.sourceURL.split('?')[0] ?? '',
          position: script.sourceCharPosition,
          duration: script.duration,
          forcedStyleLayout: script.forcedStyleAndLayoutDuration,
        })),
      };
      if (this.longFrames.length < 100) this.longFrames.push(detail);
    }
  }

  record(name: string, duration: number) {
    if (!this.recording || !Number.isFinite(duration)) return;
    let samples = this.metrics.get(name);
    if (!samples) {
      samples = { count: 0, total: 0, max: 0, values: [] };
      this.metrics.set(name, samples);
    }
    samples.count++;
    samples.total += duration;
    samples.max = Math.max(samples.max, duration);
    if (samples.values.length < MAX_SAMPLES) samples.values.push(duration);
    if (duration >= 2 && this.slowWork.length < 200
      && (name.startsWith('roll.') || name.startsWith('playback.') || name === 'audio.schedulerWork')) {
      this.slowWork.push({ stage: name, at: performance.now() - this.started - duration, duration });
    }
  }

  count(name: string, value = 1) {
    if (this.recording) this.counters[name] = (this.counters[name] ?? 0) + value;
  }

  frame(now: number) {
    if (!this.recording) return;
    if (this.previousFrame) {
      const interval = now - this.previousFrame;
      this.record('frame.interval', interval);
      if (interval > 20) this.count('framesOver20ms');
      if (interval > 34) this.count('framesOver34ms');
      if (this.frames.length < MAX_SAMPLES) this.frames.push({ at: now - this.started, interval });
    }
    this.previousFrame = now;
  }

  finish(reason = 'complete') {
    for (const observer of this.observers) this.observe(observer.takeRecords());
    this.recording = false;
    this.disconnect();
    const interval = this.metrics.get('frame.interval');
    return {
      mode: this.mode,
      reason,
      durationMs: performance.now() - this.started,
      fps: interval?.total ? interval.count * 1000 / interval.total : 0,
      context: this.initialContext,
      finalContext: { ...this.context },
      counters: { ...this.counters },
      metrics: Object.fromEntries([...this.metrics].map(([name, samples]) => [name, {
        count: samples.count, total: samples.total, max: samples.max,
        retained: samples.values.length, ...summarizeSamples(samples.values),
      }])),
      frames: this.frames,
      longFrames: this.longFrames,
      slowWork: this.slowWork,
    };
  }

  dispose() {
    this.recording = false;
    this.enabled = false;
    this.disconnect();
    this.setMode('normal');
  }

  private disconnect() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }
}
