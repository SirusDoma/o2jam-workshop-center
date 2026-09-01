export type MeasureFraction = {
  measure: number;
  fraction: number;
};

export function measureFractionAt(measure: number, fractions: readonly MeasureFraction[]): number {
  const value = fractions.find((item) => item.measure === measure)?.fraction;
  return Number.isFinite(value) && value! > 0 ? value! : 1;
}

export function measureGridPositionCount(
  measure: number,
  gridDivision: number,
  fractions: readonly MeasureFraction[],
): number {
  return Math.max(1, Math.ceil(measureFractionAt(measure, fractions) * gridDivision - Number.EPSILON));
}

export function scaledChartPosition(position: number, fractions: readonly MeasureFraction[]): number {
  const target = Math.max(0, position);
  return fractions.reduce((scaled, item) => {
    const overlap = Math.max(0, Math.min(1, target - item.measure));
    return scaled + Math.min(overlap, measureFractionAt(item.measure, fractions)) - overlap;
  }, target);
}

export function chartPositionAtScaledPosition(position: number, fractions: readonly MeasureFraction[]): number {
  const target = Math.max(0, position);
  const ordered = [...new Map(
    fractions
      .filter((item) => Number.isFinite(item.measure) && item.measure >= 0)
      .map((item) => [Math.floor(item.measure), measureFractionAt(Math.floor(item.measure), fractions)]),
  )].sort(([left], [right]) => left - right);
  let chartCursor = 0;
  let scaledCursor = 0;

  for (const [measure, fraction] of ordered) {
    const gap = Math.max(0, measure - chartCursor);
    if (target <= scaledCursor + gap) {
      return chartCursor + target - scaledCursor;
    }

    scaledCursor += gap;
    chartCursor += gap;
    if (target < scaledCursor + fraction) {
      return chartCursor + target - scaledCursor;
    }

    scaledCursor += fraction;
    chartCursor += 1;
  }

  return chartCursor + target - scaledCursor;
}
