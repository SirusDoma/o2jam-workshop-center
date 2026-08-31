import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';


export type FileKind = 'archive' | 'chart' | 'musiclist' | 'sound' | 'sprite' | 'text' | 'unknown';

export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  ext: string;
  buffer: ArrayBuffer;
  openedAt: number;
}

interface WorkspaceContextValue {
  files: WorkspaceFile[];
  add: (list: FileList | File[]) => Promise<WorkspaceFile[]>;
  remove: (id: string) => void;
  clear: () => void;
  byKind: (kind: FileKind) => WorkspaceFile[];
  get: (id: string | null | undefined) => WorkspaceFile | undefined;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  files: [],
  add: async () => [],
  remove: () => {},
  clear: () => {},
  byKind: () => [],
  get: () => undefined,
});

export interface OpeningProgress {
  name: string;
  loaded: number;
  total: number;
}

const OpeningContext = createContext<OpeningProgress | null>(null);

export function useOpening(): OpeningProgress | null {
  return useContext(OpeningContext);
}

async function readWithProgress(file: File, onProgress: (loaded: number) => void): Promise<ArrayBuffer> {
  const out = new Uint8Array(file.size);
  const reader = file.stream().getReader();
  let at = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, at);
    at += value.byteLength;
    const now = performance.now();
    if (now - last > 80) {
      last = now;
      onProgress(at);
    }
  }
  onProgress(at);
  return out.buffer;
}

export function classify(name: string): { kind: FileKind; ext: string } {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  switch (ext) {
    case 'opi':
    case 'opa':
      return { kind: 'archive', ext };
    case 'ojn':
      return { kind: 'chart', ext };
    case 'ojm':
      return { kind: 'sound', ext };
    case 'ojs':
    case 'oji':
    case 'ojt':
    case 'oja':
      return { kind: 'sprite', ext };
    case 'txt':
      return { kind: 'text', ext };
    case 'dat':
      return { kind: /ojnlist/i.test(name) ? 'musiclist' : 'unknown', ext };
    default:
      return { kind: 'unknown', ext };
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [opening, setOpening] = useState<OpeningProgress | null>(null);

  const add = useCallback(async (list: FileList | File[]): Promise<WorkspaceFile[]> => {
    const incoming = Array.from(list);
    const read: WorkspaceFile[] = [];
    try {
      for (const file of incoming) {
        const { kind, ext } = classify(file.name);
        setOpening({ name: file.name, loaded: 0, total: file.size });
        const buffer = await readWithProgress(file, (loaded) => setOpening({ name: file.name, loaded, total: file.size }));
        read.push({
          id: `${file.name}:${file.size}:${file.lastModified}`,
          name: file.name,
          size: file.size,
          kind,
          ext,
          buffer,
          openedAt: Date.now(),
        });
      }
    } finally {
      setOpening(null);
    }
    setFiles((prev) => {
      const kept = prev.filter((p) => !read.some((r) => r.id === p.id));
      return [...kept, ...read];
    });
    return read;
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      files,
      add,
      remove,
      clear,
      byKind: (kind) => files.filter((f) => f.kind === kind),
      get: (id) => (id ? files.find((f) => f.id === id) : undefined),
    }),
    [files, add, remove, clear]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <OpeningContext.Provider value={opening}>{children}</OpeningContext.Provider>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
