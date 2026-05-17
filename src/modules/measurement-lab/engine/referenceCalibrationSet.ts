import type { ReferenceLevelResult } from './referenceLevel';

export type CalibrationSetEntry = {
  readonly bandIndex: string;
  readonly bandLabel: string;
  readonly frequencyHz: number | null;
  readonly nominalLevelDb: number | null;
  readonly source: 'live_capture' | 'self_test';
  readonly result: ReferenceLevelResult;
  readonly capturedAt: string;
};

/** Replace entry with same bandIndex+source, or append. Returns new array. */
export function addOrReplaceEntry(
  set: readonly CalibrationSetEntry[],
  entry: CalibrationSetEntry,
): CalibrationSetEntry[] {
  const idx = set.findIndex(e => e.bandIndex === entry.bandIndex && e.source === entry.source);
  if (idx >= 0) {
    return [...set.slice(0, idx), entry, ...set.slice(idx + 1)];
  }
  return [...set, entry];
}

/** Returns an empty calibration set. */
export function clearCalibrationSet(): CalibrationSetEntry[] {
  return [];
}

/** Find a 1 kHz reference entry in the set (by frequency or label heuristic). */
export function find1kHzEntry(
  set: readonly CalibrationSetEntry[],
  source: 'live_capture' | 'self_test',
): CalibrationSetEntry | undefined {
  return set.find(
    e =>
      e.source === source &&
      (e.frequencyHz === 1000 ||
        e.bandLabel.toLowerCase().includes('1 khz') ||
        e.bandLabel.toLowerCase().includes('1khz')),
  );
}

/**
 * Compute L and R RMS delta vs a 1 kHz reference entry.
 * Returns null deltas if refEntry is undefined (no crash).
 */
export function relativeTo1kHz(
  entry: CalibrationSetEntry,
  refEntry: CalibrationSetEntry | undefined,
): { deltaLDb: number | null; deltaRDb: number | null } {
  if (!refEntry) return { deltaLDb: null, deltaRDb: null };
  const l = entry.result.leftRmsDbfs;
  const refL = refEntry.result.leftRmsDbfs;
  const r = entry.result.rightRmsDbfs;
  const refR = refEntry.result.rightRmsDbfs;
  return {
    deltaLDb: l !== null && refL !== null ? l - refL : null,
    deltaRDb: r !== null && refR !== null ? r - refR : null,
  };
}
