import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ENCODINGS, encodeText, type O2Encoding } from '../../o2jam';
import { EncodingSelect } from '../EncodingSelect';

export function TextEditor({
  text,
  encoding,
  onEncodingChange,
  edited,
  onRevert,
  onSave,
}: {
  text: string;
  encoding: O2Encoding;
  onEncodingChange: (encoding: O2Encoding) => void;
  edited: boolean;
  onRevert: () => void;
  onSave: (bytes: Uint8Array) => void;
}) {
  const [lossy, setLossy] = useState(false);
  const label = ENCODINGS.find((candidate) => candidate.id === encoding)?.label ?? encoding;

  return (
    <>
      <div className="dialogfoot" style={{ borderTop: 'none' }}>
        <EncodingSelect value={encoding} onChange={(value) => onEncodingChange(value as O2Encoding)} />
        <span className="hint">
          {lossy ? `Some characters have no ${label} form and were written as "?".` : 'Edits re-encode with the selected encoding.'}
        </span>
        <button className="btn" type="button" disabled={!edited} onClick={onRevert}>
          <RotateCcw size={14} />
          REVERT
        </button>
      </div>
      <textarea
        className="logpre textedit"
        value={text}
        spellCheck={false}
        aria-label="Text content"
        onChange={(event) => {
          const encoded = encodeText(event.target.value, encoding);
          setLossy(encoded.lossy);
          onSave(encoded.bytes);
        }}
      />
    </>
  );
}
