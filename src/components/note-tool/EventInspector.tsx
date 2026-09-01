import type { EditorEventPatch, FoundChartEvent } from '../../features/note-tool/document';
import { volumeLevelToPercent, volumePercentToLevel } from '../../features/note-tool/editor';
import type { OjmSample, OjmSampleType } from '../../features/note-tool/model';
import { SampleBankPicker } from './SampleBankPicker';
import { SAMPLE_LANE_COUNT, type NoteLaneKey } from '../../features/note-tool/settings';
import { BpmInput } from './BpmInput';
import { measureGridPositionCount, type MeasureFraction } from '../../features/note-tool/measureScale';
import { FRACTION_OPTIONS } from '../../features/note-tool/timingValues';

export function EventInspector({
  event,
  keys,
  gridDivision,
  measureFractions,
  samples,
  selectionCount,
  onChange,
}: {
  event: FoundChartEvent | null;
  keys: NoteLaneKey[];
  gridDivision: number;
  measureFractions: readonly MeasureFraction[];
  samples: OjmSample[];
  selectionCount: number;
  onChange: (patch: EditorEventPatch) => void;
}) {
  if (selectionCount > 1) {
    return <div className="nt-inspector nt-inspector-empty">{selectionCount} events selected. Drag them to move.</div>;
  }

  if (!event) {
    return <div className="nt-inspector nt-inspector-empty">Select an event to inspect.</div>;
  }

  const absolutePosition = event.kind === 'fraction' ? event.event.measure : event.event.absolutePosition;
  const measure = Math.floor(absolutePosition);
  const positionFraction = absolutePosition - measure;
  const positionCount = measureGridPositionCount(measure, gridDivision, measureFractions);
  const positionStep = Math.min(positionCount - 1, Math.round(positionFraction * gridDivision));
  const changeMeasure = (nextMeasure: number) => {
    const measure = Math.max(0, Math.floor(nextMeasure));
    if (event.kind === 'fraction') {
      onChange({ measure });
    }
    else {
      const step = Math.min(positionStep, measureGridPositionCount(measure, gridDivision, measureFractions) - 1);
      onChange({ absolutePosition: measure + step / gridDivision });
    }
  };
  const changePosition = (step: number) => onChange({ absolutePosition: measure + step / gridDivision });

  return (
    <div className="nt-inspector">
      <div className="nt-fields nt-inspector-fields">
        <div className="nt-field-row">
          <label className="nt-field">
            <span>Measure</span>
            <input className="secinput mono" type="number" min="0" value={measure} onChange={(input) => changeMeasure(input.currentTarget.valueAsNumber || 0)} />
          </label>
          {event.kind !== 'fraction' ? (
            <label className="nt-field">
              <span>Position</span>
              <select className="selctl mono" value={positionStep} onChange={(input) => changePosition(Number(input.currentTarget.value))}>
                {Array.from({ length: positionCount }, (_, step) => <option value={step} key={step}>{step + 1}/{gridDivision}</option>)}
              </select>
            </label>
          ) : (
            <label className="nt-field">
              <span>Fraction</span>
              <select className="selctl mono" value={event.event.fraction} onChange={(input) => onChange({ fraction: Number(input.currentTarget.value) })}>
                {FRACTION_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
        </div>

        {event.kind === 'bpm' ? (
          <label className="nt-field">
            <span>BPM</span>
            <BpmInput value={event.event.bpm} onChange={(bpm) => onChange({ bpm })} />
          </label>
        ) : null}

        {event.kind === 'note' ? (
          <>
            <div className="nt-field-row">
              <label className="nt-field">
                <span>Note Type</span>
                <select className="selctl" value={event.event.duration ? 'long' : 'tap'} onChange={(input) => onChange({ duration: input.currentTarget.value === 'long' ? event.event.duration ?? 1 / 16 : null })}>
                  <option value="tap">Tap</option>
                  <option value="long">Long</option>
                </select>
              </label>
              <label className="nt-field">
                <span>Lane</span>
                <select className="selctl" value={event.event.key} onChange={(input) => onChange({ key: input.currentTarget.value as NoteLaneKey })}>
                  {keys.map((key, index) => <option value={key} key={key}>{index + 1} · {key}</option>)}
                </select>
              </label>
            </div>
            {event.event.duration ? (
              <label className="nt-field">
                <span>Length (measures)</span>
                <input className="secinput mono" type="number" min={1 / 32} step={1 / 32} value={event.event.duration} onChange={(input) => onChange({ duration: input.currentTarget.valueAsNumber || 1 / 16 })} />
              </label>
            ) : null}
            <AudioEventFields event={event.event} samples={samples} onChange={onChange} />
          </>
        ) : null}

        {event.kind === 'autoplay' ? (
          <>
            <label className="nt-field">
              <span>Stack Lane</span>
              <input className="secinput mono" type="number" min="1" max={SAMPLE_LANE_COUNT} value={event.event.lane} onChange={(input) => onChange({ lane: input.currentTarget.valueAsNumber || 1 })} />
            </label>
            <AudioEventFields event={event.event} samples={samples} onChange={onChange} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function AudioEventFields({
  event,
  samples,
  onChange,
}: {
  event: { sampleId: number; sampleType: OjmSampleType; volume: number; pan: number };
  samples: OjmSample[];
  onChange: (patch: EditorEventPatch) => void;
}) {
  return (
    <>
      <SampleBankPicker samples={samples} sampleId={event.sampleId} sampleType={event.sampleType} onChange={(sample) => onChange({ sampleId: sample.id, sampleType: sample.type })} />
      <div className="nt-field-row">
        <label className="nt-field">
          <span>Volume</span>
          <input className="secinput mono" type="number" min="1" max="16" step="1" value={volumePercentToLevel(event.volume)} onChange={(input) => onChange({ volume: volumeLevelToPercent(input.currentTarget.valueAsNumber) })} />
        </label>
        <label className="nt-field">
          <span>Pan</span>
          <input className="secinput mono" type="number" min="-7" max="7" step="1" value={event.pan} onChange={(input) => onChange({ pan: input.currentTarget.valueAsNumber || 0 })} />
        </label>
      </div>
    </>
  );
}
