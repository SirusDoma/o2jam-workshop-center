import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { FilePlus2, FolderOpen, Maximize2, Minimize2, Save, Settings2, Upload, X } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { collectDropped } from '../components/DropZone';
import { ChartSidebar } from '../components/note-tool/ChartSidebar';
import { documentFromOjn, emptyEditorDocument, emptyMetadata, metadataFromOjn, resolveChartLevel } from '../features/note-tool/chart';
import { SettingsDialog } from '../components/note-tool/SettingsDialog';
import { NoteEditor } from '../components/note-tool/NoteEditor';
import { SamplesSection } from '../components/note-tool/SamplesSection';
import { SaveAsDialog } from '../components/note-tool/SaveAsDialog';
import { parseOjmBank, writeOjmBank, writeOjnFile } from '../features/note-tool/serialization';
import { NOTE_TOOL_SETTINGS_KEY, clampPlayheadThickness, createDefaultNoteToolSettings, normalizePlayheadGrid, parseNoteToolSettings, snapPlayheadPosition, type NoteToolSettings } from '../features/note-tool/settings';
import { MAX_SAMPLE_BANK_BYTES, classifyNoteToolFiles, musicFileName, noteToolStatesEqual, sampleBankFileName, sampleSlotIds, type OjmEncryption, type OjmFormat, type OjmSample } from '../features/note-tool/model';
import { measuredFrameRate } from '../features/note-tool/playback';
import { saveBytesAs, type SaveFilePicker } from '../features/note-tool/dom';
import type { ChartMetadata, ChartTab, Difficulty, EditorDocument, KeyMode, LoadedChart, PreviewImage } from '../features/note-tool/types';
import { CloseButton, Overlay } from '../components/Overlay';
import { PageHead } from '../components/Shell';
import { detectOjnHeaderEncoding, parseOjn, type O2Encoding } from '../o2jam';
import { reportDirty } from '../dirty';

const MAX_OJN_BYTES = 128 * 1024 * 1024;

type PendingFileAction =
  | { kind: 'new' | 'close'; }
  | { kind: 'open'; ojn: File | null; ojm: File | null; };

type SavePickerWindow = Window & { showSaveFilePicker?: SaveFilePicker; };

type NameRequest = {
  kind: 'new' | 'save';
  initialName: string;
};

function loadSettings(): NoteToolSettings {
  try {
    const stored = localStorage.getItem(NOTE_TOOL_SETTINGS_KEY);
    const parsed = stored ? parseNoteToolSettings(JSON.parse(stored)) : null;
    return parsed ?? createDefaultNoteToolSettings();
  }
  catch {
    return createDefaultNoteToolSettings();
  }
}

