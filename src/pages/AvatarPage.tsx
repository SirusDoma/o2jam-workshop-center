import { useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import {
  ENCODINGS,
  ITEM_DATA_VERSIONS,
  detectItemDataEncoding,
  detectItemDataVersion,
  itemDataVersion,
  parseArchive,
  parseItemData,
  parseSetInfo,
  readEntry,
  type ItemDataResult,
  type ItemDataVersionId,
  type ItemEntry,
  type O2Encoding,
  type SetGender,
  type SetInfoEntry,
} from '../o2jam';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EncodingSelect } from '../components/EncodingSelect';
import { FilePicker } from '../components/FilePicker';
import { FileInputCard } from '../components/FileInputCard';
import { PageHead } from '../components/Shell';
import { Tabs } from '../components/Tabs';
import { WarningCard } from '../components/WarningCard';
import { AvatarBuilder } from '../components/avatar/AvatarBuilder';
import { AvatarItemDetail } from '../components/avatar/AvatarItemDetail';
import { AvatarItemsTable } from '../components/avatar/AvatarItemsTable';
import { AvatarSetDetail } from '../components/avatar/AvatarSetDetail';
import { AvatarSetsTable } from '../components/avatar/AvatarSetsTable';
import { buildAvatarPackage } from '../features/avatar/package';
import { applyItemEdit, applySetEdit, createItem, createSet, setEditIsNoop } from '../features/avatar/model';
import { archiveSpriteNames, findTables, importedSprites, spriteCache } from '../features/avatar/utils';
import type { ItemEdit, SetEdit } from '../features/avatar/types';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { reportDirty } from '../dirty';
import { saveFile } from '../save';

