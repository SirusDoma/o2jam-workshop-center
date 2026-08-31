import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  MUSIC_LIST_VERSIONS,
  OJN_HEADER_SIZE,
  buildMusicList,
  chartHeaderBlock,
  decodeText,
  decryptOjn,
  detectMusicListVersion,
  detectOjnHeaderEncoding,
  isEncryptedOjn,
  musicListVersion,
  parseMusicList,
  type ListValue,
  type MusicListVersionId,
  type O2Encoding,
} from '../o2jam';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DownloadButton } from '../components/CopyButton';
import { EncodingSelect } from '../components/EncodingSelect';
import { DropZone } from '../components/DropZone';
import { FileInputCard } from '../components/FileInputCard';
import { PageHead } from '../components/Shell';
import { WarningCard } from '../components/WarningCard';
import { useToast } from '../context/ToastContext';
import { reportDirty } from '../dirty';
import { SectionEditor } from '../components/music-list/SectionEditor';
import { MusicListTable } from '../components/music-list/MusicListTable';
import type { EditChart, SectionRows } from '../features/music-list/types';

interface Baseline {
  versionId: MusicListVersionId;
  encoding: O2Encoding;
  blocks: Map<number, Uint8Array>;
  sections: SectionRows;
}

function snapshot(charts: readonly EditChart[], sections: SectionRows, versionId: MusicListVersionId, encoding: O2Encoding): Baseline {
  return {
    versionId,
    encoding,
    blocks: new Map(charts.map((c) => [chartId(c.block), c.block])),
    sections: Object.fromEntries(Object.entries(sections).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])),
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

let counter = 0;

const session: {
  versionId: MusicListVersionId;
  encoding: O2Encoding;
  charts: EditChart[];
  sections: SectionRows;
  baseline: Baseline;
  sectionsOpen: boolean;
} = {
  versionId: '3.82',
  encoding: 'ascii',
  charts: [],
  sections: {},
  baseline: snapshot([], {}, '3.82', 'ascii'),
  sectionsOpen: false,
};

