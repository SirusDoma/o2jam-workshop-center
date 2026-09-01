export const NOTE_LANE_KEYS = ['S', 'D', 'F', 'Space', 'J', 'K', 'L'] as const;
export const NOTE_LANE_KEYS_3 = ['S', 'F', 'Space'] as const;
export const SAMPLE_LANE_KEYS = [
  'sample-1',
  'sample-2',
  'sample-3',
  'sample-4',
  'sample-5',
  'sample-6',
  'sample-7',
  'sample-8',
  'sample-9',
  'sample-10',
  'sample-11',
  'sample-12',
  'sample-13',
  'sample-14',
  'sample-15',
  'sample-16',
  'sample-17',
  'sample-18',
  'sample-19',
  'sample-20',
  'sample-21',
  'sample-22',
  'sample-23',
  'sample-24',
  'sample-25',
  'sample-26',
  'sample-27',
  'sample-28',
  'sample-29',
  'sample-30',
] as const;
export const SAMPLE_LANE_COUNT = SAMPLE_LANE_KEYS.length;
export const NOTE_AREA_LANE_KEYS = [
  'measure',
  'fraction',
  'bpm',
  ...NOTE_LANE_KEYS,
  ...SAMPLE_LANE_KEYS,
] as const;
export const NOTE_AREA_LANE_GROUPS = [
  {
    label: 'Timing',
    lanes: [
      { key: 'measure', label: '#' },
      { key: 'fraction', label: 'Measure' },
      { key: 'bpm', label: 'BPM' },
    ],
  },
  {
    label: 'Main',
    lanes: NOTE_LANE_KEYS.map((key) => ({ key, label: key })),
  },
  {
    label: 'Background',
    lanes: SAMPLE_LANE_KEYS.map((key, index) => ({ key, label: `Sample ${index + 1}` })),
  },
] as const;
export const MAX_LANE_WIDTH = 1000;
export const DEFAULT_NOTE_HEIGHT = 16;
export const MAX_NOTE_HEIGHT = 64;
export const PLAYHEAD_GRIDS = [3, 4, 6, 8, 12, 16, 24, 32, 64, 192] as const;
export const GRID_DIVISIONS = PLAYHEAD_GRIDS.map((division) => `1/${division}`);
export const DEFAULT_PLAYHEAD_GRID = 4;
export const DEFAULT_PLAYHEAD_POSITION = 2 / DEFAULT_PLAYHEAD_GRID;
export const DEFAULT_PLAYHEAD_THICKNESS = 1;
export const DEFAULT_PLAYHEAD_COLOR = '#ff6a2c';
export const MAX_PLAYHEAD_THICKNESS = 12;
export const NOTE_TOOL_SETTINGS_KEY = 'o2wc.note-tool.settings.v1';

export type NoteLaneKey = (typeof NOTE_LANE_KEYS)[number];
export type SampleLaneKey = (typeof SAMPLE_LANE_KEYS)[number];
export type NoteAreaLaneKey = (typeof NOTE_AREA_LANE_KEYS)[number];
export type NoteSampleType = 'wav' | 'ogg';
export type LongNoteStyle = 'solid' | 'rail' | 'outline';

export type NoteLaneSettings = {
  width: number;
  background: string | null;
  highlight: string;
  noteColor: string;
  borderColor: string;
};

export type NoteToolSettings = {
  version: 1;
  uniformAutoplayStyle: boolean;
  lanes: Record<NoteAreaLaneKey, NoteLaneSettings>;
  noteBorderWidth: number;
  noteHeight: number;
  playheadGrid: number;
  playheadPosition: number;
  playheadThickness: number;
  playheadColor: string;
  longNoteStyle: LongNoteStyle;
  noteTemplate: string;
};

const SILVER_LANE = {
  width: 76,
  background: null,
  highlight: '#8d95a3',
  noteColor: '#8d95a3',
  borderColor: '#c2c8d0',
} satisfies NoteLaneSettings;

const BLUE_LANE = {
  width: 70,
  background: null,
  highlight: '#5b96f5',
  noteColor: '#5b96f5',
  borderColor: '#89b4f9',
} satisfies NoteLaneSettings;

const ORANGE_LANE = {
  width: 82,
  background: null,
  highlight: '#ff6a2c',
  noteColor: '#ff6a2c',
  borderColor: '#ff9a70',
} satisfies NoteLaneSettings;

