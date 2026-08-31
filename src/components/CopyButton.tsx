import { useState } from 'react';
import { Check, Copy, Save } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { saveFile } from '../save';

export function CopyButton({
  value,
  label = 'Copy',
  variant = 'row',
}: {
  value: string;
  label?: string;
  variant?: 'row' | 'button';
}) {
  const { notify } = useToast();
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } catch {
      notify('Clipboard is blocked here — select the text and copy it.', 'warn');
    }
  };

  if (variant === 'button') {
    return (
      <button className="btn small" type="button" onClick={() => void copy()}>
        {done ? <Check size={13} /> : <Copy size={13} />}
        {done ? 'COPIED' : label.toUpperCase()}
      </button>
    );
  }

  return (
    <button className="rowcopy" type="button" onClick={() => void copy()} title={label} aria-label={label}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export function DownloadButton({
  data,
  filename,
  label = 'Download',
  primary = false,
  disabled = false,
  onSaved,
}: {
  data: Uint8Array | Blob | string;
  filename: string;
  label?: string;
  primary?: boolean;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const { notify } = useToast();

  const save = async () => {
    try {
      if (await saveFile(data, filename)) onSaved?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save the file.', 'warn');
    }
  };

  return (
    <button
      className={`btn${primary ? ' primary' : ''}`}
      type="button"
      onClick={() => void save()}
      disabled={disabled}
    >
      <Save size={14} />
      {label.toUpperCase()}
    </button>
  );
}
