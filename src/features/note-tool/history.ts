import { noteToolStatesEqual } from './model.ts';
import type { Difficulty, EditorChart, EditorDocument } from './types';

const HISTORY_LIMIT = 100;

type ChartHistory = { past: EditorChart[]; future: EditorChart[] };

export type EditorHistory = {
  document: EditorDocument;
  charts: Record<Difficulty, ChartHistory>;
};

type HistoryAction =
  | { type: 'reset'; document: EditorDocument }
  | { type: 'edit'; difficulty: Difficulty; chart: EditorChart }
  | { type: 'undo' | 'redo'; difficulty: Difficulty };

export function createEditorHistory(document: EditorDocument): EditorHistory {
  return {
    document,
    charts: {
      EX: { past: [], future: [] },
      NX: { past: [], future: [] },
      HX: { past: [], future: [] },
    },
  };
}

export function editorHistoryReducer(state: EditorHistory, action: HistoryAction): EditorHistory {
  if (action.type === 'reset') {
    return createEditorHistory(action.document);
  }

  const { difficulty } = action;
  const current = state.document[difficulty];
  const { past, future } = state.charts[difficulty];
  let chart: EditorChart;
  let history: ChartHistory;
  if (action.type === 'edit') {
    if (noteToolStatesEqual(current, action.chart)) {
      return state;
    }

    chart = action.chart;
    history = { past: [...past, current].slice(-HISTORY_LIMIT), future: [] };
  } else {
    const previous = (action.type === 'undo' ? past : future).at(-1);
    if (!previous) {
      return state;
    }

    chart = previous;
    history = action.type === 'undo'
      ? { past: past.slice(0, -1), future: [...future, current] }
      : { past: [...past, current], future: future.slice(0, -1) };
  }

  return {
    document: { ...state.document, [difficulty]: chart },
    charts: { ...state.charts, [difficulty]: history },
  };
}
