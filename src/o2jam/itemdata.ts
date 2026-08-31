
import { asBytes, ByteReader, FormatError } from './binary';
import type { BinarySource, LabelledId } from './binary';
import { DEFAULT_ENCODING, detectEncoding, encodeText } from './text';
import type { O2Encoding } from './text';

export type ItemDataVersionId = '3.10' | '3.82' | '2.33' | '6.65' | '5.89' | '8.02';

export function isItemDataFilename(name: string): boolean {
  return /^itemdata.*\.dat$/i.test(name.trim());
}


export type SpriteRegion = 'preview' | 'body' | 'leftArm' | 'rightArm' | 'back';
export type SpriteInstrument = 'none' | 'bass' | 'guitar' | 'keyboard' | 'drum';
export type SpriteGender = 'male' | 'female';

export interface SpriteSlot {
  index: number;
  region: SpriteRegion;
  instrument: SpriteInstrument | null;
  gender: SpriteGender | null;
  label: string;
}

export const SPRITE_SLOT_COUNT = 42;

const REGIONS: readonly { key: SpriteRegion; label: string; }[] = [
  { key: 'body', label: 'Body' },
  { key: 'leftArm', label: 'Left Arm' },
  { key: 'rightArm', label: 'Right Arm' },
  { key: 'back', label: 'Back' },
];

const INSTRUMENTS: readonly { key: SpriteInstrument; label: string; }[] = [
  { key: 'none', label: 'Default' },
  { key: 'guitar', label: 'Guitar' },
  { key: 'bass', label: 'Bass' },
  { key: 'keyboard', label: 'Keyboard' },
  { key: 'drum', label: 'Drum' },
];

function buildSpriteSlots(): SpriteSlot[] {
  const slots: SpriteSlot[] = [
    { index: 0, region: 'preview', instrument: null, gender: null, label: 'Preview / Thumbnail (Big)' },
    { index: 1, region: 'preview', instrument: null, gender: null, label: 'Preview / Thumbnail (Small)' },
  ];

  for (const region of REGIONS) {
    for (const instrument of INSTRUMENTS) {
      for (const gender of ['male', 'female'] as const) {
        slots.push({
          index: slots.length,
          region: region.key,
          instrument: instrument.key,
          gender,
          label: `${region.label} – ${instrument.label} (${gender === 'male' ? 'Male' : 'Female'})`,
        });
      }
    }
  }
  return slots;
}

export const SPRITE_SLOTS: readonly SpriteSlot[] = buildSpriteSlots();


export const PLANET_ORIGINS: readonly LabelledId[] = [
  { id: 0, label: 'Any' },
  { id: 1, label: 'O2Planet' },
  { id: 2, label: 'Aqua' },
  { id: 3, label: 'Eliten' },
  { id: 4, label: 'Graffiti' },
  { id: 5, label: 'Bikini' },
  { id: 6, label: 'Crush' },
  { id: 7, label: 'Wonderland' },
  { id: 8, label: 'Meganut' },
  { id: 9, label: 'Crystal' },
  { id: 10, label: 'Draconic' },
  { id: 11, label: 'Event' },
];

export const ATTRIBUTIVE_CATEGORIES: readonly LabelledId[] = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Power' },
  { id: 2, label: 'Arrangement' },
  { id: 3, label: 'Visibility' },
];

export const ATTRIBUTIVE_EFFECTS: readonly LabelledId[] = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Power' },
  { id: 2, label: 'Mirror' },
  { id: 3, label: 'Random' },
  { id: 4, label: 'Panic' },
  { id: 5, label: 'Hidden' },
  { id: 6, label: 'Sudden' },
  { id: 7, label: 'Dark' },
  { id: 8, label: 'EndlessJam' },
  { id: 9, label: 'ReverseDark' },
  { id: 10, label: 'BlackMist' },
  { id: 11, label: "Angel's Light" },
];

const DERIVED_PART_BY_TYPE: Record<number, string> = {
  0: 'Body',
  1: 'Left Arm',
  2: 'Right Arm',
  3: 'Left Hand',
  4: 'Right Hand',
  24: 'Attributive',
};

export function derivedPartLabel(itemType: number): string {
  return DERIVED_PART_BY_TYPE[itemType] ?? 'Body';
}

