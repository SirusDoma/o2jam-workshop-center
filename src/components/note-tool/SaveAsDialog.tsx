import { useState, type FormEvent } from 'react';
import { CloseButton, Overlay } from '../Overlay';

export function SaveAsDialog({ initialName, onConfirm, onClose }: { initialName: string; onConfirm: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  const valid = name.trim().length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) {
      onConfirm(name.trim());
    }
  };

  return (
    <Overlay label="Name" width="compact" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="overlay-head">
          <div className="oh-main"><div className="oh-row"><span className="overlay-title">Name</span></div></div>
          <div className="overlay-actions"><CloseButton onClose={onClose} /></div>
        </div>
        <div className="overlay-body nt-timing-value-body">
          <label className="nt-field">
            <span>Filename</span>
            <input className="secinput" value={name} autoFocus onFocus={(event) => event.currentTarget.select()} onChange={(event) => setName(event.currentTarget.value)} />
          </label>
        </div>
        <div className="dialogfoot nt-timing-value-footer nt-name-dialog-footer">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!valid}>Confirm</button>
        </div>
      </form>
    </Overlay>
  );
}
