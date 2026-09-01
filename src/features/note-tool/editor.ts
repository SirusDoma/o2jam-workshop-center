export type EditableLane = 'S' | 'D' | 'F' | 'Space' | 'J' | 'K' | 'L';

export type EditableNote = {
  id: string;
  key: EditableLane;
  absolutePosition: number;
  sampleType: 'wav' | 'ogg';
  sampleId: number;
  volume: number;
  pan: number;
  duration?: number;
};

export type PendingLongNote = Pick<EditableNote, 'key' | 'absolutePosition'>;

const EPSILON = 0.000001;

export function volumeLevelToPercent(level: number): number {
  return Math.max(1, Math.min(16, Number.isFinite(level) ? Math.round(level) : 16)) / 16 * 100;
}

export function volumePercentToLevel(volume: number): number {
  return Math.max(1, Math.min(16, Number.isFinite(volume) ? Math.round(volume / 100 * 16) : 16));
}

export function placeTapNote(notes: readonly EditableNote[], note: EditableNote): EditableNote[] {
  const { duration: _duration, ...tap } = note;
  return [
    ...notes.filter((existing) => !occupiesPosition(existing, note.key, note.absolutePosition, EPSILON)),
    tap,
  ];
}

export function placeLongNote(
  notes: readonly EditableNote[],
  note: EditableNote,
  endPosition: number,
): EditableNote[] {
  const duration = endPosition - note.absolutePosition;
  if (duration <= EPSILON) {
    return [...notes];
  }

  const placed = { ...note, duration };
  return [
    ...notes.filter((existing) => !occupiesPosition(existing, note.key, note.absolutePosition, EPSILON)),
    placed,
  ];
}

export function editLongNote(
  notes: readonly EditableNote[],
  pending: PendingLongNote | null,
  note: EditableNote,
): { notes: EditableNote[]; pending: PendingLongNote | null } {
  if (!pending || pending.key !== note.key) {
    return {
      notes: [...notes],
      pending: { key: note.key, absolutePosition: note.absolutePosition },
    };
  }

  const start = Math.min(pending.absolutePosition, note.absolutePosition);
  const duration = Math.abs(note.absolutePosition - pending.absolutePosition);
  if (duration <= EPSILON) {
    return { notes: [...notes], pending };
  }

  const placed = { ...note, absolutePosition: start, duration };
  return {
    notes: [
      ...notes.filter((existing) => !occupiesPosition(existing, note.key, start, EPSILON)),
      placed,
    ],
    pending: null,
  };
}

export function findNote(
  notes: readonly EditableNote[],
  key: EditableLane,
  position: number,
  tolerance: number,
): EditableNote | undefined {
  return [...notes].reverse().find((note) => occupiesPosition(note, key, position, tolerance));
}

export function eraseNote(
  notes: readonly EditableNote[],
  key: EditableLane,
  position: number,
  tolerance: number,
): EditableNote[] {
  const target = findNote(notes, key, position, tolerance);
  return target ? notes.filter((note) => note.id !== target.id) : [...notes];
}

function occupiesPosition(note: EditableNote, key: EditableLane, position: number, tolerance: number): boolean {
  if (note.key !== key) {
    return false;
  }

  const end = note.absolutePosition + (note.duration ?? 0);
  return position >= note.absolutePosition - tolerance && position <= end + tolerance;
}
