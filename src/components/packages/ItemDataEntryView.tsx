import type { CSSProperties } from 'react';
import type { ItemDataResult } from '../../o2jam';
import { GENDER_LABEL, ITEM_COLS } from '../../features/packages/constants';

export function ItemDataEntryView({ itemData }: { itemData: ItemDataResult; }) {
  return (
    <>
      <div className="reg-head" style={{ '--cols': ITEM_COLS } as CSSProperties}>
        <span>ID</span>
        <span>Name</span>
        <span>Part</span>
        <span>Gender</span>
        <span className="r">Gem / ePoint</span>
      </div>
      <ul className="rows">
        {itemData.items.map((item, index) => (
          <li key={index}>
            <div className="reg-row" style={{ '--cols': ITEM_COLS } as CSSProperties}>
              <span className="cell-mono">{item.itemId}</span>
              <div className="cell-lead">
                <span className="nm-stack">
                  <span className="nm-text" title={item.description || item.name}>{item.name || '—'}</span>
                  <span className="nm-sub">{item.planetLabel}</span>
                </span>
              </div>
              <span className="cell-m l" title={item.itemTypeLabel}>{item.itemPartLabel}</span>
              <span className="cell-m l">{GENDER_LABEL[item.gender] ?? item.gender}</span>
              <span className="cell-m r">{item.priceGem} / {item.priceEPoint}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
