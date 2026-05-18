/*
 * Frequency-response engine for the Measurement Lab.
 *
 * Pure functions — no DOM or Web Audio imports — so the Node CI gate can
 * run the same code the browser runs.
 *
 * Pipeline:
 *  1. Split the capture into 50%-overlap Hann-windowed blocks.
 *  2. FFT each block; accumulate power in each bin.
 *  3. Average power; take √ for RMS magnitude.
 *  4. Collapse into 1/12-octave log bins (20 Hz–20 kHz by default).
 *  5. Normalise so the bin nearest 1 kHz = 0 dB.
 */

export type FreqResponseResult = {
  readonly frequenciesHz: Float64Array;
  readonly magnitudesDb: Float64Array;
  readonly fftSize: number;
  readonly sampleRateHz: number;
  readonly blockCount: number;
};

export type FreqResponseOptions = {
  readonly fftSize?: number;       // must be a power of 2; default 4096
  readonly binsPerOctave?: number; // default 12
  readonly freqMinHz?: number;     // default 20
  readonly freqMaxHz?: number;     // default 20000
};

/** Cooley-Tukey radix-2 DIT in-place FFT. Length must be a power of 2. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wBaseRe = Math.cos(ang);
    const wBaseIm = Math.sin(ang);
    for (let start = 0; start < n; start += len) {
      let wRe = 1.0;
      let wIm = 0.0;
      for (let k = 0; k < half; k++) {
        const uRe = re[start + k];
        const uIm = im[start + k];
        const vRe = re[start + k + half] * wRe - im[start + k + half] * wIm;
        const vIm = re[start + k + half] * wIm + im[start + k + half] * wRe;
        re[start + k]        = uRe + vRe;
        im[start + k]        = uIm + vIm;
        re[start + k + half] = uRe - vRe;
        im[start + k + half] = uIm - vIm;
        const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
        wIm = wRe * wBaseIm + wIm * wBaseRe;
        wRe = nextWRe;
      }
    }
  }
}

export function computeFrequencyResponse(
  samples: Float32Array | Float64Array,
  sampleRateHz: number,
  options: FreqResponseOptions = {},
): FreqResponseResult {
  const {
    fftSize = 4096,
    binsPerOctave = 12,
    freqMinHz = 20,
    freqMaxHz = 20000,
  } = options;

  const hop = fftSize >> 1; // 50% overlap

  // Pre-compute Hann window and its power-normalisation factor
  const win = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }
  // sum(w^2) / N — scales averaged power back to true amplitude
  let winPowerSum = 0;
  for (let i = 0; i < fftSize; i++) winPowerSum += win[i] * win[i];
  const winNorm = winPowerSum / fftSize;

  // Accumulate power across all blocks (one-sided spectrum, DC to Nyquist)
  const numBins = fftSize / 2 + 1;
  const powerAccum = new Float64Array(numBins);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let blockCount = 0;

  for (let start = 0; start + fftSize <= samples.length; start += hop) {
    for (let i = 0; i < fftSize; i++) {
      re[i] = samples[start + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    powerAccum[0] += re[0] * re[0] + im[0] * im[0];
    for (let k = 1; k < fftSize / 2; k++) {
      powerAccum[k] += re[k] * re[k] + im[k] * im[k];
    }
    powerAccum[fftSize / 2] += re[fftSize / 2] * re[fftSize / 2] + im[fftSize / 2] * im[fftSize / 2];
    blockCount++;
  }

  if (blockCount === 0) {
    return {
      frequenciesHz: new Float64Array(0),
      magnitudesDb: new Float64Array(0),
      fftSize,
      sampleRateHz,
      blockCount: 0,
    };
  }

  // Average power → RMS magnitude per FFT bin
  const scale = 1 / (blockCount * winNorm);
  const binMagLinear = new Float64Array(numBins);
  for (let k = 0; k < numBins; k++) {
    binMagLinear[k] = Math.sqrt(powerAccum[k] * scale);
  }

  // 1/binsPerOctave-octave log bins
  const freqBinHz = sampleRateHz / fftSize;
  const numOctaves = Math.log2(freqMaxHz / freqMinHz);
  const numLogBins = Math.ceil(numOctaves * binsPerOctave);
  const frequenciesHz = new Float64Array(numLogBins);
  const magLinLogBin = new Float64Array(numLogBins);
  const halfStepRatio = Math.pow(2, 0.5 / binsPerOctave);

  for (let b = 0; b < numLogBins; b++) {
    const fc = freqMinHz * Math.pow(2, b / binsPerOctave);
    const fLow = fc / halfStepRatio;
    const fHigh = fc * halfStepRatio;
    const kLow = Math.max(1, Math.round(fLow / freqBinHz));
    const kHigh = Math.min(fftSize / 2, Math.round(fHigh / freqBinHz));
    frequenciesHz[b] = fc;
    let sumPow = 0;
    let count = 0;
    for (let k = kLow; k <= kHigh; k++) {
      sumPow += binMagLinear[k] * binMagLinear[k];
      count++;
    }
    magLinLogBin[b] = count > 0 ? Math.sqrt(sumPow / count) : 0;
  }

  // Find log bin nearest 1 kHz for 0-dB normalisation
  let normIdx = 0;
  let minDist = Infinity;
  for (let b = 0; b < numLogBins; b++) {
    const dist = Math.abs(Math.log2(frequenciesHz[b] / 1000));
    if (dist < minDist) { minDist = dist; normIdx = b; }
  }
  const normLinear = magLinLogBin[normIdx];

  const magnitudesDb = new Float64Array(numLogBins);
  for (let b = 0; b < numLogBins; b++) {
    const v = magLinLogBin[b];
    magnitudesDb[b] = (v > 0 && normLinear > 0) ? 20 * Math.log10(v / normLinear) : -120;
  }

  return { frequenciesHz, magnitudesDb, fftSize, sampleRateHz, blockCount };
}

// ── S5O: Frequency-response deviation summary ─────────────────────────────────

export type FreqBandSummary = {
  readonly label: string;
  readonly freqStartHz: number;
  readonly freqEndHz: number;
  readonly meanDb: number | null;
  readonly pointCount: number;
};

export type FreqDeviationSummary = {
  readonly referenceNote: string;
  readonly iriaaApplied: boolean;
  readonly rangeStartHz: number;
  readonly rangeEndHz: number;
  readonly pointCount: number;
  readonly minDb: number;
  readonly maxDb: number;
  readonly peakToPeakDb: number;
  readonly rmsDeviationDb: number;
  readonly minFrequencyHz: number;
  readonly maxFrequencyHz: number;
  readonly bandSummaries: readonly FreqBandSummary[];
};

const BAND_DEFS: readonly { label: string; lo: number; hi: number }[] = [
  { label: 'Bass (20–300 Hz)',      lo: 20,   hi: 300 },
  { label: 'Midrange (300–3000 Hz)', lo: 300,  hi: 3000 },
  { label: 'Treble (3–20 kHz)',     lo: 3000, hi: 20000 },
];

/*
 * Compute deviation summary from a FreqResponseResult.
 * magnitudesDb values are already normalised to 0 dB at 1 kHz, so each
 * value directly represents deviation from the 1 kHz reference level.
 * Returns null when the result contains no data points.
 */
