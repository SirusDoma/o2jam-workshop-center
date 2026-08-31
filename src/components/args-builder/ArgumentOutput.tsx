import { useState, type CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { buildArguments, type ArgumentsPreset } from '../../o2jam';
import { CopyButton } from '../../components/CopyButton';
import { StackHead } from '../../components/Shell';

export function ArgumentOutput({ result }: { result: ReturnType<typeof buildArguments>; }) {
  const [escape, setEscape] = useState(true);
  const command = escape ? result.command.replace(/\|/g, '^|') : result.command;
  const escapable = result.command.includes('|');

  return (
    <section className="card reveal" style={{ '--d': '0.16s' } as CSSProperties}>
      <StackHead
        title="command"
        tally={`${result.argv.length} argument${result.argv.length === 1 ? '' : 's'}`}
      />

      {result.errors.length > 0 && (
        <div className="callout warn">
          <AlertTriangle size={15} />
          <div className="co-main">
            <span>
              <b>
                {result.errors.length} problem{result.errors.length > 1 ? 's' : ''} to fix
              </b>
            </span>
            <ul className="orphanlist">
              {result.errors.map((e, i) => (
                <li key={i}>
                  <span className="on-name" title={e.message}>
                    {e.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result.warning && (
        <div className="callout warn">
          <AlertTriangle size={15} />
          <div className="co-main">
            <b>Warning</b>
            <span>{result.warning}</span>
          </div>
        </div>
      )}

      {result.ok && (
        <>
          <div className="pad">
            <pre className="launchout">{command}</pre>
          </div>
          <div className="dialogfoot">
            <CopyButton value={command} label="Copy command" variant="button" />
            {escapable && (
              <label className="checkline">
                <input type="checkbox" checked={escape} onChange={(e) => setEscape(e.target.checked)} />
                <span className="cl-text">
                  <span>Escape for shell</span>
                </span>
              </label>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function GrammarPanel({ preset }: { preset: ArgumentsPreset; }) {
  return (
    <>
      <StackHead title="template" />
      <div className="pad">
        <pre className="launchout">{preset.grammar.template}</pre>
      </div>
      <StackHead title="example" />
      <div className="pad">
        <pre className="launchout">{preset.grammar.example}</pre>
      </div>
    </>
  );
}
