import { Fragment, useMemo, useRef, useState } from 'react';
import { FileJson, RotateCcw, Save, X } from 'lucide-react';
import { PageHead, StackHead } from '../components/Shell';
import { DropZone } from '../components/DropZone';
import { WarningCard } from '../components/WarningCard';
import { useToast } from '../context/ToastContext';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { ClientPatchInputs } from '../components/client-patcher/ClientPatchInputs';
import { ClientPatchGuide } from '../components/client-patcher/ClientPatchGuide';
import { Tabs } from '../components/Tabs';
import { BUILTIN_PATCHES } from '../features/client-patcher/catalog';
import { applyPatchPlan, createPatchPlan, inspectDefinitions } from '../features/client-patcher/engine';
import { hex, readExecutable } from '../features/client-patcher/pe';
import { validateDefinition } from '../features/client-patcher/validation';
import type { PatchDefinition, Values } from '../features/client-patcher/types';
import { saveFile } from '../save';
import { fmtBytes } from '../format';

export default function ClientPatcherPage() {
  const [client, setClient] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [imported, setImported] = useState<PatchDefinition[]>([]);
  const [values, setValues] = useState<Record<string, Values>>({});
  const [error, setError] = useState('');
  const { notify } = useToast();
  const [operation, setOperation] = useState<'loading' | 'importing' | 'saving' | null>(null);
  const busy = operation !== null;
  const [tab, setTab] = useState<'patches' | 'guide'>('patches');
  const importInput = useRef<HTMLInputElement>(null);
  const loadId = useRef(0);
  const definitions = useMemo(
    () => [...BUILTIN_PATCHES, ...imported].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    [imported]
  );
  const pe = useMemo(() => (client ? readExecutable(client.bytes) : null), [client]);
  const inspection = useMemo(
    () => pe ? inspectDefinitions(pe, definitions) : { compatible: [], unavailable: [] },
    [pe, definitions]
  );
  const { compatible, unavailable } = inspection;
  const selections = useMemo(
    () =>
      compatible.map((patch) => ({
        patch,
        values: {
          ...patch.values,
          ...(Object.hasOwn(values, patch.definition.id) ? values[patch.definition.id] : {}),
        },
      })),
    [compatible, values]
  );
  const preview = useMemo(() => {
    if (!pe) {
      return { plan: null, error: '' };
    }

    try {
      return { plan: createPatchPlan(pe, selections), error: '' };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : 'Could not prepare patches.',
      };
    }
  }, [pe, selections]);
  const versions = [
    ...new Set(
      compatible.map((patch) => patch.variant.client.version).filter((version) => version !== '*')
    ),
  ];
  const categories = [...new Set(compatible.map((patch) => patch.definition.category))];

  async function load(file: File) {
    const request = ++loadId.current;
    setOperation('loading');
    setError('');

    try {
      if (file.size > 256 * 1024 * 1024) {
        throw new Error('Choose a client executable smaller than 256 MB.');
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const bytes = new Uint8Array(await file.arrayBuffer());
      readExecutable(bytes);

      if (request !== loadId.current) {
        return;
      }

      setClient({ name: file.name, bytes });
      setValues({});
    } catch (error) {
      if (request === loadId.current) {
        setError(error instanceof Error ? error.message : 'Could not read the client.');
      }
    } finally {
      if (request === loadId.current) {
        setOperation(null);
      }
    }
  }

  async function importFiles(files: File[]) {
    setError('');
    setOperation('importing');

    try {
      if (files.length > 64) {
        throw new Error('Import up to 64 definitions at a time.');
      }

      const additions: PatchDefinition[] = [];
      const ids = new Set(definitions.map((definition) => definition.id));

      for (const file of files) {
        if (file.size > 1024 * 1024) {
          throw new Error(`${file.name} exceeds the 1 MB definition limit.`);
        }

        let definition: PatchDefinition;

        try {
          definition = validateDefinition(JSON.parse(await file.text()));
        } catch (error) {
          throw new Error(
            `${file.name}: ${error instanceof Error ? error.message : 'Invalid JSON.'}`
          );
        }

        if (ids.has(definition.id)) {
          throw new Error(`A patch with ID “${definition.id}” is already loaded.`);
        }

        ids.add(definition.id);
        additions.push(definition);
      }

      if (definitions.length + additions.length > 256) {
        throw new Error('Up to 256 definitions can be loaded.');
      }

      setImported((current) => [...current, ...additions]);
      notify(`Imported ${additions.length} patch${additions.length === 1 ? '' : 'es'}.`, 'ok');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setOperation(null);
    }
  }

  async function save() {
    if (!preview.plan || !client) {
      return;
    }

    setOperation('saving');
    setError('');

    try {
      const output = applyPatchPlan(preview.plan);
      await saveFile(output, client.name.replace(/(?:\.patched)?\.exe$/i, '') + '.patched.exe');
      notify('Client saved.', 'ok');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setOperation(null);
    }
  }

  return (
    <>
      <PageHead
        title="Client Patcher"
        sub="Patch game client executable."
      />
      <section className="card pad">
        <DropZone
          accept=".exe"
          onlyExt={['exe']}
          label="Drop a client file"
          hint="OTwo.exe"
          onFiles={(files) => {
            if (files[0]) {
              return load(files[0]);
            }
          }}
          onRejected={() => setError('Choose a Windows .exe client.')}
          onError={(error) => setError(String(error))}
          after={
            <>
              <button className="btn" onClick={() => importInput.current?.click()} disabled={busy}>
                <FileJson size={14} /> IMPORT
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void importFiles(files);
                }}
              />
              <button
                className="btn primary"
                disabled={!client || busy || !preview.plan?.writes.length}
                onClick={() => void save()}
              >
                <Save size={14} /> {operation === 'saving' ? 'SAVING…' : 'SAVE'}
              </button>
            </>
          }
        />
        {client && (
          <div
            className="callout"
            style={{ marginTop: 16, padding: '16px 0 0', background: 'none' }}
          >
            <div className="co-main">
              <b className="mono">{client.name}</b>
              <div className="titlechips">
                <span className="field-hint">{fmtBytes(client.bytes.length)}</span>
                {versions.length ? (
                  versions.map((version) => (
                    <span className="chip" key={version}>
                      v{version}
                    </span>
                  ))
                ) : (
                  <span className="chip">Unrecognized build</span>
                )}
                <span className="chip">{compatible.length} compatible patches</span>
              </div>
            </div>
            <div className="co-actions">
              <button
                className="btn"
                aria-label="Reset changes"
                title="Reset changes"
                disabled={busy}
                onClick={() => {
                  setValues({});
                  setError('');
                  notify('Changes reset.');
                }}
              >
                <RotateCcw size={13} />
              </button>
              <button
                className="btn"
                aria-label="Close client"
                disabled={busy}
                onClick={() => {
                  loadId.current++;
                  setClient(null);
                  setValues({});
                  setError('');
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {(error || preview.error) && <WarningCard>{error || preview.error}</WarningCard>}
      {imported.length > 0 && (
        <section className="card pad" aria-label="Imported definitions">
          <div className="chips">
            {imported.map((definition) => (
              <span className="chip" key={definition.id}>
                {definition.title}
                <button
                  className="rowact"
                  disabled={busy}
                  aria-label={`Remove ${definition.title}`}
                  onClick={() => {
                    setImported((current) => current.filter((item) => item.id !== definition.id));
                    setValues((current) => {
                      const next = { ...current };
                      delete next[definition.id];
                      return next;
                    });
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <Tabs
          id="client-patcher"
          tabs={[{ id: 'patches', label: 'Patches' }, { id: 'guide', label: 'Custom patches' }]}
          active={tab}
          onChange={setTab}
        />
        <div role="tabpanel" id="client-patcher-patches-panel" aria-labelledby="client-patcher-patches" hidden={tab !== 'patches'}>
          {client && compatible.length === 0 && (
            <section>
              <StackHead title="No compatible patches" />
              <p className="pad field-hint">
                No patches match this client. Import a patch or open another file.
              </p>
            </section>
          )}
          {client && compatible.length > 0 && (
            <section aria-label="Client patches">
              {categories.map((category) => {
                const group = selections.filter(({ patch }) => patch.definition.category === category);
                const subgroups = [...new Set(group.map(({ patch }) => patch.definition.group ?? ''))];
                const hasSubgroups = subgroups.some(Boolean);
                const description = group[0]!.patch.definition.description;
                const sharedDescription =
                  Boolean(description) &&
                  group.length > 1 &&
                  group.every(({ patch }) => patch.definition.description === description);

                return (
                  <CollapsibleSection title={category} key={category}>
                    <div className={hasSubgroups ? 'pad form-fields' : undefined}>
                      {sharedDescription && (
                        <div className={hasSubgroups ? 'field-hint' : 'pad field-hint'}>
                          {description}
                        </div>
                      )}
                      {subgroups.map((subgroup) => (
                        <section
                          className={subgroup ? 'control-group' : undefined}
                          key={subgroup}
                          aria-label={subgroup || category}
                        >
                          {subgroup && <h3>{subgroup}</h3>}
                          <div
                            className={
                              subgroup ? 'control-group-fields form-fields' : 'pad form-fields'
                            }
                          >
                            {group
                              .filter(({ patch }) => (patch.definition.group ?? '') === subgroup)
                              .map(({ patch, values: inputs }) => {
                                const fields = patch.definition.inputs;
                                const single = fields.length === 1;
                                const check =
                                  single && ['checkbox', 'toggle'].includes(fields[0]!.control);

                                return (
                                  <Fragment key={patch.definition.id}>
                                    {!single && fields[0]!.label !== patch.definition.title &&
                                      (patch.definition.title !== subgroup || patch.definition.description) && (
                                      <div className="field">
                                        {patch.definition.title !== subgroup && (
                                          <label className="text-normal">{patch.definition.title}</label>
                                        )}
                                        {patch.definition.description && (
                                          <span className="hint">{patch.definition.description}</span>
                                        )}
                                      </div>
                                    )}
                                    <ClientPatchInputs
                                      inputs={fields}
                                      values={inputs}
                                      singleLabel={
                                        !check ? patch.definition.title : undefined
                                      }
                                      description={
                                        sharedDescription ? undefined : patch.definition.description
                                      }
                                      onChange={(id, value) => {
                                        setValues((current) => ({
                                          ...current,
                                          [patch.definition.id]: { ...inputs, [id]: value },
                                        }));
                                        setError('');
                                      }}
                                    />
                                  </Fragment>
                                );
                              })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </CollapsibleSection>
                );
              })}
              <CollapsibleSection title="Changes" defaultOpen={false}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="kvtable" aria-label="Byte changes">
                    <thead>
                      <tr>
                        <th scope="col">Patch</th>
                        <th scope="col">File offset</th>
                        <th scope="col">Before</th>
                        <th scope="col">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.plan?.writes.length ? (
                        preview.plan.writes.map((write) => (
                          <tr key={`${write.patchId}-${write.offset}`}>
                            <td>
                              {
                                compatible.find((patch) => patch.definition.id === write.patchId)
                                  ?.definition.title
                              }
                            </td>
                            <td>0x{write.offset.toString(16).toUpperCase()}</td>
                            <td className="ev">{hex(write.before)}</td>
                            <td className="ev">{hex(write.after)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="ev">
                            {preview.error ? 'Check the fields above.' : 'No changes.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            </section>
          )}
        </div>
        <div role="tabpanel" id="client-patcher-guide-panel" aria-labelledby="client-patcher-guide" hidden={tab !== 'guide'}>
          <ClientPatchGuide />
        </div>
      </section>
      {tab === 'patches' && client && unavailable.length > 0 && (
        <section className="card">
          <CollapsibleSection title="Unavailable patches" defaultOpen={false}>
            <table className="kvtable" aria-label="Patch matching results">
              <thead>
                <tr>
                  <th scope="col">Patch</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {unavailable.map(({ definition, reasons }) => (
                  <tr key={definition.id}>
                    <td>{definition.title}</td>
                    <td>{reasons.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleSection>
        </section>
      )}
    </>
  );
}