export function computeFreqDeviationSummary(
  result: FreqResponseResult,
  iriaaApplied: boolean,
): FreqDeviationSummary | null {
  const { frequenciesHz, magnitudesDb } = result;
  if (frequenciesHz.length === 0) return null;

  let minDb = Infinity;
  let maxDb = -Infinity;
  let minFreqHz = frequenciesHz[0];
  let maxFreqHz = frequenciesHz[0];
  let sumSq = 0;

  for (let i = 0; i < frequenciesHz.length; i++) {
    const db = magnitudesDb[i];
    sumSq += db * db;
    if (db < minDb) { minDb = db; minFreqHz = frequenciesHz[i]; }
    if (db > maxDb) { maxDb = db; maxFreqHz = frequenciesHz[i]; }
  }

  const rmsDeviationDb = Math.sqrt(sumSq / frequenciesHz.length);

  const bandSummaries: FreqBandSummary[] = BAND_DEFS.map(({ label, lo, hi }) => {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < frequenciesHz.length; i++) {
      if (frequenciesHz[i] >= lo && frequenciesHz[i] <= hi) {
        sum += magnitudesDb[i];
        count++;
      }
    }
    return { label, freqStartHz: lo, freqEndHz: hi, meanDb: count > 0 ? sum / count : null, pointCount: count };
  });

  return {
    referenceNote: 'Deviation relative to 1 kHz (0 dB reference). Measures full playback/capture chain; not cartridge-only.',
    iriaaApplied,
    rangeStartHz: frequenciesHz[0],
    rangeEndHz: frequenciesHz[frequenciesHz.length - 1],
    pointCount: frequenciesHz.length,
    minDb,
    maxDb,
    peakToPeakDb: maxDb - minDb,
    rmsDeviationDb,
    minFrequencyHz: minFreqHz,
    maxFrequencyHz: maxFreqHz,
    bandSummaries,
  };
}
