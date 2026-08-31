import { Plus, X } from 'lucide-react';
import {
  DEFAULT_GATEWAY_PORT,
  UNRANKED_FREE_PASS_RANK,
  blobFieldsFor,
  encodeRanking,
  type AuthParamKey,
  type AuthParams,
  type ArgumentsPreset,
  type Gateway,
  type ResolvedBlobField,
} from '../../o2jam';

export const FTP_ROW_KEYS: readonly string[] = ['ftpAddresses', 'ftpPath1', 'ftpPath2'];

export function FtpServersField({
  preset,
  blob,
  onChange,
}: {
  preset: ArgumentsPreset;
  blob: Partial<AuthParams>;
  onChange: (v: Partial<AuthParams>) => void;
}) {
  const meta = blobFieldsFor(preset);
  const def = (key: AuthParamKey) => meta.find((f) => f.key === key)?.default ?? '';
  const defAddr = def('ftpAddresses').split('|');
  const typed = (blob.ftpAddresses ?? '').split('|');
  const addr = [typed[0] ?? '', typed[1] ?? ''];
  const paths = [blob.ftpPath1 ?? '', blob.ftpPath2 ?? ''];

  const setAddr = (i: number, v: string) => {
    const next = [...addr];
    next[i] = v;
    onChange({ ...blob, ftpAddresses: next.some((h) => h !== '') ? next.join('|') : '' });
  };
  const setPath = (i: number, v: string) => onChange({ ...blob, [i === 0 ? 'ftpPath1' : 'ftpPath2']: v });

  return (
    <div className="field">
      <label>FTP servers</label>
      <span className="hint">Music shop download servers.</span>
      {[0, 1].map((i) => (
        <div className="ftprow" key={i}>
          <input
            className="mono"
            value={addr[i] ?? ''}
            placeholder={defAddr[i] ?? defAddr[0] ?? '127.0.0.1'}
            aria-label={`FTP address ${i + 1}`}
            onChange={(e) => setAddr(i, e.target.value)}
          />
          <input
            className="mono"
            value={paths[i] ?? ''}
            placeholder={def(i === 0 ? 'ftpPath1' : 'ftpPath2')}
            aria-label={`FTP path ${i + 1}`}
            onChange={(e) => setPath(i, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
export function RankBlobField({
  field,
  value,
  onChange,
}: {
  field: ResolvedBlobField;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const raw = Number.parseInt(value ?? field.default, 10);
  const encoded = Number.isNaN(raw) ? 0 : raw;
  const freePass = encoded < 0;
  const shown = encoded === UNRANKED_FREE_PASS_RANK ? 0 : Math.abs(encoded);
  const put = (magnitude: number, fp: boolean) => onChange(String(encodeRanking(magnitude, fp)));

  return (
    <div className="field">
      <label htmlFor={`b-${field.key}`}>{field.label}</label>
      {field.hint && <span className="hint">{field.hint}</span>}
      <input
        id={`b-${field.key}`}
        className="mono"
        inputMode="numeric"
        value={String(shown)}
        onChange={(e) => put(Number.parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0, freePass)}
      />
      <label className="checkline" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={freePass} onChange={(e) => put(shown, e.target.checked)} />
        <span className="cl-text">
          <span>FreePass active</span>
        </span>
      </label>
    </div>
  );
}

export function PresetField({
  field,
  value,
  onChange,
}: {
  field: ArgumentsPreset['fields'][number];
  value: string;
  onChange: (v: string) => void;
}) {
  const listId = field.suggestions ? `sugg-${field.key}` : undefined;

  if (field.kind === 'boolean') {
    return (
      <div className="field checkfield">
        <label className="checkline">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          />
          <span className="cl-text">
            <span>{field.label}</span>
            {field.hint && <span className="hint">{field.hint}</span>}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className={`field${field.inert ? ' inert' : ''}`}>
      <label htmlFor={`f-${field.key}`}>{field.label}</label>
      {field.hint && <span className="hint">{field.hint}</span>}
      {field.kind === 'select' && field.options ? (
        <select id={`f-${field.key}`} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            id={`f-${field.key}`}
            className={field.kind === 'number' ? 'mono' : undefined}
            inputMode={field.kind === 'number' ? 'numeric' : undefined}
            value={value}
            maxLength={field.maxLength}
            placeholder={field.default}
            list={listId}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.suggestions && (
            <datalist id={listId}>
              {field.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  );
}

export function GatewayField({
  gateways,
  onChange,
}: {
  gateways: Gateway[];
  onChange: (g: Gateway[]) => void;
}) {
  const set = (i: number, patch: Partial<Gateway>) =>
    onChange(gateways.map((g, n) => (n === i ? { ...g, ...patch } : g)));

  return (
    <div className="field">
      <label>Gateways</label>
      <span className="hint">Gateway servers that represents planets in-game.</span>
      {gateways.map((g, i) => (
        <div className="gwrow" key={i}>
          <input
            className="mono"
            value={g.address}
            placeholder="127.0.0.1"
            aria-label={`Gateway ${i + 1} address`}
            onChange={(e) => set(i, { address: e.target.value })}
          />
          <input
            className="mono"
            value={String(g.port)}
            placeholder={String(DEFAULT_GATEWAY_PORT)}
            aria-label={`Gateway ${i + 1} port`}
            onChange={(e) => set(i, { port: e.target.value })}
          />
          <button
            className="rowact danger"
            type="button"
            aria-label={`Remove gateway ${i + 1}`}
            disabled={gateways.length <= 1}
            onClick={() => onChange(gateways.filter((_, n) => n !== i))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        className="envadd"
        type="button"
        onClick={() =>
          onChange([...gateways, { address: '127.0.0.1', port: DEFAULT_GATEWAY_PORT + gateways.length }])
        }
      >
        <Plus size={13} />
        ADD GATEWAY
      </button>
    </div>
  );
}
