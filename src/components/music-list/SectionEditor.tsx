import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { musicListVersion, type ListValue } from '../../o2jam';
import { StackHead } from '../Shell';
import { MusicSectionField, seedSectionRow } from './MusicSectionField';
import type { SectionRows } from '../../features/music-list/types';

export function SectionEditor({ version, sections, setSections, firstId, open, onToggle }: {
  version: ReturnType<typeof musicListVersion>;
  sections: SectionRows;
  setSections: Dispatch<SetStateAction<SectionRows>>;
  firstId: number;
  open: boolean;
  onToggle: () => void;
}) {
  const total = version.sections.reduce((count, section) => count + (sections[section.key]?.length ?? 0), 0);
  return (
    <section className="card">
      <button type="button" className="secttoggle" onClick={onToggle}><ChevronDown size={14} style={{ transform: open ? undefined : 'rotate(-90deg)' }} /><span>Extra sections</span><span className="count">{total ? `${total} entries` : 'optional'}</span></button>
      {open && version.sections.map((section) => {
        const rows = sections[section.key] ?? [];
        const columns = section.fields.filter((field) => field.key !== 'musicId');
        const set = (index: number, key: string, value: ListValue) => setSections((current) => ({ ...current, [section.key]: (current[section.key] ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
        return (
          <div key={section.key}>
            <StackHead title={section.label} tally={rows.length ? `${rows.length}` : undefined} />
            {rows.length > 0 && <div className="secgrid" style={{ '--fields': columns.length } as CSSProperties}><div className="secgrid-head"><span>Music ID</span>{columns.map((field) => <span key={field.key}>{field.label}</span>)}<span /></div>{rows.map((row, index) => <div className="secgrid-row" key={index}><input className="secinput" inputMode="numeric" value={String(row.musicId ?? '')} onChange={(event) => set(index, 'musicId', Number(event.target.value) || 0)} />{columns.map((field) => <MusicSectionField key={field.key} sectionKey={section.key} field={field} value={row[field.key]} onChange={(value) => set(index, field.key, value)} />)}<button className="rowact danger" type="button" aria-label="Remove row" onClick={() => setSections((current) => ({ ...current, [section.key]: (current[section.key] ?? []).filter((_, rowIndex) => rowIndex !== index) }))}><Trash2 size={13} /></button></div>)}</div>}
            <div className="pad"><button className="btn small" type="button" onClick={() => setSections((current) => ({ ...current, [section.key]: [...(current[section.key] ?? []), seedSectionRow(section.fields, firstId)] }))}><Plus size={13} />ADD ROW</button></div>
          </div>
        );
      })}
    </section>
  );
}
