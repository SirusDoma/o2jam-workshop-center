import {
  ATTRIBUTIVE_CATEGORIES,
  ATTRIBUTIVE_EFFECTS,
  ITEM_PARTS,
  PLANET_ORIGINS,
  SET_CURRENCIES,
  SET_INFO_MAX_ITEMS,
  SPRITE_SLOTS,
  derivedPartLabel,
  encodeText,
  type ItemDataVersion,
  type ItemEntry,
  type ItemGender,
  type O2Encoding,
  type SetInfoEntry,
} from '../../o2jam';
import { GENDER_CODE } from './constants';
import type { ItemEdit, SetEdit } from './types';

const labelOf = (list: readonly { id: number; label: string; }[], id: number) =>
  list.find((entry) => entry.id === id)?.label ?? `Unknown (${id})`;

const genderOf = (bitflag: number): ItemGender => {
  const value = (bitflag >> 7) & 0x0f;
  return value === 0 ? 'female' : value === 1 ? 'male' : 'any';
};

export function applyItemEdit(
  item: ItemEntry,
  edit: ItemEdit | undefined,
  version: ItemDataVersion,
  encoding: O2Encoding
): ItemEntry {
  if (!edit || (!edit.fields && !edit.slots)) {
    return item;
  }

  const result: ItemEntry = { ...item, ...edit.fields };
  if (edit.fields?.name !== undefined) {
    result.nameBytes = encodeText(edit.fields.name, encoding).bytes;
  }

  if (edit.fields?.description !== undefined) {
    result.descriptionBytes = encodeText(edit.fields.description, encoding).bytes;
  }

  result.itemTypeLabel = labelOf(version.itemTypes, result.itemType);
  result.planetLabel = labelOf(PLANET_ORIGINS, result.planetOrigin);
  result.paymentMethodLabel = labelOf(version.paymentMethods, result.paymentMethod);
  result.itemPartLabel = result.itemPart === 255 ? derivedPartLabel(result.itemType) : labelOf(ITEM_PARTS, result.itemPart);
  result.attributiveEffectLabel = labelOf(ATTRIBUTIVE_EFFECTS, result.attributiveEffect);
  result.attributiveCategoryLabel = labelOf(ATTRIBUTIVE_CATEGORIES, result.attributiveCategory);
  result.gender = genderOf(result.bitflag);
  result.isNew = ((result.bitflag >> 11) & 1) === 1;
  if (edit.slots) {
    result.sprites = item.sprites.map((sprite) => {
      const value = edit.slots![sprite.slot.index];
      if (value === undefined) {
        return sprite;
      }

      if (!value) {
        return { ...sprite, status: 0, present: false, filename: '', filenameBytes: new Uint8Array(0) };
      }

      return { ...sprite, status: 1, present: true, filename: value, filenameBytes: encodeText(value, encoding).bytes };
    });
  }

  return result;
}

export function applySetEdit(set: SetInfoEntry, edit: SetEdit | undefined, encoding: O2Encoding): SetInfoEntry {
  if (!edit || (!edit.fields && !edit.items)) {
    return set;
  }

  const result: SetInfoEntry = { ...set, ...edit.fields };
  if (edit.fields?.name !== undefined) {
    result.nameBytes = encodeText(edit.fields.name, encoding).bytes;
  }

  if (edit.fields?.description !== undefined) {
    result.descriptionBytes = encodeText(edit.fields.description, encoding).bytes;
  }

  result.planetLabel = labelOf(PLANET_ORIGINS, result.planet);
  result.currencyLabel = SET_CURRENCIES.find((currency) => currency.id === (result.currency === 0 ? 0 : 1))?.label ?? '';
  const active = edit.items ?? set.items.filter((item) => item.active).map(({ itemId, price, salePrice }) => ({ itemId, price, salePrice }));
  if (edit.items) {
    const anyDiscount = active.some((item) => item.salePrice < item.price);
    result.discountPercent = anyDiscount ? Math.min(255, active.reduce((sum, item) => sum + item.salePrice, 0)) : 0;
  }

  result.discounted = result.discountPercent !== 0;
  result.itemCount = active.length;
  result.items = Array.from({ length: SET_INFO_MAX_ITEMS }, (_, slot) => {
    const source = active[slot];
    const price = source?.price ?? 0;
    const salePrice = source?.salePrice ?? 0;
    return {
      slot,
      itemId: source?.itemId ?? 0,
      price,
      salePrice,
      saving: result.discounted && price > salePrice ? price - salePrice : 0,
      active: slot < active.length,
    };
  });
  return result;
}