export default function MusicListPage() {
  const { notify } = useToast();
  const [versionId, setVersionId] = useState<MusicListVersionId>(session.versionId);
  const [encoding, setEncoding] = useState<O2Encoding>(session.encoding);
  const [charts, setCharts] = useState<EditChart[]>(session.charts);
  const [sections, setSections] = useState<SectionRows>(session.sections);
  const [baseline, setBaseline] = useState<Baseline>(session.baseline);
  const [openError, setOpenError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'open'; files: File[] } | { kind: 'clear' } | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(session.sectionsOpen);

  useEffect(() => {
    Object.assign(session, { versionId, encoding, charts, sections, baseline, sectionsOpen });
  });

  const version = musicListVersion(versionId);

  const changedSongs = useMemo(() => {
    const out = new Set<number>();
    for (const sec of version.sections) {
      const group = (rows?: Record<string, ListValue>[]) => {
        const m = new Map<number, string>();
        for (const r of rows ?? []) {
          const id = Number(r.musicId) || 0;
          const vals = JSON.stringify(sec.fields.map((f) => r[f.key] ?? null));
          m.set(id, (m.get(id) ?? '') + vals);
        }
        return m;
      };
      const now = group(sections[sec.key]);
      const was = group(baseline.sections[sec.key]);
      for (const id of new Set([...now.keys(), ...was.keys()])) {
        if (now.get(id) !== was.get(id)) out.add(id);
      }
    }
    for (const c of charts) {
      const id = chartId(c.block);
      const base = baseline.blocks.get(id);
      if (!base || !bytesEqual(base, c.block)) out.add(id);
    }
    return out;
  }, [charts, sections, baseline, version]);

  const dirty = useMemo(() => {
    if (changedSongs.size > 0) return true;
    if ([...baseline.blocks.keys()].some((id) => !charts.some((c) => chartId(c.block) === id))) return true;
    if (charts.length === 0 && baseline.blocks.size === 0) return false;
    return versionId !== baseline.versionId || encoding !== baseline.encoding;
  }, [changedSongs, charts, baseline, versionId, encoding]);

  useEffect(() => {
    reportDirty('musiclist', dirty);
  }, [dirty]);

  const load = (files: File[]) => {
    void (async () => {
      const errors: string[] = [];
      const dat = files.find((f) => f.name.toLowerCase().endsWith('.dat'));
      const ojns = files.filter((f) => f.name.toLowerCase().endsWith('.ojn'));

      if (dat) {
        try {
          const buf = await dat.arrayBuffer();
          const bytes = new Uint8Array(buf);
          if (bytes.length < 4 + OJN_HEADER_SIZE || !decodeText(bytes.subarray(8, 12), 'ascii').startsWith('ojn')) {
            throw new Error(`${dat.name} is not a music list — no readable song headers.`);
          }
          const best = detectMusicListVersion(buf, dat.name) ?? versionId;
          setVersionId(best);
          const result = parseMusicList(buf, best, encoding);
          const loaded = result.charts.map((c) => {
            const block = bytes.slice(c.offset, c.offset + OJN_HEADER_SIZE);
            return {
              key: counter++,
              block,
              source: dat.name,
              encrypted: false,
              detected: detectOjnHeaderEncoding(block) ?? undefined,
            };
          });
          const rows: SectionRows = {};
          for (const s of result.sections) if (s.present && s.entries.length) rows[s.key] = s.entries.map((e) => ({ ...e.values }));
          setCharts(loaded);
          setSections(rows);
          setBaseline(snapshot(loaded, rows, best, encoding));
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Could not read that list.');
        }
      }

      const added: EditChart[] = [];
      for (const f of ojns) {
        try {
          const buf = await f.arrayBuffer();
          const encrypted = isEncryptedOjn(buf);
          const data = encrypted ? new Uint8Array(decryptOjn(buf)) : new Uint8Array(buf);
          const block = chartHeaderBlock(data);
          added.push({
            key: counter++,
            block,
            source: f.name,
            encrypted,
            detected: detectOjnHeaderEncoding(block) ?? undefined,
          });
        } catch {
          errors.push(`${f.name} is not a readable OJN file.`);
        }
      }
      if (added.length) {
        let updated = 0;
        setCharts((prev) => {
          const next = [...prev];
          let replaced = 0;
          for (const chart of added) {
            const id = chartId(chart.block);
            const i = next.findIndex((c) => chartId(c.block) === id);
            if (i >= 0) {
              next[i] = { ...chart, key: next[i]!.key };
              replaced++;
            } else {
              next.push(chart);
            }
          }
          updated = replaced;
          return next;
        });
        window.setTimeout(() => {
          if (updated > 0) notify(`Updated ${updated} existing song${updated === 1 ? '' : 's'} by music ID.`, 'info');
        }, 0);
      }
      if (errors.length) setOpenError(errors.join(' '));
    })();
  };

  const ingest = (files: File[]) => {
    setOpenError(null);
    const replaces = files.some((f) => f.name.toLowerCase().endsWith('.dat'));
    if (replaces && dirty) setConfirm({ kind: 'open', files });
    else load(files);
  };

  const doClear = () => {
    setCharts([]);
    setSections({});
    setBaseline(snapshot([], {}, versionId, encoding));
  };

  const output = useMemo(() => {
    if (charts.length === 0) return null;
    try {
      const secInput = version.sections
        .map((s) => ({ key: s.key, entries: sections[s.key] ?? [] }))
        .filter((s) => s.entries.length > 0);
      return buildMusicList(charts.map((c) => c.block), secInput, versionId, encoding);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not build the list.', 'warn');
      return null;
    }
  }, [charts, sections, versionId, encoding, version, notify]);

  const stickyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stickyRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const set = () => parent.style.setProperty('--pin', `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      parent.style.removeProperty('--pin');
    };
  }, []);

  return (
    <>
      <div className="stickyhead" ref={stickyRef}>
      <PageHead
        title="Music List"
        sub="Read or build OJNList.dat for any client version."
        actions={
          <>
            <select className="selctl" value={versionId} aria-label="Client version" onChange={(e) => setVersionId(e.target.value as MusicListVersionId)}>
              {MUSIC_LIST_VERSIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} · {v.filename}
                </option>
              ))}
            </select>
            <EncodingSelect value={encoding} onChange={(value) => setEncoding(value as O2Encoding)} />
          </>
        }
      />

      <FileInputCard padded>
          <DropZone
            accept=".dat,.ojn"
            onlyExt={['dat', 'ojn']}
            onFiles={ingest}
            onError={(error) => setOpenError(error instanceof Error ? error.message : 'Could not open that file.')}
            onRejected={(rejected) => {
              setOpenError(
                rejected.length === 1
                  ? `${rejected[0]!.name} is not a valid .dat / .ojn file.`
                  : `${rejected.length} files are not valid .dat / .ojn files.`
              );
            }}
            label={charts.length > 0 ? 'Drop a Music folder or OJN files to add more songs' : 'Drop a Music folder, OJN files, or an OJNList.dat'}
            hint={charts.length > 0 ? 'Dropping another OJNList.dat replaces this list.' : 'OJM and other files are ignored.'}
            after={
              charts.length > 0 && (
                <DownloadButton
                  data={output ?? new Uint8Array()}
                  filename={version.filename}
                  label="Save"
                  primary
                  disabled={!output || !dirty}
                  onSaved={() => {
                    setBaseline(snapshot(charts, sections, versionId, encoding));
                    notify(`Saved ${version.filename} — ${charts.length} song${charts.length === 1 ? '' : 's'}.`, 'ok');
                  }}
                />
              )
            }
          >
            {charts.length > 0 && (
              <button className="btn" type="button" onClick={() => (dirty ? setConfirm({ kind: 'clear' }) : doClear())}>
                <X size={14} />
                CLEAR
              </button>
            )}
          </DropZone>
      </FileInputCard>
      </div>

      {openError && <WarningCard onClose={() => setOpenError(null)}>{openError}</WarningCard>}

      {charts.length > 0 && (
        <>
          <MusicListTable
            charts={charts}
            setCharts={setCharts}
            version={version}
            encoding={encoding}
            sections={sections}
            setSections={setSections}
            changedSongs={changedSongs}
          />
          <SectionEditor
            version={version}
            sections={sections}
            setSections={setSections}
            firstId={charts[0] ? chartId(charts[0].block) : 0}
            open={sectionsOpen}
            onToggle={() => setSectionsOpen((value) => !value)}
          />
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="Unsaved changes"
          body={
            confirm.kind === 'open'
              ? 'The current list has unsaved changes. Opening this file replaces it and your edits are lost.'
              : 'The current list has unsaved changes. Clearing discards them.'
          }
          confirmLabel={confirm.kind === 'open' ? 'Replace list' : 'Discard'}
          onConfirm={() => {
            const pending = confirm;
            setConfirm(null);
            if (pending.kind === 'open') load(pending.files);
            else doClear();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function chartId(block: Uint8Array): number {
  return new DataView(block.buffer, block.byteOffset, block.byteLength).getUint32(0, true);
}
