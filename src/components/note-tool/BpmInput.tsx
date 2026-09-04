import { useEffect, useState } from 'react';
import { normalizeDecimalInput } from '../../features/note-tool/dom';
import { formatBpmValue, parseBpmInput } from '../../features/note-tool/timingValues';

export function BpmInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(() => formatBpmValue(value));

  useEffect(() => setDraft(formatBpmValue(value)), [value]);

  const commit = () => {
    const next = parseBpmInput(draft, value);
    onChange(next);
    setDraft(formatBpmValue(next));
  };

  return (
    <input
      className="secinput mono"
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(normalizeDecimalInput(event.currentTarget))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
