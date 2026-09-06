import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DIAGNOSTIC_MODES, diagnosticEnabled, type PlaybackDiagnostics, type DiagnosticCapture, type DiagnosticMode } from '../../features/note-tool/diagnostics';
import type { useChartPlayback } from '../../features/note-tool/useChartPlayback';

type Playback = ReturnType<typeof useChartPlayback>;
const PLAYBACK_TEST: DiagnosticMode[] = ['normal', 'auto-scrollbar', 'full-sample-layout', 'normal', 'idle'];

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('Capture cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
}

function environment() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  const gpu = gl ? {
    vendor: String(gl.getParameter(rendererInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
    renderer: String(gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
  } : null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return {
    gpu,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    screen: { width: screen.width, height: screen.height },
    development: (import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV,
    supportedObservers: typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes,
  };
}

export function PlaybackDiagnosticsPanel({ playback, diagnostic }: { playback: Playback; diagnostic: PlaybackDiagnostics }) {
  const location = useLocation();
  const enabled = location.pathname === '/tools/note-tool'
    && diagnosticEnabled(window.location.search, `${location.pathname}${location.search}`);
  const controls = useRef(playback);
  controls.current = playback;
  const position = useRef(playback.position);
  const run = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const mounted = useRef(false);
  const [status, setStatus] = useState('Ready');
  const [running, setRunning] = useState(false);
  const [captures, setCaptures] = useState<DiagnosticCapture[]>([]);
  const [reportEnvironment, setReportEnvironment] = useState<ReturnType<typeof environment> | null>(null);

  useEffect(() => playback.subscribePosition((next) => { position.current = next; }), [playback.subscribePosition]);
  useEffect(() => {
    mounted.current = true;
    diagnostic.enabled = enabled;
    return () => {
      mounted.current = false;
      if (run.current) controls.current.pause();
      run.current?.abort();
      diagnostic.dispose();
    };
  }, [diagnostic, enabled]);

  useEffect(() => {
    if (enabled) diagnostic.context.playing = playback.playing;
  }, [diagnostic, enabled, playback.playing]);

  if (!enabled) return null;

  const capture = async (modes: DiagnosticMode[]) => {
    if (modes.includes('full-sample-layout') && !document.querySelector('.nt-sample-list')) {
      setStatus('Expand Samples before running the comparison.');
      return;
    }
    const controller = new AbortController();
    run.current = controller;
    const startPosition = position.current;
    setRunning(true);
    setCaptures([]);
    setReportEnvironment(environment());
    if (panel.current) panel.current.open = false;
    let result = 'Complete';
    let idleFrame = 0;
    const visibilityChanged = () => {
      if (document.visibilityState !== 'visible') {
        result = 'Page hidden during capture';
        controller.abort();
        controls.current.pause();
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    try {
      for (const mode of modes) {
        controls.current.pause();
        diagnostic.setMode(mode);
        controls.current.setPosition(startPosition);
        setStatus(`Warming up: ${DIAGNOSTIC_MODES[mode]}`);
        if (mode !== 'idle') await controls.current.play();
        await wait(1500, controller.signal);
        if (mode !== 'idle' && !controls.current.playing) throw new Error('Playback ended before capture. Seek to an earlier section.');
        const roll = document.querySelector<HTMLElement>('.nt-roll-wrap');
        diagnostic.begin({
          startPosition, visibility: document.visibilityState,
          position: position.current, scrollTop: roll?.scrollTop ?? 0,
          documentNodes: document.getElementsByTagName('*').length,
          rollNodes: roll?.getElementsByTagName('*').length ?? 0,
          viewportWidth: roll?.clientWidth ?? 0, viewportHeight: roll?.clientHeight ?? 0,
          renderedSampleRows: document.querySelectorAll('.nt-sample-list [role="option"]').length,
          sampleSlots: Number(document.querySelector('.nt-sample-list [role="option"]')?.getAttribute('aria-setsize') ?? 0),
          panelScrollbarGutter: getComputedStyle(document.querySelector('.nt-chart')!).scrollbarGutter,
          pageFocused: document.hasFocus(),
        });
        if (mode === 'idle') {
          const frame = (now: number) => { diagnostic.frame(now); idleFrame = requestAnimationFrame(frame); };
          idleFrame = requestAnimationFrame(frame);
        }
        setStatus(`Recording 8s: ${DIAGNOSTIC_MODES[mode]}`);
        await wait(8000, controller.signal);
        cancelAnimationFrame(idleFrame);
        idleFrame = 0;
        diagnostic.context.pageFocused = document.hasFocus();
        const complete = controls.current.playing === (mode !== 'idle') && document.visibilityState === 'visible';
        const captured = diagnostic.finish(complete ? 'complete' : 'playback stopped or page hidden');
        if (!captured.metrics['frame.interval']?.count) {
          throw new Error('No playback frames recorded. An app update may have interrupted capture; start a new capture.');
        }
        setCaptures((previous) => [...previous, captured]);
        if (!complete) throw new Error('Capture interrupted. Keep playback running and the tab visible.');
      }
    } catch (error) {
      result = controller.signal.aborted ? result === 'Complete' ? 'Cancelled' : result : error instanceof Error ? error.message : 'Capture failed';
      if (diagnostic.recording) {
        const partial = diagnostic.finish(result);
        setCaptures((previous) => [...previous, partial]);
      }
    } finally {
      cancelAnimationFrame(idleFrame);
      document.removeEventListener('visibilitychange', visibilityChanged);
      if (mounted.current) {
        diagnostic.setMode('normal');
        controls.current.pause();
        controls.current.setPosition(startPosition);
        run.current = null;
        setRunning(false);
        setStatus(result);
        if (panel.current) panel.current.open = true;
      }
    }
  };

  const report = { version: 2, revision: 'stable-sidebar-v1', capturedAt: new Date().toISOString(), environment: reportEnvironment, captures };
  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `note-tool-diagnostic-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const format = (value: number | undefined) => value === undefined ? '—' : value.toFixed(2);
  return (
    <details className="nt-diagnostics" ref={panel} open>
      <summary>Playback diagnostics · {status}</summary>
      <div className="nt-diagnostics-content">
        <p>Test playback compares the same section with the current layout, automatic panel scrollbars, all sample rows, and paused playback. Keep this window visible until it finishes.</p>
        <div className="nt-diagnostics-actions">
          <button type="button" disabled={running} onClick={() => void capture(PLAYBACK_TEST)}>Test playback (48s)</button>
          <button type="button" disabled={running} onClick={() => void capture(['normal'])}>Capture 8s</button>
          <button type="button" disabled={running} onClick={() => void capture(Object.keys(DIAGNOSTIC_MODES) as DiagnosticMode[])}>Compare all ({Math.ceil(Object.keys(DIAGNOSTIC_MODES).length * 9.5)}s)</button>
          <button type="button" disabled={!running} onClick={() => { run.current?.abort(); controls.current.pause(); }}>Cancel capture</button>
          <button type="button" disabled={running || !captures.length} onClick={exportReport}>Export JSON</button>
        </div>
        {captures.length > 0 ? <>
          <table>
            <thead><tr><th>Test</th><th>RAF FPS</th><th>Frame p95</th><th>Callback p95</th><th>Scroll p95</th><th>Scroll event p95</th><th>Cull max</th><th>Scrolls</th><th>Sample rows</th></tr></thead>
            <tbody>{captures.map((item, index) => <tr key={`${index}-${item.mode}`}>
              <th>{DIAGNOSTIC_MODES[item.mode]}</th><td>{item.fps.toFixed(1)}</td>
              <td>{format(item.metrics['frame.interval']?.p95)}</td>
              <td>{format(item.metrics['playback.callback']?.p95)}</td>
              <td>{format(item.metrics['roll.scroll']?.p95)}</td>
              <td>{format(item.metrics['roll.scrollEvent']?.p95)}</td>
              <td>{format(item.metrics['roll.cull']?.max)}</td>
              <td>{item.counters.scrollWrites ?? 0}</td>
              <td>{item.context.renderedSampleRows}</td>
            </tr>)}</tbody>
          </table>
          <details><summary>Report data</summary><pre aria-label="Playback diagnostic report">{JSON.stringify(report, null, 2)}</pre></details>
        </> : null}
      </div>
    </details>
  );
}
