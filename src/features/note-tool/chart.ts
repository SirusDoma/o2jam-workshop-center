import type { BinarySource } from '../../o2jam/binary.ts';
import { parseOjnChart, type ChartNote, type OjnChart, type OjnDifficulty, type OjnFile } from '../../o2jam/ojn.ts';
import { SAMPLE_LANE_COUNT, type NoteLaneKey } from './settings.ts';
import type { PlaybackEvent, TempoChange } from './playback';
import type { AutoplayChartNote, ChartMetadata, Difficulty, EditorChart, EditorChartNote, EditorDocument } from './types';

const LANE_KEYS: NoteLaneKey[] = ['S', 'D', 'F', 'Space', 'J', 'K', 'L'];

export function toOjnDifficulty(difficulty: Difficulty): OjnDifficulty {
  return difficulty.toLowerCase() as OjnDifficulty;
}

export function metadataFromOjn(file: OjnFile): ChartMetadata {
  const { header } = file;
  return {
    title: header.title || 'Untitled',
    artist: header.artist,
    noteDesigner: header.noteDesigner,
    bpm: header.bpm > 0 ? header.bpm : 120,
    musicId: header.id,
    genre: header.genre,
    ojnVersion: header.encodingVersion,
    revision: header.fileVersion,
    ojmFileName: header.ojm || 'Untitled.ojm',
    ojnFormat: file.encrypted ? 'encrypted-new' : 'normal',
  };
}

export function chartNotes(chart: OjnChart): EditorChartNote[] {
  const result: EditorChartNote[] = [];
  const releases = chart.notes.filter((note) => note.kind === 'release' && note.lane > 0);
  const usedReleases = new Set<number>();

  for (const [index, note] of chart.notes.entries()) {
    if (note.lane <= 0 || note.kind === 'release') {
      continue;
    }

    const key = LANE_KEYS[note.lane - 1];
    if (!key) {
      continue;
    }

    const release = note.kind === 'hold'
      ? releases.find((candidate) => candidate.lane === note.lane && candidate.position > note.position && !usedReleases.has(candidate.offset))
      : undefined;

    const duration = release ? release.position - note.position : undefined;
    if (release) {
      usedReleases.add(release.offset);
    }

    result.push({
      id: `note-${note.offset}-${index}`,
      key,
      absolutePosition: note.position,
      sampleType: note.background ? 'ogg' : 'wav',
      sampleId: note.sampleId,
      volume: note.volume,
      pan: note.pan,
      ...(duration && duration > 0 ? { duration } : {}),
    });
  }

  return result;
}

export function autoplayNotes(chart: OjnChart): AutoplayChartNote[] {
  return chart.notes
    .filter((note) => note.lane === 0 && note.kind !== 'release')
    .map((note, index) => ({
      id: `auto-${note.offset}-${index}`,
      lane: autoplayLane(note, index),
      absolutePosition: note.position,
      sampleType: note.background ? 'ogg' as const : 'wav' as const,
      sampleId: note.sampleId,
      volume: note.volume,
      pan: note.pan,
    }));
}

export function editorChartFromOjn(chart: OjnChart): EditorChart {
  return {
    notes: chartNotes(chart),
    autoplayNotes: autoplayNotes(chart),
    bpmChanges: chart.bpmChanges.map((change, index) => ({
      id: `bpm-${change.offset}-${index}`,
      absolutePosition: change.position,
      bpm: change.bpm,
    })),
    measureFractions: chart.measureFractions.map((change, index) => ({
      id: `fraction-${change.offset}-${index}`,
      measure: Math.max(0, change.measure - 1),
      fraction: change.fraction,
    })),
    measureCount: Math.max(4, chart.measureCount),
  };
}

export function documentFromOjn(source: BinarySource): EditorDocument {
  return {
    EX: editorChartFromOjn(parseOjnChart(source, 'ex')),
    NX: editorChartFromOjn(parseOjnChart(source, 'nx')),
    HX: editorChartFromOjn(parseOjnChart(source, 'hx')),
  };
}

export function emptyEditorChart(): EditorChart {
  return { notes: [], autoplayNotes: [], bpmChanges: [], measureFractions: [], measureCount: 4 };
}

export function emptyEditorDocument(): EditorDocument {
  return { EX: emptyEditorChart(), NX: emptyEditorChart(), HX: emptyEditorChart() };
}

export function resolveChartLevel(manualLevel: number, chart: EditorChart, baseBpm: number): number {
  return manualLevel > 0 ? manualLevel : computeLegacyChartLevel(chart, baseBpm);
}

