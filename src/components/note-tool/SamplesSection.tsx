import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ChevronDown, FolderOpen, Play, Plus, Square, Trash2 } from 'lucide-react';
import { collectDropped } from '../DropZone';
import { scrollNearest } from '../../features/note-tool/dom';
import {
  MAX_SAMPLE_FILES,
  MAX_SAMPLE_BANK_BYTES,
  allocateSampleId,
  classifyNoteToolFiles,
  formatSampleSlot,
  resolveOjmSettings,
  sampleSlotIds,
  sampleTypeFromName,
  validateSampleDescriptor,
  type OjmEncryption,
  type OjmFormat,
  type OjmSample,
  type OjmSampleType,
} from '../../features/note-tool/model';

export function SamplesSection({
  disabled = false,
  samples,
  selectedSample,
  ojmFileName,
  format,
  encryption,
  onSamplesChange,
  onSelectedSampleChange,
  onOjmFileNameChange,
  onOpenFiles,
}: {
  disabled?: boolean;
  samples: OjmSample[];
  selectedSample: Pick<OjmSample, 'id' | 'type'>;
  ojmFileName: string;
  format: OjmFormat;
  encryption: OjmEncryption;
  onSamplesChange: (samples: OjmSample[]) => void;
  onSelectedSampleChange: (sample: Pick<OjmSample, 'id' | 'type'>) => void;
  onOjmFileNameChange: (name: string) => void;
  onOpenFiles: (files: File[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ojmInput = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const selectedRow = useRef<HTMLDivElement>(null);
  const { id: selectedId, type } = selectedSample;
  const settings = resolveOjmSettings(format, encryption);
  const slots = sampleSlotIds(type);
  const sampleById = useMemo(() => new Map(samples.filter((sample) => sample.type === type).map((sample) => [sample.id, sample])), [samples, type]);
  const selected = samples.find((sample) => sample.id === selectedId && sample.type === type) ?? null;

  useEffect(() => () => stopPreview(), []);
  useEffect(() => scrollNearest(selectedRow.current), [open, selectedId, type]);

  const stopPreview = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
    audio.current = null;
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    setPlaying(false);
    setMessage(null);
  };

  useEffect(() => {
    if (disabled) stopPreview();
  }, [disabled]);

  const playPreview = async (sample = selected) => {
    if (!sample) {
      setMessage('Select a sample to preview.');
      return;
    }

    stopPreview();
    const url = URL.createObjectURL(new Blob([sample.data], { type: sample.mime }));
    const element = new Audio(url);
    audioUrl.current = url;
    audio.current = element;
    element.addEventListener('ended', stopPreview, { once: true });

    try {
      await element.play();
      setPlaying(true);
      setMessage(`Playing ${sample.name}.`);
    }
    catch {
      stopPreview();
      setMessage(`${sample.name} could not be decoded by this browser.`);
    }
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (samples.length + files.length > MAX_SAMPLE_FILES) {
      setMessage(`A sample bank can contain at most ${MAX_SAMPLE_FILES} samples.`);
      return;
    }

    const rejected = files.map((file) => validateSampleDescriptor(file, format)).find(Boolean);
    if (rejected) {
      setMessage(rejected);
      return;
    }

    const bankSize = samples.reduce((total, sample) => total + sample.size, 0);
    const incomingSize = files.reduce((total, file) => total + file.size, 0);
    if (bankSize + incomingSize > MAX_SAMPLE_BANK_BYTES) {
      setMessage('The sample bank cannot exceed 512 MB in this browser session.');
      return;
    }

    const next = [...samples];
    const added: OjmSample[] = [];

    try {
      for (const file of files) {
        const codec = sampleTypeFromName(file.name);
        if (!codec) {
          continue;
        }

        const sampleType = format === 'm30' ? type : codec;
        const preferredId = added.length === 0
          && selectedId !== null
          && isSampleSlot(sampleType, selectedId)
          && !next.some((sample) => sample.id === selectedId)
          ? selectedId
          : null;
        const id = preferredId ?? allocateSampleId(sampleType, next.map((sample) => sample.id), file.name);
        const sample: OjmSample = {
          id,
          name: file.name,
          type: sampleType,
          codec,
          size: file.size,
          mime: file.type || (codec === 'wav' ? 'audio/wav' : 'audio/ogg'),
          data: await file.arrayBuffer(),
        };
        next.push(sample);
        added.push(sample);
      }
    }
    catch (error) {
      setMessage(error instanceof Error ? error.message : 'Samples could not be loaded.');
      return;
    }

    onSamplesChange(next);
    const first = added[0];
    if (first) {
      onSelectedSampleChange({ id: first.id, type: first.type });
    }
    setMessage(`${added.length} sample${added.length === 1 ? '' : 's'} added.`);
  };

  const removeSelected = (id: number) => {
    stopPreview();
    onSamplesChange(samples.filter((sample) => sample.id !== id));
    setMessage('Sample removed.');
  };

  const accept = settings.acceptedTypes.map((sampleType) => `audio/${sampleType},.${sampleType}`).join(',');

  return (
    <section className={`nt-section nt-samples-section${open ? ' open' : ''}`}>
      <button className="stackhead nt-section-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>Samples</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <div className="nt-samples-panel">
          <div className="nt-fields nt-sample-bank-fields">
            <label className="nt-field">
              <span>OJM filename</span>
              <div className="nt-ojm-control">
                <input className="secinput mono" value={ojmFileName} onChange={(event) => onOjmFileNameChange(event.currentTarget.value)} />
                <button className="icon-btn" type="button" aria-label="Open OJM" title="Open OJM" onClick={() => ojmInput.current?.click()}>
                  <FolderOpen />
                </button>
                <input
                  className="sr-only"
                  ref={ojmInput}
                  type="file"
                  accept=".ojm,.omc,.m30,application/octet-stream"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) onOpenFiles([file]);
                  }}
                />
              </div>
            </label>
          </div>
          <div
            className={`nt-sample-table-zone${dragging ? ' is-dragging' : ''}`}
            aria-disabled={disabled}
            inert={disabled}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const draggedType = draggedSampleType(event.dataTransfer);
              if (format !== 'm30' && draggedType && draggedType !== type && settings.acceptedTypes.includes(draggedType)) {
                onSelectedSampleChange({ id: sampleSlotIds(draggedType)[0] ?? 0, type: draggedType });
              }
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragging(false);
              }
            }}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
              setDragging(false);
              void collectDropped(event.dataTransfer).then((files) => {
                const dropped = classifyNoteToolFiles(files);
                if (dropped.ojn || dropped.ojm) onOpenFiles(files);
                else void addFiles(files);
              }).catch(() => setMessage('Dropped files could not be read.'));
            }}
          >
            <div className="nt-panel-tabs nt-sample-tabs" role="tablist" aria-label="OJM sample type">
            {(['wav', 'ogg'] as const).map((sampleType) => (
              <button
                className={`${type === sampleType ? 'on' : ''}${dragging && type === sampleType ? ' drop-target' : ''}`}
                type="button"
                role="tab"
                aria-selected={type === sampleType}
                key={sampleType}
                onClick={() => {
                  onSelectedSampleChange({ id: sampleSlotIds(sampleType)[0] ?? 0, type: sampleType });
                }}
              >
                {sampleType.toUpperCase()}
              </button>
            ))}
            </div>
            <div className="nt-sample-head" aria-hidden="true"><span>ID</span><span>Name</span><span /></div>
            <div className="nt-sample-list" role="listbox" aria-label={`${type.toUpperCase()} samples`}>
              {slots.map((id) => {
                const sample = sampleById.get(id);
                return (
                <div
                  className={`nt-sample-row${selectedId === id ? ' on' : ''}${sample ? '' : ' empty'}`}
                  role="option"
                  tabIndex={selectedId === id ? 0 : -1}
                  aria-selected={selectedId === id}
                  key={id}
                  ref={selectedId === id ? selectedRow : undefined}
                  onClick={() => onSelectedSampleChange({ id, type })}
                  onDoubleClick={() => { if (sample) void playPreview(sample); }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectedSampleChange({ id, type });
                    }
                  }}
                >
                  <span className="mono">{formatSampleSlot(type, id)}</span>
                  <span>{sample?.name ?? 'Empty'}</span>
                  {sample ? <button
                    className="nt-sample-remove"
                    type="button"
                    aria-label={`Remove ${sample.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSelected(sample.id);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <Trash2 />
                  </button> : <span />}
                </div>
                );
              })}
            </div>
          </div>
          <div className="nt-sample-footer" aria-label="Sample controls" aria-disabled={disabled} inert={disabled}>
            <button className="icon-btn" type="button" disabled={!selected} aria-label="Play selected sample" title="Play selected sample" onClick={() => void playPreview()}>
              <Play />
            </button>
            <button className="icon-btn" type="button" disabled={!playing} aria-label="Stop sample playback" title="Stop sample playback" onClick={stopPreview}>
              <Square />
            </button>
            <span className="nt-sample-status" role="status">{message}</span>
            <button className="icon-btn nt-add-sample" type="button" aria-label={`Add ${type.toUpperCase()} sample`} title={`Add ${type.toUpperCase()} sample`} onClick={() => fileInput.current?.click()}>
              <Plus />
            </button>
            <input
              className="sr-only"
              ref={fileInput}
              type="file"
              multiple
              accept={accept}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void addFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = '';
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isSampleSlot(type: OjmSampleType, id: number): boolean {
  return type === 'wav' ? id >= 0 && id <= 999 : id >= 1000 && id <= 1998;
}

function draggedSampleType(dataTransfer: DataTransfer): OjmSampleType | null {
  const file = dataTransfer.files[0] ?? Array.from(dataTransfer.items).find((item) => item.kind === 'file')?.getAsFile();
  return file ? sampleTypeFromName(file.name) : null;
}
