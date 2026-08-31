import type { ReactNode } from 'react';
import { File as FileIcon, X } from 'lucide-react';
import { useWorkspace, type FileKind, type WorkspaceFile } from '../context/WorkspaceContext';
import { fmtBytes } from '../format';
import { DropZone } from './DropZone';

export function FilePicker({
  kinds,
  selected,
  onSelect,
  accept,
  hint,
  allowUnknown = false,
  actions,
  after,
  onClose,
  onError,
}: {
  kinds: FileKind[];
  selected: string | null;
  onSelect: (file: WorkspaceFile) => void;
  accept?: string;
  hint: string;
  allowUnknown?: boolean;
  actions?: ReactNode;
  after?: ReactNode;
  onClose?: (file: WorkspaceFile) => void;
  onError: (message: string) => void;
}) {
  const { files, remove } = useWorkspace();
  const wanted = files.filter(
    (f) => kinds.includes(f.kind) || (allowUnknown && f.kind === 'unknown')
  );

  const exts = accept
    ?.split(',')
    .map((e) => e.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  const extList = exts?.map((e) => `.${e}`).join(' / ');

  return (
    <>
      {wanted.length > 0 && (
        <div className="picklist">
          {wanted.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`filepick${selected === f.id ? ' on' : ''}`}
              onClick={() => onSelect(f)}
            >
              <FileIcon size={14} />
              <span className="fp-name">{f.name}</span>
              <span className="fp-size">{fmtBytes(f.size)}</span>
              <span
                className="rowcopy danger"
                role="button"
                tabIndex={-1}
                aria-label={`Close ${f.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClose) onClose(f);
                  else remove(f.id);
                }}
              >
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="pad">
        <DropZone
          accept={accept}
          hint={hint}
          after={after}
          onlyExt={exts}
          onError={(error) => onError(error instanceof Error ? error.message : 'Could not open that file.')}
          onRejected={(rejected) =>
            onError(
              rejected.length === 1
                ? `${rejected[0]!.name} is not a valid ${extList} file.`
                : `${rejected.length} files are not valid ${extList} files.`
            )
          }
          onOpened={(opened) => {
            const first = opened.find(
              (f) => kinds.includes(f.kind) || (allowUnknown && f.kind === 'unknown')
            );
            if (first) onSelect(first);
          }}
        >
          {actions}
        </DropZone>
      </div>
    </>
  );
}
