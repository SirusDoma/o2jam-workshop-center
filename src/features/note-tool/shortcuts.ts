export function isMacPlatform(platform = typeof navigator === 'undefined' ? '' : navigator.platform): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function hasPrimaryModifier(event: { ctrlKey: boolean; metaKey: boolean }, mac = isMacPlatform()): boolean {
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function formatShortcut(keys: string, mac = isMacPlatform()): string {
  if (mac && keys === 'Ctrl + Space') {
    return '⇧ + Space';
  }

  return mac
    ? keys.replaceAll('Ctrl', '⌘').replaceAll('Shift', '⇧').replaceAll('Delete', '⌫').replaceAll('PgUp / PgDn', 'Fn + ↑ / Fn + ↓')
    : keys;
}

export function playbackShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, mac = isMacPlatform()): 'toggle' | 'restart' | null {
  if (event.code !== 'Space' || event.altKey || event.metaKey || (mac && event.ctrlKey)) {
    return null;
  }

  return (mac ? event.shiftKey : event.ctrlKey) ? 'restart' : 'toggle';
}

export function historyShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, mac = isMacPlatform()): 'undo' | 'redo' | null {
  if (!hasPrimaryModifier(event, mac) || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }

  return !mac && key === 'y' && !event.shiftKey ? 'redo' : null;
}
