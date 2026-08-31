
import { ByteReader, ByteWriter, FormatError, asBytes } from './binary';
import type { BinarySource, LabelledId } from './binary';
import { DEFAULT_ENCODING, encodeText } from './text';
import type { O2Encoding } from './text';
import { PLANET_ORIGINS } from './itemdata';

export const SET_INFO_PREFIX_SIZE = 69;
export const SET_INFO_MAX_ITEMS = 5;

export type SetGender = 'female' | 'male' | 'any';

export const SET_CURRENCIES: readonly LabelledId[] = [
  { id: 0, label: 'ePoint / O2Cash / MCash' },
  { id: 1, label: 'GEM' },
];

export interface SetInfoItem {
  slot: number;
  itemId: number;
  price: number;
  salePrice: number;
  saving: number;
  active: boolean;
}

export interface SetInfoEntry {
  index: number;
  offset: number;
  size: number;
  id: number;
  planet: number;
  planetLabel: string;
  isNew: boolean;
  gender: SetGender;
  discountPercent: number;
  discounted: boolean;
  itemCount: number;
  currency: number;
  currencyLabel: string;
  items: SetInfoItem[];
  name: string;
  description: string;
  genderFlagRaw: number;
  nameBytes: Uint8Array;
  descriptionBytes: Uint8Array;
}

export interface SetInfoResult {
  setCount: number;
  sets: SetInfoEntry[];
  bytesConsumed: number;
}

function genderOf(flag: number): SetGender {
  const code = (flag >> 6) & 0x03;
  if (code === 0) return 'female';
  if (code === 1) return 'male';
  return 'any';
}

export function parseSetInfo(
  source: BinarySource,
  encoding: O2Encoding = DEFAULT_ENCODING,
): SetInfoResult {
  const reader = new ByteReader(source);
  if (reader.size < 4) {
    throw new FormatError(`set info needs at least 4 bytes, got ${reader.size}`, 0);
  }

  const raw = asBytes(source);
  const sets: SetInfoEntry[] = [];
  const setCount = reader.u32();

  const readString = (): { text: string; bytes: Uint8Array } | null => {
    if (!reader.has(4)) return null;
    const length = reader.i32();
    if (length < 0 || !reader.has(length)) return null;
    const at = reader.tell();
    return { text: reader.fixedString(length, encoding), bytes: raw.subarray(at, at + length) };
  };

  for (let index = 0; index < setCount; index++) {
    const offset = reader.tell();
    if (!reader.has(SET_INFO_PREFIX_SIZE)) break;

    const id = reader.u32();
    const originFlag = reader.u8();
    const genderFlag = reader.u8();
    const discountPercent = reader.u8();
    const declaredItems = reader.u8();
    const currency = reader.u8();

    const itemIds: number[] = [];
    const prices: number[] = [];
    const salePrices: number[] = [];
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) itemIds.push(reader.u32());
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) prices.push(reader.u32());
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) salePrices.push(reader.u32());

    const name = readString();
    if (name === null) break;
    const description = readString();
    if (description === null) break;

    const planet = originFlag & 0x7f;

    const active = Math.min(declaredItems, SET_INFO_MAX_ITEMS);
    const items: SetInfoItem[] = [];
    for (let slot = 0; slot < SET_INFO_MAX_ITEMS; slot++) {
      const price = prices[slot] ?? 0;
      const salePrice = salePrices[slot] ?? 0;
      items.push({
        slot,
        itemId: itemIds[slot] ?? 0,
        price,
        salePrice,
        saving: discountPercent !== 0 && price > salePrice ? price - salePrice : 0,
        active: slot < active,
      });
    }

    sets.push({
      index,
      offset,
      size: reader.tell() - offset,
      id,
      planet,
      planetLabel: PLANET_ORIGINS.find((p) => p.id === planet)?.label ?? `Unknown (${planet})`,
      isNew: ((originFlag >> 7) & 1) === 1,
      gender: genderOf(genderFlag),
      discountPercent,
      discounted: discountPercent !== 0,
      itemCount: declaredItems,
      currency,
      currencyLabel: SET_CURRENCIES.find((c) => c.id === (currency === 0 ? 0 : 1))?.label ?? '',
      items,
      name: name.text,
      description: description.text,
      genderFlagRaw: genderFlag & 0x3f,
      nameBytes: name.bytes,
      descriptionBytes: description.bytes,
    });
  }

  return { setCount, sets, bytesConsumed: reader.tell() };
}

const GENDER_CODES: Record<SetGender, number> = { female: 0, male: 1, any: 2 };

export function writeSetInfo(sets: readonly SetInfoEntry[], encoding: O2Encoding = DEFAULT_ENCODING): Uint8Array {
  const w = new ByteWriter();
  w.u32(sets.length);
  for (const s of sets) {
    w.u32(s.id);
    w.u8((s.planet & 0x7f) | (s.isNew ? 0x80 : 0));
    w.u8((s.genderFlagRaw & 0x3f) | (GENDER_CODES[s.gender] << 6));
    w.u8(s.discountPercent);
    w.u8(s.itemCount);
    w.u8(s.currency);
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) w.u32(s.items[i]?.itemId ?? 0);
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) w.u32(s.items[i]?.price ?? 0);
    for (let i = 0; i < SET_INFO_MAX_ITEMS; i++) w.u32(s.items[i]?.salePrice ?? 0);
    const name = s.nameBytes ?? encodeText(s.name, encoding).bytes;
    const description = s.descriptionBytes ?? encodeText(s.description, encoding).bytes;
    w.i32(name.length).bytes(name);
    w.i32(description.length).bytes(description);
  }
  return w.toUint8Array();
}
