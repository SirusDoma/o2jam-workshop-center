import type { OjnFile } from '../../o2jam';
import type { NoteLaneKey } from './settings';
import type { OjnFormat } from './model';

export type Difficulty = 'EX' | 'NX' | 'HX';
export type EditTool = 'select' | 'note' | 'erase';
export type KeyMode = 3 | 7;
export type ChartTab = 'metadata' | 'format';

export type ChartMetadata = {
  title: string;
  artist: string;
  noteDesigner: string;
  bpm: number;
  musicId: number;
  genre: number;
  ojnVersion: number;
  revision: number;
  ojmFileName: string;
  ojnFormat: OjnFormat;
};

export type EditorChartNote = {
  id: string;
  key: NoteLaneKey;
  absolutePosition: number;
  sampleType: 'wav' | 'ogg';
  sampleId: number;
  volume: number;
  pan: number;
  duration?: number;
};

export type AutoplayChartNote = {
  id: string;
  lane: number;
  absolutePosition: number;
  sampleType: 'wav' | 'ogg';
  sampleId: number;
  volume: number;
  pan: number;
};

export type EditorBpmChange = {
  id: string;
  absolutePosition: number;
  bpm: number;
};

export type EditorMeasureFraction = {
  id: string;
  measure: number;
  fraction: number;
};

export type EditorChart = {
  notes: EditorChartNote[];
  autoplayNotes: AutoplayChartNote[];
  bpmChanges: EditorBpmChange[];
  measureFractions: EditorMeasureFraction[];
  measureCount: number;
};

export type EditorDocument = Record<Difficulty, EditorChart>;

export type InspectorEvent =
  | { kind: 'note'; id: string }
  | { kind: 'autoplay'; id: string }
  | { kind: 'bpm'; id: string }
  | { kind: 'fraction'; id: string };

export type PreviewImage = {
  label: 'Cover Image' | 'Thumbnail Image';
  name: string;
  mime: string;
  bytes: Uint8Array;
  url: string;
};

export type LoadedChart = {
  name: string;
  file: OjnFile;
};
