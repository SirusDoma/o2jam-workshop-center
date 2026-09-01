import { tempoChanges } from '../../features/note-tool/chart';
import { chartEndPosition } from '../../features/note-tool/document';
import { positionToSeconds } from '../../features/note-tool/playback';
import type { Difficulty, EditorChart } from '../../features/note-tool/types';

export function ChartSummary({ difficulty, chart, baseBpm }: { difficulty: Difficulty; chart: EditorChart; baseBpm: number }) {
  const duration = positionToSeconds(chartEndPosition(chart), baseBpm, tempoChanges(chart), chart.measureFractions);
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);

  return (
    <dl className="nt-summary">
      <div><dt>Difficulty</dt><dd className={`diff-${difficulty.toLowerCase()}`}>{difficulty}</dd></div>
      <div><dt>Notes</dt><dd>{chart.notes.length}</dd></div>
      <div><dt>BPM changes</dt><dd>{chart.bpmChanges.length}</dd></div>
      <div><dt>Fractions</dt><dd>{chart.measureFractions.length}</dd></div>
      <div><dt>Measures</dt><dd>{chart.measureCount}</dd></div>
      <div><dt>Length</dt><dd>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</dd></div>
    </dl>
  );
}
