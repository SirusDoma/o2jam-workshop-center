import { useState } from 'react';
import { CloseButton, Overlay } from '../Overlay';

export function SceneNameDialog({
  mode,
  initialName,
  onClose,
  onSubmit,
}: {
  mode: 'add' | 'rename';
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const title = mode === 'add' ? 'New scene' : 'Rename scene';
  return (
    <Overlay label={title} width="narrow" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main"><div className="oh-row"><span className="overlay-title">{title}</span></div></div>
        <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
      </div>
      <div className="confirm-body">
        <input
          className="secinput"
          value={name}
          autoFocus
          spellCheck={false}
          aria-label="Scene name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSubmit(name);
            }
          }}
        />
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onSubmit(name)}>{mode === 'add' ? 'Create' : 'Rename'}</button>
        </div>
      </div>
    </Overlay>
  );
}

export function SetIdDialog({
  initialValue,
  onClose,
  onSubmit,
}: {
  initialValue: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Overlay label="Edit SET id" width="narrow" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main"><div className="oh-row"><span className="overlay-title">Edit SET id</span></div></div>
        <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
      </div>
      <div className="confirm-body">
        <input
          className="secinput mono"
          value={value}
          autoFocus
          spellCheck={false}
          aria-label="SET id"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSubmit(value);
            }
          }}
        />
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="button" onClick={() => onSubmit(value)}>Apply</button>
        </div>
      </div>
    </Overlay>
  );
}

export function SetDeleteDialog({
  count,
  onClose,
  onDelete,
}: {
  count: number;
  onClose: () => void;
  onDelete: (mode: 'delete' | 'dissolve') => void;
}) {
  return (
    <Overlay label="Delete SET" width="narrow" onClose={onClose}>
      <div className="overlay-head">
        <div className="oh-main"><div className="oh-row"><span className="overlay-title">Delete SET</span></div></div>
        <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
      </div>
      <div className="confirm-body">
        <p>
          This SET holds {count} {count === 1 ? 'control' : 'controls'}. Delete them with it, or keep them in the scene on their own?
        </p>
        <div className="confirm-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" onClick={() => onDelete('dissolve')}>Keep Controls</button>
          <button className="btn primary" type="button" onClick={() => onDelete('delete')}>Delete Controls</button>
        </div>
      </div>
    </Overlay>
  );
}
