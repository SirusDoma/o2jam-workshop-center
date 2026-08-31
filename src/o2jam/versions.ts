
import { FormatError } from './binary';
import type { MusicListVersionId } from './ojnlist';
import type { ItemDataVersionId } from './itemdata';

export type ClientVersionId = '3.10' | '3.82' | '2.33' | '6.65' | '5.89' | '8.02';

export interface ClientVersion {
  id: ClientVersionId;
  label: string;
  clientVersion: string;
  distribution: string;
  musicListId: MusicListVersionId;
  musicListFilename: string;
  itemDataId: ItemDataVersionId;
}

export const CLIENT_VERSIONS: readonly ClientVersion[] = [
  {
    id: '3.10',
    label: 'O2Jam Original',
    clientVersion: '3.10',
    distribution: 'e-Games / mgame',
    musicListId: '3.10',
    musicListFilename: 'OJNList.dat',
    itemDataId: '3.10',
  },
  {
    id: '3.82',
    label: 'O2Jam NX',
    clientVersion: '3.82',
    distribution: 'e-Games / mgame',
    musicListId: '3.82',
    musicListFilename: 'OJNList.dat',
    itemDataId: '3.82',
  },
  {
    id: '2.33',
    label: 'O2Jam X2',
    clientVersion: '2.33',
    distribution: 'NOWCOM',
    musicListId: '2.33',
    musicListFilename: 'Image/X2OJNList.dat',
    itemDataId: '2.33',
  },
  {
    id: '5.89',
    label: 'O2JamO2',
    clientVersion: '5.89',
    distribution: 'NOWCOM',
    musicListId: '5.89',
    musicListFilename: 'OJNList.dat',
    itemDataId: '5.89',
  },
  {
    id: '6.65',
    label: 'O2JamO2',
    clientVersion: '6.65',
    distribution: 'NOWCOM',
    musicListId: '6.65',
    musicListFilename: 'OJNList.dat',
    itemDataId: '6.65',
  },
  {
    id: '8.02',
    label: 'O2Jam Classic',
    clientVersion: '8.02',
    distribution: 'NOWCOM',
    musicListId: '8.02',
    musicListFilename: 'OJNList.dat',
    itemDataId: '8.02',
  },
];

export function clientVersion(id: ClientVersionId): ClientVersion {
  const found = CLIENT_VERSIONS.find((v) => v.id === id);
  if (!found) {
    throw new FormatError(`unknown client version "${id}"`);
  }

  return found;
}
