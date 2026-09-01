import { useState, type FormEvent } from 'react';
import { CloseButton, Overlay } from '../Overlay';
import { FRACTION_OPTIONS, formatBpmValue, formatTimingValue } from '../../features/note-tool/timingValues';

export function TimingValueDialog({
  kind,
  location,
  defaultValue,
  onConfirm,
  onClose,
}: {
  kind: 'bpm' | 'fraction';
  location: string;
  defaultValue: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(formatTimingValue(kind, defaultValue));
  const parsedValue = Number(value);
  const valid = Number.isFinite(parsedValue) && parsedValue > 0;
  const label = kind === 'bpm' ? 'BPM' : 'Measure Fraction';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) {
      onConfirm(parsedValue);
    }
  };

  return (
    <Overlay label={`Place ${label} event`} width="compact" onClose={onClose}>
      <form className="nt-timing-value-form" onSubmit={submit}>
        <div className="overlay-head">
          <div className="oh-main">
            <div className="oh-row">
              <span className="overlay-title">Place {label} Event</span>
            </div>
            <span className="overlay-path">{location}</span>
          </div>
          <div className="overlay-actions">
            <CloseButton onClose={onClose} />
          </div>
        </div>
        <div className="overlay-body nt-timing-value-body">
          <label className="nt-field">
            <span>{label} value</span>
            {kind === 'fraction' ? (
              <select className="selctl mono" value={value} autoFocus onChange={(event) => setValue(event.currentTarget.value)}>
                {FRACTION_OPTIONS.map((option) => <option value={option.value} key={option.label}>{option.label}</option>)}
              </select>
            ) : (
              <input
                className="secinput mono"
                type="number"
                min="1"
                step="0.01"
                value={value}
                autoFocus
                aria-invalid={!valid}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={() => valid && setValue(formatBpmValue(parsedValue))}
                onChange={(event) => setValue(event.currentTarget.value)}
              />
            )}
          </label>
        </div>
        <div className="dialogfoot nt-timing-value-footer">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!valid}>Confirm</button>
        </div>
      </form>
    </Overlay>
  );
}
