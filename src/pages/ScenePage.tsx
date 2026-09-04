import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import {
  DEFAULT_ENCODING,
  parseArchive,
  type Bound,
  type ControlEntry,
  type ControlState,
} from '../o2jam';
import { decodeBmp, type Bitmap } from '../bmp';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilePicker } from '../components/FilePicker';
import { FileInputCard } from '../components/FileInputCard';
import { PageHead } from '../components/Shell';
import { WarningCard } from '../components/WarningCard';
import { useToast } from '../context/ToastContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { reportDirty } from '../dirty';
import { saveFile } from '../save';
import { SceneInspector } from '../components/scene/SceneInspector';
import { SceneNameDialog, SetDeleteDialog, SetIdDialog } from '../components/scene/SceneDialogs';
import { ScenePanel } from '../components/scene/ScenePanel';
import { SceneStage } from '../components/scene/SceneStage';
import { SpritePicker } from '../components/scene/SpritePicker';
import { buildScenePackage } from '../features/scene/package';
import {
  DEFAULT_TEXT,
  boundFileFor,
  boundOfIn,
  boundWithSize,
  ckey,
  defaultSource,
  idHex,
  makeControl,
  type EditFrame,
  type FieldEdit,
  type PosSource,
  type TextStyle,
} from '../features/scene/model';
import {
  allControls,
  blockOrigin as findBlockOrigin,
  createBoundRects,
  createBoundRows,
  decodeAll,
  decodeSpriteFrames,
  effectiveControls,
  labelDraws as createLabelDraws,
  leftoverBounds,
  placeControls,
  readBounds,
  readScene,
  sceneExtent,
  sceneRows,
  selectedRectangles,
  type DecodeCache,
} from '../features/scene/sceneUtils';
import { revertSpriteFrameBounds, spriteFrameBoundsChanged } from '../features/scene/spriteBounds';

