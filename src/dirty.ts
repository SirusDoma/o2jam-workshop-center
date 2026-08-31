const flags = new Map<string, boolean>();

export function reportDirty(key: string, value: boolean): void {
  if (value) {
    flags.set(key, true);
  }
  else {
    flags.delete(key);
  }
}

export function anyDirty(keys?: readonly string[]): boolean {
  if (!keys) {
    return flags.size > 0;
  }

  return keys.some((k) => flags.has(k));
}

window.addEventListener('beforeunload', (e) => {
  if (flags.size > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});
