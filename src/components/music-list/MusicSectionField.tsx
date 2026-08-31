import { useRef } from 'react';
import { MUSIC_LABELS, type LabelledId, type ListField, type ListValue } from '../../o2jam';

const CHECK_FIELDS = new Set([
  'new.newFlag',
  'new.premiumNewFlag',
  'new.newOverride',
  'planet.standardPlanets',
  'planet.superEasy',
  'planet.easy',
  'planet.fallbackAvailability',
  'superEasy.availability',
  'vipExclusion.availability',
  'freeMusic.freeFlag',
]);

const ENUM_FIELDS: Record<string, readonly LabelledId[]> = {
  'musicLabel.labelId': MUSIC_LABELS,
  'keyMode.keyMode': [
    { id: 0, label: 'Default' },
    { id: 3, label: '3K' },
    { id: 5, label: '5K' },
    { id: 7, label: '7K' },
  ],
  'mission.difficulty': [
    { id: 1, label: 'EX' },
    { id: 2, label: 'NX' },
    { id: 3, label: 'HX' },
  ],
};

export function MusicSectionField({ sectionKey, field, value, onChange }: {
  sectionKey: string;
  field: ListField;
  value: ListValue | undefined;
  onChange: (value: ListValue) => void;
}) {
  const path = `${sectionKey}.${field.key}`;
  if (CHECK_FIELDS.has(path)) {
    return <CheckField value={value} onChange={onChange} />;
  }

  const options = ENUM_FIELDS[path];
  if (options) {
    return <EnumField value={value} options={options} onChange={onChange} />;
  }

  if (field.type === 'char') {
    const date = /date/i.test(field.label);
    return <input className="secinput" value={String(value ?? '')} placeholder={date ? 'yyyy-MM-dd' : undefined} onChange={(event) => onChange(event.target.value)} />;
  }

  if (field.type === 'bytes') {
    return <input className="secinput" value={String(value ?? '')} placeholder="hex" onChange={(event) => onChange(event.target.value)} />;
  }

  return <input className="secinput" inputMode="numeric" value={String(value ?? 0)} onChange={(event) => onChange(Number(event.target.value) || 0)} />;
}

export function seedSectionRow(fields: readonly ListField[], musicId: number): Record<string, ListValue> {
  const row: Record<string, ListValue> = {};
  for (const field of fields) row[field.key] = field.type === 'char' ? '' : 0;
  row.musicId = musicId;
  return row;
}

function CheckField({ value, onChange }: { value: ListValue | undefined; onChange: (value: ListValue) => void; }) {
  const raw = Number(value) || 0;
  const previous = useRef(raw !== 0 ? raw : 1);
  if (raw !== 0) {
    previous.current = raw;
  }

  return <label className="checkline"><input type="checkbox" checked={raw !== 0} onChange={(event) => onChange(event.target.checked ? previous.current : 0)} />{raw !== 0 && raw !== 1 && <span className="dz-hint">value {raw}</span>}</label>;
}

function EnumField({ value, options, onChange }: { value: ListValue | undefined; options: readonly LabelledId[]; onChange: (value: ListValue) => void; }) {
  const raw = Number(value) || 0;
  const known = options.some((option) => option.id === raw);
  return (
    <select className="secinput" value={String(raw)} onChange={(event) => onChange(Number(event.target.value))}>
      {!known && <option value={String(raw)}>{raw === 0 ? 'Default' : `${raw} — unknown`}</option>}
      {options.map((option) => <option key={option.id} value={String(option.id)}>{option.label}</option>)}
    </select>
  );
}
