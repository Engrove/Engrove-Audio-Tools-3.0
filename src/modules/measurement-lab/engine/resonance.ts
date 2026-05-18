/*
 * Low-frequency resonance peak engine for the Measurement Lab.
 *
 * Pure functions over Float32 / Float64 arrays.
 *
 * The user plays a low-frequency sweep band from a test record (typically
 * 5–25 Hz log sweep).  The cartridge/arm system resonates at a frequency
 * within that range; the captured amplitude envelope peaks there.
 *
 * Pipeline:
 *  1. Rectify and exponentially smooth the signal to extract its envelope.
 *  2. Settle for settlingSeconds then search for the envelope peak.
 *  3. Map the peak sample index → frequency via the sweep's frequency-time
 *     relationship (log or linear).
 *  4. Estimate Q from the −3 dB bandwidth of the envelope peak.
 */

export type ResonanceSweepType = 'log' | 'linear';

export type ResonanceResult = {
  readonly peakFrequencyHz: number;
  readonly peakAmplitudeDbFs: number;
  readonly qEstimate: number | null;
  readonly sampleCount: number;
};

export type ResonanceOptions = {
  readonly settlingSeconds?: number;
  readonly lpCutoffHz?: number; // envelope LP filter cutoff; default 1 Hz
};

/*
 * Single-pole IIR low-pass filter (exponential moving average) on the
 * rectified signal.  α = 1 − exp(−2π·fc / fs).  Returns the envelope
 * as a Float64Array of the same length as samples.
 */
function computeEnvelope(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  lpCutoffHz: number,
): Float64Array {
  const alpha = 1 - Math.exp(-2 * Math.PI * lpCutoffHz / sampleRateHz);
  const env = new Float64Array(samples.length);
  let state = 0;
  for (let n = 0; n < samples.length; n++) {
    const absX = Math.abs(samples[n]);
    state += alpha * (absX - state);
    env[n] = state;
  }
  return env;
}

/*
 * Map a sample index to instantaneous frequency for the chosen sweep type.
 * Both log and linear sweeps are assumed to cover [fromHz, toHz] over the
 * full duration (samples.length / sampleRateHz).
 */
function indexToFrequency(
  idx: number,
  sampleRateHz: number,
  totalSamples: number,
  fromHz: number,
  toHz: number,
  sweepType: ResonanceSweepType,
): number {
  const t = idx / sampleRateHz;
  const T = totalSamples / sampleRateHz;
  if (sweepType === 'log') {
    return fromHz * Math.pow(toHz / fromHz, t / T);
  }
  return fromHz + (toHz - fromHz) * (t / T);
}

export function analyseResonance(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  sweepFromHz: number,
  sweepToHz: number,
  sweepType: ResonanceSweepType = 'log',
  options: ResonanceOptions = {},
): ResonanceResult {
  const { settlingSeconds = 0.5, lpCutoffHz = 1 } = options;
  const settleN = Math.floor(settlingSeconds * sampleRateHz);

  const env = computeEnvelope(samples, sampleRateHz, lpCutoffHz);

  // Find peak in the post-settling window (also exclude last 5% for LP lag)
  const searchEnd = Math.floor(samples.length * 0.95);
  let peakIdx = settleN;
  let peakVal = 0;
  for (let n = settleN; n < searchEnd; n++) {
    if (env[n] > peakVal) { peakVal = env[n]; peakIdx = n; }
  }

  const peakFrequencyHz = indexToFrequency(
    peakIdx, sampleRateHz, samples.length, sweepFromHz, sweepToHz, sweepType,
  );
  const peakAmplitudeDbFs = peakVal > 0 ? 20 * Math.log10(peakVal) : -120;

  // Q estimate: find −3 dB points (envelope = peakVal / √2)
  const threshold = peakVal / Math.SQRT2;
  let qEstimate: number | null = null;

  let loIdx = -1;
  for (let n = peakIdx; n >= settleN; n--) {
    if (env[n] <= threshold) { loIdx = n; break; }
  }
  let hiIdx = -1;
  for (let n = peakIdx; n < searchEnd; n++) {
    if (env[n] <= threshold) { hiIdx = n; break; }
  }

  if (loIdx >= 0 && hiIdx >= 0) {
    const fLo = indexToFrequency(
      loIdx, sampleRateHz, samples.length, sweepFromHz, sweepToHz, sweepType,
    );
    const fHi = indexToFrequency(
      hiIdx, sampleRateHz, samples.length, sweepFromHz, sweepToHz, sweepType,
    );
    const bw = Math.abs(fHi - fLo);
    if (bw > 0) qEstimate = peakFrequencyHz / bw;
  }

  return {
    peakFrequencyHz,
    peakAmplitudeDbFs,
    qEstimate,
    sampleCount: Math.max(0, samples.length - settleN),
  };
}

// ── S5P: Resonance diagnostic metadata ───────────────────────────────────────

export type ResonanceDiagnosticMeta = {
  readonly measurementNote: string;
  readonly qEstimateNote: string;
  readonly typicalRangeNote: string;
  readonly limitationsNote: string;
  readonly wowBandOverlapNote: string;
};

export function buildResonanceDiagnosticMeta(): ResonanceDiagnosticMeta {
  return {
    measurementNote:
      'Captures the tonearm–cartridge system resonant frequency from the peak of the amplitude envelope during a low-frequency sweep (typically 5–25 Hz). Peak sample index is mapped to frequency via the sweep time–frequency relationship.',
    qEstimateNote:
      'Q (quality factor) is estimated from the −3 dB bandwidth of the envelope peak. Higher Q indicates sharper, less-damped resonance. Values are approximate; envelope LP smoothing introduces a bias that narrows effective bandwidth.',
    typicalRangeNote:
      'Typical tonearm–cartridge resonance: 8–12 Hz for MM cartridges, 12–16 Hz for MC. Values outside 5–20 Hz may indicate a cartridge–arm compliance mismatch or a measurement artifact.',
    limitationsNote:
      'Measures the combined tonearm + cartridge system. Cannot separate individual arm or cartridge contribution. Accuracy depends on the test record providing a clean, low-distortion sweep in the measured frequency range. Groove noise and rumble can distort envelope peak detection below 10 Hz.',
    wowBandOverlapNote:
      'The resonance measurement window (5–25 Hz) overlaps the wow modulation band (<6 Hz) and typical turntable rumble bands. Wow, flutter or rumble contributions to the captured signal are not filtered before peak detection.',
  };
}
