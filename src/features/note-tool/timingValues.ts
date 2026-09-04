export const DEFAULT_FRACTION_VALUE = 1;

export const FRACTION_OPTIONS = [
  { label: '1', value: 1 },
  { label: '3/4', value: 0.75 },
  { label: '1/2', value: 0.5 },
  { label: '1/4', value: 0.25 },
] as const;

export function formatBpmValue(value: number): string {
  return (Number.isFinite(value) ? value : 120).toFixed(2);
}

export function parseBpmInput(value: string, fallback: number): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function formatTimingValue(kind: 'bpm' | 'fraction', value: number): string {
  if (kind === 'bpm') {
    return formatBpmValue(value);
  }

  return String(FRACTION_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_FRACTION_VALUE);
}
