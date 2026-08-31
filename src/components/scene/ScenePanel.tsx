import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GripHorizontal, Layers, MousePointerClick, MoveVertical, Plus, RotateCcw, Scan, TextCursorInput } from 'lucide-react';
import type { Bound, ControlEntry } from '../../o2jam';
import { FilterBox } from '../FilterBox';
import { SplitButton } from '../SplitButton';
import { Tabs } from '../Tabs';
import { BoundsEditor } from './BoundsEditor';
import { ControlTree } from './ControlTree';
import { filterRows } from '../../features/scene/sceneUtils';
import type { PosSource, Row } from '../../features/scene/model';

type BoundRow = { key: string; token: string; bound: Bound; control: ControlEntry | null };
type EditableBoundRow = Pick<BoundRow, 'bound' | 'control'>;

interface ControlPanelProps {
  rows: Row[];
  selected: string | null;
  drawn: Set<string>;
  hidden: Set<string>;
  boundHidden: Set<string>;
  removed: Set<string>;
  posSource: Record<string, PosSource>;
  showBounds: boolean;
  orderEdited: boolean;
  onSelect: (key: string) => void;
  onToggleHidden: (key: string) => void;
  onToggleBound: (key: string) => void;
  onToggleSource: (control: ControlEntry) => void;
  onRestore: (key: string) => void;
  setLabel: (setId: number) => string;
  onEditSet: (setId: number) => void;
  onDeleteSet: (setId: number) => void;
  onRestoreSet: (setId: number) => void;
  onReorder: (dragKey: string, dragScope: 'unit' | 'member', targetKey: string, after: boolean) => void;
  onAddControl: (kind?: 'image' | 'text' | 'scroll') => void;
  onAddSet: () => number | null;
  onRevertOrder: () => void;
}

interface BoundsPanelProps {
  fileName: string | null;
  newFileName: string;
  fileNames: string[];
  rows: BoundRow[];
  edited: boolean;
  onAdd: () => void;
  onRevert: () => void;
  onFileChange: (name: string | null) => void;
  onEdit: (row: EditableBoundRow, patch: Partial<Bound>) => void;
  onRemove: (row: EditableBoundRow) => void;
}

export function ScenePanel({
  sceneKey,
  controls,
  bounds,
  inspector,
}: {
  sceneKey: string;
  controls: ControlPanelProps;
  bounds: BoundsPanelProps;
  inspector: ReactNode;
}) {
  const [tab, setTab] = useState<'controls' | 'bounds'>('controls');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [detailHeight, setDetailHeight] = useState(556);
  const visibleRows = useMemo(() => filterRows(controls.rows, query), [controls.rows, query]);

  useEffect(() => setExpanded({}), [sceneKey]);

  return (
    <div className="scene-split">
      <div className="scene-list">
        <Tabs
          tabs={[
            { id: 'controls', label: 'Controls' },
            { id: 'bounds', label: 'Bounds' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'controls' && (
          <>
            <div className="ctactions">
              <SplitButton
                icon={<Plus size={14} />}
                label="ADD"
                onClick={() => controls.onAddControl()}
                items={[
                  { icon: <MousePointerClick size={14} />, label: 'Add control', onClick: () => controls.onAddControl() },
                  { icon: <TextCursorInput size={14} />, label: 'Add text', onClick: () => controls.onAddControl('text') },
                  { icon: <MoveVertical size={14} />, label: 'Add scroll bar', onClick: () => controls.onAddControl('scroll') },
                  {
                    icon: <Layers size={14} />,
                    label: 'Add SET',
                    onClick: () => {
                      const setId = controls.onAddSet();
                      if (setId !== null) setExpanded((current) => ({ ...current, [setId]: true }));
                    },
                  },
                ]}
              />
              <button className="btn" type="button" title="Revert this screen's drawing order and SET moves" disabled={!controls.orderEdited} onClick={controls.onRevertOrder}>
                <RotateCcw size={14} />
                REVERT
              </button>
              <span className="ct-filter">
                <FilterBox value={query} onChange={setQuery} placeholder="Filter by name, id or sprite" />
              </span>
            </div>
            <ControlTree
              rows={visibleRows}
              selected={controls.selected}
              expanded={expanded}
              drawn={controls.drawn}
              hidden={controls.hidden}
              boundHidden={controls.boundHidden}
              removed={controls.removed}
              posSource={controls.posSource}
              showBounds={controls.showBounds}
              onSelect={controls.onSelect}
              onToggle={(setId) => setExpanded((current) => ({ ...current, [setId]: !current[setId] }))}
              onToggleHidden={controls.onToggleHidden}
              onToggleBound={controls.onToggleBound}
              onToggleSource={controls.onToggleSource}
              onRestore={controls.onRestore}
              setLabel={controls.setLabel}
              onEditSet={controls.onEditSet}
              onDeleteSet={controls.onDeleteSet}
              onRestoreSet={controls.onRestoreSet}
              onReorder={controls.onReorder}
            />
          </>
        )}

        {tab === 'bounds' && (
          <>
            <div className="ctactions">
              {bounds.fileName && (
                <button className="btn" type="button" onClick={bounds.onAdd}>
                  <Scan size={14} />
                  ADD
                </button>
              )}
              <button className="btn" type="button" disabled={!bounds.edited} onClick={bounds.onRevert}>
                <RotateCcw size={14} />
                REVERT
              </button>
              <select
                className="selctl"
                style={{ marginLeft: 'auto', maxWidth: 220 }}
                aria-label="Bound file"
                value={bounds.fileName ?? ''}
                onChange={(event) => bounds.onFileChange(event.target.value === '\u0000new' ? bounds.newFileName : event.target.value || null)}
              >
                <option value="">— no bound file —</option>
                {bounds.fileName && !bounds.fileNames.includes(bounds.fileName) && (
                  <option value={bounds.fileName}>{bounds.fileName} (new)</option>
                )}
                {bounds.fileNames.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value={'\u0000new'}>Create new…</option>
              </select>
            </div>
            {bounds.fileName ? (
              <BoundsEditor rows={bounds.rows} onEdit={bounds.onEdit} onRemove={bounds.onRemove} />
            ) : (
              <div className="archive-empty">NO BOUND FILE FOR THIS SCREEN</div>
            )}
          </>
        )}
      </div>

      <div
        className="scene-vsplit"
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize"
        onPointerDown={(event) => {
          event.preventDefault();
          const startY = event.clientY;
          const start = detailHeight;
          const move = (pointer: PointerEvent) => setDetailHeight(Math.min(Math.max(160, start + pointer.clientY - startY), 900));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      >
        <GripHorizontal size={12} />
      </div>

      <div className="scene-detail" style={{ height: detailHeight }}>{inspector}</div>
    </div>
  );
}