export default function NoteToolPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('EX');
  const [keyMode, setKeyMode] = useState<KeyMode>(7);
  const [chartTab, setChartTab] = useState<ChartTab>('metadata');
  const [panelWidth, setPanelWidth] = useState(320);
  const [maximized, setMaximized] = useState(false);
  const [coverImage, setCoverImage] = useState<PreviewImage | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<PreviewImage | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStorageMessage, setSettingsStorageMessage] = useState<string | null>(null);
  const [toolSettings, setToolSettings] = useState(loadSettings);
  const effectiveSettings = useMemo<NoteToolSettings>(() => {
    const playheadGrid = normalizePlayheadGrid(toolSettings.playheadGrid);
    return {
      ...toolSettings,
      version: 1,
      playheadGrid,
      playheadPosition: snapPlayheadPosition(toolSettings.playheadPosition, playheadGrid),
      playheadThickness: clampPlayheadThickness(toolSettings.playheadThickness),
    };
  }, [toolSettings]);

  const [metadata, setMetadata] = useState<ChartMetadata>(emptyMetadata);
  const [levels, setLevels] = useState<Record<Difficulty, number>>({ EX: 0, NX: 0, HX: 0 });
  const [editorDocument, setEditorDocument] = useState<EditorDocument>(emptyEditorDocument);
  const [loaded, setLoaded] = useState<LoadedChart | null>(null);
  const [documentName, setDocumentName] = useState('Untitled.ojn');
  const [documentNameDraft, setDocumentNameDraft] = useState('Untitled.ojn');
  const [documentNameAccepted, setDocumentNameAccepted] = useState(false);
  const [ojmNameAccepted, setOjmNameAccepted] = useState(false);
  const [renamingDocument, setRenamingDocument] = useState(false);
  const [samples, setSamples] = useState<OjmSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<Pick<OjmSample, 'id' | 'type'>>({ id: 0, type: 'wav' });
  const [ojmFormat, setOjmFormat] = useState<OjmFormat>('omc');
  const [ojmEncryption, setOjmEncryption] = useState<OjmEncryption>('none');
  const [encoding, setEncoding] = useState<O2Encoding>('ascii');
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [cleanRevision, setCleanRevision] = useState(0);
  const [workspaceDragging, setWorkspaceDragging] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingFileAction | null>(null);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const hiSpeed = useRef('1.0');
  const panelDrag = useRef({ x: 0, width: 250 });
  const ojnInput = useRef<HTMLInputElement>(null);
  const imageUrls = useRef(new Set<string>());
  const cleanDocumentState = useRef<unknown>(null);
  const captureCleanDocumentState = useRef(true);

  useEffect(() => {
    reportDirty('note-tool', dirty);
    return () => reportDirty('note-tool', false);
  }, [dirty]);

  useEffect(() => {
    const urls = imageUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NOTE_TOOL_SETTINGS_KEY, JSON.stringify(effectiveSettings));
      setSettingsStorageMessage(null);
    }
    catch {
      setSettingsStorageMessage('Settings could not be saved in this browser.');
    }
  }, [effectiveSettings]);

  useEffect(() => {
    setFileMessage(null);
  }, [ojmFormat, ojmEncryption]);

  const clearImages = () => {
    setCoverImage((current) => releaseImage(current, imageUrls.current));
    setThumbnailImage((current) => releaseImage(current, imageUrls.current));
  };

  const markDocumentCleanAfterRender = () => {
    captureCleanDocumentState.current = true;
    setDirty(false);
    setCleanRevision((revision) => revision + 1);
  };

  const createNew = (name = 'Untitled.ojn', nameAccepted = false) => {
    clearImages();
    setDifficulty('EX');
    setKeyMode(7);
    setChartTab('metadata');
    setMetadata(emptyMetadata());
    setLevels({ EX: 0, NX: 0, HX: 0 });
    setEditorDocument(emptyEditorDocument());
    setLoaded(null);
    setDocumentName(name);
    setDocumentNameDraft(name);
    setDocumentNameAccepted(nameAccepted);
    setOjmNameAccepted(false);
    setRenamingDocument(false);
    setSamples([]);
    setSelectedSample({ id: 0, type: 'wav' });
    setOjmFormat('omc');
    setOjmEncryption('none');
    setEncoding('ascii');
    setPreviewImage(null);
    setFileMessage(null);
    markDocumentCleanAfterRender();
    hiSpeed.current = '1.0';
    setEditorRevision((revision) => revision + 1);
  };

  const loadOjn = async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.ojn')) {
      setFileMessage('Select an OJN file.');
      return false;
    }

    if (file.size > MAX_OJN_BYTES) {
      setFileMessage(`${file.name} is larger than 128 MB.`);
      return false;
    }

    try {
      const source = await file.arrayBuffer();
      const preliminary = parseOjn(source);
      const detectedEncoding = detectOjnHeaderEncoding(preliminary.data) ?? 'ascii';
      const parsed = detectedEncoding === 'ascii' ? preliminary : parseOjn(source, detectedEncoding);
      const document = documentFromOjn(source);
      clearImages();
      const nextCover = parsed.cover ? imageFromOjn('Cover Image', parsed.cover.bytes, parsed.cover.mime, imageUrls.current) : null;
      const nextThumbnail = parsed.thumbnail ? imageFromOjn('Thumbnail Image', parsed.thumbnail.bytes, parsed.thumbnail.mime, imageUrls.current) : null;
      setCoverImage(nextCover);
      setThumbnailImage(nextThumbnail);
      setMetadata(metadataFromOjn(parsed));
      setLevels({ EX: parsed.header.levelEx, NX: parsed.header.levelNx, HX: parsed.header.levelHx });
      setEditorDocument(document);
      setLoaded({ name: file.name, file: parsed });
      setDocumentName(file.name);
      setDocumentNameDraft(file.name);
      setDocumentNameAccepted(true);
      setOjmNameAccepted(true);
      setRenamingDocument(false);
      setSamples([]);
      setSelectedSample({ id: 0, type: 'wav' });
      setOjmFormat('omc');
      setOjmEncryption('none');
      setEncoding(detectedEncoding);
      hiSpeed.current = '1.0';
      setEditorRevision((revision) => revision + 1);
      return true;
    }
    catch (error) {
      setFileMessage(error instanceof Error ? `OJN could not be loaded: ${error.message}` : 'OJN could not be loaded.');
      return false;
    }
  };

  const loadOjm = async (file: File): Promise<boolean> => {
    if (file.size > MAX_SAMPLE_BANK_BYTES) {
      setFileMessage(`${file.name} is larger than 512 MB.`);
      return false;
    }

    try {
      const parsed = parseOjmBank(await file.arrayBuffer());
      setSamples(parsed.samples);
      setMetadata((current) => ({ ...current, ojmFileName: file.name }));
      setOjmNameAccepted(true);
      setOjmFormat(parsed.format);
      setOjmEncryption(parsed.encryption);
      const first = parsed.samples[0];
      const firstType = first?.type ?? 'wav';
      setSelectedSample({ id: first?.id ?? sampleSlotIds(firstType)[0] ?? 0, type: firstType });
      setFileMessage(`${file.name} loaded with ${parsed.samples.length} sample${parsed.samples.length === 1 ? '' : 's'}.`);
      return true;
    }
    catch (error) {
      setFileMessage(error instanceof Error ? `OJM could not be loaded: ${error.message}` : 'OJM could not be loaded.');
      return false;
    }
  };

  const openFiles = async ({ ojn, ojm }: Extract<PendingFileAction, { kind: 'open'; }>) => {
    const ojnLoaded = ojn ? await loadOjn(ojn) : false;
    const ojmLoaded = ojm ? await loadOjm(ojm) : false;

    if (ojnLoaded) {
      markDocumentCleanAfterRender();
    } else if (ojmLoaded) {
      setDirty(true);
    }
  };

  const performFileAction = (action: PendingFileAction) => {
    if (action.kind === 'open') {
      void openFiles(action);
    } else if (action.kind === 'new') {
      setNameRequest({ kind: 'new', initialName: musicFileName(0, 'ojn') });
    } else {
      createNew();
    }
  };

  const requestFileAction = (action: PendingFileAction) => {
    if (dirty) {
      setPendingAction(action);
    } else {
      performFileAction(action);
    }
  };

  const requestOpenFiles = (files: File[]) => {
    const dropped = classifyNoteToolFiles(files);
    if (!dropped.ojn && !dropped.ojm) {
      setFileMessage('Select an OJN, OJM, OMC, or M30 file.');
      return;
    }

    if (dropped.duplicates.length > 0) {
      setFileMessage('Open at most one OJN and one OJM at a time.');
      return;
    }

    requestFileAction({ kind: 'open', ojn: dropped.ojn, ojm: dropped.ojm });
  };

  const changeDifficulty = (next: Difficulty) => {
    setDifficulty(next);
  };

  const replaceImage = (label: PreviewImage['label'], event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    void file.arrayBuffer().then((data) => {
      const bytes = new Uint8Array(data);
      const image = { label, name: file.name, mime: file.type || 'application/octet-stream', bytes, url: URL.createObjectURL(file) };
      imageUrls.current.add(image.url);
      const setImage = label === 'Cover Image' ? setCoverImage : setThumbnailImage;
      setImage((current) => {
        releaseImage(current, imageUrls.current);
        return image;
      });

      setDirty(true);
    }).catch(() => setFileMessage(`${label} could not be loaded.`));
  };

  const removeImage = (label: PreviewImage['label']) => {
    const setImage = label === 'Cover Image' ? setCoverImage : setThumbnailImage;
    setImage((current) => releaseImage(current, imageUrls.current));
    setPreviewImage((current) => current?.label === label ? null : current);
    setDirty(true);
  };

  const startPanelResize = (event: PointerEvent<HTMLButtonElement>) => {
    panelDrag.current = { x: event.clientX, width: panelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizePanel = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setPanelWidth(Math.max(210, Math.min(520, panelDrag.current.width + event.clientX - panelDrag.current.x)));
    }
  };

  const resizePanelWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPanelWidth((width) => Math.max(210, width - 10));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPanelWidth((width) => Math.min(520, width + 10));
    }
  };

  const currentChart = editorDocument[difficulty];
  const displayedLevels = useMemo<Record<Difficulty, number>>(() => ({
    EX: resolveChartLevel(levels.EX, editorDocument.EX, metadata.bpm),
    NX: resolveChartLevel(levels.NX, editorDocument.NX, metadata.bpm),
    HX: resolveChartLevel(levels.HX, editorDocument.HX, metadata.bpm),
  }), [editorDocument, levels, metadata.bpm]);

  const documentState = useMemo(() => ({
    documentName,
    metadata,
    levels,
    editorDocument,
    samples,
    ojmFormat,
    ojmEncryption,
    encoding,
    coverImage: coverImage ? { name: coverImage.name, mime: coverImage.mime, bytes: coverImage.bytes } : null,
    thumbnailImage: thumbnailImage ? { name: thumbnailImage.name, mime: thumbnailImage.mime, bytes: thumbnailImage.bytes } : null,
  }), [coverImage, documentName, editorDocument, encoding, levels, metadata, ojmEncryption, ojmFormat, samples, thumbnailImage]);

  useEffect(() => {
    if (captureCleanDocumentState.current) {
      cleanDocumentState.current = documentState;
      captureCleanDocumentState.current = false;
      setDirty(false);
      return;
    }

    setDirty(!noteToolStatesEqual(cleanDocumentState.current, documentState));
  }, [cleanRevision, documentState]);

  const chooseOjmFormat = (next: OjmFormat, encryption: OjmEncryption = next === 'm30' ? 'nami' : 'none') => {
    if (next === 'm30' && samples.some((sample) => sample.type === 'wav')) {
      setFileMessage('Remove WAV samples before switching to M30.');
      return;
    }

    setOjmFormat(next);
    setOjmEncryption(encryption);
    setDirty(true);
    if (next === 'm30') {
      setSelectedSample({ id: sampleSlotIds('ogg')[0] ?? 1000, type: 'ogg' });
    }

    setFileMessage(null);
  };

  const suggestedOjnName = () => musicFileName(metadata.musicId, 'ojn');

  const changeMetadata = (patch: Partial<ChartMetadata>) => {
    if (patch.musicId !== undefined && !documentNameAccepted) {
      const name = musicFileName(patch.musicId, 'ojn');
      setDocumentName(name);
      setDocumentNameDraft(name);
    }

    setMetadata((current) => ({
      ...current,
      ...patch,
      ...(patch.musicId !== undefined && !ojmNameAccepted ? { ojmFileName: musicFileName(patch.musicId, 'ojm') } : {}),
    }));

    setDirty(true);
  };

  const savePicker = () => (window as SavePickerWindow).showSaveFilePicker?.bind(window) as SaveFilePicker | undefined;

  const requestSave = () => {
    if (!documentNameAccepted) {
      setNameRequest({ kind: 'save', initialName: suggestedOjnName() });
      return;
    }

    void saveFiles(documentName, savePicker());
  };

  const commitDocumentName = () => {
    if (!documentNameDraft.trim()) {
      setDocumentNameDraft(documentName);
      setRenamingDocument(false);
      return;
    }

    const name = normalizeFileName(documentNameDraft.trim(), '.ojn');
    setDocumentName(name);
    setDocumentNameDraft(name);
    setDocumentNameAccepted(true);
    setRenamingDocument(false);
  };

  const saveFiles = async (requestedName: string, picker?: SaveFilePicker) => {
    try {
      const bankFileName = sampleBankFileName(metadata.ojmFileName, metadata.title, ojmFormat);
      const bank = writeOjmBank(samples, ojmFormat, ojmEncryption);
      const ojn = writeOjnFile({
        metadata: { ...metadata, ojmFileName: bankFileName },
        levels: displayedLevels,
        document: editorDocument,
        coverImage,
        thumbnailImage,
        baseHeader: loaded?.file.header,
        encoding,
      });

      const savedOjnName = picker
        ? await saveBytesAs(ojn, requestedName, picker)
        : (downloadBytes(ojn, requestedName), requestedName);

      if (picker) {
        await saveBytesAs(bank, bankFileName, picker);
      } else {
        downloadBytes(bank, bankFileName);
      }

      setDocumentName(savedOjnName);
      setDocumentNameDraft(savedOjnName);
      setDocumentNameAccepted(true);
      setRenamingDocument(false);
      setFileMessage(null);
      markDocumentCleanAfterRender();
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setFileMessage(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
    }
  };

  return (
    <>
      <PageHead
        className="nt-pagehead"
        title="Note Tool"
        sub="Create and edit OJN note charts."
        actions={
          <>
            <button className="btn nt-page-action" type="button" disabled={playbackActive} onClick={() => requestFileAction({ kind: 'new' })}><FilePlus2 size={14} />New</button>
            <button className="btn nt-page-action" type="button" disabled={playbackActive} onClick={() => ojnInput.current?.click()}><FolderOpen size={14} />Browse</button>
            <button className="btn primary nt-page-action" type="button" disabled={playbackActive || !dirty} onClick={requestSave}><Save size={14} />Save</button>
          </>
        }
      />
      <input
        className="sr-only"
        ref={ojnInput}
        type="file"
        disabled={playbackActive}
        accept=".ojn,application/octet-stream"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) {
            requestOpenFiles([file]);
          }
        }}
      />

      <section
        className={`card nt-workspace${maximized ? ' nt-maximized' : ''}${workspaceDragging ? ' is-dragging' : ''}`}
        onDragOver={(event: DragEvent<HTMLElement>) => {
          if (playbackActive || !event.dataTransfer.types.includes('Files')) {
            return;
          }

          event.preventDefault();
          setWorkspaceDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setWorkspaceDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setWorkspaceDragging(false);
          void collectDropped(event.dataTransfer).then(requestOpenFiles).catch(() => setFileMessage('Dropped files could not be read.'));
        }}
      >
        {workspaceDragging ? (
          <div className="dropzone nt-workspace-drop" role="status">
            <Upload size={24} />
            <b>Drop OJN & OJM files to open</b>
            <span>Encrypted files are supported</span>
          </div>
        ) : null}
        <header className="nt-filebar">
          <div className="nt-file">
            {renamingDocument ? (
              <input
                className="secinput nt-file-name-input"
                aria-label="Rename OJN filename"
                value={documentNameDraft}
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setDocumentNameDraft(event.currentTarget.value)}
                onBlur={commitDocumentName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitDocumentName();
                  } else if (event.key === 'Escape') {
                    setDocumentNameDraft(documentName);
                    setRenamingDocument(false);
                  }
                }}
              />
            ) : (
              <button
                className="nt-file-name nt-file-name-button"
                type="button"
                disabled={playbackActive}
                aria-label={`Rename ${documentName}`}
                onClick={() => {
                  setDocumentNameDraft(documentName);
                  setRenamingDocument(true);
                }}
              >
                {documentName}
              </button>
            )}
            {fileMessage ? <span className="nt-file-message" role="status">{fileMessage}</span> : null}
          </div>
          <div className="nt-filebar-actions">
            <FpsCounter />
            <button className="icon-btn nt-note-settings-toggle" type="button" disabled={playbackActive} aria-label="Open settings" aria-haspopup="dialog" aria-expanded={settingsOpen} title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 /></button>
            <button className="icon-btn nt-maximize-toggle" type="button" aria-label={maximized ? 'Restore Note Tool panel' : 'Maximize Note Tool panel'} aria-pressed={maximized} title={maximized ? 'Restore panel' : 'Maximize panel'} onClick={() => setMaximized((value) => !value)}>
              {maximized ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button className="icon-btn nt-close-toggle" type="button" disabled={playbackActive} aria-label="Close current file" title="Close current file" onClick={() => requestFileAction({ kind: 'close' })}>
              <X />
            </button>
          </div>
        </header>

        <div className="nt-layout" style={{ '--nt-panel-width': `${panelWidth}px` } as CSSProperties}>
          <aside className="nt-side nt-chart" aria-label="Note Tool panels">
            <ChartSidebar
              metadata={metadata}
              chartTab={chartTab}
              difficulty={difficulty}
              levels={displayedLevels}
              coverImage={coverImage}
              thumbnailImage={thumbnailImage}
              ojmFormat={ojmFormat}
              ojmEncryption={ojmEncryption}
              encoding={encoding}
              onMetadataChange={changeMetadata}
              onOjmFormatChange={chooseOjmFormat}
              onEncodingChange={(value) => {
                setEncoding(value);
                setDirty(true);
              }}
              onChartTabChange={setChartTab}
              onDifficultyChange={changeDifficulty}
              onLevelChange={(id, level) => {
                setLevels((current) => ({ ...current, [id]: level }));
                setDirty(true);
              }}
              onImageChange={replaceImage}
              onImagePreview={setPreviewImage}
              onImageRemove={removeImage}
            />
            <SamplesSection
              disabled={playbackActive}
              samples={samples}
              selectedSample={selectedSample}
              ojmFileName={metadata.ojmFileName}
              format={ojmFormat}
              encryption={ojmEncryption}
              onSamplesChange={(nextSamples) => {
                setSamples(nextSamples);
                setDirty(true);
              }}
              onSelectedSampleChange={setSelectedSample}
              onOjmFileNameChange={(ojmFileName) => {
                setMetadata((current) => ({ ...current, ojmFileName }));
                setOjmNameAccepted(true);
                setDirty(true);
              }}
              onOpenFiles={requestOpenFiles}
            />
          </aside>

          <button
            className="nt-panel-resizer"
            type="button"
            role="separator"
            aria-label="Resize Note Tool side panel"
            aria-orientation="vertical"
            aria-valuemin={210}
            aria-valuemax={520}
            aria-valuenow={panelWidth}
            onPointerDown={startPanelResize}
            onPointerMove={resizePanel}
            onKeyDown={resizePanelWithKeyboard}
          />

          <NoteEditor
            key={editorRevision}
            chart={currentChart}
            difficulty={difficulty}
            baseBpm={metadata.bpm}
            samples={samples}
            selectedSample={selectedSample}
            keyMode={keyMode}
            initialHiSpeed={hiSpeed.current}
            onKeyModeChange={setKeyMode}
            onHiSpeedChange={(value) => { hiSpeed.current = value; }}
            settings={effectiveSettings}
            onSettingsChange={setToolSettings}
            onSelectedSampleChange={setSelectedSample}
            onPlaybackChange={setPlaybackActive}
            onChartChange={(chart) => {
              setEditorDocument((current) => ({ ...current, [difficulty]: chart }));
              setDirty(true);
            }}
          />
        </div>
      </section>

      {previewImage ? (
        <div className="nt-image-preview-overlay">
          <Overlay label={`${previewImage.label} preview`} width="wide" onClose={() => setPreviewImage(null)}>
            <div className="overlay-head">
              <div className="oh-main"><div className="oh-row"><span className="overlay-title">{previewImage.label}</span></div></div>
              <div className="overlay-actions"><CloseButton onClose={() => setPreviewImage(null)} /></div>
            </div>
            <div className="nt-image-preview-dialog"><img src={previewImage.url} alt={previewImage.label} /></div>
          </Overlay>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="nt-settings-overlay">
          <SettingsDialog settings={effectiveSettings} storageMessage={settingsStorageMessage} onChange={setToolSettings} onClose={() => setSettingsOpen(false)} />
        </div>
      ) : null}

      {pendingAction ? (
        <ConfirmDialog
          title="Unsaved changes"
          body={pendingAction.kind === 'close'
            ? 'This file has unsaved changes. Closing it discards them.'
            : pendingAction.kind === 'new'
              ? 'This file has unsaved changes. Creating a new file discards them.'
              : 'This file has unsaved changes. Opening another file discards them.'}
          confirmLabel="Discard"
          onClose={() => setPendingAction(null)}
          onConfirm={() => {
            const action = pendingAction;
            setPendingAction(null);
            performFileAction(action);
          }}
        />
      ) : null}

      {nameRequest ? (
        <SaveAsDialog
          initialName={nameRequest.initialName}
          onClose={() => setNameRequest(null)}
          onConfirm={(name) => {
            const request = nameRequest;
            const normalizedName = normalizeFileName(name, '.ojn');
            setNameRequest(null);
            if (request.kind === 'new') {
              createNew(normalizedName, true);
            } else {
              void saveFiles(normalizedName, savePicker());
            }
          }}
        />
      ) : null}
    </>
  );
}

