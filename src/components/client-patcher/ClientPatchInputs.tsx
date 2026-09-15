import { useId } from 'react';
import { matches } from '../../features/client-patcher/validation';
import type { InputDefinition, Row, Value, Values } from '../../features/client-patcher/types';

export function ClientPatchInputs({
  inputs,
  values,
  onChange,
  singleLabel,
  description,
}: {
  inputs: InputDefinition[];
  values: Values;
  onChange: (id: string, value: Value) => void;
  singleLabel?: string;
  description?: string;
}) {
  const prefix = useId();

  const visible = inputs.filter((input) => matches(input.visibleWhen, values));
  const groups = [...new Set(visible.map((input) => input.group ?? ''))];
  const renderInput = (input: InputDefinition) => {
    const id = `${prefix}-${input.id}`;
    const label = inputs.length === 1 ? (singleLabel ?? input.label) : input.label;
    const showDescription = inputs.length === 1 || input === inputs[0] && input.label === singleLabel;
    const help = [showDescription ? description : undefined, input.description]
      .filter(Boolean)
      .join(' ');
    const hint = help ? `${id}-hint` : undefined;

    if (input.control === 'rows') {
      const rows = (Array.isArray(values[input.id]) ? values[input.id] : []) as Row[];
      return (
        <div className="form-fields" role="group" aria-labelledby={`${id}-label`} key={input.id}>
          <div className="field">
            <label className="checkline" id={`${id}-label`}>{label}</label>
            {help && <span className="hint" id={hint}>{help}</span>}
          </div>
          {rows.map((row, index) => (
            <div className="control-group" key={index}>
              <div className="control-group-fields form-fields">
                <ClientPatchInputs inputs={input.fields!} values={row} onChange={(field, value) => {
                  if (Array.isArray(value)) return;
                  onChange(input.id, rows.map((item, i) => i === index ? { ...item, [field]: value } : item));
                }} />
                <div className="actions">
                  <button type="button" className="btn" aria-label={`Remove ${label} row ${index + 1}`}
                    onClick={() => onChange(input.id, rows.filter((_, i) => i !== index))}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          <div className="actions">
            <button type="button" className="btn" disabled={rows.length >= input.maxRows!} onClick={() => {
              const row = Object.fromEntries(input.fields!.map((field) => [field.id, field.default])) as Row;
              const key = input.uniqueBy;
              if (key && typeof row[key] === 'number') {
                while (rows.some((item) => item[key] === row[key])) row[key] = Number(row[key]) + 1;
              }
              onChange(input.id, [...rows, row]);
            }}>{input.addLabel ?? 'Add row'}</button>
          </div>
        </div>
      );
    }

    if (input.control === 'checkbox' || input.control === 'toggle') {
      return (
        <div className="field checkfield" key={input.id}>
          <label className="checkline stacked" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              role={input.control === 'toggle' ? 'switch' : undefined}
              checked={values[input.id] === true}
              aria-describedby={hint}
              onChange={(event) => onChange(input.id, event.target.checked)}
            />
            <span className="cl-text">
              <span>{label}</span>
              {help && (
                <span className="hint" id={hint}>
                  {help}
                </span>
              )}
            </span>
          </label>
        </div>
      );
    }

    if (input.control === 'radio') {
      return (
        <div className="field" key={input.id}>
          <label className="text-normal" id={`${id}-label`}>{label}</label>
          {help && (
            <span className="hint" id={hint}>
              {help}
            </span>
          )}
          <div
            className="netlines"
            role="radiogroup"
            aria-labelledby={`${id}-label`}
            aria-describedby={hint}
          >
            {input.options?.map((option, i) => (
              <label className="checkline" key={i}>
                <input
                  type="radio"
                  name={id}
                  checked={values[input.id] === option.value}
                  onChange={() => onChange(input.id, option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (input.control === 'range') {
      return (
        <div className="field" key={input.id}>
          <label className="text-normal" htmlFor={id}>{label}</label>
          {help && <span className="hint" id={hint}>{help}</span>}
          <div className="field-range">
            <input id={id} type="range" min={input.min} max={input.max} step={1}
              value={Number(values[input.id])} aria-describedby={hint}
              aria-valuetext={input.suffix ? `${values[input.id]}${input.suffix}` : undefined}
              onChange={(event) => onChange(input.id, event.target.valueAsNumber)} />
            <output className="mono" htmlFor={id}>{String(values[input.id])}{input.suffix}</output>
          </div>
        </div>
      );
    }

    return (
      <div className={`field${input.control === 'number' ? ' small' : ''}`} key={input.id}>
        <label className="text-normal" htmlFor={id}>{label}</label>
        {help && (
          <span className="hint" id={hint}>
            {help}
          </span>
        )}
        {input.control === 'select' ? (
          <select
            id={id}
            aria-describedby={hint}
            value={input.options?.findIndex((option) => option.value === values[input.id])}
            onChange={(event) =>
              onChange(input.id, input.options![Number(event.target.value)]!.value)
            }
          >
            {input.options?.map((option, i) => (
              <option key={i} value={i}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className="mono"
            type={input.control === 'number' ? 'number' : 'text'}
            aria-describedby={hint}
            min={input.min}
            max={input.max}
            maxLength={input.maxLength}
            step={input.format === 'port' ? 1 : 'any'}
            value={
              typeof values[input.id] === 'number' && !Number.isFinite(values[input.id])
                ? ''
                : String(values[input.id] ?? '')
            }
            spellCheck={false}
            onChange={(event) =>
              onChange(
                input.id,
                input.control === 'number' ? event.target.valueAsNumber : event.target.value
              )
            }
          />
        )}
      </div>
    );
  };

  if (inputs.length === 1) {
    return visible.map(renderInput);
  }

  return (
    <>
      {groups.map((group) => (
        <div className={group ? 'inline-form' : 'form-fields'} key={group} role="group" aria-label={group || undefined}>
          {visible.filter((input) => (input.group ?? '') === group).map(renderInput)}
        </div>
      ))}
    </>
  );
}
