
import { asBytes } from './binary';
import type { BinarySource } from './binary';
import { decodeText, detectEncoding, DEFAULT_ENCODING } from './text';
import type { O2Encoding } from './text';

export const ALBUM_ENTRY_SIZE = 160;
export const ALBUM_SONG_SLOTS = 10;
const NAME_OFFSET = 8;
const NAME_SIZE = 64;

export interface AlbumSongRef {
  musicId: number;
  difficulty: number;
}

export interface AlbumEntry {
  index: number;
  offset: number;
  serverId: number;
  albumId: number;
  name: string;
  price: number;
  level: number;
  ranked: number;
  songs: AlbumSongRef[];
}

export interface AlbumListResult {
  albumCount: number;
  albums: AlbumEntry[];
}

export function isAlbumListData(source: BinarySource): boolean {
  const bytes = asBytes(source);
  if (bytes.byteLength < 4 + ALBUM_ENTRY_SIZE) {
    return false;
  }

  if ((bytes.byteLength - 4) % ALBUM_ENTRY_SIZE !== 0) {
    return false;
  }

  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0, true);
  const capacity = (bytes.byteLength - 4) / ALBUM_ENTRY_SIZE;
  return count > 0 && count <= capacity;
}

export function detectAlbumListEncoding(source: BinarySource): O2Encoding | null {
  const bytes = asBytes(source);
  if (!isAlbumListData(bytes)) {
    return null;
  }

  const capacity = Math.floor((bytes.byteLength - 4) / ALBUM_ENTRY_SIZE);
  const samples: Uint8Array[] = [];
  for (let i = 0; i < capacity; i++) {
    const at = 4 + i * ALBUM_ENTRY_SIZE + NAME_OFFSET;
    samples.push(bytes.subarray(at, at + NAME_SIZE));
  }
  return detectEncoding(samples);
}

export function parseAlbumList(
  source: BinarySource,
  encoding: O2Encoding = DEFAULT_ENCODING,
): AlbumListResult {
  const bytes = asBytes(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declared = bytes.byteLength >= 4 ? view.getInt32(0, true) : 0;
  const count = Math.max(0, Math.floor((bytes.byteLength - 4) / ALBUM_ENTRY_SIZE));

  const albums: AlbumEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 4 + i * ALBUM_ENTRY_SIZE;
    const songs: AlbumSongRef[] = [];
    for (let j = 0; j < ALBUM_SONG_SLOTS; j++) {
      const slot = at + 80 + j * 8;
      const musicId = view.getInt32(slot, true);
      if (musicId === 0) {
        continue;
      }

      songs.push({ musicId, difficulty: view.getInt32(slot + 4, true) });
    }
    albums.push({
      index: i,
      offset: at,
      serverId: view.getInt32(at, true),
      albumId: view.getInt32(at + 4, true),
      name: decodeText(bytes.subarray(at + NAME_OFFSET, at + NAME_OFFSET + NAME_SIZE), encoding),
      price: view.getInt16(at + 72, true),
      level: view.getUint8(at + 74),
      ranked: view.getUint8(at + 75),
      songs,
    });
  }

  return { albumCount: declared, albums };
}
