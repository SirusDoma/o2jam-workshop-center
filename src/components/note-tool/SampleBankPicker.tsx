import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { scrollNearest } from '../../features/note-tool/dom';
import { formatSampleSlot, sampleSlotIds, type OjmSample, type OjmSampleType } from '../../features/note-tool/model';

export function SampleBankPicker({
  samples,
  sampleId,
  sampleType,
  overlay = false,
  className = '',
  onChange,
}: {
  samples: OjmSample[];
  sampleId: number;
  sampleType: OjmSampleType;
  overlay?: boolean;
  className?: string;
  onChange: (sample: Pick<OjmSample, 'id' | 'type'>) => void;
}) {
  const [type, setType] = useState<OjmSampleType>(sampleType);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selectedOption = useRef<HTMLButtonElement>(null);
  useEffect(() => setType(sampleType), [sampleType]);
  useEffect(() => {
    if (open) {
      setType(sampleType);
      setQuery('');
    }
  }, [open, sampleType]);
  useEffect(() => {
    if (open) {
      scrollNearest(selectedOption.current);
    }
  }, [open, query, sampleId, sampleType, type]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  const sampleById = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const slots = useMemo(() => sampleSlotIds(type), [type]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSlots = slots.filter((id) => {
    const sample = sampleById.get(id);
    return !normalizedQuery
      || formatSampleSlot(type, id).toLowerCase().includes(normalizedQuery)
      || sample?.name.toLowerCase().includes(normalizedQuery);
  });
  const selectedSample = samples.find((sample) => sample.id === sampleId);

  return (
    <div className={`nt-field nt-sample-bank-field${className ? ` ${className}` : ''}`}>
      <span>Sample</span>
      <div className={`nt-sample-picker${open ? ' open' : ''}${overlay ? ' is-overlay' : ''}`} ref={root}>
        <button className="nt-sample-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <b>{sampleType.toUpperCase()}</b>
          <span className="mono">{formatSampleSlot(sampleType, sampleId)}</span>
          <span>{selectedSample?.name ?? 'Empty'}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        {open ? (
          <div className="nt-sample-picker-menu">
            <div className="nt-sample-picker-tabs" role="tablist" aria-label="Sample bank">
              {(['wav', 'ogg'] as const).map((nextType) => (
                <button className={type === nextType ? 'on' : ''} type="button" role="tab" aria-selected={type === nextType} key={nextType} onClick={() => { setType(nextType); setQuery(''); }}>
                  {nextType.toUpperCase()}
                </button>
              ))}
            </div>
            <input className="secinput nt-sample-search" type="search" value={query} aria-label={`Search ${type.toUpperCase()} sample bank`} placeholder={`Search ${type.toUpperCase()} samples`} onChange={(input) => setQuery(input.currentTarget.value)} />
            <div className="nt-sample-picker-results" role="listbox" aria-label={`${type.toUpperCase()} samples`}>
              {visibleSlots.length > 0 ? visibleSlots.map((id) => {
                const sample = sampleById.get(id);
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={id === sampleId && type === sampleType}
                    key={id}
                    ref={id === sampleId && type === sampleType ? selectedOption : undefined}
                    onClick={() => { onChange({ id, type }); setOpen(false); }}
                  >
                    <span className="mono">{formatSampleSlot(type, id)}</span>
                    <span>{sample?.name ?? 'Empty'}</span>
                  </button>
                );
              }) : <span>No matching {type.toUpperCase()} samples</span>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