export const ITEM_PARTS: readonly LabelledId[] = [
  { id: 0, label: 'Instrument' },
  { id: 1, label: 'Hair' },
  { id: 2, label: 'Accessories' },
  { id: 3, label: 'Glove' },
  { id: 4, label: 'Necklace' },
  { id: 5, label: 'Shirt' },
  { id: 6, label: 'Pants' },
  { id: 7, label: 'Glasses' },
  { id: 8, label: 'Earrings' },
  { id: 9, label: 'Amulet' },
  { id: 10, label: 'Shoes' },
  { id: 11, label: 'Face' },
  { id: 12, label: 'Wings' },
  { id: 13, label: 'Musical Accessories' },
  { id: 14, label: 'Pet' },
  { id: 15, label: 'Hair Accessories' },
  { id: 16, label: 'Body' },
  { id: 255, label: 'Derived from Item Type' },
];

const ITEM_TYPES_BASE: readonly LabelledId[] = [
  { id: 0, label: 'Body' },
  { id: 1, label: 'Left Arm' },
  { id: 2, label: 'Right Arm' },
  { id: 3, label: 'Left Hand' },
  { id: 4, label: 'Right Hand' },
  { id: 5, label: 'Face' },
  { id: 6, label: 'Hair' },
  { id: 7, label: 'Glasses' },
  { id: 8, label: 'Earrings' },
  { id: 9, label: 'Necklace' },
  { id: 10, label: 'Amulet' },
  { id: 11, label: 'Accessories' },
  { id: 12, label: 'Glove' },
  { id: 13, label: 'Pants' },
  { id: 14, label: 'Shoes' },
  { id: 15, label: 'Keyboard' },
  { id: 16, label: 'Guitar' },
  { id: 17, label: 'Drum' },
  { id: 18, label: 'Bass' },
  { id: 19, label: 'Shirt' },
  { id: 20, label: 'Wings' },
  { id: 21, label: 'Musical Accessories' },
  { id: 22, label: 'Pet' },
  { id: 23, label: 'Hair Accessories' },
  { id: 24, label: 'Attributive' },
];

const ITEM_TYPES_802: readonly LabelledId[] = [
  ...ITEM_TYPES_BASE,
  { id: 25, label: 'Name Changer' },
  { id: 26, label: 'Penalty Reset' },
  { id: 27, label: 'Bag Expansion' },
  { id: 28, label: 'Costume' },
];

const PAYMENT_310: readonly LabelledId[] = [
  { id: 0, label: 'Not for Sale' },
  { id: 1, label: 'GEM' },
  { id: 2, label: 'ePoint' },
];

const PAYMENT_382: readonly LabelledId[] = [
  { id: 0, label: 'Not for Sale' },
  { id: 1, label: 'GEM' },
  { id: 2, label: 'ePoint / O2Cash / Gash / MCash' },
];

const PAYMENT_802: readonly LabelledId[] = [...PAYMENT_382, { id: 3, label: 'Any' }];


export interface ItemPrefixLayout {
  itemId: number;
  itemType: number;
  planetOrigin: number;
  bitflag: number;
  quantity: { offset: number; type: 'byte' | 'int16'; };
  attributiveEffect: number;
  attributiveCategory: number;
  paymentMethod: number;
  priceGem: number;
  priceEPoint: number;
  itemPart: number;
  specialItemFlagMale: number | null;
  specialItemFlagFemale: number | null;
  nameLength: number;
}

const LAYOUT_310: ItemPrefixLayout = {
  itemId: 0,
  itemType: 4,
  planetOrigin: 5,
  bitflag: 6,
  quantity: { offset: 8, type: 'byte' },
  attributiveEffect: 9,
  attributiveCategory: 10,
  paymentMethod: 11,
  priceGem: 12,
  priceEPoint: 16,
  itemPart: 20,
  specialItemFlagMale: null,
  specialItemFlagFemale: null,
  nameLength: 21,
};

const LAYOUT_382: ItemPrefixLayout = {
  itemId: 0,
  itemType: 4,
  planetOrigin: 5,
  bitflag: 6,
  quantity: { offset: 8, type: 'int16' },
  attributiveEffect: 10,
  attributiveCategory: 11,
  paymentMethod: 12,
  priceGem: 13,
  priceEPoint: 17,
  itemPart: 21,
  specialItemFlagMale: null,
  specialItemFlagFemale: null,
  nameLength: 22,
};