function FpsCounter() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let animation = 0;
    let frames = 0;
    let started = performance.now();
    const sample = (now: number) => {
      frames += 1;
      const elapsed = now - started;
      if (elapsed >= 1_000) {
        setFps(measuredFrameRate(frames, elapsed));
        frames = 0;
        started = now;
      }

      animation = requestAnimationFrame(sample);
    };

    animation = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(animation);
  }, []);

  return <output className="nt-fps mono" aria-label="Rendered frames per second" title="Rendered frames per second">{fps ?? '--'} FPS</output>;
}

function releaseImage(image: PreviewImage | null, urls: Set<string>): null {
  if (image) {
    URL.revokeObjectURL(image.url);
    urls.delete(image.url);
  }

  return null;
}

function imageFromOjn(label: PreviewImage['label'], bytes: Uint8Array, mime: string, urls: Set<string>): PreviewImage {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: mime }));
  urls.add(url);
  return { label, name: label === 'Cover Image' ? 'cover' : 'thumbnail', mime, bytes: copy, url };
}

function downloadBytes(bytes: Uint8Array, name: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileNameForTitle(title: string, extension: string): string {
  const base = title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Untitled';
  return `${base}${extension}`;
}

function normalizeFileName(name: string, extension: string): string {
  const base = name.toLowerCase().endsWith(extension) ? name.slice(0, -extension.length) : name;
  return fileNameForTitle(base, extension);
}
