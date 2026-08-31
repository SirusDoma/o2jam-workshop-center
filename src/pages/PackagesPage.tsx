import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, Save } from 'lucide-react';
import {
  ENCODINGS,
  buildArchive,
  detectArchiveEncoding,
  isAlbumListData,
  isSpriteData,
  parseArchive,
  readEntry,
  sniffImageMime,
  writeBounds,
  writeSprite,
  type Archive,
  type ArchiveEntry,
  type O2Encoding,
} from '../o2jam';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EncodingSelect } from '../components/EncodingSelect';
import { FilePicker } from '../components/FilePicker';
import { FileInputCard } from '../components/FileInputCard';
import { PageHead } from '../components/Shell';
import { WarningCard } from '../components/WarningCard';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { reportDirty } from '../dirty';
import { saveFile } from '../save';
import { EntryView } from '../components/packages/EntryView';
import { PackageEntryList } from '../components/packages/PackageEntryList';
import { NewPackageDialog, NewPackageEntryDialog, type NewEntryKind } from '../components/packages/PackageDialogs';
import { bytesEqual, looksLikeMusicList, quickTextish } from '../features/packages/packageUtils';
interface Edits {
  removed: Set<number>;
  replaced: Map<number, Uint8Array>;
  added: { name: string; data: Uint8Array; original: Uint8Array }[];
}