const LAYOUT_802: ItemPrefixLayout = {
  ...LAYOUT_382,
  specialItemFlagMale: 22,
  specialItemFlagFemale: 26,
  nameLength: 30,
};

export interface ItemDataVersion {
  id: ItemDataVersionId;
  label: string;
  clientVersion: string;
  layout: ItemPrefixLayout;
  itemTypes: readonly LabelledId[];
  paymentMethods: readonly LabelledId[];
}

export const ITEM_DATA_VERSIONS: readonly ItemDataVersion[] = [
  {
    id: '3.10',
    label: 'v3.10 — O2Jam Original',
    clientVersion: '3.10',
    layout: LAYOUT_310,
    itemTypes: ITEM_TYPES_BASE,
    paymentMethods: PAYMENT_310,
  },
  {
    id: '3.82',
    label: 'v3.82 — O2Jam NX',
    clientVersion: '3.82',
    layout: LAYOUT_382,
    itemTypes: ITEM_TYPES_BASE,
    paymentMethods: PAYMENT_382,
  },
  {
    id: '2.33',
    label: 'v2.33 — O2Jam X2',
    clientVersion: '2.33',
    layout: LAYOUT_382,
    itemTypes: ITEM_TYPES_BASE,
    paymentMethods: PAYMENT_382,
  },
  {
    id: '5.89',
    label: 'v5.89 — O2JamO2',
    clientVersion: '5.89',
    layout: LAYOUT_382,
    itemTypes: ITEM_TYPES_BASE,
    paymentMethods: PAYMENT_382,
  },
  {
    id: '6.65',
    label: 'v6.65 — O2JamO2',
    clientVersion: '6.65',
    layout: LAYOUT_382,
    itemTypes: ITEM_TYPES_BASE,
    paymentMethods: PAYMENT_382,
  },
  {
    id: '8.02',
    label: 'v8.02 — O2Jam Classic',
    clientVersion: '8.02',
    layout: LAYOUT_802,
    itemTypes: ITEM_TYPES_802,
    paymentMethods: PAYMENT_802,
  },
];

export function itemDataVersion(id: ItemDataVersionId): ItemDataVersion {
  const found = ITEM_DATA_VERSIONS.find((v) => v.id === id);
  if (!found) {
    throw new FormatError(`unknown item data version "${id}"`);
  }

  return found;
}

function labelOf(list: readonly LabelledId[], id: number): string {
  return list.find((entry) => entry.id === id)?.label ?? `Unknown (${id})`;
}


export type ItemGender = 'female' | 'male' | 'any';

export interface ItemSpriteRef {
  slot: SpriteSlot;
  status: number;
  present: boolean;
  filename: string;
  filenameBytes: Uint8Array;
  offset: number;
}

export interface ItemEntry {
  index: number;
  offset: number;
  size: number;
  itemId: number;
  itemType: number;
  itemTypeLabel: string;
  planetOrigin: number;
  planetLabel: string;
  bitflag: number;
  gender: ItemGender;
  isNew: boolean;
  quantity: number;
  attributiveEffect: number;
  attributiveEffectLabel: string;
  attributiveCategory: number;
  attributiveCategoryLabel: string;
  paymentMethod: number;
  paymentMethodLabel: string;
  priceGem: number;
  priceEPoint: number;
  itemPart: number;
  itemPartLabel: string;
  specialItemFlagMale: number | null;
  specialItemFlagFemale: number | null;
  specialUnisex: boolean;
  name: string;
  description: string;
  nameBytes: Uint8Array;
  descriptionBytes: Uint8Array;
  sprites: ItemSpriteRef[];
}

export interface ItemDataResult {
  versionId: ItemDataVersionId;
  itemCount: number;
  items: ItemEntry[];
  bytesConsumed: number;
}

function genderOf(bitflag: number): ItemGender {
  const value = (bitflag >> 7) & 0x0f;
  if (value === 0) {
    return 'female';
  }

  if (value === 1) {
    return 'male';
  }

  return 'any';
}