export function computeLegacyChartLevel(chart: EditorChart, baseBpm: number): number {
  if (chart.notes.length === 0) {
    return 0;
  }

  const lastNotePosition = chart.notes.reduce((last, note) => Math.max(last, note.absolutePosition + (note.duration ?? 0)), 0);
  const measureCount = Math.max(1, Math.ceil(chart.measureCount), Math.floor(lastNotePosition) + 1);
  const sampleCount = Math.min(20, measureCount);
  const lanes = Array.from({ length: measureCount }, () =>
    Array.from({ length: LANE_KEYS.length }, () => new Map<number, 0 | 2 | 3>()));

  for (const note of chart.notes) {
    const lane = LANE_KEYS.indexOf(note.key);
    if (lane < 0) {
      continue;
    }

    const start = legacyPosition(note.absolutePosition);
    lanes[start.measure]?.[lane]?.set(start.tick, note.duration ? 2 : 0);
    if (note.duration) {
      const end = legacyPosition(note.absolutePosition + note.duration);
      lanes[end.measure]?.[lane]?.set(end.tick, 3);
    }
  }

  const tempos = [...chart.bpmChanges].sort((left, right) => left.absolutePosition - right.absolutePosition);
  const initialBpm = Number.isFinite(baseBpm) && baseBpm > 0 ? baseBpm : 120;
  const scores = Array.from({ length: measureCount }, () => 0);

  for (let measure = 0; measure < measureCount; measure += 1) {
    const measureBpm = tempoBefore(tempos, measure + 1, initialBpm);
    const seenTicks = new Set<number>();
    let noteWeight = 0;
    let timingWeight = 0;
    for (let lane = 0; lane < LANE_KEYS.length; lane += 1) {
      for (let tick = 0; tick < 192; tick += 1) {
        const kind = lanes[measure]![lane]!.get(tick);
        if (kind === undefined) {
          continue;
        }

        const weight = kind === 0 ? 1 : 2;
        noteWeight += weight;
        if (!seenTicks.has(tick)) {
          seenTicks.add(tick);
          timingWeight += weight * measureBpm / 150;
        }
      }
    }
    scores[measure] = (scores[measure] ?? 0) + (timingWeight + noteWeight * 0.5) / sampleCount;
  }

  let bpm = initialBpm;
  let tempoIndex = 0;
  let activeLongNotes = 0;
  let previousLanes = Array.from({ length: LANE_KEYS.length }, () => false);

  for (let measure = 0; measure < measureCount; measure += 1) {
    let primaryWeight = 0;
    let chordWeight = 0;
    for (let tick = 0; tick < 192; tick += 1) {
      const position = measure + tick / 192;
      while (tempoIndex < tempos.length && tempos[tempoIndex]!.absolutePosition <= position) {
        bpm = tempos[tempoIndex]!.bpm;
        tempoIndex += 1;
      }

      const cells = lanes[measure]!.map((lane) => lane.get(tick));
      for (const kind of cells) {
        if (kind === 3) {
          activeLongNotes -= 1;
        }
      }

      let hasPrimary = false;
      let hasFirstNote = false;
      let hasChordWeight = false;
      const currentLanes = Array.from({ length: LANE_KEYS.length }, () => false);

      for (let lane = 0; lane < cells.length; lane += 1) {
        const kind = cells[lane];
        if (kind === undefined) {
          continue;
        }

        if (!previousLanes[lane] || activeLongNotes !== 0) {
          primaryWeight += (hasPrimary ? 0.5 : 1) * (activeLongNotes !== 0 ? 2 : 1) * bpm / 150;
          hasPrimary = true;
        } else if (kind !== 0) {
          primaryWeight += (hasPrimary ? 1 : 2) * bpm / 150;
          hasPrimary = true;
        }

        if (hasFirstNote || activeLongNotes !== 0) {
          let weight = hasChordWeight ? 0.5 : 1;
          if (activeLongNotes !== 0) {
            weight *= 2;
          }

          if (kind !== 0 && activeLongNotes !== 0) {
            weight *= 2;
          }

          chordWeight += weight * bpm / 150;
          hasChordWeight = true;
        } else {
          hasFirstNote = true;
        }

        currentLanes[lane] = true;
      }

      if (hasFirstNote) {
        previousLanes = currentLanes;
      }

      for (const kind of cells) {
        if (kind === 2) {
          activeLongNotes += 1;
        }
      }
    }
    scores[measure] = (scores[measure] ?? 0) + (primaryWeight + chordWeight) / sampleCount;
  }

  const score = scores.sort((left, right) => right - left).slice(0, sampleCount).reduce((total, value) => total + value, 0);
  return Math.max(1, Math.ceil((score - 6) / 2.4 - 0.5));
}

export function playbackEvents(chart: EditorChart): PlaybackEvent[] {
  return [
    ...chart.autoplayNotes.map((note) => ({
      id: note.id,
      position: note.absolutePosition,
      sampleId: note.sampleId,
      volume: note.volume,
      pan: note.pan,
    })),
    ...chart.notes.map((note) => ({
      id: note.id,
      position: note.absolutePosition,
      sampleId: note.sampleId,
      volume: note.volume,
      pan: note.pan,
    })),
  ];
}

export function tempoChanges(chart: EditorChart): TempoChange[] {
  return chart.bpmChanges.map((change) => ({ position: change.absolutePosition, bpm: change.bpm }));
}

export function formatOjnVersion(value: number): string {
  return (Number.isFinite(value) ? Math.max(0, value) : 0).toFixed(1);
}

export function parseOjnVersionInput(value: string, fallback: number): number {
  const parsed = value.trim() === '' ? Number.NaN : Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(1)) : fallback;
}

export function emptyMetadata(): ChartMetadata {
  return {
    title: 'Untitled',
    artist: '',
    noteDesigner: '',
    bpm: 120,
    musicId: 0,
    genre: 10,
    ojnVersion: 2.9,
    revision: 0,
    ojmFileName: 'Untitled.ojm',
    ojnFormat: 'normal',
  };
}

function autoplayLane(note: ChartNote, index: number): number {
  const channelLane = note.channel - 8;
  return channelLane >= 1 && channelLane <= SAMPLE_LANE_COUNT ? channelLane : index % SAMPLE_LANE_COUNT + 1;
}

function legacyPosition(value: number): { measure: number; tick: number } {
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
  let measure = Math.floor(normalized);
  let tick = Math.round((normalized - measure) * 192);
  if (tick >= 192) {
    measure += 1;
    tick = 0;
  }

  return { measure, tick };
}

function tempoBefore(changes: EditorChart['bpmChanges'], position: number, baseBpm: number): number {
  let bpm = baseBpm;
  for (const change of changes) {
    if (change.absolutePosition >= position) {
      break;
    }

    bpm = change.bpm;
  }
  return bpm;
}
