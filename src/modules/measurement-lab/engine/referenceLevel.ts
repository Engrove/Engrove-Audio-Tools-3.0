/*
 * Reference Level Calibration analyzer.
 *
 * Pure computation over stereo Float32Array buffers; no Web Audio dependency.
 *
 * Balance convention: balanceDb = rightRmsDbfs − leftRmsDbfs.
 *   Positive  = right channel louder than left.
 *   Negative  = left channel louder than right.
 *
 * Headroom convention: headroomDb = 0 dBFS − maxPeakDbfs.
 *   Positive  = room left below full scale.
 *   Zero      = peak at 0 dBFS (clipping boundary).
 *
 * Clipping threshold: peak sample abs >= 0.999 on either channel.
 *
 * Low-signal threshold: both channels RMS below -60 dBFS.
 *   Below this threshold confidence is 'low' and a warning is emitted.
 */

export type ReferenceLevelInput = {
  readonly leftSamples: Float32Array;
  readonly rightSamples: Float32Array;
  readonly sampleRateHz: number;
  readonly referenceFrequencyHz?: number;
  readonly referenceLevelDb?: number;
};

export type ReferenceLevelResult = {
  readonly leftRmsDbfs: number | null;
  readonly rightRmsDbfs: number | null;
  readonly leftPeakDbfs: number | null;
  readonly rightPeakDbfs: number | null;
  readonly balanceDb: number | null;
  readonly headroomDb: number | null;
  readonly clipping: boolean;
  readonly sampleRateHz: number;
  readonly referenceFrequencyHz?: number;
  readonly referenceLevelDb?: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
};

const SILENCE_FLOOR_DB = -120;
export const CLIPPING_THRESHOLD = 0.999;
const LOW_SIGNAL_THRESHOLD_DB = -60;

function safeDbFs(linear: number): number | null {
  if (!Number.isFinite(linear) || linear <= 0) return null;
  const db = 20 * Math.log10(linear);
  return db < SILENCE_FLOOR_DB ? null : db;
}

export function computeRmsLinear(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function computePeakLinear(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

export function analyzeReferenceLevel(input: ReferenceLevelInput): ReferenceLevelResult {
  const { leftSamples, rightSamples, sampleRateHz, referenceFrequencyHz, referenceLevelDb } = input;
  const warnings: string[] = [];

  const leftRmsLinear = computeRmsLinear(leftSamples);
  const rightRmsLinear = computeRmsLinear(rightSamples);
  const leftPeakLinear = computePeakLinear(leftSamples);
  const rightPeakLinear = computePeakLinear(rightSamples);

  const leftRmsDbfs = safeDbFs(leftRmsLinear);
  const rightRmsDbfs = safeDbFs(rightRmsLinear);
  const leftPeakDbfs = safeDbFs(leftPeakLinear);
  const rightPeakDbfs = safeDbFs(rightPeakLinear);

  const tooLow =
    (leftRmsDbfs === null || leftRmsDbfs < LOW_SIGNAL_THRESHOLD_DB) &&
    (rightRmsDbfs === null || rightRmsDbfs < LOW_SIGNAL_THRESHOLD_DB);
  if (tooLow) {
    warnings.push('Signal too low for reliable calibration.');
  }

  const balanceDb =
    leftRmsDbfs !== null && rightRmsDbfs !== null
      ? rightRmsDbfs - leftRmsDbfs
      : null;

  const maxPeakLinear = Math.max(leftPeakLinear, rightPeakLinear);
  const maxPeakDbfs = safeDbFs(maxPeakLinear);
  const headroomDb = maxPeakDbfs !== null ? 0 - maxPeakDbfs : null;

  const clipping = leftPeakLinear >= CLIPPING_THRESHOLD || rightPeakLinear >= CLIPPING_THRESHOLD;
  if (clipping) {
    warnings.push('Clipping detected. Reduce input gain before calibrating.');
  }

  const confidence: 'high' | 'medium' | 'low' = tooLow ? 'low' : clipping ? 'medium' : 'high';

  return {
    leftRmsDbfs,
    rightRmsDbfs,
    leftPeakDbfs,
    rightPeakDbfs,
    balanceDb,
    headroomDb,
    clipping,
    sampleRateHz,
    referenceFrequencyHz,
    referenceLevelDb,
    confidence,
    warnings,
  };
}