export function setEditIsNoop(original: SetInfoEntry, edit: SetEdit, encoding: O2Encoding): boolean {
  const result = applySetEdit(original, edit, encoding);
  if (result === original) {
    return true;
  }

  const fields = ['name', 'description', 'planet', 'gender', 'isNew', 'currency'] as const;
  if (fields.some((field) => result[field] !== original[field])) {
    return false;
  }

  return original.items.every((item, slot) => {
    const edited = result.items[slot]!;
    return item.itemId === edited.itemId && item.price === edited.price && item.salePrice === edited.salePrice && item.active === edited.active;
  });
}

export function createSet(index: number, id: number, encoding: O2Encoding): SetInfoEntry {
  return {
    index,
    offset: 0,
    size: 0,
    id,
    planet: 0,
    planetLabel: labelOf(PLANET_ORIGINS, 0),
    isNew: true,
    gender: 'any',
    discountPercent: 0,
    discounted: false,
    itemCount: 0,
    currency: 0,
    currencyLabel: SET_CURRENCIES.find((currency) => currency.id === 0)?.label ?? '',
    items: Array.from({ length: SET_INFO_MAX_ITEMS }, (_, slot) => ({ slot, itemId: 0, price: 0, salePrice: 0, saving: 0, active: false })),
    name: 'New Set',
    description: '',
    genderFlagRaw: 0,
    nameBytes: encodeText('New Set', encoding).bytes,
    descriptionBytes: new Uint8Array(0),
  };
}

export function firstEmptyItemSlot(items: readonly ItemEntry[]): ItemEntry | null {
  let first: ItemEntry | null = null;
  for (const item of items) {
    const empty = item.itemId > 0
      && item.name.trim() === ''
      && item.description.trim() === ''
      && item.sprites.every((sprite) => sprite.filename.trim() === '');
    if (empty && (!first || item.itemId < first.itemId)) {
      first = item;
    }
  }

  return first;
}

export function createItem(index: number, itemId: number, version: ItemDataVersion, encoding: O2Encoding): ItemEntry {
  return {
    index,
    offset: 0,
    size: 0,
    itemId,
    itemType: 6,
    itemTypeLabel: labelOf(version.itemTypes, 6),
    planetOrigin: 0,
    planetLabel: labelOf(PLANET_ORIGINS, 0),
    bitflag: (GENDER_CODE.any << 7) | (1 << 11),
    gender: 'any',
    isNew: true,
    quantity: 0,
    attributiveEffect: 0,
    attributiveEffectLabel: labelOf(ATTRIBUTIVE_EFFECTS, 0),
    attributiveCategory: 0,
    attributiveCategoryLabel: labelOf(ATTRIBUTIVE_CATEGORIES, 0),
    paymentMethod: 0,
    paymentMethodLabel: labelOf(version.paymentMethods, 0),
    priceGem: 0,
    priceEPoint: 0,
    itemPart: 255,
    itemPartLabel: derivedPartLabel(6),
    specialItemFlagMale: version.layout.specialItemFlagMale === null ? null : 0,
    specialItemFlagFemale: version.layout.specialItemFlagFemale === null ? null : 0,
    specialUnisex: false,
    name: 'New Item',
    description: '',
    nameBytes: encodeText('New Item', encoding).bytes,
    descriptionBytes: new Uint8Array(0),
    sprites: SPRITE_SLOTS.slice(0, version.layout.spriteSlotCount).map((slot) => ({
      slot,
      status: 0,
      present: false,
      filename: '',
      filenameBytes: new Uint8Array(0),
      offset: 0,
    })),
  };
}
