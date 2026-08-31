import { useCallback, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import { useOpening, useWorkspace, type WorkspaceFile } from '../context/WorkspaceContext';

export function DropZone({
  accept,
  hint,
  label = 'Drop a file',
  onlyExt,
  onOpened,
  onRejected,
  onError,
  onFiles,
  children,
  after,
}: {
  accept?: string;
  hint: string;
  label?: string;
  onlyExt?: string[];
  onOpened?: (files: WorkspaceFile[]) => void;
  onRejected?: (files: File[], kept: number) => void;
  onError?: (error: unknown) => void;
  onFiles?: (files: File[]) => void;
  children?: ReactNode;
  after?: ReactNode;
}) {
  const { add } = useWorkspace();
  const opening = useOpening();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const reading = busy && opening ? opening : null;

  const keep = useCallback(
    (files: File[]) => {
      if (!onlyExt) {
        return files;
      }

      const set = onlyExt.map((e) => e.toLowerCase());
      return files.filter((f) => set.includes(f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()));
    },
    [onlyExt]
  );

  const take = useCallback(
    async (files: File[]) => {
      const wanted = keep(files);
      const rejected = files.filter((f) => !wanted.includes(f));
      if (wanted.length === 0) {
        if (rejected.length) {
          onRejected?.(rejected, 0);
        }

        if (input.current) {
          input.current.value = '';
        }

        return;
      }

      setBusy(true);
      try {
        if (onFiles) {
          onFiles(wanted);
        } else {
          const opened = await add(wanted);
          onOpened?.(opened);
        }

        if (rejected.length) {
          onRejected?.(rejected, wanted.length);
        }
      } catch (error) {
        onError?.(error);
      } finally {
        setBusy(false);
        if (input.current) {
          input.current.value = '';
        }
      }
    },
    [add, keep, onOpened, onRejected, onError, onFiles]
  );

  return (
    <div
      className={`opener${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void (async () => {
          setBusy(true);
          try {
            const files = await collectDropped(e.dataTransfer);
            await take(files);
          } catch (error) {
            onError?.(error);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => void take(Array.from(e.target.files ?? []))}
      />
      {busy ? <span className="spin" /> : <Upload size={18} />}
      <div className="dz-text">
        {reading ? (
          <>
            <span className="dz-label">
              Opening {reading.name}
              <span className="dz-pct">{reading.total > 0 ? `${Math.floor((reading.loaded / reading.total) * 100)}%` : ''}</span>
            </span>
            <span className="dz-bar">
              <span
                className="dz-fill"
                style={{ width: reading.total > 0 ? `${(reading.loaded / reading.total) * 100}%` : '100%' }}
              />
            </span>
          </>
        ) : (
          <>
            <span className="dz-label">{busy ? 'Opening…' : label}</span>
            <span className="dz-hint">{hint}</span>
          </>
        )}
      </div>
      <div className="dz-acts">
        {children}
        <button className="btn" type="button" onClick={() => input.current?.click()}>
          <FolderOpen size={14} />
          BROWSE
        </button>
        {after}
      </div>
    </div>
  );
}

export async function collectDropped(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);

  if (entries.length === 0) {
    return Array.from(dt.files);
  }

  const out: File[] = [];
  await Promise.all(entries.map((entry) => walkEntry(entry, out)));
  return out;
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    out.push(file);
    return;
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries() is batched and ends with an empty batch.
  for (; ;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) {
      break;
    }

    await Promise.all(batch.map((e) => walkEntry(e, out)));
  }
}