export default function AvatarPage() {
  const { files, add, remove } = useWorkspace();
  const { notify } = useToast();
  const [fileId, setFileId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<ItemDataVersionId>('3.82');
  const [encoding, setEncoding] = useState<'auto' | O2Encoding>('auto');
  const [tableName, setTableName] = useState<string | null>(null);
  const [pane, setPane] = useState<'items' | 'sets' | 'builder'>('items');
  const [pickedSet, setPickedSet] = useState<number | null>(null);
  const [setInfoEdits, setSetInfoEdits] = useState<Record<number, SetEdit>>({});
  const [addedSets, setAddedSets] = useState<SetInfoEntry[]>([]);
  const [removedSets, setRemovedSets] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<number, ItemEdit>>>({});
  const [addedItems, setAddedItems] = useState<Record<string, ItemEntry[]>>({});
  const [removedItems, setRemovedItems] = useState<Record<string, Set<number>>>({});
  const [addedFiles, setAddedFiles] = useState<Record<string, Uint8Array>>({});
  const [confirmFile, setConfirmFile] = useState<{ kind: 'close' | 'switch'; id: string; } | null>(null);
  const nextIndex = useRef(1_000_000);

  const file = files.find((f) => f.id === fileId) ?? null;
  const tables = useMemo(() => (file ? findTables(file) : []), [file]);
  const table = tables.find((t) => t.name === tableName) ?? tables[0] ?? null;

  useEffect(() => {
    if (!file || !table) {
      return;
    }

    const detected = detectItemDataVersion(readEntry(file.buffer, table));
    if (detected) {
      setVersionId(detected);
    }
  }, [file, table]);

  const detected = useMemo(() => {
    if (!file || !table) {
      return null;
    }

    try {
      return detectItemDataEncoding(readEntry(file.buffer, table), versionId);
    } catch {
      return null;
    }
  }, [file, table, versionId]);
  const resolved: O2Encoding = encoding === 'auto' ? detected ?? 'ascii' : encoding;

  const parsed = useMemo((): { data?: ItemDataResult; error?: string; } => {
    if (!file || !table) {
      return {};
    }

    try {
      return { data: parseItemData(readEntry(file.buffer, table), versionId, resolved) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not read this item table.' };
    }
  }, [file, table, versionId, resolved]);

  useEffect(() => {
    spriteCache.clear();
    importedSprites.clear();
    setPicked(null);
    setPickedSet(null);
    setPane('items');
    setTableName(null);
    setEdits({});
    setSetInfoEdits({});
    setAddedSets([]);
    setRemovedSets(new Set());
    setAddedItems({});
    setRemovedItems({});
    setAddedFiles({});
    return () => {
      spriteCache.clear();
      importedSprites.clear();
    };
  }, [fileId]);

  const spriteNames = useMemo(() => {
    const base = file ? archiveSpriteNames(file) : [];
    const have = new Set(base.map((n) => n.toLowerCase()));
    const extra = Object.keys(addedFiles).filter((n) => !have.has(n.toLowerCase()));
    return [...base, ...extra].sort((a, b) => a.localeCompare(b));
  }, [file, addedFiles]);
  const version = itemDataVersion(versionId);
  const tableEdits = table ? edits[table.name] : undefined;
  const tableAdded = table ? addedItems[table.name] : undefined;
  const removedSet = table ? removedItems[table.name] : undefined;
  const items = useMemo(
    () =>
      [...(parsed.data?.items ?? []), ...(tableAdded ?? [])].map((it) => applyItemEdit(it, tableEdits?.[it.index], version, resolved)),
    [parsed, tableAdded, tableEdits, version, resolved]
  );
  const item = picked === null ? null : items.find((i) => i.index === picked) ?? null;

  const setInfo = useMemo(() => {
    if (!file) {
      return null;
    }

    try {
      const arc = parseArchive(file.buffer, 'ascii');
      const entry = arc.entries.find((e) => e.name.toLowerCase() === 'setinfodata.ojs');
      return entry ? { name: entry.name, data: parseSetInfo(readEntry(file.buffer, entry), resolved) } : null;
    } catch {
      return null;
    }
  }, [file, resolved]);
  const setsEff = useMemo(
    () => [...(setInfo?.data.sets ?? []), ...addedSets].map((s) => applySetEdit(s, setInfoEdits[s.index], resolved)),
    [setInfo, addedSets, setInfoEdits, resolved]
  );
  const setEntry = pickedSet === null ? null : setsEff.find((s) => s.index === pickedSet) ?? null;

  const editSetEntry = (index: number, patch: SetEdit) => {
    if (index >= 1_000_000) {
      setAddedSets((all) => all.map((s) => (s.index === index ? applySetEdit(s, patch, resolved) : s)));
      return;
    }

    setSetInfoEdits((all) => {
      const cur = all[index] ?? {};
      const merged: SetEdit = {
        fields: patch.fields ? { ...cur.fields, ...patch.fields } : cur.fields,
        items: patch.items ?? cur.items,
      };
      const orig = setInfo?.data.sets.find((s) => s.index === index);
      if (orig && setEditIsNoop(orig, merged, resolved)) {
        if (!all[index]) {
          return all;
        }

        const next = { ...all };
        delete next[index];
        return next;
      }

      return { ...all, [index]: merged };
    });
  };
  const revertSetEntry = (index: number) => {
    setSetInfoEdits((all) => {
      if (!all[index]) {
        return all;
      }

      const next = { ...all };
      delete next[index];
      return next;
    });
  };

  const addSet = () => {
    if (!setInfo) {
      return;
    }

    const index = nextIndex.current++;
    const maxId = setsEff.reduce((m, s) => Math.max(m, s.id), 0);
    setAddedSets((all) => [...all, createSet(index, maxId + 1, resolved)]);
    setPickedSet(index);
  };
  const removeSet = (index: number) => {
    if (index >= 1_000_000) {
      setAddedSets((all) => all.filter((s) => s.index !== index));
      if (pickedSet === index) {
        setPickedSet(null);
      }
    } else {
      setRemovedSets((all) => new Set(all).add(index));
    }
  };
  const restoreSet = (index: number) => {
    setRemovedSets((all) => {
      if (!all.has(index)) {
        return all;
      }

      const next = new Set(all);
      next.delete(index);
      return next;
    });
  };


  const createSetFromBuilder = (wearing: ItemEntry[], gender: SetGender) => {
    if (!setInfo || wearing.length === 0) {
      return;
    }

    const index = nextIndex.current++;
    const maxId = setsEff.reduce((m, s) => Math.max(m, s.id), 0);
    const base = createSet(index, maxId + 1, resolved);
    const entry = applySetEdit(
      base,
      {
        fields: { gender },
        items: wearing.map((it) => {
          const price = base.currency === 1 ? it.priceGem : it.priceEPoint;
          return { itemId: it.itemId, price, salePrice: price };
        }),
      },
      resolved
    );
    setAddedSets((all) => [...all, entry]);
    setPane('sets');
    setPickedSet(index);
  };

  const usedAdded = useMemo(() => {
    const names = Object.keys(addedFiles);
    if (names.length === 0) {
      return new Set<string>();
    }

    const refs = new Set<string>();
    for (const t of Object.values(edits))
      for (const e of Object.values(t))
        if (e.slots) {
          for (const v of Object.values(e.slots))
            if (v) {
              refs.add(v.toLowerCase());
            }
        }
    for (const list of Object.values(addedItems))
      for (const it of list)
        for (const sp of it.sprites)
          if (sp.present) {
            refs.add(sp.filename.toLowerCase());
          }
    const existing = new Set((file ? archiveSpriteNames(file) : []).map((n) => n.toLowerCase()));
    return new Set(names.filter((n) => refs.has(n.toLowerCase()) || existing.has(n.toLowerCase())));
  }, [addedFiles, edits, addedItems, file]);

  const dirty =
    Object.values(edits).some((t) => Object.keys(t).length > 0) ||
    Object.keys(setInfoEdits).length > 0 ||
    addedSets.length > 0 ||
    removedSets.size > 0 ||
    Object.values(addedItems).some((a) => a.length > 0) ||
    Object.values(removedItems).some((s) => s.size > 0) ||
    usedAdded.size > 0;
  useEffect(() => {
    reportDirty('avatar', dirty);
    return () => reportDirty('avatar', false);
  }, [dirty]);

  const chipCount = (name: string) => {
    let base = 0;
    try {
      const entry = tables.find((t) => t.name === name);
      if (entry && file) {
        const b = readEntry(file.buffer, entry);
        base = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, true);
      }
    } catch {
    }
    return base + (addedItems[name]?.length ?? 0) - (removedItems[name]?.size ?? 0);
  };

  const addItem = () => {
    if (!table) {
      return;
    }

    const name = table.name;
    const index = nextIndex.current++;
    const maxId = items.reduce((m, i) => Math.max(m, i.itemId), 0);
    const it = createItem(index, maxId + 1, version, resolved);
    setAddedItems((all) => ({ ...all, [name]: [...(all[name] ?? []), it] }));
    setPicked(index);
  };

  const importSprite = async (f: File): Promise<string> => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    setAddedFiles((all) => ({ ...all, [f.name]: bytes }));
    if (file) {
      importedSprites.set(`${file.id}:${f.name.toLowerCase()}`, bytes);
      spriteCache.delete(`${file.id}:${f.name}:true`);
      spriteCache.delete(`${file.id}:${f.name}:false`);
    }

    return f.name;
  };

  const removeItem = (index: number) => {
    if (!table) {
      return;
    }

    const name = table.name;
    if (index >= 1_000_000) {
      setAddedItems((all) => ({ ...all, [name]: (all[name] ?? []).filter((i) => i.index !== index) }));
      if (picked === index) {
        setPicked(null);
      }
    } else {
      setRemovedItems((all) => {
        const s = new Set(all[name] ?? []);
        s.add(index);
        return { ...all, [name]: s };
      });
    }
  };

  const restoreItem = (index: number) => {
    if (!table) {
      return;
    }

    const name = table.name;
    setRemovedItems((all) => {
      if (!all[name]?.has(index)) {
        return all;
      }

      const s = new Set(all[name]);
      s.delete(index);
      return { ...all, [name]: s };
    });
  };

  const editItem = (index: number, patch: Partial<ItemEdit>) => {
    if (!table) {
      return;
    }

    const name = table.name;
    if (index >= 1_000_000) {
      setAddedItems((all) => ({
        ...all,
        [name]: (all[name] ?? []).map((i) => (i.index === index ? applyItemEdit(i, patch, version, resolved) : i)),
      }));
      return;
    }

    setEdits((all) => {
      const forTable = { ...(all[name] ?? {}) };
      const cur = forTable[index] ?? {};
      forTable[index] = {
        fields: patch.fields ? { ...cur.fields, ...patch.fields } : cur.fields,
        slots: patch.slots ? { ...cur.slots, ...patch.slots } : cur.slots,
      };
      return { ...all, [name]: forTable };
    });
  };

  const revertItem = (index: number) => {
    if (!table) {
      return;
    }

    const name = table.name;
    setEdits((all) => {
      if (!all[name]?.[index]) {
        return all;
      }

      const forTable = { ...all[name] };
      delete forTable[index];
      return { ...all, [name]: forTable };
    });
  };

  const exportArchive = async () => {
    if (!file) {
      return;
    }

    try {
      const out = buildAvatarPackage({
        buffer: file.buffer,
        activeTableName: table?.name ?? null,
        versionId,
        activeEncoding: resolved,
        itemEdits: edits,
        addedItems,
        removedItems,
        setEdits: setInfoEdits,
        addedSets,
        removedSets,
        addedFiles,
        usedAddedFiles: usedAdded,
      });
      if (!(await saveFile(out, file.name))) {
        return;
      }

      const [reopened] = await add([new File([out.slice().buffer as ArrayBuffer], file.name)]);
      if (reopened && reopened.id !== file.id) {
        remove(file.id);
      }

      if (reopened) {
        setFileId(reopened.id);
      }

      notify(`Saved ${file.name}.`, 'ok');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not rebuild the archive.', 'warn');
    }
  };

  return (
    <>
      <div className="stickyhead">
        <PageHead
          title="Avatars"
          sub="Build, modify and preview avatar items."
          actions={
            <>
              <select className="selctl" value={versionId} aria-label="Item table layout" onChange={(e) => setVersionId(e.target.value as ItemDataVersionId)}>
                {ITEM_DATA_VERSIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <EncodingSelect
                value={encoding}
                autoLabel={`Auto — ${ENCODINGS.find((entry) => entry.id === (detected ?? 'ascii'))?.label}`}
                onChange={(value) => setEncoding(value)}
              />
            </>
          }
        />

        <FileInputCard>
          <FilePicker
            kinds={['archive']}
            selected={fileId}
            onSelect={(f) => {
              setOpenError(null);
              if (f.id === fileId) {
                return;
              }

              if (dirty) {
                setConfirmFile({ kind: 'switch', id: f.id });
              }
              else {
                setFileId(f.id);
              }
            }}
            onClose={(f) => {
              if (dirty && f.id === fileId) {
                setConfirmFile({ kind: 'close', id: f.id });
                return;
              }

              remove(f.id);
              if (f.id === fileId) {
                setFileId(null);
              }
            }}
            accept=".opa,.opi"
            hint="Avatar package."
            onError={setOpenError}
            after={
              file && parsed.data ? (
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

      {confirmFile && (
        <ConfirmDialog
          title="Unsaved changes"
          body={
            confirmFile.kind === 'close'
              ? 'This package has unsaved changes. Closing it discards them.'
              : 'This package has unsaved changes. Switching packages discards them.'
          }
          confirmLabel="Discard"
          onConfirm={() => {
            const pending = confirmFile;
            setConfirmFile(null);
            if (pending.kind === 'close') {
              remove(pending.id);
              setFileId(null);
            } else {
              setFileId(pending.id);
            }
          }}
          onClose={() => setConfirmFile(null)}
        />
      )}

      {file && tables.length === 0 && (
        <WarningCard>No item table in this archive.</WarningCard>
      )}

      {parsed.error && (
        <WarningCard>{parsed.error} Try another version above.</WarningCard>
      )}

      {file && parsed.data && table && (
        <>
          <section className="card archive avatars">
            <div className="pane-tabs">
              <Tabs
                tabs={[
                  { id: 'items' as const, label: 'Items' },
                  { id: 'sets' as const, label: 'Set Items' },
                  { id: 'builder' as const, label: 'Builder' },
                ]}
                active={pane}
                onChange={setPane}
              />
            </div>
            {pane === 'builder' ? (
              <AvatarBuilder file={file} items={items} hasSetInfo={!!setInfo} onCreateSet={createSetFromBuilder} />
            ) : (
              <>
                <div className="archive-listwrap">
                  {pane === 'items' ? (
                    <AvatarItemsTable
                      items={items}
                      sources={tables.map((entry) => ({ name: entry.name, count: chipCount(entry.name), selected: entry.name === table.name }))}
                      query={query}
                      selected={picked}
                      edits={tableEdits}
                      removed={removedSet}
                      onPick={setPicked}
                      onRemove={removeItem}
                      onRestore={restoreItem}
                      onSource={setTableName}
                      onQuery={setQuery}
                      onAdd={addItem}
                    />
                  ) : (
                    <AvatarSetsTable
                      sets={setsEff}
                      query={query}
                      hasSetInfo={!!setInfo}
                      selected={pickedSet}
                      edits={setInfoEdits}
                      removed={removedSets}
                      source={{
                        name: setInfo?.name ?? 'SetInfoData.ojs',
                        count: (setInfo?.data.sets.length ?? 0) + addedSets.length - removedSets.size,
                        selected: true,
                      }}
                      onQuery={setQuery}
                      onAdd={addSet}
                      onPick={setPickedSet}
                      onRemove={removeSet}
                      onRestore={restoreSet}
                    />
                  )}
                </div>

                <div className="archive-view">
                  {pane === 'sets' ? (
                    setEntry ? (
                      <AvatarSetDetail
                        key={setEntry.index}
                        file={file}
                        set={setEntry}
                        allItems={items}
                        edited={!!setInfoEdits[setEntry.index]}
                        onField={(fields) => editSetEntry(setEntry.index, { fields })}
                        onItems={(list) => editSetEntry(setEntry.index, { items: list })}
                        onRevert={() => revertSetEntry(setEntry.index)}
                      />
                    ) : (
                      <div className="archive-empty">SELECT A SET</div>
                    )
                  ) : item ? (
                    <AvatarItemDetail
                      key={item.index}
                      file={file}
                      item={item}
                      allItems={items}
                      spriteNames={spriteNames}
                      version={version}
                      edited={!!tableEdits?.[item.index]}
                      onField={(patch) => editItem(item.index, { fields: patch })}
                      onSlot={(idx, name) => editItem(item.index, { slots: { [idx]: name } })}
                      onImport={importSprite}
                      onRevert={() => revertItem(item.index)}
                    />
                  ) : (
                    <div className="archive-empty">SELECT AN ITEM</div>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
