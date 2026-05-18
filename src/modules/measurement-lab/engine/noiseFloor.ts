/*
 * Noise Floor analyzer.
 *
 * Pure computation over stereo Float32Array buffers; no Web Audio dependency.
 *
 * noiseFloorDbfs convention: the higher of left/right RMS dBFS, giving the
 * worst-case channel noise floor. Null when the signal is completely silent
 * or no samples were captured.
 */

export type NoiseFloorResult = {
  readonly leftRmsDbfs: number | null;
  readonly rightRmsDbfs: number | null;
  readonly leftPeakDbfs: number | null;
  readonly rightPeakDbfs: number | null;
  readonly noiseFloorDbfs: number | null;
  readonly warnings: readonly string[];
};

const SILENCE_FLOOR_DB = -120;

function computeRmsLinear(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function computePeakLinear(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function safeDbFs(linear: number): number | null {
  if (!Number.isFinite(linear) || linear <= 0) return null;
  const db = 20 * Math.log10(linear);
  return db < SILENCE_FLOOR_DB ? null : db;
}

export function analyzeNoiseFloor(
  leftSamples: Float32Array,
  rightSamples: Float32Array,
): NoiseFloorResult {
  const warnings: string[] = [];

  if (leftSamples.length === 0 && rightSamples.length === 0) {
    warnings.push('No samples captured.');
    return {
      leftRmsDbfs: null, rightRmsDbfs: null,
      leftPeakDbfs: null, rightPeakDbfs: null,
      noiseFloorDbfs: null, warnings,
    };
  }

  const effRight = rightSamples.length > 0 ? rightSamples : leftSamples;

  const leftRmsDbfs = safeDbFs(computeRmsLinear(leftSamples));
  const rightRmsDbfs = safeDbFs(computeRmsLinear(effRight));
  const leftPeakDbfs = safeDbFs(computePeakLinear(leftSamples));
  const rightPeakDbfs = safeDbFs(computePeakLinear(effRight));

  const noiseFloorDbfs =
    leftRmsDbfs !== null && rightRmsDbfs !== null
      ? Math.max(leftRmsDbfs, rightRmsDbfs)
      : leftRmsDbfs ?? rightRmsDbfs;

  return { leftRmsDbfs, rightRmsDbfs, leftPeakDbfs, rightPeakDbfs, noiseFloorDbfs, warnings };
}
