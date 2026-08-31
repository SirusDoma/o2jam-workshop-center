import { ENCODINGS, type O2Encoding } from '../o2jam';

export function EncodingSelect({
  value,
  onChange,
  autoLabel,
  className = 'selctl',
}: {
  value: O2Encoding | 'auto';
  onChange: (value: O2Encoding | 'auto') => void;
  autoLabel?: string;
  className?: string;
}) {
  return (
    <select className={className} value={value} aria-label="Text encoding" onChange={(event) => onChange(event.target.value as O2Encoding | 'auto')}>
      {autoLabel && <option value="auto">{autoLabel}</option>}
      {ENCODINGS.map((encoding) => (
        <option key={encoding.id} value={encoding.id}>
          {encoding.label}
        </option>
      ))}
    </select>
  );
}
