export const COLS = '46px minmax(0, 1fr) 84px 66px 30px';
export const SONG_COLS = '74px minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) 110px';
export const ITEM_COLS = '74px minmax(0, 1.6fr) minmax(0, 1fr) 70px 110px';
export const GENDER_LABEL: Record<string, string> = { male: 'Male', female: 'Female', any: 'Any' };
export const TEXTISH_TYPES = new Set(['TXT', 'ALBUM LIST', 'ITEM LIST', 'MUSIC LIST']);
export const playback = { playing: false, fps: 3 };

export type ViewTab = 'preview' | 'meta' | 'bytes';
