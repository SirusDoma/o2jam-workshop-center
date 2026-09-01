import { useState, type DragEvent } from 'react';
import { Plus, Upload, X } from 'lucide-react';
import type { ItemEntry } from '../../o2jam';
import { CloseButton, Overlay } from '../Overlay';
import type { WorkspaceFile } from '../../context/WorkspaceContext';
import { ojiReferenceName } from '../../features/avatar/utils';
import { SlotThumb } from './AvatarPreview';

export function AvatarSpriteEditor({
  file,
  item,
  spriteNames,
  onSet,
  onImport,
}: {
  file: WorkspaceFile;
  item: ItemEntry;
  spriteNames: string[];
  onSet: (index: number, name: string | null) => void;
  onImport: (f: File) => Promise<string>;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ index: number; oji: boolean; } | null>(null);
  const editingSlot = editing === null ? null : item.sprites.find((s) => s.slot.index === editing) ?? null;
  const dropSprite = (event: DragEvent<HTMLDivElement>, index: number, oji: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const file = [...event.dataTransfer.files].find((entry) => /\.(ojs|oji|ojt|oja)$/i.test(entry.name));
    if (file) {
      void onImport(file).then((name) => onSet(index, oji ? ojiReferenceName(name) : name));
    }
  };

  return (
    <>
      <div className="slotgrid">
        {item.sprites.map((s) => {
          const name = s.present ? s.filename : '';
          const filled = !!name;
          return (
            <div
              key={s.slot.index}
              className={`slotcell${filled ? '' : ' blank'}${dragOver?.index === s.slot.index ? ' dragover' : ''}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setDragOver((current) => current?.index === s.slot.index ? current : { index: s.slot.index, oji: false });
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOver((current) => current?.index === s.slot.index ? null : current);
                }
              }}
              onDrop={(e) => dropSprite(e, s.slot.index, false)}
            >
              <div className="slot-head">
                <span className="sl-i">{String(s.slot.index).padStart(2, '0')}</span>
                <span className="slot-label">{s.slot.label}</span>
                {filled && (
                  <button className="rowcopy danger" type="button" aria-label="Unlink" onClick={() => onSet(s.slot.index, null)}>
                    <X size={12} />
                  </button>
                )}
              </div>
              <input
                className="slot-name"
                readOnly
                value={name}
                placeholder="(Empty)"
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`${s.slot.label} sprite`}
              />
              {dragOver?.index === s.slot.index ? (
                <div className="slot-drop-options">
                  <div
                    className={`slot-drop-target primary${dragOver.oji ? '' : ' active'}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOver({ index: s.slot.index, oji: false });
                    }}
                    onDrop={(e) => dropSprite(e, s.slot.index, false)}
                  >
                    <Upload size={16} />
                    <span>Import as-is</span>
                  </div>
                  <div
                    className={`slot-drop-target${dragOver.oji ? ' active' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOver({ index: s.slot.index, oji: true });
                    }}
                    onDrop={(e) => dropSprite(e, s.slot.index, true)}
                  >
                    <span>Import with .oji reference</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`slot-thumb${filled ? '' : ' hollow'}`}
                  onClick={() => setEditing(s.slot.index)}
                  aria-label={`Link sprite for ${s.slot.label}`}
                >
                  {filled ? (
                    <SlotThumb file={file} name={name} />
                  ) : (
                    <span className="st-link">
                      <Plus size={16} />
                      Link sprite
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editingSlot && (
        <SpritePicker
          label={editingSlot.slot.label}
          names={spriteNames}
          onPick={(n) => {
            onSet(editingSlot.slot.index, n);
            setEditing(null);
          }}
          onImport={onImport}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function SpritePicker({
  label,
  names,
  onPick,
  onImport,
  onClose,
}: {
  label: string;
  names: string[];
  onPick: (n: string | null) => void;
  onImport: (f: File) => Promise<string>;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [useOjiReference, setUseOjiReference] = useState(false);
  const term = q.trim().toLowerCase();
  const shown = term ? names.filter((n) => n.toLowerCase().includes(term)) : names;
  const referenceName = (name: string) => useOjiReference ? ojiReferenceName(name) : name;
  return (
    <Overlay onClose={onClose} label={`Link sprite for ${label}`} width="mid">
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="overlay-title">{label}</span>
          </div>
        </div>
        <div className="overlay-actions">
          <CloseButton onClose={onClose} />
        </div>
      </div>
      <div className="pad">
        <input
          className="secinput"
          autoFocus
          type="search"
          value={q}
          placeholder={`Search ${names.length} sprites`}
          aria-label="Search sprites"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="pickerlist">
        <button type="button" className="filepick" onClick={() => onPick(null)}>
          <X size={13} />
          <span className="fp-name">— none —</span>
        </button>
        {shown.slice(0, 500).map((n) => (
          <button key={n} type="button" className="filepick" onClick={() => onPick(referenceName(n))}>
            <span className="fp-name">{n}</span>
          </button>
        ))}
      </div>
      <div className="dialogfoot">
        <label className="checkline picker-reference">
          <input type="checkbox" checked={useOjiReference} onChange={(e) => setUseOjiReference(e.target.checked)} />
          <span>Use .oji as reference</span>
        </label>
        <label className="btn picker-import">
          <Upload size={14} />
          IMPORT
          <input
            type="file"
            hidden
            accept=".ojs,.oja,.oji,.ojt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void onImport(f).then((name) => onPick(referenceName(name)));
              }
            }}
          />
        </label>
      </div>
    </Overlay>
  );
}
