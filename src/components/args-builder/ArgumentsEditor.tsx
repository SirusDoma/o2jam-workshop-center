import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ClipboardPaste } from 'lucide-react';
import {
  blobFieldsFor,
  buildArguments,
  getCipher,
  parseAuthParams,
  tryDecodeLaunchToken,
  type ArgumentsFieldKey,
  type ArgumentsPreset,
  type AuthParamKey,
  type AuthParams,
  type Gateway,
} from '../../o2jam';
import { StackHead } from '../Shell';
import { Tabs } from '../Tabs';
import { ArgumentOutput, GrammarPanel } from './ArgumentOutput';
import { FTP_ROW_KEYS, FtpServersField, GatewayField, PresetField, RankBlobField } from './ArgumentFields';

export function ArgumentsEditor({ preset, header }: { preset: ArgumentsPreset; header: ReactNode }) {
  const [fields, setFields] = useState<Partial<Record<ArgumentsFieldKey, string>>>({});
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [blob, setBlob] = useState<Partial<AuthParams>>({});
  const [tab, setTab] = useState<'form' | 'import' | 'grammar'>('form');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setFields({ ...preset.defaults.fields });
    setGateways([...preset.defaults.gateways]);
    setBlob({ ...(preset.defaults.authParams ?? {}) });
    setTab('form');
    setImportText('');
    setImportError(null);
  }, [preset]);

  const importEncoded = (text: string) => {
    setImportText(text);
    const trimmed = text.trim().replace(/\^/g, '');
    if (trimmed === '') {
      setImportError(null);
      return;
    }

    if (preset.tokenEncoding !== 'plain') {
      const decoded = tryDecodeLaunchToken(trimmed);
      if (decoded === null) {
        setImportError('Not a valid encoded launch token.');
        return;
      }
      setFields((current) => ({ ...current, token: decoded }));
      setTab('form');
    } else {
      try {
        const [head = '', ...pipes] = trimmed.split('|');
        const plaintext = getCipher(preset.cipher!).decrypt(head.trim());
        const { gatewayAddress, gatewayPort, ...rest } = parseAuthParams(plaintext);
        setBlob(rest);
        const imported: Gateway[] = [];
        for (let i = 0; i + 3 < pipes.length; i += 4) {
          imported.push({ address: pipes[i + 2] ?? '', port: pipes[i + 3] ?? '' });
        }
        if (imported.length > 0) setGateways(imported);
        else if (gatewayAddress !== '') setGateways([{ address: gatewayAddress, port: gatewayPort }]);
        setTab('form');
      } catch {
        setImportError('Unable to decrypt or parse the parameters.');
        return;
      }
    }
    setImportText('');
    setImportError(null);
  };

  const result = useMemo(
    () => buildArguments(preset, { fields, gateways, authParams: blob }),
    [preset, fields, gateways, blob]
  );
  const usesBlob = preset.cipher !== undefined;
  const importable = preset.tokenEncoding !== 'plain' || usesBlob;

  return (
    <>
      <div className="stickyhead">
        {header}
        <ArgumentOutput result={result} />
      </div>

      <section className="card reveal" style={{ '--d': '0.12s' } as CSSProperties}>
        <Tabs
          tabs={[
            { id: 'form', label: 'PARAMETERS' },
            ...(importable ? ([{ id: 'import', label: 'IMPORT' }] as const) : []),
            { id: 'grammar', label: 'GRAMMAR' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'import' && importable && (
          <div className="dialog-body">
            <div className="field">
              <label htmlFor="f-import">{usesBlob ? 'Encrypted parameters' : 'Encoded auth token'}</label>
              <span className="hint">
                {usesBlob
                  ? 'Paste an encrypted parameter blob to fill the parameters.'
                  : 'Paste an encoded launch token to fill the auth token.'}
              </span>
              <textarea
                id="f-import"
                className="mono"
                rows={4}
                value={importText}
                onChange={(event) => importEncoded(event.target.value)}
              />
              {importError && (
                <span className="hint" style={{ color: 'var(--warn)' }}>
                  {importError}
                </span>
              )}
              <button
                className="btn small"
                type="button"
                style={{ alignSelf: 'flex-start' }}
                onClick={() =>
                  navigator.clipboard
                    .readText()
                    .then(importEncoded)
                    .catch(() => setImportError('Clipboard is not accessible.'))
                }
              >
                <ClipboardPaste size={13} />
                PASTE
              </button>
            </div>
          </div>
        )}

        {tab === 'form' && !usesBlob && (
          <div className="dialog-body">
            {preset.fields.map((field) =>
              field.kind === 'gateways' ? (
                <GatewayField key={field.key} gateways={gateways} onChange={setGateways} />
              ) : (
                <PresetField
                  key={field.key}
                  field={field}
                  value={fields[field.key] ?? field.default ?? ''}
                  onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
                />
              )
            )}
          </div>
        )}

        {tab === 'form' && usesBlob && (
          <>
            <div className="dialog-body">
              <FtpServersField preset={preset} blob={blob} onChange={setBlob} />
              {blobFieldsFor(preset)
                .filter((field) => !FTP_ROW_KEYS.includes(field.key))
                .map((field) =>
                  field.key === 'rank' ? (
                    <RankBlobField
                      key={field.key}
                      field={field}
                      value={blob.rank}
                      onChange={(value) => setBlob((current) => ({ ...current, rank: value }))}
                    />
                  ) : (
                    <div className={`field${field.inert ? ' inert' : ''}`} key={field.key}>
                      <label htmlFor={`b-${field.key}`}>{field.label}</label>
                      {field.hint && <span className="hint">{field.hint}</span>}
                      {field.options ? (
                        <select
                          id={`b-${field.key}`}
                          value={blob[field.key as AuthParamKey] ?? field.default}
                          onChange={(event) =>
                            setBlob((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`b-${field.key}`}
                          className="mono"
                          value={blob[field.key as AuthParamKey] ?? ''}
                          maxLength={field.maxLength}
                          placeholder={field.default}
                          onChange={(event) =>
                            setBlob((current) => ({ ...current, [field.key]: event.target.value }))
                          }
                        />
                      )}
                    </div>
                  )
                )}
              <GatewayField gateways={gateways} onChange={setGateways} />
            </div>
            {result.plaintext && (
              <>
                <StackHead
                  title="plaintext"
                  tally={`${result.plaintext.length} chars`}
                />
                <pre className="logpre" style={{ minHeight: 0 }}>
                  {result.plaintext}
                </pre>
              </>
            )}
          </>
        )}

        {tab === 'grammar' && <GrammarPanel preset={preset} />}
      </section>
    </>
  );
}
