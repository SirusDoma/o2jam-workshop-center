import type { Dispatch, SetStateAction } from 'react';
import { ENCODINGS, musicListVersion, type ListValue, type O2Encoding } from '../../o2jam';
import { EncodingSelect } from '../EncodingSelect';
import { MusicSectionField, seedSectionRow } from './MusicSectionField';
import type { SectionRows } from '../../features/music-list/types';

export function MusicSections({ version, songId, sections, setSections, detected, override, fallback, onOverride }: {
  version: ReturnType<typeof musicListVersion>;
  songId: number;
  sections: SectionRows;
  setSections: Dispatch<SetStateAction<SectionRows>>;
  detected?: O2Encoding;
  override?: O2Encoding;
  fallback: O2Encoding;
  onOverride: (encoding: O2Encoding | undefined) => void;
}) {
  const rowOf = (key: string) => (sections[key] ?? []).find((row) => Number(row.musicId) === songId) ?? null;
  const toggle = (key: string, enabled: boolean) => setSections((current) => {
    const rows = current[key] ?? [];
    if (enabled) {
      if (rows.some((row) => Number(row.musicId) === songId)) return current;
      const section = version.sections.find((entry) => entry.key === key)!;
      return { ...current, [key]: [...rows, seedSectionRow(section.fields, songId)] };
    }
    return { ...current, [key]: rows.filter((row) => Number(row.musicId) !== songId) };
  });
  const setField = (key: string, field: string, value: ListValue) => setSections((current) => ({
    ...current,
    [key]: (current[key] ?? []).map((row) => Number(row.musicId) === songId ? { ...row, [field]: value } : row),
  }));
  const encodingLabel = (encoding: O2Encoding) => ENCODINGS.find((entry) => entry.id === encoding)?.label ?? encoding;

  return (
    <div className="songedit">
      <div className="songsec">
        <div className="songsec-head songsec-name">Text Encoding<span className="songsec-sub">{detected ? `Detected ${encodingLabel(detected)}.` : `Not Detected (Fallback: ${encodingLabel(fallback)})`}</span></div>
        <div className="songfields"><label className="songfield"><span>Encoding</span><EncodingSelect className="secinput" value={override ?? 'auto'} autoLabel="Auto" onChange={(value) => onOverride(value === 'auto' ? undefined : value)} /></label></div>
      </div>
      {version.sections.map((section) => {
        const row = rowOf(section.key);
        return (
          <div className="songsec" key={section.key}>
            <label className="checkline stacked songsec-head"><input type="checkbox" checked={!!row} onChange={(event) => toggle(section.key, event.target.checked)} /><span className="songsec-name">{section.label}</span></label>
            {row && <div className="songfields">{section.fields.filter((field) => field.key !== 'musicId').map((field) => <label className="songfield" key={field.key}><span>{field.label}</span><MusicSectionField sectionKey={section.key} field={field} value={row[field.key]} onChange={(value) => setField(section.key, field.key, value)} /></label>)}</div>}
          </div>
        );
      })}
    </div>
  );
}