export function parseItemData(
  source: BinarySource,
  versionId: ItemDataVersionId,
  encoding: O2Encoding = DEFAULT_ENCODING,
): ItemDataResult {
  const raw = asBytes(source);
  const reader = new ByteReader(source);
  if (reader.size < 4) {
    throw new FormatError(`item data needs at least 4 bytes, got ${reader.size}`, 0);
  }

  const version = itemDataVersion(versionId);
  const { layout } = version;
  const items: ItemEntry[] = [];

  const itemCount = reader.u32();

  const readString = (): { text: string; bytes: Uint8Array; } | null => {
    if (!reader.has(4)) {
      return null;
    }

    const length = reader.i32();
    if (length < 0 || !reader.has(length)) {
      return null;
    }

    const start = reader.tell();
    return { text: reader.fixedString(length, encoding), bytes: raw.subarray(start, start + length) };
  };

  for (let index = 0; index < itemCount; index++) {
    const offset = reader.tell();
    if (reader.eof()) {
      break;
    }

    try {
      if (!reader.has(layout.nameLength)) {
        break;
      }

      const view = reader.view;
      const itemId = view.getInt32(offset + layout.itemId, true);
      const itemType = view.getUint8(offset + layout.itemType);
      const planetOrigin = view.getUint8(offset + layout.planetOrigin);
      const bitflag = view.getInt16(offset + layout.bitflag, true);
      const quantity =
        layout.quantity.type === 'byte'
          ? view.getUint8(offset + layout.quantity.offset)
          : view.getInt16(offset + layout.quantity.offset, true);
      const attributiveEffect = view.getUint8(offset + layout.attributiveEffect);
      const attributiveCategory = view.getUint8(offset + layout.attributiveCategory);
      const paymentMethod = view.getUint8(offset + layout.paymentMethod);
      const priceGem = view.getInt32(offset + layout.priceGem, true);
      const priceEPoint = view.getInt32(offset + layout.priceEPoint, true);
      const itemPart = view.getUint8(offset + layout.itemPart);
      const specialItemFlagMale =
        layout.specialItemFlagMale === null
          ? null
          : view.getInt32(offset + layout.specialItemFlagMale, true);
      const specialItemFlagFemale =
        layout.specialItemFlagFemale === null
          ? null
          : view.getInt32(offset + layout.specialItemFlagFemale, true);

      reader.seek(offset + layout.nameLength);
      const name = readString();
      if (name === null) {
        break;
      }

      const description = readString();
      if (description === null) {
        break;
      }

      const sprites: ItemSpriteRef[] = [];
      let desynced = false;
      for (const slot of SPRITE_SLOTS) {
        const at = reader.tell();
        if (!reader.has(1)) {
          desynced = true;
          break;
        }

        const status = reader.u8();
        // Status 0 has no length or filename bytes.
        if (status !== 1) {
          sprites.push({ slot, status, present: false, filename: '', filenameBytes: new Uint8Array(0), offset: at });
          continue;
        }

        if (!reader.has(4)) {
          desynced = true;
          break;
        }

        const length = reader.i32();
        if (length < 0 || !reader.has(length)) {
          desynced = true;
          break;
        }

        const nameStart = reader.tell();
        sprites.push({
          slot,
          status,
          present: true,
          filename: reader.fixedString(length, encoding),
          filenameBytes: raw.subarray(nameStart, nameStart + length),
          offset: at,
        });
      }

      items.push({
        index,
        offset,
        size: reader.tell() - offset,
        itemId,
        itemType,
        itemTypeLabel: labelOf(version.itemTypes, itemType),
        planetOrigin,
        planetLabel: labelOf(PLANET_ORIGINS, planetOrigin),
        bitflag,
        gender: genderOf(bitflag),
        isNew: ((bitflag >> 11) & 1) === 1,
        quantity,
        attributiveEffect,
        attributiveEffectLabel: labelOf(ATTRIBUTIVE_EFFECTS, attributiveEffect),
        attributiveCategory,
        attributiveCategoryLabel: labelOf(ATTRIBUTIVE_CATEGORIES, attributiveCategory),
        paymentMethod,
        paymentMethodLabel: labelOf(version.paymentMethods, paymentMethod),
        priceGem,
        priceEPoint,
        itemPart,
        itemPartLabel: itemPart === 255 ? derivedPartLabel(itemType) : labelOf(ITEM_PARTS, itemPart),
        specialItemFlagMale,
        specialItemFlagFemale,
        specialUnisex: !!specialItemFlagMale && !!specialItemFlagFemale,
        name: name.text,
        description: description.text,
        nameBytes: name.bytes,
        descriptionBytes: description.bytes,
        sprites,
      });

      if (desynced) {
        break;
      }
    } catch {
      break;
    }
  }

  return { versionId, itemCount, items, bytesConsumed: reader.tell() };
}

