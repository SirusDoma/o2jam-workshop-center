import type { ReactNode } from 'react';
import { Rss } from 'lucide-react';
import { Navbar } from './Navbar';

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="appframe">
      <Navbar />
      <main className="appcol">
        {children}
        <footer className="card appfoot">
          <span>These tools run in your browser and work offline.</span>
          <nav className="appfoot-links" aria-label="Links">
            <a href="https://github.com/SirusDoma/o2jam-workshop-center" target="_blank" rel="noopener noreferrer">
              <GitHubMark /> GitHub
            </a>
            <a href="https://dev.cxo2.me" target="_blank" rel="noopener noreferrer">
              <Rss size={14} /> Dev logs
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub: string;
  actions?: ReactNode;
}) {
  return (
    <header className="card pagehead">
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Kpi({
  k,
  v,
  unit,
  tone,
}: {
  k: string;
  v: string | number;
  unit?: string;
  tone?: 'ok' | 'acc' | 'wrn' | 'dim';
}) {
  return (
    <div className="kpi">
      <span className="k">{k}</span>
      <span className={`v${tone ? ` ${tone}` : ''}`}>
        {v}
        {unit && <span className="u">{unit}</span>}
      </span>
    </div>
  );
}

export function StackHead({ title, tally }: { title: string; tally?: string }) {
  return (
    <div className="stackhead">
      <span>{title}</span>
      {tally && <span className="tally">{tally}</span>}
    </div>
  );
}
