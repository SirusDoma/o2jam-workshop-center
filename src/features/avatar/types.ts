import type { ItemEntry, SetInfoEntry } from '../../o2jam';

export type ItemFieldPatch = Partial<
  Pick<
    ItemEntry,
    | 'itemId'
    | 'itemType'
    | 'planetOrigin'
    | 'bitflag'
    | 'quantity'
    | 'attributiveEffect'
    | 'attributiveCategory'
    | 'paymentMethod'
    | 'priceGem'
    | 'priceEPoint'
    | 'itemPart'
    | 'name'
    | 'description'
  >
>;

export interface ItemEdit {
  fields?: ItemFieldPatch;
  slots?: Record<number, string | null>;
}

export interface SetEdit {
  fields?: Partial<Pick<SetInfoEntry, 'name' | 'description' | 'planet' | 'gender' | 'isNew' | 'currency'>>;
  items?: { itemId: number; price: number; salePrice: number }[];
}
