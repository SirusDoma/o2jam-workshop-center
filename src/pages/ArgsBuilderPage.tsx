import { useMemo, useState } from 'react';
import {
  CLIENT_VERSIONS,
  getPreset,
  presetsForVersion,
  type ClientVersionId,
} from '../o2jam';
import { PageHead } from '../components/Shell';
import { ArgumentsEditor } from '../components/args-builder/ArgumentsEditor';
import { PresetSelector } from '../components/args-builder/PresetSelector';

export default function ArgsBuilderPage() {
  const [versionId, setVersionId] = useState<ClientVersionId>('3.82');
  const [presetId, setPresetId] = useState<string>(() => presetsForVersion('3.82')[0]?.id ?? '');
  const presets = useMemo(() => presetsForVersion(versionId), [versionId]);
  const preset = getPreset(presetId);

  return (
    <ArgumentsEditor
      preset={preset}
      header={
        <>
        <PageHead
          title="Arguments Builder"
          sub="Generate a client's launch command."
          actions={
            <select
              className="selctl"
              value={versionId}
              aria-label="Client version"
              onChange={(event) => {
                const id = event.target.value as ClientVersionId;
                setVersionId(id);
                setPresetId(presetsForVersion(id)[0]?.id ?? '');
              }}
            >
              {CLIENT_VERSIONS.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.clientVersion} — {version.label}
                </option>
              ))}
            </select>
          }
        />

        <PresetSelector presets={presets} selected={presetId} onSelect={setPresetId} />
        </>
      }
    />
  );
}
