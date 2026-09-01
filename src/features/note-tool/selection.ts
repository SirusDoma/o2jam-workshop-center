import type { InspectorEvent } from './types';
import { DEFAULT_PLAYHEAD_GRID, DEFAULT_PLAYHEAD_POSITION, playheadTopRatio } from './settings.ts';

export function updateEventSelection(
  current: readonly InspectorEvent[],
  target: InspectorEvent | null,
  additive: boolean,
): InspectorEvent[] {
  if (!target) {
    return additive ? [...current] : [];
  }

  if (!additive) {
    return [target];
  }

  const exists = current.some((event) => event.kind === target.kind && event.id === target.id);
  return exists
    ? current.filter((event) => event.kind !== target.kind || event.id !== target.id)
    : [...current, target];
}

export function isEventSelected(selection: readonly InspectorEvent[], target: InspectorEvent): boolean {
  return selection.some((event) => event.kind === target.kind && event.id === target.id);
}

export function selectionForEventDrag(
  current: readonly InspectorEvent[],
  target: InspectorEvent,
): InspectorEvent[] {
  return isEventSelected(current, target) ? [...current] : [target];
}

export function updateMarqueeSelection(
  current: readonly InspectorEvent[],
  targets: readonly InspectorEvent[],
  additive: boolean,
): InspectorEvent[] {
  if (!additive) {
    return [...targets];
  }

  const result = [...current];
  for (const target of targets) {
    if (!isEventSelected(result, target)) {
      result.push(target);
    }
  }
  return result;
}

export function shouldAutoScrollPlayhead(playing: boolean, positionChanged: boolean, rulerSeeking: boolean): boolean {
  return !rulerSeeking && (playing || positionChanged);
}

export function playbackScrollTop(
  playheadOffset: number,
  viewportHeight: number,
  viewportPosition = DEFAULT_PLAYHEAD_POSITION,
  viewportGrid = DEFAULT_PLAYHEAD_GRID,
): number {
  return Math.max(0, playheadOffset - viewportHeight * playheadTopRatio(viewportPosition, viewportGrid));
}