export default function ScenePage() {
  const { files, add, remove } = useWorkspace();
  const { notify } = useToast();
  const [confirmFile, setConfirmFile] = useState<{ kind: 'close' | 'switch'; id: string; } | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [stateName, setStateName] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [moveOn, setMoveOn] = useState(false);
  const [showBounds, setShowBounds] = useState(true);
  const [keyOn, setKeyOn] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [frameSel, setFrameSel] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [boundHidden, setBoundHidden] = useState<Set<string>>(new Set());
  const [posSource, setPosSource] = useState<Record<string, PosSource>>({});
  const [spriteEdits, setSpriteEdits] = useState<Record<string, { x: number; y: number; }>>({});
  const [spriteFrames, setSpriteFrames] = useState<Record<string, EditFrame[]>>({});
  const [newSprites, setNewSprites] = useState<Record<string, string>>({});
  const [removedSprites, setRemovedSprites] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(3);
  const [boundEdits, setBoundEdits] = useState<Record<string, Bound>>({});
  const [labels, setLabels] = useState<Record<string, TextStyle>>({});
  const [fieldEdits, setFieldEdits] = useState<Record<string, FieldEdit>>({});
  const [added, setAdded] = useState<Record<string, ControlEntry[]>>({});
  const [addedBounds, setAddedBounds] = useState<Record<string, Bound>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [extraRects, setExtraRects] = useState<Record<string, Bound[]>>({});
  const [removedRects, setRemovedRects] = useState<Set<string>>(new Set());
  const [addedBlocks, setAddedBlocks] = useState<ControlState[]>([]);
  const [removedBlocks, setRemovedBlocks] = useState<Set<string>>(new Set());
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [sceneDialog, setSceneDialog] = useState<'add' | 'rename' | null>(null);
  const [confirmScene, setConfirmScene] = useState(false);
  const [setIdEdits, setSetIdEdits] = useState<Record<string, number>>({});
  const [setDialog, setSetDialog] = useState<{ sid: number; } | null>(null);
  const [orderKeys, setOrderKeys] = useState<Record<string, string[]>>({});
  const [setDelete, setSetDelete] = useState<number | null>(null);
  const [dissolvedSets, setDissolvedSets] = useState<Set<string>>(new Set());
  const [boundFiles, setBoundFiles] = useState<Record<string, string | null>>({});
  const [panels, setPanels] = useState<Record<string, { sprite?: boolean; text?: boolean; }>>({});
  const [picker, setPicker] = useState(false);
  const nextLine = useRef(1_000_001);
  const bgInit = useRef(new Set<string>());

  const file = files.find((f) => f.id === fileId) ?? null;
  const scene = useMemo(() => (file ? readScene(file) : null), [file]);

  // File identity prevents edits from leaking into another archive.
  useEffect(() => {
    setStateName(null);
    setSelected(null);
    setFrameSel({});
    setHidden(new Set());
    setBoundHidden(new Set());
    setBoundEdits({});
    setLabels({});
    setPosSource({});
    setSpriteEdits({});
    setSpriteFrames({});
    setNewSprites({});
    setRemovedSprites(new Set());
    setFieldEdits({});
    setAdded({});
    setAddedBounds({});
    setRemoved(new Set());
    setExtraRects({});
    setRemovedRects(new Set());
    setAddedBlocks([]);
    setRemovedBlocks(new Set());
    setRenames({});
    setSetIdEdits({});
    setOrderKeys({});
    setDissolvedSets(new Set());
    setBoundFiles({});
    setPanels({});
    bgInit.current = new Set();
    nextLine.current = 1_000_001;
  }, [file]);

  const blocks = useMemo(() => {
    if (!scene?.list) {
      return [];
    }

    return [...scene.list.states, ...scene.list.dialogs, ...addedBlocks].filter((b) => !removedBlocks.has(b.name));
  }, [scene, addedBlocks, removedBlocks]);
  const active = blocks.find((b) => b.name === stateName) ?? blocks[0] ?? null;
  const displayName = (n: string) => renames[n] ?? n;
  const mapSetId = (sid: number) => (active ? setIdEdits[`${active.name}:${sid}`] ?? sid : sid);
  const boundFileOf = (block: ControlState): string | null => boundFileFor(block, boundFiles);

  useEffect(() => {
    setSelected(null);
    if (active && !bgInit.current.has(active.name)) {
      bgInit.current.add(active.name);
      const bg = allControls(active)[1];
      if (bg) {
        setBoundHidden((h) => new Set(h).add(ckey(bg)));
      }
    }
  }, [active?.name]);

  const rawBounds = useMemo(
    () => (file && active && boundFileOf(active) ? readBounds(file, boundFileOf(active)!) : []),
    [file, active, boundFiles]
  );
  const bounds = useMemo(
    () => (active ? rawBounds.map((b) => boundEdits[`${active.name}:${b.index}`] ?? b) : rawBounds),
    [rawBounds, boundEdits, active]
  );
  const effBounds = useMemo<(Bound | undefined)[]>(
    () => (active ? bounds.map((b) => (removedRects.has(`${active.name}:${b.index}`) ? undefined : b)) : bounds),
    [bounds, removedRects, active]
  );

  const effControls = useMemo(
    () => (active ? effectiveControls(active, fieldEdits, removed, added, orderKeys, dissolvedSets) : []),
    [active, fieldEdits, removed, added, orderKeys, dissolvedSets]
  );

  const leftovers = useMemo(
    () => (active ? leftoverBounds(active, bounds, removedRects, extraRects) : []),
    [active, bounds, removedRects, extraRects]
  );

  const decodeCache = useRef<DecodeCache>({ file: null, map: new Map() });
  const decoded = useMemo(
    () => (file && active ? decodeAll(file, effControls, keyOn, spriteFrames, decodeCache.current) : []),
    [file, active, effControls, keyOn, spriteFrames]
  );

  const spriteNames = useMemo(() => {
    const byLower = new Map<string, string>();
    if (file) {
      try {
        for (const e of parseArchive(file.buffer, DEFAULT_ENCODING).entries) {
          if (/\.(ojs|oji|ojt|oja)$/i.test(e.name) && !removedSprites.has(e.name.toLowerCase())) {
            byLower.set(e.name.toLowerCase(), e.name);
          }
        }
      } catch {
      }
    }

    for (const [lower, actual] of Object.entries(newSprites)) if (!removedSprites.has(lower)) {
      byLower.set(lower, actual);
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  }, [file, newSprites, removedSprites]);

  const bndNames = useMemo(() => {
    if (!file) {
      return [];
    }

    try {
      return parseArchive(file.buffer, DEFAULT_ENCODING)
        .entries.filter((e) => /\.bnd$/i.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }, [file]);

  const blockOrigin = useMemo(() => findBlockOrigin(effControls, effBounds), [effControls, effBounds]);

  const placed = useMemo(
    () =>
      active
        ? placeControls({
          state: active,
          decoded,
          controls: effControls,
          bounds: effBounds,
          addedBounds,
          hidden,
          origin: blockOrigin,
          sources: posSource,
          spritePositions: spriteEdits,
          setIdEdits,
        })
        : [],
    [active, decoded, effControls, effBounds, addedBounds, hidden, blockOrigin, posSource, spriteEdits, setIdEdits]
  );

  const boundRects = useMemo(
    () =>
      active
        ? createBoundRects({
          state: active,
          controls: effControls,
          bounds: effBounds,
          addedBounds,
          leftovers,
          origin: blockOrigin,
          setIdEdits,
        })
        : [],
    [active, effControls, effBounds, addedBounds, leftovers, blockOrigin, setIdEdits]
  );

  const boundRows = useMemo(
    () => createBoundRows(effControls, effBounds, addedBounds, leftovers),
    [effControls, effBounds, addedBounds, leftovers]
  );

  const editBound = (idx: number, patch: Partial<Bound>) =>
    setBoundEdits((e) => {
      if (!active) {
        return e;
      }

      const key = `${active.name}:${idx}`;
      const found = rawBounds.find((b) => b.index === idx);
      if (!found) {
        return e;
      }

      return { ...e, [key]: boundWithSize({ ...(e[key] ?? found), ...patch }) };
    });

  const editAddedBound = (key: string, patch: Partial<Bound>) =>
    setAddedBounds((e) => {
      const cur = e[key];
      if (!cur) {
        return e;
      }

      return { ...e, [key]: boundWithSize({ ...cur, ...patch }) };
    });

  const setBoundFor = (c: ControlEntry, patch: Partial<Bound>) => (c.boundIndex >= 0 ? editBound(c.boundIndex, patch) : editAddedBound(ckey(c), patch));

  const editField = (key: string, patch: FieldEdit) => setFieldEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  const addRect = () => {
    if (!active) {
      return;
    }

    setExtraRects((m) => {
      const cur = m[active.name] ?? [];
      return { ...m, [active.name]: [...cur, boundWithSize({ index: rawBounds.length + cur.length, left: 40, top: 40, right: 160, bottom: 90, width: 0, height: 0, offset: 0 })] };
    });
  };

  const editExtraRect = (idx: number, patch: Partial<Bound>) =>
    setExtraRects((m) => {
      if (!active) {
        return m;
      }

      const pos = idx - rawBounds.length;
      const cur = m[active.name] ?? [];
      if (!cur[pos]) {
        return m;
      }

      return { ...m, [active.name]: cur.map((b, i) => (i === pos ? boundWithSize({ ...b, ...patch }) : b)) };
    });

  const removeRect = (row: { bound: Bound; control: ControlEntry | null; }) => {
    if (!active) {
      return;
    }

    const { bound: b, control: c } = row;
    if (c && c.boundIndex < 0) {
      setAddedBounds((m) => {
        const n = { ...m };
        delete n[ckey(c)];
        return n;
      });
    } else if (!c && b.index >= rawBounds.length) {
      const pos = b.index - rawBounds.length;
      setExtraRects((m) => ({ ...m, [active.name]: (m[active.name] ?? []).filter((_, i) => i !== pos).map((r, i) => ({ ...r, index: rawBounds.length + i })) }));
    } else {
      setRemovedRects((s) => new Set(s).add(`${active.name}:${b.index}`));
    }
  };

  const addControl = (kind: 'image' | 'text' | 'scroll' = 'image') => {
    if (!active) {
      return;
    }

    const line = nextLine.current++;
    const stateByte = (active.baseId >>> 24) & 0xff;
    const n = added[active.name]?.length ?? 0;
    const type = kind === 'scroll' ? 0x02 : kind === 'text' ? 0x48 : 0x50;
    const token = kind === 'scroll' ? 'IDC_SCROLL_NEW' : kind === 'text' ? 'IDC_TEXT_NEW' : 'IDC_IMAGE_NEW';
    const id = ((stateByte << 24) | (type << 16) | (0xa0 + n)) >>> 0;
    const c = makeControl(id, token, kind === 'scroll' ? 'O2_SBS_VERT 7 100' : '', line);
    const key = ckey(c);
    setAdded((a) => ({ ...a, [active.name]: [...(a[active.name] ?? []), c] }));
    setAddedBounds((m) => ({ ...m, [key]: boundWithSize({ index: -1, left: 40, top: 40, right: 160, bottom: 90, width: 0, height: 0, offset: 0 }) }));
    setOrderKeys((m) => (m[active.name] ? { ...m, [active.name]: [...m[active.name]!, key] } : m));
    setSelected(key);
  };

  const removeControl = (key: string) => {
    if (!active) {
      return;
    }

    if ((added[active.name] ?? []).some((c) => ckey(c) === key)) {
      setAdded((a) => ({ ...a, [active.name]: (a[active.name] ?? []).filter((c) => ckey(c) !== key) }));
      const drop = <T,>(m: Record<string, T>): Record<string, T> => {
        if (!(key in m)) {
          return m;
        }

        const n = { ...m };
        delete n[key];
        return n;
      };
      setAddedBounds(drop);
      setFieldEdits(drop);
      setLabels(drop);
      setPanels(drop);
      setFrameSel(drop);
      setOrderKeys((m) => (m[active.name] ? { ...m, [active.name]: m[active.name]!.filter((k) => k !== key) } : m));
    } else {
      setRemoved((r) => new Set(r).add(key));
    }

    if (selected === key) {
      setSelected(null);
    }
  };

  const restoreControl = (key: string) =>
    setRemoved((r) => {
      const n = new Set(r);
      n.delete(key);
      return n;
    });

  const applySceneDialog = (nameInput: string) => {
    if (!sceneDialog) {
      return;
    }

    const name = nameInput.trim();
    if (!/^\S+$/.test(name)) {
      notify('Scene names cannot contain spaces.', 'warn');
      return;
    }

    const taken = new Set(
      blocks.filter((block) => !(sceneDialog === 'rename' && active && block.name === active.name)).map((block) => displayName(block.name).toLowerCase())
    );
    if (taken.has(name.toLowerCase())) {
      notify(`${name} already exists.`, 'warn');
      return;
    }

    if (sceneDialog === 'add') {
      const stateByte = (Math.max(0, ...blocks.map((b) => (b.baseId >>> 24) & 0xff)) + 1) & 0xff;
      const kind: 'state' | 'dialog' = /^DIALOG/i.test(name) ? 'dialog' : 'state';
      const base = makeControl((stateByte << 24) >>> 0, `IDC_${name}`, '', nextLine.current++);
      const block: ControlState = {
        name,
        kind,
        declaredCount: 0,
        declaredSetCount: kind === 'state' ? 0 : null,
        base,
        baseId: base.id,
        boundFile: `${name}.bnd`,
        controls: [],
        sets: [],
        line: nextLine.current++,
      };
      setAddedBlocks((a) => [...a, block]);
      setStateName(name);
    } else if (active) {
      const key = active.name;
      setRenames((m) => {
        const n = { ...m };
        if (name === key) {
          delete n[key];
        }
        else {
          n[key] = name;
        }

        return n;
      });
    }

    setSceneDialog(null);
  };

  const applySetDialog = (value: string) => {
    if (!setDialog || !active) {
      return;
    }

    const n = parseInt(value.replace(/^0x/i, '') || '', 16);
    if (!Number.isFinite(n)) {
      notify('Not a valid hex id.', 'warn');
      return;
    }

    const key = `${active.name}:${setDialog.sid}`;
    setSetIdEdits((m) => {
      const next = { ...m };
      if ((n >>> 0) === setDialog.sid) {
        delete next[key];
      }
      else {
        next[key] = n >>> 0;
      }

      return next;
    });
    setSetDialog(null);
  };

  const deleteScene = () => {
    if (!active) {
      return;
    }

    const key = active.name;
    const dropKey = <T,>(m: Record<string, T>): Record<string, T> => {
      if (!(key in m)) {
        return m;
      }

      const n = { ...m };
      delete n[key];
      return n;
    };
    if (addedBlocks.some((b) => b.name === key)) {
      setAddedBlocks((a) => a.filter((b) => b.name !== key));
      setAdded(dropKey);
      setExtraRects(dropKey);
      setRenames(dropKey);
      setOrderKeys(dropKey);
      setBoundFiles(dropKey);
      setDissolvedSets((s) => new Set([...s].filter((k) => !k.startsWith(`${key}:`))));
    } else {
      setRemovedBlocks((s) => new Set(s).add(key));
    }

    setStateName(null);
    setSelected(null);
    setConfirmScene(false);
  };

  const readSpriteFrames = useCallback((sprite: string) => (file ? decodeSpriteFrames(file, sprite) : []), [file]);

  const mutateFrames = (sprite: string, fn: (fr: EditFrame[]) => EditFrame[]) =>
    setSpriteFrames((m) => {
      const name = sprite.toLowerCase();
      const cur = m[name] ?? readSpriteFrames(sprite);
      return { ...m, [name]: fn(cur.map((f) => ({ ...f }))) };
    });

  const pickBmp = (onLoad: (bmp: Bitmap) => void) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.bmp,image/bmp';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) {
        return;
      }

      f.arrayBuffer().then((buf) => {
        const bmp = decodeBmp(new Uint8Array(buf));
        if (bmp) {
          setOpenError(null);
          onLoad(bmp);
        } else {
          setOpenError(`${f.name} is not a readable 24/32-bit BMP.`);
        }
      }).catch((error) => setOpenError(error instanceof Error ? error.message : `Could not open ${f.name}.`));
    };
    inp.click();
  };

  const replaceFrame = (sprite: string, i: number) =>
    pickBmp((bmp) =>
      mutateFrames(sprite, (fr) => {
        if (fr[i]) {
          fr[i] = { ...fr[i], width: bmp.width, height: bmp.height, rgba: bmp.rgba };
        }

        return fr;
      })
    );
  const removeFrame = (sprite: string, i: number) => mutateFrames(sprite, (fr) => (fr.length > 1 ? fr.filter((_, k) => k !== i) : fr));
  const addFrame = (sprite: string) => pickBmp((bmp) => mutateFrames(sprite, (fr) => [...fr, { width: bmp.width, height: bmp.height, x: 0, y: 0, rgba: bmp.rgba }]));

  const addFrameFiles = (sprite: string, files: File[]) => {
    void (async () => {
      const add: Bitmap[] = [];
      for (const f of files) {
        try {
          const bmp = decodeBmp(new Uint8Array(await f.arrayBuffer()));
          if (bmp) {
            add.push(bmp);
          }
          else {
            setOpenError(`${f.name} is not a readable 24/32-bit BMP.`);
          }
        } catch (error) {
          setOpenError(error instanceof Error ? error.message : `Could not open ${f.name}.`);
        }
      }
      if (add.length) {
        if (add.length === files.length) {
          setOpenError(null);
        }

        mutateFrames(sprite, (fr) => [...fr, ...add.map((b) => ({ width: b.width, height: b.height, x: 0, y: 0, rgba: b.rgba }))]);
      }
    })();
  };

  const addOjs = (name: string) => {
    const nm = name.trim();
    if (!nm) {
      return;
    }

    const lower = nm.toLowerCase();
    setRemovedSprites((s) => {
      if (!s.has(lower)) {
        return s;
      }

      const n = new Set(s);
      n.delete(lower);
      return n;
    });
    setNewSprites((m) => ({ ...m, [lower]: nm }));
    setSpriteFrames((m) => (m[lower] ? m : { ...m, [lower]: [{ width: 32, height: 32, x: 0, y: 0, rgba: new Uint8ClampedArray(32 * 32 * 4) }] }));
  };

  const removeOjs = (name: string) => {
    const lower = name.toLowerCase();
    const wasNew = !!newSprites[lower];
    setNewSprites((m) => {
      if (!m[lower]) {
        return m;
      }

      const n = { ...m };
      delete n[lower];
      return n;
    });
    setSpriteFrames((m) => {
      if (!m[lower]) {
        return m;
      }

      const n = { ...m };
      delete n[lower];
      return n;
    });
    if (!wasNew) {
      setRemovedSprites((s) => new Set(s).add(lower));
    }
  };

  const extent = useMemo(() => sceneExtent(placed, boundRects), [placed, boundRects]);

  const tree = useMemo(
    () => (active ? sceneRows(active, fieldEdits, added, orderKeys, dissolvedSets) : { rows: [], ordered: [] }),
    [active, fieldEdits, added, orderKeys, dissolvedSets]
  );
  const rows = tree.rows;
  const treeControls = tree.ordered;

  const nonBaseOrdered = active ? treeControls.slice(active.base ? 1 : 0) : [];

  const reorderRow = (dragKey: string, dragScope: 'unit' | 'member', targetKey: string, after: boolean) => {
    if (!active || dragKey === targetKey) {
      return;
    }

    const list = nonBaseOrdered;
    const keys = list.map(ckey);
    const di = keys.indexOf(dragKey);
    const ti = keys.indexOf(targetKey);
    if (di < 0 || ti < 0) {
      return;
    }

    const dragC = list[di]!;
    if (dragScope === 'unit' && dragC.setId !== null) {
      const runOf = (i: number): [number, number] => {
        const sid = list[i]!.setId;
        let s = i;
        let e = i;
        if (sid !== null) {
          while (s > 0 && list[s - 1]!.setId === sid) s--;
          while (e < list.length - 1 && list[e + 1]!.setId === sid) e++;
        }

        return [s, e];
      };
      const [ds, de] = runOf(di);
      const [ts, te] = runOf(ti);
      if (ti >= ds && ti <= de) {
        return;
      }

      const slice = keys.slice(ds, de + 1);
      const rest = [...keys.slice(0, ds), ...keys.slice(de + 1)];
      const anchor = after ? keys[te]! : keys[ts]!;
      const pos = rest.indexOf(anchor) + (after ? 1 : 0);
      setOrderKeys((m) => ({ ...m, [active.name]: [...rest.slice(0, pos), ...slice, ...rest.slice(pos)] }));
      return;
    }

    const destSid = list[ti]!.setId;
    if (destSid !== dragC.setId) {
      editField(dragKey, { setId: destSid });
    }

    const without = keys.filter((k) => k !== dragKey);
    const pos = without.indexOf(targetKey) + (after ? 1 : 0);
    setOrderKeys((m) => ({ ...m, [active.name]: [...without.slice(0, pos), dragKey, ...without.slice(pos)] }));
  };

  const addSet = () => {
    if (!active) {
      return null;
    }

    const line = nextLine.current++;
    const stateByte = (active.baseId >>> 24) & 0xff;
    const n = added[active.name]?.length ?? 0;
    const sid = (0x00010000 | ((0xa0 + n) << 8)) >>> 0;
    const id = ((stateByte << 24) | 0x00600000 | (0xa0 + n)) >>> 0;
    const c = { ...makeControl(id, 'IDC_SET_MEMBER_NEW', '', line), setId: sid };
    const key = ckey(c);
    setAdded((a) => ({ ...a, [active.name]: [...(a[active.name] ?? []), c] }));
    setAddedBounds((m) => ({ ...m, [key]: boundWithSize({ index: -1, left: 40, top: 40, right: 160, bottom: 90, width: 0, height: 0, offset: 0 }) }));
    setOrderKeys((m) => (m[active.name] ? { ...m, [active.name]: [...m[active.name]!, key] } : m));
    setSelected(key);
    return sid;
  };

  const applySetDelete = (mode: 'delete' | 'dissolve') => {
    if (setDelete === null || !active) {
      return;
    }

    if (mode === 'dissolve') {
      setDissolvedSets((s) => new Set(s).add(`${active.name}:${setDelete}`));
    } else {
      for (const c of nonBaseOrdered) if (c.setId === setDelete) {
        removeControl(ckey(c));
      }
    }

    setSetDelete(null);
  };

  const restoreSet = (sid: number) => {
    if (!active) {
      return;
    }

    const dk = `${active.name}:${sid}`;
    if (dissolvedSets.has(dk)) {
      setDissolvedSets((s) => {
        const n = new Set(s);
        n.delete(dk);
        return n;
      });
      return;
    }

    for (const c of nonBaseOrdered) if (c.setId === sid && removed.has(ckey(c))) {
      restoreControl(ckey(c));
    }
  };

  const orderEdited =
    !!active &&
    (!!orderKeys[active.name] ||
      [...dissolvedSets].some((k) => k.startsWith(`${active.name}:`)) ||
      treeControls.some((c) => fieldEdits[ckey(c)]?.setId !== undefined));

  const revertOrder = () => {
    if (!active) {
      return;
    }

    setOrderKeys((m) => {
      if (!(active.name in m)) {
        return m;
      }

      const n = { ...m };
      delete n[active.name];
      return n;
    });
    setDissolvedSets((s) => new Set([...s].filter((k) => !k.startsWith(`${active.name}:`))));
    const keys = new Set(treeControls.map(ckey));
    setFieldEdits((m) => {
      const n: Record<string, FieldEdit> = {};
      for (const [k, v] of Object.entries(m)) {
        if (keys.has(k) && v.setId !== undefined) {
          const { setId: _drop, ...rest } = v;
          if (Object.keys(rest).length) {
            n[k] = rest;
          }
        } else {
          n[k] = v;
        }
      }
      return n;
    });
  };
  const drawnKeys = useMemo(() => new Set(placed.map((p) => ckey(p.control))), [placed]);
  const selectedControl = effControls.find((c) => ckey(c) === selected) ?? null;
  const selectedPlaced = placed.find((p) => ckey(p.control) === selected) ?? null;
  const selectedBound = selectedControl ? boundOfIn(selectedControl, effBounds, addedBounds) : undefined;
  const selectedDecoded = decoded.find((d) => ckey(d.control) === selected) ?? null;
  const selDelta = (() => {
    if (!selectedControl?.sprite || !selectedDecoded) {
      return { x: 0, y: 0 };
    }

    const e = spriteEdits[selectedControl.sprite.toLowerCase()];
    return e ? { x: e.x - selectedDecoded.fx, y: e.y - selectedDecoded.fy } : { x: 0, y: 0 };
  })();
  const selSpriteRows =
    selectedControl?.sprite && selectedDecoded
      ? selectedDecoded.fpos.map((p, i) => ({
        x: p.x + selDelta.x,
        y: p.y + selDelta.y,
        w: selectedDecoded.frames[i]?.width ?? 0,
        h: selectedDecoded.frames[i]?.height ?? 0,
      }))
      : null;
  const selCanSwitch = !!(selectedControl && selectedControl.setId === null && selectedControl.sprite);
  const selSource: PosSource = selectedControl && selectedControl.setId === null ? posSource[selected!] ?? defaultSource(selectedControl) : 'bound';

  const rawSelected = active && selected ? [...allControls(active), ...(added[active.name] ?? [])].find((c) => ckey(c) === selected) ?? null : null;
  const selBoundKey = selectedControl && active && selectedControl.boundIndex >= 0 ? `${active.name}:${selectedControl.boundIndex}` : null;
  const selSpriteKeys = [...new Set([selectedControl?.sprite, rawSelected?.sprite].filter((s): s is string => !!s).map((s) => s.toLowerCase()))];
  const selEdited =
    !!selected &&
    (!!fieldEdits[selected] ||
      !!labels[selected] ||
      !!panels[selected] ||
      (selBoundKey !== null && (!!boundEdits[selBoundKey] || removedRects.has(selBoundKey))) ||
      selSpriteKeys.some((k) => spriteFrames[k] || spriteEdits[k] || newSprites[k] || removedSprites.has(k)));

  const revertControl = () => {
    if (!selected) {
      return;
    }

    const drop = <T,>(m: Record<string, T>, k: string) => {
      if (!(k in m)) {
        return m;
      }

      const n = { ...m };
      delete n[k];
      return n;
    };
    setFieldEdits((e) => drop(e, selected));
    setLabels((m) => drop(m, selected));
    setPanels((p) => drop(p, selected));
    setFrameSel((s) => drop(s, selected));
    if (selBoundKey) {
      setBoundEdits((e) => drop(e, selBoundKey));
      setRemovedRects((s) => {
        if (!s.has(selBoundKey)) {
          return s;
        }

        const n = new Set(s);
        n.delete(selBoundKey);
        return n;
      });
    }

    for (const k of selSpriteKeys) {
      setSpriteFrames((m) => drop(m, k));
      setSpriteEdits((m) => drop(m, k));
      setNewSprites((m) => drop(m, k));
      setRemovedSprites((s) => {
        if (!s.has(k)) {
          return s;
        }

        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  };

  const selectedRects = useMemo(
    () => selectedRectangles(selected, placed, boundRects, frameSel),
    [selected, placed, boundRects, frameSel]
  );
  const labelDraws = useMemo(
    () => createLabelDraws(labels, boundRects, placed),
    [labels, boundRects, placed]
  );
  const textHitRects = useMemo(() => {
    const keys = new Set(effControls.filter((control) => /^IDC_(TEXT|EDIT)/.test(control.token)).map(ckey));
    return boundRects.filter((rect): rect is typeof rect & { key: string; } => !!rect.key && keys.has(rect.key));
  }, [effControls, boundRects]);

  const dirty =
    Object.keys(fieldEdits).length > 0 ||
    Object.keys(boundEdits).length > 0 ||
    Object.keys(spriteFrames).length > 0 ||
    Object.keys(spriteEdits).length > 0 ||
    Object.keys(newSprites).length > 0 ||
    removedSprites.size > 0 ||
    Object.values(added).some((a) => a.length > 0) ||
    Object.values(extraRects).some((a) => a.length > 0) ||
    removedRects.size > 0 ||
    removed.size > 0 ||
    addedBlocks.length > 0 ||
    removedBlocks.size > 0 ||
    Object.keys(renames).length > 0 ||
    Object.keys(setIdEdits).length > 0 ||
    Object.keys(orderKeys).length > 0 ||
    dissolvedSets.size > 0 ||
    Object.keys(boundFiles).length > 0;

  const activeSpriteNames = new Set(effControls.map((control) => control.sprite.toLowerCase()).filter(Boolean));
  const spriteBoundsEdited = [...activeSpriteNames].some((name) => {
    if (spriteEdits[name]) {
      return true;
    }

    const frames = spriteFrames[name];
    return !!frames && spriteFrameBoundsChanged(frames, readSpriteFrames(name));
  });
  const boundsEdited =
    !!active &&
    (Object.keys(boundEdits).some((k) => k.startsWith(`${active.name}:`)) ||
      (extraRects[active.name]?.length ?? 0) > 0 ||
      [...removedRects].some((k) => k.startsWith(`${active.name}:`)) ||
      boundFiles[active.name] !== undefined ||
      spriteBoundsEdited);

  const revertBounds = () => {
    if (!active) {
      return;
    }

    setBoundEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${active.name}:`))));
    setExtraRects((m) => {
      if (!(active.name in m)) {
        return m;
      }

      const n = { ...m };
      delete n[active.name];
      return n;
    });
    setRemovedRects((s) => new Set([...s].filter((k) => !k.startsWith(`${active.name}:`))));
    setSpriteEdits((edits) => Object.fromEntries(Object.entries(edits).filter(([name]) => !activeSpriteNames.has(name))));
    setSpriteFrames((overrides) => {
      const next = { ...overrides };
      for (const name of activeSpriteNames) {
        const frames = next[name];
        if (!frames) {
          continue;
        }

        const original = readSpriteFrames(name);
        if (!spriteFrameBoundsChanged(frames, original)) {
          continue;
        }

        const reverted = revertSpriteFrameBounds(frames, original);
        if (reverted) {
          next[name] = reverted;
        } else {
          delete next[name];
        }
      }
      return next;
    });
    setBoundFiles((m) => {
      if (!(active.name in m)) {
        return m;
      }

      const n = { ...m };
      delete n[active.name];
      return n;
    });
  };

  useEffect(() => {
    reportDirty('scene', dirty);
    return () => reportDirty('scene', false);
  }, [dirty]);

  const exportArchive = async () => {
    if (!file || !scene?.list) {
      return;
    }

    try {
      const out = buildScenePackage({
        file,
        list: scene.list,
        encoding: scene.encoding,
        fieldEdits,
        boundEdits,
        addedControls: added,
        addedBounds,
        removedControls: removed,
        extraBounds: extraRects,
        removedBounds: removedRects,
        addedBlocks,
        removedBlocks,
        renames,
        setIdEdits,
        orderKeys,
        dissolvedSets,
        boundFiles,
        spriteFrames,
        spritePositions: spriteEdits,
        newSprites,
        removedSprites,
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

  const toggleHidden = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleBound = (id: string) =>
    setBoundHidden((h) => {
      const next = new Set(h);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const shownBoundRects = useMemo(() => boundRects.filter((r) => !(r.key && boundHidden.has(r.key))), [boundRects, boundHidden]);

  const toggleSource = (c: ControlEntry) => {
    const key = ckey(c);
    const next: PosSource = (posSource[key] ?? defaultSource(c)) === 'sprite' ? 'bound' : 'sprite';
    setPosSource((s) => ({ ...s, [key]: next }));
  };

  const editSpriteRow = (sprite: string, i: number, patch: { x?: number; y?: number; }) => {
    const name = sprite.toLowerCase();
    const d = { ...selDelta };
    mutateFrames(sprite, (fr) =>
      fr.map((f, k) => ({
        ...f,
        x: k === i && patch.x !== undefined ? patch.x : f.x + d.x,
        y: k === i && patch.y !== undefined ? patch.y : f.y + d.y,
      }))
    );
    if (d.x || d.y) {
      setSpriteEdits((e) => {
        const n = { ...e };
        delete n[name];
        return n;
      });
    }
  };

  const drag = useRef<
    | { mode: 'bound'; control: ControlEntry; wx: number; wy: number; base: { left: number; top: number; right: number; bottom: number; }; }
    | { mode: 'sprite'; sprite: string; wx: number; wy: number; base: { x: number; y: number; }; }
    | null
  >(null);

  const onGrab = (key: string, wx: number, wy: number) => {
    setSelected(key);
    const c = effControls.find((k) => ckey(k) === key) ?? null;
    if (!c) {
      return;
    }

    const src: PosSource = c.setId === null ? posSource[key] ?? defaultSource(c) : 'bound';
    if (src === 'sprite' && c.sprite) {
      const d = decoded.find((dd) => ckey(dd.control) === key);
      const cur = spriteEdits[c.sprite.toLowerCase()] ?? { x: d?.fx ?? 0, y: d?.fy ?? 0 };
      drag.current = { mode: 'sprite', sprite: c.sprite, wx, wy, base: { ...cur } };
    } else {
      const b = boundOfIn(c, effBounds, addedBounds);
      if (b) {
        drag.current = { mode: 'bound', control: c, wx, wy, base: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } };
      }
    }
  };
  const onDrag = (wx: number, wy: number) => {
    const d = drag.current;
    if (!d) {
      return;
    }

    const dx = Math.round(wx - d.wx);
    const dy = Math.round(wy - d.wy);
    if (d.mode === 'sprite') {
      const name = d.sprite.toLowerCase();
      setSpriteEdits((e) => ({ ...e, [name]: { x: d.base.x + dx, y: d.base.y + dy } }));
    } else {
      setBoundFor(d.control, { left: d.base.left + dx, top: d.base.top + dy, right: d.base.right + dx, bottom: d.base.bottom + dy });
    }
  };
  const onDrop = () => {
    drag.current = null;
  };

  return (
    <>
      <div className="stickyhead">
        <PageHead title="Scene Composer" sub="Customize the scene graph of the interface." />
        <FileInputCard>
          <FilePicker
            kinds={['archive']}
            selected={fileId}
            onSelect={(workspaceFile) => {
              setOpenError(null);
              if (workspaceFile.id === fileId) {
                return;
              }

              if (dirty) {
                setConfirmFile({ kind: 'switch', id: workspaceFile.id });
              }
              else {
                setFileId(workspaceFile.id);
              }
            }}
            onClose={(workspaceFile) => {
              if (dirty && workspaceFile.id === fileId) {
                setConfirmFile({ kind: 'close', id: workspaceFile.id });
                return;
              }

              remove(workspaceFile.id);
              if (workspaceFile.id === fileId) {
                setFileId(null);
              }
            }}
            accept=".opi,.opa"
            hint="Interface or Playing package."
            onError={setOpenError}
            after={
              file && scene?.list ? (
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

      {file && scene?.error && (
        <WarningCard>{scene.error}</WarningCard>
      )}

      {file && scene?.list && active && (
        <>
          <section className="card composer-wrap">
            <SceneStage
              scenes={blocks.map((block) => ({ name: block.name, label: displayName(block.name) }))}
              active={active.name}
              placed={placed}
              boundRects={shownBoundRects}
              hitRects={boundRects}
              textHitRects={textHitRects}
              labelDraws={labelDraws}
              selectedRects={selectedRects}
              extent={extent}
              zoom={zoom}
              playing={playing}
              fps={fps}
              transparent={keyOn}
              showBounds={showBounds}
              moveMode={moveOn}
              frameSelection={frameSel}
              onScene={setStateName}
              onAddScene={() => setSceneDialog('add')}
              onDeleteScene={() => setConfirmScene(true)}
              onRenameScene={() => setSceneDialog('rename')}
              onZoom={setZoom}
              onPlaying={setPlaying}
              onFps={setFps}
              onTransparent={setKeyOn}
              onShowBounds={setShowBounds}
              onMoveMode={setMoveOn}
              onSelect={setSelected}
              onGrab={onGrab}
              onDrag={onDrag}
              onDrop={onDrop}
            />

            <ScenePanel
              sceneKey={file.id}
              controls={{
                rows,
                selected,
                drawn: drawnKeys,
                hidden,
                boundHidden,
                removed,
                posSource,
                showBounds,
                orderEdited,
                onSelect: setSelected,
                onToggleHidden: toggleHidden,
                onToggleBound: toggleBound,
                onToggleSource: toggleSource,
                onRestore: restoreControl,
                setLabel: (setId) => idHex(mapSetId(setId)),
                onEditSet: (setId) => setSetDialog({ sid: setId }),
                onDeleteSet: setSetDelete,
                onRestoreSet: restoreSet,
                onReorder: reorderRow,
                onAddControl: addControl,
                onAddSet: addSet,
                onRevertOrder: revertOrder,
              }}
              bounds={{
                fileName: boundFileOf(active),
                newFileName: `${displayName(active.name)}.bnd`,
                fileNames: bndNames,
                rows: boundRows,
                edited: boundsEdited,
                onAdd: addRect,
                onRevert: revertBounds,
                onFileChange: (name) =>
                  setBoundFiles((current) => {
                    if (name === active.boundFile) {
                      const next = { ...current };
                      delete next[active.name];
                      return next;
                    }

                    return { ...current, [active.name]: name };
                  }),
                onEdit: (row, patch) =>
                  row.control
                    ? setBoundFor(row.control, patch)
                    : row.bound.index >= rawBounds.length
                      ? editExtraRect(row.bound.index, patch)
                      : editBound(row.bound.index, patch),
                onRemove: removeRect,
              }}
              inspector={
                selectedControl ? (
                  <SceneInspector
                    control={selectedControl}
                    placed={selectedPlaced}
                    bound={selectedBound}
                    frame={frameSel[selected!] ?? 0}
                    off={hidden.has(selected!)}
                    boundOff={boundHidden.has(selected!)}
                    showBounds={showBounds}
                    source={selSource}
                    canSwitch={selCanSwitch}
                    spriteRows={selSpriteRows}
                    spriteMissing={!!selectedControl.sprite && !selectedDecoded}
                    spriteOn={panels[selected!]?.sprite ?? !!selectedControl.sprite}
                    textOn={panels[selected!]?.text ?? (/^IDC_(TEXT|EDIT)/.test(selectedControl.token) || !!labels[selected!]?.text.trim())}
                    style={labels[selected!] ?? DEFAULT_TEXT}
                    edited={selEdited}
                    onRevert={revertControl}
                    onField={(patch) => editField(selected!, patch)}
                    onFrame={(frame) => {
                      setPlaying(false);
                      setFrameSel((current) => ({ ...current, [selected!]: frame }));
                    }}
                    onBound={(patch) => setBoundFor(selectedControl, patch)}
                    onSpriteRow={(index, patch) => selectedControl.sprite && editSpriteRow(selectedControl.sprite, index, patch)}
                    onBrowse={() => setPicker(true)}
                    onRemove={() => removeControl(selected!)}
                    onReplaceFrame={(index) => selectedControl.sprite && replaceFrame(selectedControl.sprite, index)}
                    onRemoveFrame={(index) => selectedControl.sprite && removeFrame(selectedControl.sprite, index)}
                    onAddFrame={() => selectedControl.sprite && addFrame(selectedControl.sprite)}
                    onAddFrameFiles={(files) => selectedControl.sprite && addFrameFiles(selectedControl.sprite, files)}
                    onAddSprite={() => setPanels((current) => ({ ...current, [selected!]: { ...current[selected!], sprite: true } }))}
                    onAddText={() => setPanels((current) => ({ ...current, [selected!]: { ...current[selected!], text: true } }))}
                    onRemoveSprite={() => {
                      setPanels((current) => ({ ...current, [selected!]: { ...current[selected!], sprite: false } }));
                      editField(selected!, { sprite: '' });
                    }}
                    onRemoveText={() => {
                      setPanels((current) => ({ ...current, [selected!]: { ...current[selected!], text: false } }));
                      setLabels((current) => {
                        const next = { ...current };
                        delete next[selected!];
                        return next;
                      });
                    }}
                    onToggleHidden={() => toggleHidden(selected!)}
                    onToggleBound={() => toggleBound(selected!)}
                    onToggleSource={() => toggleSource(selectedControl)}
                    onStyle={(patch) => setLabels((current) => ({ ...current, [selected!]: { ...(current[selected!] ?? DEFAULT_TEXT), ...patch } }))}
                  />
                ) : (
                  <div className="archive-empty">SELECT A CONTROL</div>
                )
              }
            />
          </section>

          {picker && selectedControl && (
            <SpritePicker
              names={spriteNames}
              current={selectedControl.sprite}
              newLower={new Set(Object.keys(newSprites))}
              spriteFrames={spriteFrames}
              decodeFrames={readSpriteFrames}
              onPick={(name) => {
                editField(selected!, { sprite: name });
                setPicker(false);
              }}
              onClose={() => setPicker(false)}
              onAddOjs={addOjs}
              onRemoveOjs={removeOjs}
              onReplaceFrame={replaceFrame}
              onRemoveFrame={removeFrame}
              onAddFrame={addFrame}
              onAddFrameFiles={addFrameFiles}
            />
          )}

          {sceneDialog && (
            <SceneNameDialog
              key={`${sceneDialog}:${active.name}`}
              mode={sceneDialog}
              initialName={sceneDialog === 'add' ? 'STATE_NEW' : displayName(active.name)}
              onClose={() => setSceneDialog(null)}
              onSubmit={applySceneDialog}
            />
          )}
          {setDialog && (
            <SetIdDialog
              key={`${active.name}:${setDialog.sid}`}
              initialValue={idHex(mapSetId(setDialog.sid))}
              onClose={() => setSetDialog(null)}
              onSubmit={applySetDialog}
            />
          )}
          {setDelete !== null && (
            <SetDeleteDialog
              count={nonBaseOrdered.filter((control) => control.setId === setDelete).length}
              onClose={() => setSetDelete(null)}
              onDelete={applySetDelete}
            />
          )}
          {confirmScene && (
            <ConfirmDialog
              title="Delete scene?"
              body={`This deletes ${displayName(active.name)} and its controls from the ControlList when you save.`}
              confirmLabel="Delete Scene"
              onConfirm={deleteScene}
              onClose={() => setConfirmScene(false)}
            />
          )}
          {confirmFile && (
            <ConfirmDialog
              title="Unsaved changes"
              body={
                confirmFile.kind === 'close'
                  ? 'This archive has unsaved changes. Closing it discards them.'
                  : 'This archive has unsaved changes. Switching archives discards them.'
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
        </>
      )}
    </>
  );
}
