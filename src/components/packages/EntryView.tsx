import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Upload } from 'lucide-react';
import type { ArchiveEntry, O2Encoding } from '../../o2jam';
import { Tabs } from '../Tabs';
import { AlbumEntryView } from './AlbumEntryView';
import { BoundsEditor } from './BoundsEditor';
import { EntryMetadata } from './EntryMetadata';
import { HexView } from './HexView';
import { ItemDataEntryView } from './ItemDataEntryView';
import { PackageMusicListView } from './PackageMusicListView';
import { SpriteEntryView } from './SpriteEntryView';
import { TextEditor } from './TextEditor';
import type { ViewTab } from '../../features/packages/constants';
import { classifyEntryContent, type EntryContent } from '../../features/packages/entryContent';
import { download, extOf } from '../../features/packages/packageUtils';
import { PackageIcon } from './PackageIcon';

function ImagePreview({ data, mime, name }: { data: Uint8Array; mime: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(new Blob([data.slice().buffer as ArrayBuffer], { type: mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data, mime]);

  if (!url) return null;
  return (
    <div className="pad">
      <div className="spriteframe" style={{ minHeight: 180 }}>
        <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: 480, imageRendering: 'auto' }} />
      </div>
    </div>
  );
}

function previewLabel(content: EntryContent): string {
  switch (content.kind) {
    case 'sprite': return 'Frames';
    case 'image': return 'Image';
    case 'album': return 'Albums';
    case 'musicList': return 'Songs';
    case 'itemData': return 'Items';
    case 'bounds': return 'Bounds';
    default: return 'Content';
  }
}

function isTextContent(content: EntryContent): boolean {
  return content.kind === 'text' || content.kind === 'album' || content.kind === 'musicList' || content.kind === 'itemData';
}

export function EntryView({
  entry,
  addedName,
  data,
  encoding,
  auto,
  tab,
  onTab,
  edited,
  onRevert,
  onReplace,
}: {
  entry: ArchiveEntry | null;
  addedName?: string;
  data: Uint8Array;
  encoding: O2Encoding;
  auto: boolean;
  tab: ViewTab;
  onTab: (tab: ViewTab) => void;
  edited: boolean;
  onRevert: () => void;
  onReplace: (bytes: Uint8Array) => void;
}) {
  const name = entry?.name ?? addedName ?? '';
  const ext = entry ? entry.ext : extOf(name);
  const [textEncoding, setTextEncoding] = useState<O2Encoding | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const content = useMemo(
    () => classifyEntryContent(data, name, ext, encoding, auto, textEncoding),
    [data, name, ext, encoding, auto, textEncoding]
  );
  const previewable = content.kind !== 'bytes';
  const sprite = content.kind === 'sprite' ? content.sprite : null;
  const mime = content.kind === 'image' ? content.mime : null;

  useEffect(() => {
    if (!previewable && tab === 'preview') onTab('meta');
  }, [previewable, tab, onTab]);

  return (
    <>
      <div className="overlay-head">
        <div className="oh-main">
          <div className="oh-row">
            <span className="ico">{isTextContent(content) ? <FileText size={15} /> : <PackageIcon ext={ext} />}</span>
            <span className="overlay-title">{name}</span>
            {content.kind === 'sprite' && (
              <span className="chip img">
                {ext.toUpperCase()}: {content.sprite.frameCount} Frame{content.sprite.frameCount === 1 ? '' : 's'}
              </span>
            )}
            {content.kind === 'image' && <span className="chip img">{content.mime.split('/')[1]?.toUpperCase()}</span>}
            {content.kind === 'musicList' && (
              <span className="chip img">
                v{content.versionId}: {content.songs.length} Song{content.songs.length === 1 ? '' : 's'}
              </span>
            )}
            {content.kind === 'itemData' && (
              <span className="chip img">
                v{content.itemData.versionId}: {content.itemData.items.length} Item{content.itemData.items.length === 1 ? '' : 's'}
              </span>
            )}
            {!entry && <span className="chip ok">ADDED</span>}
          </div>
        </div>
        <div className="overlay-actions">
          <button className="btn" type="button" onClick={() => download(data, name)}>
            <Download size={14} />
            EXTRACT
          </button>
          <button className="btn" type="button" onClick={() => replaceRef.current?.click()}>
            <Upload size={14} />
            REPLACE
          </button>
          <input
            ref={replaceRef}
            type="file"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) onReplace(new Uint8Array(await file.arrayBuffer()));
            }}
          />
        </div>
      </div>

      <Tabs
        tabs={[
          ...(previewable ? [{ id: 'preview', label: previewLabel(content) }] : []),
          { id: 'meta', label: 'Metadata' },
          { id: 'bytes', label: 'Bytes' },
        ]}
        active={tab}
        onChange={(next) => onTab(next as ViewTab)}
      />

      <div className="view-body">
        {content.kind === 'sprite' && (
          <SpriteEntryView
            active={tab === 'preview'}
            data={data}
            sprite={content.sprite}
            name={name}
            edited={edited}
            onRevert={onRevert}
            onReplace={onReplace}
          />
        )}
        {content.kind === 'album' && <AlbumEntryView active={tab === 'preview'} album={content.album} />}
        {tab === 'preview' && content.kind === 'image' && <ImagePreview data={data} mime={content.mime} name={name} />}
        {tab === 'preview' && content.kind === 'musicList' && <PackageMusicListView songs={content.songs} />}
        {tab === 'preview' && content.kind === 'itemData' && <ItemDataEntryView itemData={content.itemData} />}
        {tab === 'preview' && content.kind === 'bounds' && (
          <BoundsEditor data={data} onSave={onReplace} edited={edited} onRevert={onRevert} />
        )}
        {tab === 'preview' && content.kind === 'text' && (
          <TextEditor
            text={content.value}
            encoding={content.encoding}
            onEncodingChange={setTextEncoding}
            edited={edited}
            onRevert={onRevert}
            onSave={onReplace}
          />
        )}
        {tab === 'meta' && (
          <EntryMetadata
            entry={entry}
            name={name}
            size={data.length}
            type={mime ? mime.split('/')[1]!.toUpperCase() : ext ? ext.toUpperCase() : '—'}
            sprite={sprite}
          />
        )}
        {tab === 'bytes' && <HexView data={data} start={0} length={1024} />}
      </div>
    </>
  );
}
