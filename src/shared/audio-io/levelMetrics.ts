/*
 * Audio level metric helpers. Pure functions over Float32Array sample
 * buffers so they can be tested in Node without a Web Audio context.
 *
 * Reference levels:
 *   - peak / RMS are reported as linear sample magnitudes in [0, 1]
 *   - dBFS values reference a full-scale sine of amplitude 1.0
 *   - silenceFloorDb is the value returned for any input whose linear
 *     magnitude is below 10 ** (silenceFloorDb / 20). The default of
 *     -120 dBFS matches typical browser AnalyserNode floors and keeps
 *     log10(0) and similar corner cases out of the call sites.
 */

export const silenceFloorDb = -120;

export type LevelMetrics = {
  readonly peakLinear: number;
  readonly rmsLinear: number;
  readonly peakDbFs: number;
  readonly rmsDbFs: number;
  readonly clipped: boolean;
};

function safeDbFs(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0) {
    return silenceFloorDb;
  }
  const db = 20 * Math.log10(linear);
  return db < silenceFloorDb ? silenceFloorDb : db;
}

export function computePeakLinear(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    const magnitude = value < 0 ? -value : value;
    if (magnitude > peak) {
      peak = magnitude;
    }
  }
  return peak;
}

export function computeRmsLinear(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    sumOfSquares += value * value;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

export function computeLevelMetrics(samples: Float32Array): LevelMetrics {
  const peakLinear = computePeakLinear(samples);
  const rmsLinear = computeRmsLinear(samples);
  return {
    peakLinear,
    rmsLinear,
    peakDbFs: safeDbFs(peakLinear),
    rmsDbFs: safeDbFs(rmsLinear),
    clipped: peakLinear >= 0.999,
  };
}

/*
 * Decay-tracked peak hold for visual VU style indicators. Pure function:
 * pass the previous hold value, the latest peak, the elapsed seconds and
 * the decay rate in dB per second. Returns the new hold value.
 */
export function decayPeakHold(
  previousHoldLinear: number,
  latestPeakLinear: number,
  elapsedSeconds: number,
  decayDbPerSecond: number,
): number {
  if (latestPeakLinear >= previousHoldLinear) {
    return latestPeakLinear;
  }
  if (decayDbPerSecond <= 0 || elapsedSeconds <= 0) {
    return previousHoldLinear;
  }
  const decayDb = decayDbPerSecond * elapsedSeconds;
  const decayLinear = 10 ** (-decayDb / 20);
  const next = previousHoldLinear * decayLinear;
  return next < latestPeakLinear ? latestPeakLinear : next;
}
