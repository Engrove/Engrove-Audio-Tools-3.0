/*
 * THD and SMPTE IMD engine for the Measurement Lab.
 *
 * Pure functions over Float32 / Float64 arrays — no DOM or Web Audio
 * imports so the Node CI gate can exercise the same code paths.
 *
 * THD pipeline:
 *  1. Average power spectrum over 50%-overlap Hann-windowed blocks.
 *  2. At each harmonic h×f₀ (h = 2..H), sum power in a 3-bin window
 *     centred on the expected bin.  The 3-bin sum captures the Hann
 *     main lobe even when the frequency falls ±0.5 bins off-centre.
 *  3. THD% = √(Σ P_h) / √P₁ × 100.
 *
 * SMPTE IMD pipeline (AES17-2015, single-ended):
 *  1. Same averaged power spectrum.
 *  2. f2 power measured at the high-frequency tone bin.
 *  3. Sideband power summed at f2 ± n×f1 for n = 1..N.
 *  4. IMD% = √(Σ P_sideband) / √P_f2 × 100.
 */

import { fftInPlace } from './freqResponse.js';

export type ThdResult = {
  readonly fundamentalHz: number;
  readonly thdPercent: number;
  readonly harmonics: readonly number[]; // dBc for 2nd…10th
  readonly sampleCount: number;
};

export type ImdResult = {
  readonly f1Hz: number;
  readonly f2Hz: number;
  readonly imdPercent: number;
  readonly sampleCount: number;
};

export type ThdOptions = {
  readonly fftSize?: number;       // must be power of 2; default 8192
  readonly numHarmonics?: number;  // 2nd through this; default 9 (up to 10th)
  readonly settlingSeconds?: number;
};

export type ImdOptions = {
  readonly fftSize?: number;
  readonly numSidebands?: number;  // pairs; default 5
  readonly settlingSeconds?: number;
};

function buildPowerSpectrum(
  samples: Float32Array | Float64Array,
  fftSize: number,
  settleN: number,
): Float64Array {
  const hop = fftSize >> 1;
  const win = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }
  const numBins = fftSize / 2 + 1;
  const accum = new Float64Array(numBins);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let blockCount = 0;

  for (let start = settleN; start + fftSize <= samples.length; start += hop) {
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[start + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    accum[0] += re[0] * re[0] + im[0] * im[0];
    for (let k = 1; k < fftSize / 2; k++) {
      accum[k] += re[k] * re[k] + im[k] * im[k];
    }
    accum[fftSize / 2] += re[fftSize / 2] * re[fftSize / 2] + im[fftSize / 2] * im[fftSize / 2];
    blockCount++;
  }

  if (blockCount > 0) {
    for (let k = 0; k < numBins; k++) accum[k] /= blockCount;
  }
  return accum;
}

/*
 * Sum power in a 3-bin window around the nearest bin to freqHz.
 * Using three adjacent bins captures >90% of the Hann main-lobe energy
 * for any offset up to ±0.5 bins, making the estimate robust even when
 * the tone does not fall exactly on a bin centre.
 */
function tonePower(
  spectrum: Float64Array,
  freqHz: number,
  binHz: number,
): number {
  const k = Math.round(freqHz / binHz);
  const lo = Math.max(1, k - 1);
  const hi = Math.min(spectrum.length - 2, k + 1);
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += spectrum[i];
  return sum;
}

export function analyseTHD(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  fundamentalHz: number,
  options: ThdOptions = {},
): ThdResult {
  const {
    fftSize = 8192,
    numHarmonics = 9,
    settlingSeconds = 0.5,
  } = options;

  const settleN = Math.floor(settlingSeconds * sampleRateHz);
  const spectrum = buildPowerSpectrum(samples, fftSize, settleN);
  const binHz = sampleRateHz / fftSize;

  const fundPow = tonePower(spectrum, fundamentalHz, binHz);
  let harmonicSumPow = 0;
  const harmonics: number[] = [];

  for (let h = 2; h <= 1 + numHarmonics; h++) {
    const hFreq = h * fundamentalHz;
    if (hFreq >= sampleRateHz / 2) break;
    const hPow = tonePower(spectrum, hFreq, binHz);
    harmonicSumPow += hPow;
    harmonics.push(
      (hPow > 0 && fundPow > 0) ? 10 * Math.log10(hPow / fundPow) : -120,
    );
  }

  const thdPercent = fundPow > 0
    ? Math.sqrt(harmonicSumPow / fundPow) * 100
    : 0;

  return {
    fundamentalHz,
    thdPercent,
    harmonics,
    sampleCount: Math.max(0, samples.length - settleN),
  };
}

export function analyseIMD(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  f1Hz: number,
  f2Hz: number,
  options: ImdOptions = {},
): ImdResult {
  const {
    fftSize = 8192,
    numSidebands = 5,
    settlingSeconds = 0.5,
  } = options;

  const settleN = Math.floor(settlingSeconds * sampleRateHz);
  const spectrum = buildPowerSpectrum(samples, fftSize, settleN);
  const binHz = sampleRateHz / fftSize;

  const f2Pow = tonePower(spectrum, f2Hz, binHz);
  let sidebandSumPow = 0;

  for (let n = 1; n <= numSidebands; n++) {
    const fUp = f2Hz + n * f1Hz;
    const fDn = f2Hz - n * f1Hz;
    if (fUp < sampleRateHz / 2) sidebandSumPow += tonePower(spectrum, fUp, binHz);
    if (fDn > 0)                 sidebandSumPow += tonePower(spectrum, fDn, binHz);
  }

  const imdPercent = f2Pow > 0
    ? Math.sqrt(sidebandSumPow / f2Pow) * 100
    : 0;

  return {
    f1Hz,
    f2Hz,
    imdPercent,
    sampleCount: Math.max(0, samples.length - settleN),
  };
}
