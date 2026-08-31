import type { ListValue, O2Encoding } from '../../o2jam';

export interface EditChart {
  key: number;
  block: Uint8Array;
  source: string;
  encrypted: boolean;
  detected?: O2Encoding;
  override?: O2Encoding;
}

export type SectionRows = Record<string, Record<string, ListValue>[]>;
export type SortKey = 'id' | 'title' | 'artist' | 'designer' | 'bpm' | 'level' | 'time';