export const DEFAULT_NOTE_TOOL_SETTINGS: NoteToolSettings = {
  version: 1,
  uniformAutoplayStyle: true,
  lanes: createDefaultLanes(),
  noteBorderWidth: 1.5,
  noteHeight: DEFAULT_NOTE_HEIGHT,
  playheadGrid: DEFAULT_PLAYHEAD_GRID,
  playheadPosition: DEFAULT_PLAYHEAD_POSITION,
  playheadThickness: DEFAULT_PLAYHEAD_THICKNESS,
  playheadColor: DEFAULT_PLAYHEAD_COLOR,
  longNoteStyle: 'solid',
  noteTemplate: '{prefix}{id}',
};

export function createDefaultNoteToolSettings(): NoteToolSettings {
  return {
    ...DEFAULT_NOTE_TOOL_SETTINGS,
    lanes: Object.fromEntries(
      NOTE_AREA_LANE_KEYS.map((lane) => [lane, { ...DEFAULT_NOTE_TOOL_SETTINGS.lanes[lane] }]),
    ) as Record<NoteAreaLaneKey, NoteLaneSettings>,
  };
}
export function updateNoteLaneSettings(settings: NoteToolSettings, lane: NoteAreaLaneKey, patch: Partial<NoteLaneSettings>): NoteToolSettings {
  const keys = settings.uniformAutoplayStyle && SAMPLE_LANE_KEYS.includes(lane as SampleLaneKey) ? SAMPLE_LANE_KEYS : [lane];
  const lanes = { ...settings.lanes };
  for (const key of keys) lanes[key] = { ...lanes[key], ...patch };
  return { ...settings, lanes };
}

export function clampLaneWidth(width: number): number {
  return Math.max(0, Math.min(MAX_LANE_WIDTH, width));
}

export function clampNoteHeight(height: number): number {
  return Math.max(1, Math.min(MAX_NOTE_HEIGHT, height));
}

export function snapPlayheadPosition(position: number, grid: number): number {
  if (!Number.isFinite(position)) {
    return DEFAULT_PLAYHEAD_POSITION;
  }

  const denominator = normalizePlayheadGrid(grid);
  return Math.max(1, Math.min(denominator, Math.round(position * denominator))) / denominator;
}

export function playheadPositionStep(position: number, grid: number): number {
  const denominator = normalizePlayheadGrid(grid);
  return Math.round(snapPlayheadPosition(position, denominator) * denominator);
}

export function gridCellBottomRatio(step: number, grid: number): number {
  const denominator = normalizePlayheadGrid(grid);
  return (Math.max(1, Math.min(denominator, Math.round(step))) - 1) / denominator;
}

export function playheadTopRatio(position: number, grid = DEFAULT_PLAYHEAD_GRID): number {
  return 1 - gridCellBottomRatio(playheadPositionStep(position, grid), grid);
}

export function normalizePlayheadGrid(grid: number): number {
  return PLAYHEAD_GRIDS.includes(grid as (typeof PLAYHEAD_GRIDS)[number]) ? grid : DEFAULT_PLAYHEAD_GRID;
}

export function effectivePlayheadGrid(grid: string, subGrid: string): number {
  return normalizePlayheadGrid(Number((subGrid === 'none' ? grid : subGrid).split('/')[1]));
}

export function playheadPositionFromChartPosition(position: number, grid: number): number {
  if (!Number.isFinite(position)) {
    return DEFAULT_PLAYHEAD_POSITION;
  }

  const denominator = normalizePlayheadGrid(grid);
  const fraction = ((position % 1) + 1) % 1;
  return Math.max(1, Math.min(denominator, Math.round(fraction * denominator) + 1)) / denominator;
}

export function clampPlayheadThickness(thickness: number): number {
  return Number.isFinite(thickness) ? Math.max(1, Math.min(MAX_PLAYHEAD_THICKNESS, thickness)) : DEFAULT_PLAYHEAD_THICKNESS;
}

export function effectiveNoteLaneWidth(keyMode: 3 | 7, lane: NoteLaneKey, width: number): number {
  return keyMode === 3 && !NOTE_LANE_KEYS_3.includes(lane as (typeof NOTE_LANE_KEYS_3)[number]) ? 0 : width;
}

