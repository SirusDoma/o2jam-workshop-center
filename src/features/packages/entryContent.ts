import {
  OJN_HEADER_SIZE,
  decodeText,
  detectAlbumListEncoding,
  detectEncoding,
  detectItemDataEncoding,
  detectItemDataVersion,
  detectMusicListVersion,
  detectOjnHeaderEncoding,
  isAlbumListData,
  isSpriteData,
  parseAlbumList,
  parseItemData,
  parseMusicList,
  parseOjnHeader,
  parseSprite,
  sniffImageMime,
  type AlbumListResult,
  type ItemDataResult,
  type MusicListVersionId,
  type O2Encoding,
  type OjnHeader,
  type Sprite,
} from '../../o2jam';
import { isSprite } from './packageUtils';

export type EntryContent =
  | { kind: 'sprite'; sprite: Sprite }
  | { kind: 'image'; mime: string }
  | { kind: 'album'; album: AlbumListResult }
  | { kind: 'musicList'; versionId: MusicListVersionId; songs: OjnHeader[] }
  | { kind: 'itemData'; itemData: ItemDataResult }
  | { kind: 'bounds' }
  | { kind: 'text'; value: string; encoding: O2Encoding }
  | { kind: 'bytes' };

export function classifyEntryContent(
  data: Uint8Array,
  name: string,
  ext: string,
  encoding: O2Encoding,
  auto: boolean,
  textEncoding: O2Encoding | null
): EntryContent {
  if (isSprite(ext) && isSpriteData(data, name)) {
    try {
      return { kind: 'sprite', sprite: parseSprite(data, name) };
    } catch {
    }
  }

  const mime = sniffImageMime(data);
  if (mime) return { kind: 'image', mime };

  if (isAlbumListData(data)) {
    const albumEncoding = auto ? detectAlbumListEncoding(data) ?? encoding : encoding;
    return { kind: 'album', album: parseAlbumList(data, albumEncoding) };
  }

  if (ext !== 'bnd' && data.length >= 4 + OJN_HEADER_SIZE && decodeText(data.subarray(8, 12), 'ascii').startsWith('ojn')) {
    try {
      const best = detectMusicListVersion(data, name);
      if (best) {
        const musicList = parseMusicList(data, best, encoding);
        const songs: OjnHeader[] = [];
        for (const chart of musicList.charts) {
          const block = data.slice(chart.offset, chart.offset + OJN_HEADER_SIZE);
          const headerEncoding = auto ? detectOjnHeaderEncoding(block) ?? encoding : encoding;
          try {
            songs.push(parseOjnHeader(block, headerEncoding));
          } catch {
          }
        }
        if (songs.length) return { kind: 'musicList', versionId: musicList.versionId, songs };
      }
    } catch {
    }
  }

  if (ext !== 'bnd' && /^itemdata/i.test(name) && ext === 'dat') {
    try {
      const best = detectItemDataVersion(data);
      if (best) {
        const itemEncoding = auto ? detectItemDataEncoding(data, best) ?? encoding : encoding;
        const itemData = parseItemData(data, best, itemEncoding);
        if (itemData.items.length) return { kind: 'itemData', itemData };
      }
    } catch {
    }
  }

  if (ext === 'bnd') return { kind: 'bounds' };
  if (data.length <= 2_000_000 && data.indexOf(0) === -1) {
    const resolvedEncoding = textEncoding ?? (auto ? detectEncoding([data]) ?? encoding : encoding);
    const value = decodeText(data, resolvedEncoding);
    if (value.replace(/[^\x09\x0a\x0d\x20-￿]/g, '').length / Math.max(1, value.length) > 0.92) {
      return { kind: 'text', value, encoding: resolvedEncoding };
    }
  }

  return { kind: 'bytes' };
}
