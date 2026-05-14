/*
 * Speed and Wow & Flutter engine for the Measurement Lab.
 *
 * Pure functions over Float32/Float64 arrays; no Web Audio API or DOM
 * imports so the module can be exercised by the Node CI gate in
 * tools/check-measurement-lab.mjs.
 *
 * Algorithm: upward zero-crossing detection with linear interpolation
 * for sub-sample crossing positions recovers a demodulated series of
 * instantaneous frequency values — one per period of the reference tone.
 * From that series:
 *
 *   AES6 unweighted W&F = sqrt(2) × RMS((f_inst − mean_f) / mean_f) × 100 %
 *
 * IEC-weighted W&F applies a first-order approximation of the IEC 386
 * flutter-weighting bandpass — bilinear-transformed HP at 0.5 Hz
 * followed by LP at 200 Hz — to the normalised deviation series before
 * the RMS. The approximation covers the dominant flutter band (1–10 Hz)
 * accurately; a full quasi-peak IEC 386 detector is deferred.
 *
 * Speed deviation = (mean_f_inst − f_ref) / f_ref × 100 %.
 */

export type SpeedFlutterResult = {
  readonly speedDeviationPercent: number;
  readonly unweightedWfPercent: number;
  readonly weightedWfPercent: number;
  readonly meanFrequencyHz: number;
  readonly sampleCount: number;
};

/*
 * Extract instantaneous frequency (Hz) from upward zero crossings.
 * Linear interpolation gives sub-sample crossing positions; the period
 * between consecutive crossings becomes one f_inst estimate.
 * Output length ≈ samples.length × referenceHz / sampleRateHz.
 */
export function demodulateInstantaneousFrequency(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
): Float64Array {
  const result: number[] = [];
  let prevCrossing = -1;

  for (let n = 1; n < samples.length; n += 1) {
    const prev = samples[n - 1];
    const curr = samples[n];
    if (prev <= 0 && curr > 0) {
      const offset = -prev / (curr - prev);
      const crossing = (n - 1) + offset;
      if (prevCrossing >= 0) {
        const period = crossing - prevCrossing;
        if (period > 0) result.push(sampleRateHz / period);
      }
      prevCrossing = crossing;
    }
  }
  return new Float64Array(result);
}

function seriesMean(s: Float64Array): number {
  if (s.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < s.length; i += 1) sum += s[i];
  return sum / s.length;
}

function seriesRms(s: Float64Array): number {
  if (s.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < s.length; i += 1) sumSq += s[i] * s[i];
  return Math.sqrt(sumSq / s.length);
}

function applyFirstOrderIir(
  b0: number,
  b1: number,
  a1: number,
  series: Float64Array,
): Float64Array {
  const out = new Float64Array(series.length);
  let xPrev = 0;
  let yPrev = 0;
  for (let n = 0; n < series.length; n += 1) {
    const y = b0 * series[n] + b1 * xPrev - a1 * yPrev;
    out[n] = y;
    xPrev = series[n];
    yPrev = y;
  }
  return out;
}

/*
 * IEC 386 flutter-weighting approximation: bilinear-transformed
 * 1st-order HP at 0.5 Hz + LP at 200 Hz in series. The input is
 * treated as uniformly sampled at demodRateHz (≈ referenceHz).
 */
function applyIecFlutterWeighting(series: Float64Array, demodRateHz: number): Float64Array {
  const k = 2 * demodRateHz;

  const wHp = 2 * Math.PI * 0.5;
  const hp = applyFirstOrderIir(
    k / (k + wHp),
    -k / (k + wHp),
    (wHp - k) / (k + wHp),
    series,
  );

  const wLp = 2 * Math.PI * 200;
  return applyFirstOrderIir(
    wLp / (k + wLp),
    wLp / (k + wLp),
    (wLp - k) / (k + wLp),
    hp,
  );
}

/*
 * Compute speed and W&F metrics from a demodulated instantaneous-
 * frequency series. settlingCount: leading samples to discard.
 */
export function computeSpeedFlutterMetrics(
  instFreqHz: Float64Array,
  referenceHz: number,
  settlingCount: number,
): SpeedFlutterResult {
  if (instFreqHz.length === 0) {
    return {
      speedDeviationPercent: 0,
      unweightedWfPercent: 0,
      weightedWfPercent: 0,
      meanFrequencyHz: referenceHz,
      sampleCount: 0,
    };
  }

  const skip = Math.max(0, Math.min(settlingCount, instFreqHz.length - 1));
  const analysis = skip > 0 ? instFreqHz.subarray(skip) : instFreqHz;

  const meanF = seriesMean(analysis);
  const speedDeviationPercent = ((meanF - referenceHz) / referenceHz) * 100;

  const deviation = new Float64Array(analysis.length);
  for (let i = 0; i < analysis.length; i += 1) {
    deviation[i] = (analysis[i] - meanF) / meanF;
  }

  const unweightedWfPercent = Math.SQRT2 * seriesRms(deviation) * 100;

  const weightedDeviation = applyIecFlutterWeighting(deviation, referenceHz);
  const weightedWfPercent = Math.SQRT2 * seriesRms(weightedDeviation) * 100;

  return {
    speedDeviationPercent,
    unweightedWfPercent,
    weightedWfPercent,
    meanFrequencyHz: meanF,
    sampleCount: analysis.length,
  };
}

/*
 * Convenience wrapper: demodulate then compute metrics.
 * settlingSeconds: initial demodulated output to discard (filter
 * transients and ADC settle time).
 */
export function analyseSpeedFlutter(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  referenceHz: number,
  settlingSeconds = 1,
): SpeedFlutterResult {
  const instFreq = demodulateInstantaneousFrequency(samples, sampleRateHz);
  const settlingCount = Math.floor(settlingSeconds * referenceHz);
  return computeSpeedFlutterMetrics(instFreq, referenceHz, settlingCount);
}
