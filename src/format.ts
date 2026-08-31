
const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function fmtBytes(bytes: number): string {
  if (bytes < 0) return '—';
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

export function fmtOffset(offset: number, width = 8): string {
  return `0x${offset.toString(16).toUpperCase().padStart(width, '0')}`;
}

export function fmtHex(value: number, width = 2): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
