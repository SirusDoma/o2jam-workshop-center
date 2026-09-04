import { useEffect, useState, type ChangeEvent } from 'react';
import { GENRES, type O2Encoding } from '../../o2jam';
import { EncodingSelect } from '../EncodingSelect';
import { normalizeDecimalInput } from '../../features/note-tool/dom';
import { formatOjnVersion, parseOjnVersionInput } from '../../features/note-tool/chart';
import { BpmInput } from './BpmInput';
import { CollapsibleSection } from './CollapsibleSection';
import { ImagePicker } from './ImagePicker';
import type { OjmEncryption, OjmFormat } from '../../features/note-tool/model';
import type { ChartMetadata, ChartTab, Difficulty, PreviewImage } from '../../features/note-tool/types';

const DIFFICULTIES: Difficulty[] = ['EX', 'NX', 'HX'];

export function ChartSidebar({
  metadata,
  chartTab,
  difficulty,
  levels,
  coverImage,
  thumbnailImage,
  ojmFormat,
  ojmEncryption,
  encoding,
  onMetadataChange,
  onOjmFormatChange,
  onEncodingChange,
  onChartTabChange,
  onDifficultyChange,
  onLevelChange,
  onImageChange,
  onImagePreview,
  onImageRemove,
}: {
  metadata: ChartMetadata;
  chartTab: ChartTab;
  difficulty: Difficulty;
  levels: Record<Difficulty, number>;
  coverImage: PreviewImage | null;
  thumbnailImage: PreviewImage | null;
  ojmFormat: OjmFormat;
  ojmEncryption: OjmEncryption;
  encoding: O2Encoding;
  onMetadataChange: (patch: Partial<ChartMetadata>) => void;
  onOjmFormatChange: (format: OjmFormat, encryption: OjmEncryption) => void;
  onEncodingChange: (encoding: O2Encoding) => void;
  onChartTabChange: (tab: ChartTab) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onLevelChange: (difficulty: Difficulty, level: number) => void;
  onImageChange: (label: PreviewImage['label'], event: ChangeEvent<HTMLInputElement>) => void;
  onImagePreview: (image: PreviewImage) => void;
  onImageRemove: (label: PreviewImage['label']) => void;
}) {
  return (
    <>
      <CollapsibleSection title="Chart">
        <div className="nt-panel-tabs" role="tablist" aria-label="Chart section">
          <button className={chartTab === 'metadata' ? 'on' : ''} type="button" role="tab" aria-selected={chartTab === 'metadata'} onClick={() => onChartTabChange('metadata')}>
            Metadata
          </button>
          <button className={chartTab === 'format' ? 'on' : ''} type="button" role="tab" aria-selected={chartTab === 'format'} onClick={() => onChartTabChange('format')}>
            Format
          </button>
        </div>
        {chartTab === 'metadata' ? (
          <div className="nt-fields">
            <label className="nt-field">
              <span>Title</span>
              <input className="secinput" value={metadata.title} placeholder="Title" onChange={(event) => onMetadataChange({ title: event.currentTarget.value })} />
            </label>
            <label className="nt-field">
              <span>Artist</span>
              <input className="secinput" value={metadata.artist} placeholder="Artist" onChange={(event) => onMetadataChange({ artist: event.currentTarget.value })} />
            </label>
            <label className="nt-field">
              <span>Note Designer</span>
              <input className="secinput" value={metadata.noteDesigner} placeholder="Note Designer" onChange={(event) => onMetadataChange({ noteDesigner: event.currentTarget.value })} />
            </label>
            <label className="nt-field">
              <span>BPM</span>
              <BpmInput value={metadata.bpm} onChange={(bpm) => onMetadataChange({ bpm })} />
            </label>
            <div className="nt-field-row">
              <label className="nt-field">
                <span>Music ID</span>
                <input className="secinput mono" type="number" min="0" value={metadata.musicId} onChange={(event) => onMetadataChange({ musicId: Math.max(0, event.currentTarget.valueAsNumber || 0) })} />
              </label>
              <label className="nt-field">
                <span>Genre</span>
                <select className="selctl" value={metadata.genre} aria-label="Genre" onChange={(event) => onMetadataChange({ genre: Number(event.currentTarget.value) })}>
                  {GENRES.map((genre) => <option value={genre.id} key={genre.id}>{genre.label}</option>)}
                </select>
              </label>
            </div>
          </div>
        ) : (
          <div className="nt-fields">
            <div className="nt-field-row">
              <label className="nt-field">
                <span>Format Ver.</span>
                <FormatVersionInput value={metadata.ojnVersion} onChange={(ojnVersion) => onMetadataChange({ ojnVersion })} />
              </label>
              <label className="nt-field">
                <span>OJN Ver.</span>
                <input className="secinput mono" type="number" min="0" step="1" value={metadata.revision} onChange={(event) => onMetadataChange({ revision: Math.max(0, event.currentTarget.valueAsNumber || 0) })} />
              </label>
            </div>
            <label className="nt-field">
              <span>OJN Format</span>
              <select className="selctl" value={metadata.ojnFormat} onChange={(event) => onMetadataChange({ ojnFormat: event.currentTarget.value as ChartMetadata['ojnFormat'] })}>
                <option value="normal">Normal</option>
                <option value="encrypted-new">Encrypted (new)</option>
              </select>
            </label>
            <div className={ojmFormat === 'm30' ? 'nt-field-row' : undefined}>
              <label className="nt-field">
                <span>OJM Format</span>
                <select
                  className="selctl"
                  value={ojmFormat}
                  onChange={(event) => {
                    const format = event.currentTarget.value as OjmFormat;
                    onOjmFormatChange(format, format === 'm30' ? 'nami' : 'none');
                  }}
                >
                  <option value="ojm">OJM</option>
                  <option value="omc">OMC</option>
                  <option value="m30">M30</option>
                </select>
              </label>
              {ojmFormat === 'm30' ? (
                <label className="nt-field">
                  <span>Encryption</span>
                  <select
                    className="selctl"
                    value={ojmEncryption}
                    onChange={(event) => onOjmFormatChange('m30', event.currentTarget.value as OjmEncryption)}
                  >
                    <option value="none">None</option>
                    <option value="scramble1">Scramble 1</option>
                    <option value="scramble2">Scramble 2</option>
                    <option value="decode">Decode</option>
                    <option value="decrypt">Decrypt</option>
                    <option value="nami">Nami</option>
                  </select>
                </label>
              ) : null}
            </div>
            <label className="nt-field">
              <span>Text Encoding</span>
              <EncodingSelect value={encoding} onChange={(value) => onEncodingChange(value as O2Encoding)} />
            </label>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Levels">
        <div className="nt-difficulties">
          {DIFFICULTIES.map((id) => (
            <div className={`nt-difficulty${difficulty === id ? ' on' : ''}`} key={id}>
              <button type="button" aria-pressed={difficulty === id} onClick={() => onDifficultyChange(id)}>
                <span className={`diff-${id.toLowerCase()}`}>{id}</span>
              </button>
              <input className="secinput mono" type="number" min="0" max="99" value={levels[id]} aria-label={`${id} level`} onChange={(event) => onLevelChange(id, Math.max(0, Math.min(99, event.currentTarget.valueAsNumber || 0)))} />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Images" defaultOpen={false}>
        <div className="nt-fields nt-image-fields">
          <ImagePicker label="Cover Image" image={coverImage} onChange={onImageChange} onPreview={onImagePreview} onRemove={onImageRemove} />
          <ImagePicker label="Thumbnail Image" image={thumbnailImage} onChange={onImageChange} onPreview={onImagePreview} onRemove={onImageRemove} />
        </div>
      </CollapsibleSection>
    </>
  );
}

function FormatVersionInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(() => formatOjnVersion(value));

  useEffect(() => setDraft(formatOjnVersion(value)), [value]);

  const commit = () => {
    const next = parseOjnVersionInput(draft, value);
    onChange(next);
    setDraft(formatOjnVersion(next));
  };

  return (
    <input
      className="secinput mono"
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(normalizeDecimalInput(event.currentTarget))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
