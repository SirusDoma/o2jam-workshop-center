import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlaybackDiagnostics, diagnosticEnabled, summarizeSamples } from './diagnostics.ts';

test('diagnostic switch accepts both standard and hash-router queries', () => {
  assert.equal(diagnosticEnabled('?diagnostic=true', '#/tools/note-tool'), true);
  assert.equal(diagnosticEnabled('', '#/tools/note-tool?diagnostic=true'), true);
  assert.equal(diagnosticEnabled('?diagnostic=false', '#/tools/note-tool'), false);
  assert.equal(diagnosticEnabled('', '#/tools/note-tool'), false);
  assert.equal(diagnosticEnabled('?diagnostic=1', ''), false);
});

test('disabled diagnostics collect nothing and cannot activate isolation modes', () => {
  const diagnostic = new PlaybackDiagnostics();
  diagnostic.setMode('no-audio');
  diagnostic.begin();
  diagnostic.record('work', 99);
  diagnostic.frame(100);
  diagnostic.frame(200);
  const capture = diagnostic.finish();
  assert.equal(capture.mode, 'normal');
  assert.equal(capture.fps, 0);
  assert.deepEqual(capture.metrics, {});
});

test('capture uses frame intervals and preserves an isolated snapshot', () => {
  const diagnostic = new PlaybackDiagnostics();
  diagnostic.enabled = true;
  diagnostic.context.events = 200;
  diagnostic.begin();
  diagnostic.frame(100);
  diagnostic.frame(116);
  diagnostic.frame(150);
  diagnostic.record('work', 2);
  diagnostic.record('work', 7);
  diagnostic.count('audioLate');
  const capture = diagnostic.finish();
  assert.equal(capture.fps, 40);
  assert.equal(capture.metrics['frame.interval']?.count, 2);
  assert.equal(capture.metrics.work?.p95, 7);
  assert.equal(capture.counters.framesOver20ms, 1);
  diagnostic.context.events = 400;
  diagnostic.begin();
  diagnostic.record('work', 100);
  diagnostic.finish();
  assert.equal(capture.context.events, 200);
  assert.equal(capture.metrics.work?.total, 9);
  assert.equal(capture.frames.length, 2);
});

test('retention stays bounded while counts and totals remain accurate', () => {
  const diagnostic = new PlaybackDiagnostics();
  diagnostic.enabled = true;
  diagnostic.begin();
  for (let index = 1; index <= 10_000; index++) diagnostic.frame(index * 10);
  const capture = diagnostic.finish();
  assert.equal(capture.fps, 100);
  assert.equal(capture.frames.length, 4096);
  assert.equal(capture.metrics['frame.interval']?.retained, 4096);
  assert.equal(capture.metrics['frame.interval']?.count, 9999);
  assert.deepEqual(summarizeSamples([]), { p50: 0, p95: 0, p99: 0 });
});

test('long-frame attribution excludes earlier work and drains pending observer entries', () => {
  const original = globalThis.PerformanceObserver;
  const observers: MockObserver[] = [];
  class MockObserver {
    static supportedEntryTypes = ['long-animation-frame'];
    pending: unknown[] = [];
    disconnected = false;
    constructor() { observers.push(this); }
    observe() {}
    takeRecords() { return this.pending.splice(0); }
    disconnect() { this.disconnected = true; }
  }
  Object.defineProperty(globalThis, 'PerformanceObserver', { configurable: true, value: MockObserver });
  try {
    const diagnostic = new PlaybackDiagnostics();
    diagnostic.enabled = true;
    diagnostic.begin();
    const startTime = performance.now();
    observers[0]!.pending.push(
      { entryType: 'longtask', startTime: 0, duration: 1000 },
      {
        entryType: 'long-animation-frame', startTime, duration: 80, blockingDuration: 30,
        renderStart: startTime + 20, styleAndLayoutStart: startTime + 30,
        scripts: [{ sourceURL: '/playback.js?cache=123', sourceFunctionName: 'update', sourceCharPosition: 42, duration: 20, forcedStyleAndLayoutDuration: 12 }],
      },
    );
    const captured = diagnostic.finish();
    assert.equal(captured.metrics.longtask, undefined);
    assert.equal(captured.metrics['long-animation-frame']?.count, 1);
    assert.equal(captured.longFrames[0]?.renderDuration, 60);
    assert.equal(captured.longFrames[0]?.scripts[0]?.forcedStyleLayout, 12);
    assert.equal(captured.longFrames[0]?.scripts[0]?.source, '/playback.js');
    assert.equal(observers[0]?.disconnected, true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'PerformanceObserver', { configurable: true, value: original });
    else Reflect.deleteProperty(globalThis, 'PerformanceObserver');
  }
});
