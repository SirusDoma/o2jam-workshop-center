import { ListMusic, MonitorPlay, Package, Terminal, UserRound, type LucideIcon } from 'lucide-react';

export interface ToolCatalogEntry {
  id: 'music-list' | 'packages' | 'scene' | 'avatar' | 'arguments-builder';
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { id: 'music-list', path: '/tools/music-list', label: 'Music List', description: 'Read or build OJNList.dat for any client version.', icon: ListMusic },
  { id: 'packages', path: '/tools/package', label: 'Packages', description: 'Inspect, edit and repack an OPI or OPA package.', icon: Package },
  { id: 'scene', path: '/tools/scene', label: 'Scene Composer', description: 'Customize the scene graph of the interface.', icon: MonitorPlay },
  { id: 'avatar', path: '/tools/avatar', label: 'Avatars', description: 'Build, modify and preview avatar items.', icon: UserRound },
  { id: 'arguments-builder', path: '/tools/arguments-builder', label: 'Arguments Builder', description: "Generate a client's launch command.", icon: Terminal },
];