export default function PackagesPage() {
  const { files, add, remove } = useWorkspace();
  const { notify } = useToast();
  const [fileId, setFileId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<'auto' | O2Encoding>('auto');
  const [picked, setPicked] = useState<string | null>(null);
  const [tab, setTab] = useState<'preview' | 'meta' | 'bytes'>('preview');
  const [edits, setEdits] = useState<Edits>({ removed: new Set(), replaced: new Map(), added: [] });
  const [creating, setCreating] = useState(false);
  const [newEntry, setNewEntry] = useState<NewEntryKind | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: 'close' | 'switch'; id: string } | { kind: 'create'; name: string } | null
  >(null);

  const file = files.find((f) => f.id === fileId) ?? null;

  const detected = useMemo(() => {
    if (!file) return null;
    try {
      return detectArchiveEncoding(file.buffer);
    } catch {
      return null;
    }
  }, [file]);
  const resolved: O2Encoding = encoding === 'auto' ? detected ?? 'ascii' : encoding;

  const archive = useMemo((): { data?: Archive; error?: string } => {
    if (!file) return {};
    try {
      return { data: parseArchive(file.buffer, resolved) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not read this package.' };
    }
  }, [file, resolved]);

  // File identity keeps pending edits tied to the current open file.
  useEffect(() => {
    setPicked(null);
    setEdits({ removed: new Set(), replaced: new Map(), added: [] });
  }, [file]);

  const entries = archive.data?.entries ?? [];
  const dirty = edits.removed.size > 0 || edits.replaced.size > 0 || edits.added.length > 0;

  useEffect(() => {
    reportDirty('packages', dirty);
    return () => reportDirty('packages', false);
  }, [dirty]);

  const contentType = useMemo(() => {
    const m = new Map<number, { label: string; img: boolean }>();
    if (!file) return m;
    const bytes = new Uint8Array(file.buffer);
    for (const e of entries) {
      const entryBytes = bytes.subarray(e.offset, e.offset + e.size);
      const mime = sniffImageMime(entryBytes.subarray(0, 8));
      if (mime) {
        m.set(e.index, { label: mime.split('/')[1]!.toUpperCase(), img: true });
        continue;
      }
      if (isSpriteData(entryBytes, e.name)) continue;
      if (isAlbumListData(entryBytes)) {
        m.set(e.index, { label: 'ALBUM LIST', img: false });
        continue;
      }
      if (/^itemdata/i.test(e.name) && e.ext === 'dat') {
        m.set(e.index, { label: 'ITEM LIST', img: false });
        continue;
      }
      if (looksLikeMusicList(entryBytes)) {
        m.set(e.index, { label: 'MUSIC LIST', img: false });
        continue;
      }
      if (quickTextish(entryBytes)) m.set(e.index, { label: 'TXT', img: false });
    }
    return m;
  }, [file, entries]);

  const dataOf = (index: number, entry: ArchiveEntry) => edits.replaced.get(index) ?? (file ? readEntry(file.buffer, entry) : new Uint8Array());

  const selectedOrig = picked?.startsWith('o') ? entries.find((e) => `o${e.index}` === picked) ?? null : null;
  const selectedAdded = picked?.startsWith('a') ? edits.added[Number(picked.slice(1))] ?? null : null;

  const selectedData = useMemo(
    () => (selectedOrig && file ? edits.replaced.get(selectedOrig.index) ?? readEntry(file.buffer, selectedOrig) : null),
    [selectedOrig, file, edits.replaced]
  );

  const toggleRemoved = (index: number) => {
    setEdits((s) => {
      const r = new Set(s.removed);
      r.has(index) ? r.delete(index) : r.add(index);
      return { ...s, removed: r };
    });
  };
  const removeAdded = (i: number) => setEdits((s) => ({ ...s, added: s.added.filter((_, n) => n !== i) }));

  const exportArchive = async () => {
    if (!file || !archive.data) return;
    try {
      const kept = entries
        .filter((e) => !edits.removed.has(e.index))
        .map((e) => ({ name: e.name, data: dataOf(e.index, e) }));
      const out = buildArchive(archive.data.kind, [...kept, ...edits.added], resolved);
      if (!(await saveFile(out, file.name))) return;
      const [reopened] = await add([new File([out.slice().buffer as ArrayBuffer], file.name)]);
      if (reopened && reopened.id !== file.id) {
        remove(file.id);
        setFileId(reopened.id);
      }
      notify(`Saved ${file.name} — ${kept.length + edits.added.length} entries.`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not rebuild the package.', 'warn');
    }
  };

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const read = await Promise.all(
      Array.from(list).map(async (f) => {
        const data = new Uint8Array(await f.arrayBuffer());
        return { name: f.name, data, original: data };
      })
    );
    if (read.length) setEdits((e) => ({ ...e, added: [...e.added, ...read] }));
  };

  const createArchive = async (rawName: string) => {
    let name = rawName.trim() || 'Interface.opi';
    if (!/\.(opi|opa)$/i.test(name)) name += '.opi';
    const kind = name.toLowerCase().endsWith('.opa') ? 'opa' : 'opi';
    const bytes = buildArchive(kind, [], 'ascii');
    const [opened] = await add([new File([bytes.slice().buffer as ArrayBuffer], name)]);
    if (opened) {
      setOpenError(null);
      setFileId(opened.id);
    }
    setCreating(false);
  };

  const createEntry = (kind: NewEntryKind, rawName: string) => {
    let name = rawName.trim() || (kind === 'sprite' ? 'Sprite.ojs' : 'Bounds.bnd');
    if (kind === 'sprite' && !/\.(ojs|oji|ojt|oja)$/i.test(name)) name += '.ojs';
    if (kind === 'bound' && !/\.bnd$/i.test(name)) name += '.bnd';
    const data = kind === 'sprite' ? writeSprite([], 0, 8, /\.oji$/i.test(name) ? 'runlist' : 'rgb555') : writeBounds([]);
    const idx = edits.added.length;
    setEdits((s) => ({ ...s, added: [...s.added, { name, data, original: data }] }));
    setPicked(`a${idx}`);
    setNewEntry(null);
  };

  const requestCreate = (name: string) => {
    if (dirty) {
      setCreating(false);
      setConfirm({ kind: 'create', name });
    } else {
      void createArchive(name);
    }
  };

  return (
    <>
      <div className="stickyhead">
      <PageHead
        title="Packages"
        sub="Inspect, edit and repack an OPI or OPA package."
        actions={
          <EncodingSelect
            value={encoding}
            autoLabel={`Auto — ${ENCODINGS.find((entry) => entry.id === (detected ?? 'ascii'))?.label}`}
            onChange={(value) => setEncoding(value)}
          />
        }
      />

      <FileInputCard>
        <FilePicker
          kinds={['archive']}
          selected={fileId}
          onSelect={(f) => {
            setOpenError(null);
            if (f.id === fileId) return;
            if (dirty) setConfirm({ kind: 'switch', id: f.id });
            else setFileId(f.id);
          }}
          onClose={(f) => {
            if (dirty && f.id === fileId) {
              setConfirm({ kind: 'close', id: f.id });
              return;
            }
            remove(f.id);
            if (f.id === fileId) setFileId(null);
          }}
          accept=".opi,.opa"
          hint="Interface, Playing or Avatar package."
          onError={setOpenError}
          actions={
            <button className="btn" type="button" onClick={() => setCreating(true)}>
              <FilePlus2 size={14} />
              CREATE
            </button>
          }
          after={
            file && archive.data ? (
              <button className="btn primary" type="button" onClick={() => void exportArchive()} disabled={!dirty}>
                <Save size={14} />
                SAVE
              </button>
            ) : null
          }
        />
      </FileInputCard>
      </div>

      {openError && <WarningCard onClose={() => setOpenError(null)}>{openError}</WarningCard>}

      {archive.error && (
        <WarningCard>{archive.error}</WarningCard>
      )}

      {file && archive.data && (
        <>
          <section className="card archive">
            <PackageEntryList
              key={file.id}
              entries={entries}
              added={edits.added}
              removed={edits.removed}
              replaced={edits.replaced}
              contentType={contentType}
              picked={picked}
              onPick={setPicked}
              onToggleRemoved={toggleRemoved}
              onRemoveAdded={removeAdded}
              onAddFiles={(files) => void addFiles(files)}
              onNewEntry={({ kind }) => setNewEntry(kind)}
            />

            <div className="archive-view">
              {selectedOrig && selectedData ? (
                <EntryView
                  key={selectedOrig.index}
                  entry={selectedOrig}
                  data={selectedData}
                  encoding={resolved}
                  auto={encoding === 'auto'}
                  tab={tab}
                  onTab={setTab}
                  edited={edits.replaced.has(selectedOrig.index)}
                  onRevert={() => setEdits((s) => { const r = new Map(s.replaced); r.delete(selectedOrig.index); return { ...s, replaced: r }; })}
                  onReplace={(bytes) => {
                    const original = file ? readEntry(file.buffer, selectedOrig) : null;
                    setEdits((s) => {
                      const r = new Map(s.replaced);
                      if (original && bytesEqual(bytes, original)) r.delete(selectedOrig.index);
                      else r.set(selectedOrig.index, bytes);
                      return { ...s, replaced: r };
                    });
                  }}
                />
              ) : selectedAdded ? (
                <EntryView
                  key={picked}
                  entry={null}
                  addedName={selectedAdded.name}
                  data={selectedAdded.data}
                  encoding={resolved}
                  auto={encoding === 'auto'}
                  tab={tab}
                  onTab={setTab}
                  edited={!bytesEqual(selectedAdded.data, selectedAdded.original)}
                  onRevert={() => {
                    const idx = Number(picked!.slice(1));
                    setEdits((s) => ({ ...s, added: s.added.map((a, n) => (n === idx ? { ...a, data: a.original } : a)) }));
                  }}
                  onReplace={(bytes) => {
                    const idx = Number(picked!.slice(1));
                    setEdits((s) => ({ ...s, added: s.added.map((a, n) => (n === idx ? { ...a, data: bytes } : a)) }));
                  }}
                />
              ) : (
                <div className="archive-empty">SELECT AN ENTRY</div>
              )}
            </div>
          </section>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="Unsaved changes"
          body={
            confirm.kind === 'close'
              ? 'This package has unsaved changes. Closing it discards them.'
              : confirm.kind === 'switch'
                ? 'This package has unsaved changes. Switching packages discards them.'
                : 'This package has unsaved changes. Creating a new package discards them.'
          }
          confirmLabel="Discard"
          onConfirm={() => {
            const pending = confirm;
            setConfirm(null);
            if (pending.kind === 'close') {
              remove(pending.id);
              setFileId(null);
            } else if (pending.kind === 'switch') {
              setFileId(pending.id);
            } else if (pending.kind === 'create') {
              void createArchive(pending.name);
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      <NewPackageEntryDialog
        key={newEntry ?? 'closed'}
        kind={newEntry}
        onClose={() => setNewEntry(null)}
        onCreate={createEntry}
      />
      <NewPackageDialog open={creating} onClose={() => setCreating(false)} onCreate={requestCreate} />
    </>
  );
}
