import { DEFAULT_NOTE_HEIGHT } from './settings.ts';
import { chartPositionAtScaledPosition, measureFractionAt, scaledChartPosition, type MeasureFraction } from './measureScale.ts';

const NOTE_CELL_INSET = 1;

export function alignToDevicePixel(value: number, pixelRatio = 1): number {
  const scale = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return Math.round(value * scale) / scale;
}

export function laneLabelFits(columnWidth: number, labelWidth: number): boolean {
  return columnWidth >= labelWidth;
}

export function noteCellBox(cellBottom: number, _cellHeight: number, noteHeight = DEFAULT_NOTE_HEIGHT): { top: number; height: number } {
  const height = noteHeight;
  return {
    top: cellBottom - height - NOTE_CELL_INSET,
    height,
  };
}

export function longNoteBox(
  cellBottom: number,
  cellHeight: number,
  durationHeight: number,
  noteHeight = DEFAULT_NOTE_HEIGHT,
): { top: number; height: number; markerHeight: number } {
  const markerHeight = noteCellBox(cellBottom, cellHeight, noteHeight).height;
  return {
    top: cellBottom - durationHeight - markerHeight - NOTE_CELL_INSET,
    height: durationHeight + markerHeight,
    markerHeight,
  };
}

export function gridPositionAtY(
  y: number,
  measureCount: number,
  measureHeight: number,
  gridDivision: number,
  fractions: readonly MeasureFraction[] = [],
): number {
  const height = scaledChartPosition(measureCount, fractions) * measureHeight;
  const clampedY = Math.max(0, Math.min(height - 1, y));
  const raw = chartPositionAtY(clampedY, measureCount, measureHeight, measureCount, fractions);
  const measure = Math.min(measureCount - 1, Math.max(0, Math.floor(raw)));
  const position = Math.min(gridDivision - 1, Math.max(0, Math.floor((raw - measure) * gridDivision))) / gridDivision;
  return measure + position;
}

export function gridLineHeight(measureHeight: number, grid: string): number {
  const division = Number(grid.split('/')[1]);
  return Number.isFinite(division) && division > 0 ? measureHeight / division : 0;
}

export function chartPositionAtY(
  y: number,
  measureCount: number,
  measureHeight: number,
  endPosition: number,
  fractions: readonly MeasureFraction[] = [],
): number {
  const scaledHeight = scaledChartPosition(measureCount, fractions);
  const scaledPosition = scaledHeight - Math.max(0, y) / measureHeight;
  const position = chartPositionAtScaledPosition(scaledPosition, fractions);
  return Math.max(0, Math.min(endPosition, position));
}

export function chartPositionY(
  position: number,
  measureCount: number,
  measureHeight: number,
  fractions: readonly MeasureFraction[] = [],
): number {
  return (scaledChartPosition(measureCount, fractions) - scaledChartPosition(position, fractions)) * measureHeight;
}

export function measurePixelHeight(measure: number, measureHeight: number, fractions: readonly MeasureFraction[] = []): number {
  return measureHeight * measureFractionAt(measure, fractions);
}

export function nextHiSpeed(current: number, deltaY: number): number {
  const change = deltaY < 0 ? 0.5 : deltaY > 0 ? -0.5 : 0;
  return Math.max(0.5, Math.min(8, Math.round((current + change) * 2) / 2));
}

export function edgeScrollDelta(
  pointerY: number,
  viewportTop: number,
  viewportBottom: number,
  edgeSize = 48,
  maxDelta = 16,
): number {
  if (pointerY < viewportTop + edgeSize) {
    return -maxDelta * Math.min(1, (viewportTop + edgeSize - pointerY) / edgeSize);
  }
  if (pointerY > viewportBottom - edgeSize) {
    return maxDelta * Math.min(1, (pointerY - viewportBottom + edgeSize) / edgeSize);
  }
  return 0;
}

export function edgeScrollTop(
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number,
  delta: number,
): number {
  return Math.max(0, Math.min(Math.max(0, scrollHeight - viewportHeight), scrollTop + delta));
}
