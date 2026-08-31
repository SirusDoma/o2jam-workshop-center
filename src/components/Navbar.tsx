import { Fragment, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Moon, Sun, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { anyDirty } from '../dirty';
import { useTheme } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { fmtBytes } from '../format';
import { TOOL_CATALOG } from '../toolCatalog';

export function Navbar() {
  const { theme, toggle } = useTheme();
  const { files, clear } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const held = files.reduce((a, f) => a + f.size, 0);

  return (
    <header className="card topbar">
      <div className="tb-main">
        <span className="tb-brand">O2Jam Workshop Center</span>

        <div className="tb-right">
          {files.length > 0 && (
            <button
              className="tb-session"
              type="button"
              onClick={() => (anyDirty(['packages', 'scene', 'avatar']) ? setConfirm(true) : clear())}
              title="Close all files"
            >
              Close {files.length} {files.length === 1 ? 'file' : 'files'} · {fmtBytes(held)}
              <X size={14} />
            </button>
          )}
          <button className="icon-btn" type="button" onClick={toggle} aria-label="Toggle color scheme">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      <nav className="tb-nav" aria-label="Sections">
        <NavLink to="/" end className={({ isActive }) => `tb-link${isActive ? ' on' : ''}`}>
          <Home size={13} />
          Home
        </NavLink>
        {TOOL_CATALOG.map((tool, i) => (
          <Fragment key={tool.path}>
            {i === 0 ? <span className="tb-sep" /> : <span className="tb-dot" />}
            <NavLink to={tool.path} className={({ isActive }) => `tb-link${isActive ? ' on' : ''}`}>
              <tool.icon size={13} />
              {tool.label}
            </NavLink>
          </Fragment>
        ))}
      </nav>

      {confirm && (
        <ConfirmDialog
          title="Close all files"
          body="Closing all open files discards any unsaved changes."
          confirmLabel="Close all"
          onConfirm={() => {
            setConfirm(false);
            clear();
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </header>
  );
}
