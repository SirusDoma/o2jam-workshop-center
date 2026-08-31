import { ITEM_PARTS, type ItemDataVersion, type ItemGender, type SpriteGender, type SpriteInstrument, type SpriteRegion } from '../../o2jam';

export const INSTRUMENTS: { id: SpriteInstrument; label: string }[] = [
  { id: 'none', label: 'Default' },
  { id: 'bass', label: 'Bass' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'drum', label: 'Drum' },
];
export const REGION_ORDER: SpriteRegion[] = ['back', 'body', 'leftArm', 'rightArm'];

export function baseBodyIds(gender: SpriteGender): number[] {
  return [30, 31, 32, 33, 34, gender === 'female' ? 36 : 35];
}

export const COLS = '46px minmax(0, 1fr) 140px 76px 30px';
export const playback = { playing: true, fps: 12 };

const labelOf = (list: readonly { id: number; label: string }[], id: number) => list.find((entry) => entry.id === id)?.label ?? `Unknown (${id})`;

export const GENDER_CODE: Record<ItemGender, number> = { female: 0, male: 1, any: 2 };

export const partForType = (version: ItemDataVersion, t: number): number => {
  if (t >= 15 && t <= 18) return 0;
  if (t <= 4) return 255;
  const label = labelOf(version.itemTypes, t);
  return ITEM_PARTS.find((p) => p.label === label)?.id ?? 255;
};