export function parseNoteToolSettings(value: unknown): NoteToolSettings | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.lanes)) {
    return null;
  }

  const sourceLanes = value.lanes;
  const lanes = {} as Record<NoteAreaLaneKey, NoteLaneSettings>;

  for (const lane of NOTE_AREA_LANE_KEYS) {
    const candidate = sourceLanes[lane];

    if (!isLaneSettings(candidate)) {
      return null;
    }

    lanes[lane] = {
      ...candidate,
      width: clampLaneWidth(candidate.width),
    };
  }

  const { noteHeight, playheadPosition, playheadThickness, playheadColor, playheadGrid, uniformAutoplayStyle } = value;
  if (
    typeof uniformAutoplayStyle !== 'boolean'
    || !isFiniteNumber(value.noteBorderWidth)
    || value.noteBorderWidth < 0
    || value.noteBorderWidth > 12
    || !isFiniteNumber(noteHeight)
    || !isFiniteNumber(playheadPosition)
    || !isFiniteNumber(playheadThickness)
    || !isFiniteNumber(playheadGrid)
    || normalizePlayheadGrid(playheadGrid) !== playheadGrid
    || !isHexColor(playheadColor)
    || !isLongNoteStyle(value.longNoteStyle)
    || typeof value.noteTemplate !== 'string'
    || value.noteTemplate.length > 80
  ) {
    return null;
  }

  const settings: NoteToolSettings = {
    version: 1,
    uniformAutoplayStyle,
    lanes,
    noteBorderWidth: value.noteBorderWidth,
    noteHeight: clampNoteHeight(noteHeight),
    playheadGrid,
    playheadPosition: snapPlayheadPosition(playheadPosition, playheadGrid),
    playheadThickness: clampPlayheadThickness(playheadThickness),
    playheadColor,
    longNoteStyle: value.longNoteStyle,
    noteTemplate: value.noteTemplate,
  };
  return uniformAutoplayStyle ? updateNoteLaneSettings(settings, 'sample-1', lanes['sample-1']) : settings;
}

export function formatNoteLabel(
  template: string,
  note: { lane: string; sampleId: number; sampleType: NoteSampleType },
): string {
  const values = {
    prefix: note.sampleType === 'wav' ? 'W' : 'M',
    id: String(note.sampleId),
    type: note.sampleType.toUpperCase(),
    lane: note.lane,
  };

  return template.replace(/\{(prefix|id|type|lane)(?::([^}]+))?\}/g, (token, name: keyof typeof values, format: string | undefined) => {
    const modifiers = format?.split(':') ?? [];
    let value = values[name];

    if (name === 'id') {
      const width = modifiers.find((modifier) => /^\d+$/.test(modifier));
      value = value.padStart(width === undefined ? 4 : Math.min(32, Number(width)), '0');
    }

    if (modifiers.includes('upper')) {
      return value.toUpperCase();
    }
    if (modifiers.includes('lower')) {
      return value.toLowerCase();
    }
    if (modifiers.some((modifier) => modifier !== 'upper' && modifier !== 'lower' && !/^\d+$/.test(modifier))) {
      return token;
    }

    return value;
  });
}

function isLaneSettings(value: unknown): value is NoteLaneSettings {
  return isRecord(value)
    && isFiniteNumber(value.width)
    && value.width >= 0
    && (value.background === null || isHexColor(value.background))
    && isHexColor(value.highlight)
    && isHexColor(value.noteColor)
    && isHexColor(value.borderColor);
}

function isLongNoteStyle(value: unknown): value is LongNoteStyle {
  return value === 'solid' || value === 'rail' || value === 'outline';
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDefaultLanes(): Record<NoteAreaLaneKey, NoteLaneSettings> {
  const lanes = {
    measure: { ...SILVER_LANE, width: 52, highlight: '#7a4fd4', noteColor: '#7a4fd4', borderColor: '#a98bf5' },
    fraction: { ...SILVER_LANE, width: 58, highlight: '#8f7bd8', noteColor: '#8f7bd8', borderColor: '#b9a9ed' },
    bpm: { ...SILVER_LANE, width: 58, highlight: '#35aab8', noteColor: '#35aab8', borderColor: '#75c9d3' },
    S: { ...SILVER_LANE },
    D: { ...BLUE_LANE },
    F: { ...SILVER_LANE },
    Space: { ...ORANGE_LANE },
    J: { ...SILVER_LANE },
    K: { ...BLUE_LANE },
    L: { ...SILVER_LANE },
  } as Record<NoteAreaLaneKey, NoteLaneSettings>;

  for (const lane of SAMPLE_LANE_KEYS) {
    lanes[lane] = {
      ...SILVER_LANE,
      width: 64,
      highlight: '#43a86b',
      noteColor: '#43a86b',
      borderColor: '#7ac997',
    };
  }

  return lanes;
}