export function writeItemData(
  items: readonly ItemEntry[],
  versionId: ItemDataVersionId,
  encoding: O2Encoding = DEFAULT_ENCODING,
): Uint8Array {
  const { layout } = itemDataVersion(versionId);
  const chunks: Uint8Array[] = [];
  const lstr = (s: string, rawBytes?: Uint8Array): Uint8Array => {
    const b = rawBytes ?? encodeText(s, encoding).bytes;
    const out = new Uint8Array(4 + b.length);
    new DataView(out.buffer).setInt32(0, b.length, true);
    out.set(b, 4);
    return out;
  };

  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, items.length, true);
  chunks.push(head);

  for (const item of items) {
    const prefix = new Uint8Array(layout.nameLength);
    const v = new DataView(prefix.buffer);
    v.setInt32(layout.itemId, item.itemId, true);
    v.setUint8(layout.itemType, item.itemType & 0xff);
    v.setUint8(layout.planetOrigin, item.planetOrigin & 0xff);
    v.setInt16(layout.bitflag, item.bitflag, true);
    if (layout.quantity.type === 'byte') {
      v.setUint8(layout.quantity.offset, item.quantity & 0xff);
    }
    else {
      v.setInt16(layout.quantity.offset, item.quantity, true);
    }

    v.setUint8(layout.attributiveEffect, item.attributiveEffect & 0xff);
    v.setUint8(layout.attributiveCategory, item.attributiveCategory & 0xff);
    v.setUint8(layout.paymentMethod, item.paymentMethod & 0xff);
    v.setInt32(layout.priceGem, item.priceGem, true);
    v.setInt32(layout.priceEPoint, item.priceEPoint, true);
    v.setUint8(layout.itemPart, item.itemPart & 0xff);
    if (layout.specialItemFlagMale !== null) {
      v.setInt32(layout.specialItemFlagMale, item.specialItemFlagMale ?? 0, true);
    }

    if (layout.specialItemFlagFemale !== null) {
      v.setInt32(layout.specialItemFlagFemale, item.specialItemFlagFemale ?? 0, true);
    }

    chunks.push(prefix, lstr(item.name, item.nameBytes), lstr(item.description, item.descriptionBytes));

    for (const s of item.sprites) {
      if (s.present) {
        chunks.push(Uint8Array.of(1), lstr(s.filename, s.filenameBytes));
      }
      else {
        chunks.push(Uint8Array.of(s.status & 0xff));
      }
    }
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function detectItemDataEncoding(
  source: BinarySource,
  versionId: ItemDataVersionId,
): O2Encoding | null {
  const bytes = asBytes(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { layout } = itemDataVersion(versionId);

  const samples: Uint8Array[] = [];
  for (const item of parseItemData(bytes, versionId, 'ascii').items) {
    let at = item.offset + layout.nameLength;
    for (let field = 0; field < 2; field++) {
      if (at + 4 > bytes.byteLength) {
        break;
      }

      const length = view.getInt32(at, true);
      if (length < 0 || at + 4 + length > bytes.byteLength) {
        break;
      }

      samples.push(bytes.subarray(at + 4, at + 4 + length));
      at += 4 + length;
    }
  }
  return detectEncoding(samples);
}

export function detectItemDataVersion(source: BinarySource): ItemDataVersionId | null {
  const reader = new ByteReader(source);
  if (reader.size < 4) {
    return null;
  }

  const size = reader.size;

  const scored = ITEM_DATA_VERSIONS.map((v) => {
    let score = 0;
    try {
      const r = parseItemData(source, v.id, 'ascii');
      const complete = r.itemCount > 0 && r.items.length === r.itemCount;
      const consumed = size > 0 ? r.bytesConsumed / size : 0;
      score =
        (complete ? 100 : 0) +
        (r.items.length > 0 ? 20 : 0) +
        Math.round(Math.min(1, consumed) * 15);
    } catch {
      score = -1;
    }
    return { versionId: v.id, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].versionId : null;
}
