import { useRef, type ReactNode } from 'react';
import { HashRouter, Navigate, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ToolActiveContext } from './context/ToolActiveContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import HomePage from './pages/HomePage';
import MusicListPage from './pages/MusicListPage';
import PackagesPage from './pages/PackagesPage';
import ScenePage from './pages/ScenePage';
import AvatarPage from './pages/AvatarPage';
import ArgsBuilderPage from './pages/ArgsBuilderPage';
import { TOOL_CATALOG, type ToolCatalogEntry } from './toolCatalog';

const PAGES: Record<ToolCatalogEntry['id'], () => ReactNode> = {
  'music-list': () => <MusicListPage />,
  packages: () => <PackagesPage />,
  scene: () => <ScenePage />,
  avatar: () => <AvatarPage />,
  'arguments-builder': () => <ArgsBuilderPage />,
};
const TOOLS = TOOL_CATALOG.map((tool) => ({ path: tool.path, page: PAGES[tool.id] }));

function ToolStack() {
  const { pathname } = useLocation();
  const visited = useRef(new Set<string>());
  const known = TOOLS.some((t) => t.path === pathname);
  if (known) {
    visited.current.add(pathname);
  }

  if (!known && pathname !== '/') {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {pathname === '/' && <HomePage />}
      {TOOLS.filter((t) => visited.current.has(t.path)).map((t) => {
        const active = pathname === t.path;
        return (
          <ToolActiveContext.Provider key={t.path} value={active}>
            <div style={{ display: active ? 'contents' : 'none' }}>{t.page()}</div>
          </ToolActiveContext.Provider>
        );
      })}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <WorkspaceProvider>
          <HashRouter>
            <Shell>
              <ToolStack />
            </Shell>
          </HashRouter>
        </WorkspaceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
