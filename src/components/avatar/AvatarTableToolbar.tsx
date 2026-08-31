import { Plus } from 'lucide-react';
import { fmtCount } from '../../format';
import { FilterBox } from '../FilterBox';

export interface AvatarTableSource {
  name: string;
  count: number;
  selected: boolean;
  onSelect?: () => void;
}

export function AvatarTableToolbar({ sources, query, addLabel, addDisabled, onQuery, onAdd }: {
  sources: AvatarTableSource[];
  query: string;
  addLabel: string;
  addDisabled?: boolean;
  onQuery: (query: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="fchips">
        {sources.map((source) => (
          <button key={source.name} type="button" className={`fchip${source.selected ? ' on' : ''}`} onClick={source.onSelect}>
            {source.name}<span className="n">{fmtCount(source.count)}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-right">
        <button className="btn" type="button" disabled={addDisabled} onClick={onAdd}><Plus size={14} />{addLabel}</button>
        <FilterBox value={query} onChange={onQuery} placeholder="Filter" />
      </div>
    </div>
  );
}
