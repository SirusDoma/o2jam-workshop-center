import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchHotkey } from '../hooks/useSearchHotkey';

export function FilterBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useSearchHotkey(ref);

  return (
    <div className="search">
      <span className="search-ico">
        <Search size={14} />
      </span>
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') {
            return;
          }

          e.stopPropagation();
          if (value) {
            onChange('');
          }
          else {
            ref.current?.blur();
          }
        }}
      />
      <span
        className="kbd"
        role="button"
        style={{ cursor: 'pointer' }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (value) {
            onChange('');
          }
          else if (focused) {
            ref.current?.blur();
          }
          else {
            ref.current?.focus();
          }
        }}
      >
        {focused || value ? 'esc' : '/'}
      </span>
    </div>
  );
}
