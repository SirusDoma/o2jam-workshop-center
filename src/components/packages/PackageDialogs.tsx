import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { CloseButton, Overlay } from '../Overlay';

export type NewEntryKind = 'sprite' | 'bound';

export function NewPackageDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('Interface.opi');
  if (!open) {
    return null;
  }

  return (
    <Overlay label="New package" width="narrow" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row"><span className="overlay-title">New package</span></div>
        </div>
        <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
      </div>
      <div className="confirm-body">
        <p>Enter the package name:</p>
        <input
          className="secinput"
          value={name}
          autoFocus
          spellCheck={false}
          aria-label="Package filename"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCreate(name);
            }
          }}
        />
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onCreate(name)}>
            <FilePlus2 size={14} />
            Create
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function NewPackageEntryDialog({
  kind,
  onClose,
  onCreate,
}: {
  kind: NewEntryKind | null;
  onClose: () => void;
  onCreate: (kind: NewEntryKind, name: string) => void;
}) {
  const [name, setName] = useState(kind === 'sprite' ? 'Sprite.ojs' : 'Bounds.bnd');
  if (!kind) {
    return null;
  }

  const title = kind === 'sprite' ? 'New sprite' : 'New bounds';

  return (
    <Overlay label={title} width="narrow" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row"><span className="overlay-title">{title}</span></div>
        </div>
        <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
      </div>
      <div className="confirm-body">
        <input
          className="secinput"
          value={name}
          autoFocus
          spellCheck={false}
          aria-label="Entry filename"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCreate(kind, name);
            }
          }}
        />
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onCreate(kind, name)}>
            <FilePlus2 size={14} />
            Create
          </button>
        </div>
      </div>
    </Overlay>
  );
}
