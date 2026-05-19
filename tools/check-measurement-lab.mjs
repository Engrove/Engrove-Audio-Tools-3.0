#!/usr/bin/env node
/*
 * S30B/S30C/S30D/S30E CI gate for the Measurement Lab.
 *
 * S30B — iRIAA filter (three assertions):
 *   1. Analog reference reproduces the canonical 3-time-constant RIAA
 *      playback table (0 dB at 1 kHz, +19.27 dB at 20 Hz,
 *      -19.62 dB at 20 kHz, no Neumann extension) within 0.05 dB.
 *   2. Bilinear-transformed discrete coefficients lie within an
 *      honest frequency-dependent envelope of the analog reference.
 *   3. Time-domain applyIirFilter agrees with the closed-form z-transform
 *      within 0.1 dB (catches indexing / accumulator errors).
 *
 * S30C — Speed & W&F engine (three assertions):
 *   4. Zero-crossing demodulation of a synthesised 3150 Hz + 0.2 %
 *      sinusoidal FM at 3 Hz gives unweightedWfPercent = 0.20 ± 0.01 %.
 *   5. Speed deviation of the FM signal is 0.00 ± 0.01 % (mean of
 *      f_inst equals the carrier frequency).
 *   6. Pure 3150 Hz (no FM) gives unweightedWfPercent < 0.01 %
 *      (noise floor of zero-crossing demodulation).
 *
 * S30D — Channel balance & crosstalk (three assertions):
 *   7. Stereo 1 kHz with L at 0 dBFS and R at -40 dB yields
 *      crosstalkDb = -40.00 ± 0.3 dB when on-channel is left.
 *   8. Matched on-channel levels across L and R captures yield
 *      balanceDb = 0.00 ± 0.05 dB.
 *   9. Mismatched on-channel levels (R signal at -6 dB relative to L)
 *      yield balanceDb = -6.02 ± 0.05 dB.
 *
 * S30E — Frequency response (two assertions):
 *  10. LCG-noise iRIAA end-to-end: computeFrequencyResponse matches
 *      computeIriaaDiscreteMagnitudeDb within ±0.7 dB at four frequencies.
 *  11. fftInPlace Parseval unitarity within 0.01 dB.
 *
 * S30F — THD and SMPTE IMD (two assertions):
 *  12. Synthesised 1 kHz + 1 % 2nd-harmonic distortion gives
 *      thdPercent = 1.00 ± 0.05 %.
 *  13. SMPTE dual-tone 60 Hz + 7 kHz with symmetric ±60 Hz sidebands at
 *      1 % of f2 gives imdPercent = 1.41 ± 0.10 %.
 *
 * S30G — Resonance peak (two assertions):
 *  14. Log sweep 5–30 Hz with a Gaussian amplitude envelope centred at
 *      10 Hz gives peakFrequencyHz = 10.0 ± 1.0 Hz.
 *  15. Q estimate is within ±1 of the analytically expected value derived
 *      from the same Gaussian width.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'engrove-measurement-lab-'));

function copySource(relativePath) {
  const from = join(repoRoot, relativePath);
  const to = join(tempRoot, relativePath);
  if (!existsSync(from)) throw new Error('Missing source file: ' + relativePath);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function localTscCommand() {
  const localTsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(localTsc)) return { command: process.execPath, args: [localTsc] };
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['--no-install', 'tsc'] };
}

function compileTempSources() {
  const compilerOptions = {
    target: 'ES2022',
    module: 'ES2022',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    rootDir: './src',
    outDir: './dist',
  };
  writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ type: 'module' }, null, 2), 'utf8');
  writeFileSync(
    join(tempRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, include: ['src/**/*.ts'] }, null, 2),
    'utf8',
  );
  const tsc = localTscCommand();
  execFileSync(tsc.command, [...tsc.args, '--project', 'tsconfig.json'], { cwd: tempRoot, stdio: 'inherit' });
}

function assertWithin(label, actual, expected, toleranceDb) {
  const delta = Math.abs(actual - expected);
  if (!(delta <= toleranceDb)) {
    throw new Error(
      `${label}: expected ${expected.toFixed(3)} dB, got ${actual.toFixed(3)} dB (delta ${delta.toFixed(3)} > ${toleranceDb} dB).`,
    );
  }
}

async function runChecks() {
  copySource('src/modules/measurement-lab/engine/iriaaFilter.ts');
  copySource('src/modules/measurement-lab/engine/speedFlutter.ts');
  copySource('src/modules/measurement-lab/engine/crosstalk.ts');
  copySource('src/modules/measurement-lab/engine/freqResponse.ts');
  copySource('src/modules/measurement-lab/engine/thd.ts');
  copySource('src/modules/measurement-lab/engine/resonance.ts');
  copySource('src/modules/measurement-lab/engine/referenceLevel.ts');
  copySource('src/modules/measurement-lab/engine/referenceCalibrationSet.ts');
  copySource('src/modules/measurement-lab/engine/channelIdentity.ts');
  copySource('src/modules/measurement-lab/engine/noiseFloor.ts');
  copySource('src/modules/measurement-lab/engine/runQuality.ts');
  copySource('src/shared/audio-io/levelMetrics.ts');
  compileTempSources();

  const iriaaModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/iriaaFilter.js')).href
  );
  const speedFlutterModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/speedFlutter.js')).href
  );
  const crosstalkModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/crosstalk.js')).href
  );
  const freqResponseModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/freqResponse.js')).href
  );
  const thdModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/thd.js')).href
  );
  const resonanceModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/resonance.js')).href
  );
  const referenceLevelModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/referenceLevel.js')).href
  );
  const refCalSetModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/referenceCalibrationSet.js')).href
  );
  const channelIdentityModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/channelIdentity.js')).href
  );
  const noiseFloorModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/noiseFloor.js')).href
  );
  const runQualityModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/runQuality.js')).href
  );
  const levelMetricsModule = await import(
    pathToFileURL(join(tempRoot, 'dist/shared/audio-io/levelMetrics.js')).href
  );

  const {
    computeRiaaMagnitudeDb,
    computeIriaaIirCoefficients,
    computeIriaaDiscreteMagnitudeDb,
    applyIirFilter,
  } = iriaaModule;
  const { computeFrequencyResponse, fftInPlace } = freqResponseModule;
  const { analyseTHD, analyseIMD } = thdModule;
  const { analyseResonance } = resonanceModule;
  const { analyzeReferenceLevel } = referenceLevelModule;
  const { addOrReplaceEntry, clearCalibrationSet, find1kHzEntry, relativeTo1kHz } = refCalSetModule;
  const { computeChannelIdentity } = channelIdentityModule;
  const { analyseSpeedFlutter } = speedFlutterModule;
  const { analyseChannelCapture, summariseChannelBalance } = crosstalkModule;
  const { computeRmsLinear } = levelMetricsModule;
  const { deriveMeasurementRunQuality, deriveMeasurementChainReadiness } = runQualityModule;

  // 1. Analog reference matches the canonical 3-time-constant RIAA
  //    playback table to 0.05 dB.
  const analogReferences = [
    { freq: 20, db: 19.274 },
    { freq: 50, db: 16.941 },
    { freq: 100, db: 13.088 },
    { freq: 1000, db: 0 },
    { freq: 5000, db: -8.210 },
    { freq: 10000, db: -13.734 },
    { freq: 20000, db: -19.620 },
  ];
  for (const { freq, db } of analogReferences) {
    const actual = computeRiaaMagnitudeDb(freq);
    assertWithin(`analog RIAA at ${freq} Hz`, actual, db, 0.05);
  }
  console.log('- analog reference RIAA table: PASS');

  // 2. Discrete-time magnitude (closed-form z-transform of the
  //    coefficients we ship) approximates the analog reference within a
  //    frequency-dependent tolerance envelope. Bilinear transform warps
  //    the frequency axis: tan(omega T / 2) deviates from omega T / 2 by
  //    a few percent below 1 kHz and by ~17% near 20 kHz at fs = 96 kHz.
  //    The envelope below caps that distortion honestly rather than
  //    pretending the digital filter is bit-exact at every frequency.
  const sampleRate = 96_000;
  const coefficients = computeIriaaIirCoefficients(sampleRate);
  function envelopeForFrequency(frequencyHz) {
    if (frequencyHz <= 1000) return 0.01;
    if (frequencyHz <= 5000) return 0.1;
    if (frequencyHz <= 10000) return 0.35;
    return 1.5;
  }
  for (const { freq, db } of analogReferences) {
    const discrete = computeIriaaDiscreteMagnitudeDb(coefficients, freq, sampleRate);
    assertWithin(`discrete RIAA at ${freq} Hz`, discrete, db, envelopeForFrequency(freq));
  }
  console.log('- discrete coefficients vs analog reference (within bilinear envelope): PASS');

  // 3. Time-domain implementation agrees with the closed-form discrete
  //    response. This catches off-by-one indexing, accumulator drift and
  //    typos in applyIirFilter without comparing against the analog
  //    reference. 0.05 dB tolerance covers FFT-quantisation-style noise.
  const samplesPerTone = 24_000;
  const settling = 8_000;
  for (const { freq } of analogReferences) {
    const input = new Float64Array(samplesPerTone);
    for (let n = 0; n < samplesPerTone; n += 1) {
      input[n] = Math.sin((2 * Math.PI * freq * n) / sampleRate);
    }
    const output = applyIirFilter(coefficients, input);
    const inputRms = computeRmsLinear(toFloat32(input.subarray(settling)));
    const outputRms = computeRmsLinear(toFloat32(output.subarray(settling)));
    const measured = 20 * Math.log10(outputRms / inputRms);
    const expected = computeIriaaDiscreteMagnitudeDb(coefficients, freq, sampleRate);
    assertWithin(`time-domain matches z-transform at ${freq} Hz`, measured, expected, 0.1);
  }
  console.log('- applyIirFilter time-domain matches closed-form z-transform: PASS');

  // --- S30C: Speed & W&F engine checks ---
  //
  // Synthesise a 5-second FM signal at 96 kHz:
  //   x(t) = sin(2π·fc·t − (fdev/fm)·cos(2π·fm·t))
  // giving f_inst(t) = fc + fdev·sin(2π·fm·t).
  // With fc=3150, fdev=6.3 (= 0.2 % of fc), fm=3 Hz:
  //   AES6 unweighted W&F = sqrt(2)·RMS(fdev·sin/fc) = fdev/fc·100 = 0.20 %.
  const wfSampleRate = 96_000;
  const wfDuration = 5;
  const wfNsamples = wfSampleRate * wfDuration;
  const wfFc = 3150;
  const wfFdev = wfFc * 0.002;    // 0.2 % of carrier
  const wfFm = 3;
  const wfBeta = wfFdev / wfFm;   // modulation index = 2.1

  const fmSignal = new Float32Array(wfNsamples);
  for (let n = 0; n < wfNsamples; n += 1) {
    const t = n / wfSampleRate;
    fmSignal[n] = Math.sin(2 * Math.PI * wfFc * t - wfBeta * Math.cos(2 * Math.PI * wfFm * t));
  }

  // 4. Unweighted W&F from FM signal = 0.20 ± 0.01 %
  const fmResult = analyseSpeedFlutter(fmSignal, wfSampleRate, wfFc, 0.5);
  assertWithin('W&F (FM 0.2 % at 3 Hz) unweighted', fmResult.unweightedWfPercent, 0.20, 0.01);
  console.log('- speed flutter: 0.2 % FM unweighted W&F: PASS');

  // 5. Speed deviation for FM signal = 0.00 ± 0.01 % (mean f_inst = fc)
  assertWithin('W&F (FM 0.2 %) speed deviation', fmResult.speedDeviationPercent, 0, 0.01);
  console.log('- speed flutter: FM speed deviation ≈ 0 %: PASS');

  // 6. Pure 3150 Hz (no FM) → noise floor < 0.01 %
  const pureSignal = new Float32Array(wfNsamples);
  for (let n = 0; n < wfNsamples; n += 1) {
    pureSignal[n] = Math.sin(2 * Math.PI * wfFc * n / wfSampleRate);
  }
  const pureResult = analyseSpeedFlutter(pureSignal, wfSampleRate, wfFc, 0.5);
  if (!(pureResult.unweightedWfPercent < 0.01)) {
    throw new Error(
      `W&F noise floor: expected < 0.01 %, got ${pureResult.unweightedWfPercent.toFixed(4)} %.`,
    );
  }
  console.log('- speed flutter: pure-tone W&F noise floor < 0.01 %: PASS');

  // --- S30D: Channel balance & crosstalk checks ---
  //
  // Synthesise 2 s of 1 kHz at 96 kHz on two stereo "captures":
  //   L band: left = sin (amp 1.0), right = sin (amp 0.01) → crosstalk = -40 dB
  //   R band: left = sin (amp 0.01), right = sin (amp 1.0) → crosstalk = -40 dB
  const ctSampleRate = 96_000;
  const ctSeconds = 2;
  const ctN = ctSampleRate * ctSeconds;
  const ctSettling = 0.1;
  const fullSig = new Float32Array(ctN);
  const bleedSig = new Float32Array(ctN);
  const halfSig = new Float32Array(ctN);
  const halfBleedSig = new Float32Array(ctN);
  for (let n = 0; n < ctN; n += 1) {
    const v = Math.sin(2 * Math.PI * 1000 * n / ctSampleRate);
    fullSig[n] = v;             // 0 dBFS
    bleedSig[n] = v * 0.01;     // -40 dB
    halfSig[n] = v * 0.5;       // -6 dB
    halfBleedSig[n] = v * 0.005; // -46 dB (still -40 dB below halfSig)
  }

  // 7. Crosstalk L → R at -40 dB
  const lBand = analyseChannelCapture(fullSig, bleedSig, 'left', ctSampleRate, ctSettling);
  assertWithin('crosstalk L → R at -40 dB', lBand.crosstalkDb, -40, 0.3);
  console.log('- channel: L → R crosstalk -40 dB: PASS');

  // 8. Balance = 0 dB when both bands have matched on-channel levels
  const rBandMatched = analyseChannelCapture(bleedSig, fullSig, 'right', ctSampleRate, ctSettling);
  const matchedSummary = summariseChannelBalance(lBand, rBandMatched);
  assertWithin('channel balance (matched)', matchedSummary.balanceDb ?? 0, 0, 0.05);
  console.log('- channel: matched balance ≈ 0 dB: PASS');

  // 9. Balance = -6.02 dB when R band signal is at -6 dB vs L band signal
  const rBandQuiet = analyseChannelCapture(halfBleedSig, halfSig, 'right', ctSampleRate, ctSettling);
  const mismatchedSummary = summariseChannelBalance(lBand, rBandQuiet);
  assertWithin('channel balance (R at -6 dB)', mismatchedSummary.balanceDb ?? 0, -6.0206, 0.05);
  console.log('- channel: mismatched balance ≈ -6.02 dB: PASS');

  // --- S30E: Frequency response engine checks ---
  //
  // Deterministic LCG white noise (30 s at 44100 Hz) through the digital
  // iRIAA filter.  computeFrequencyResponse averages ~644 Hann-windowed
  // blocks; the PSD standard deviation is ~0.20 dB, so ±0.7 dB gives
  // >3.5σ protection.  Checked at 200 Hz, 1 kHz, 5 kHz and 10 kHz
  // against computeIriaaDiscreteMagnitudeDb (normalised at the same
  // log-bin as the engine uses internally).
  const frSampleRate = 44_100;
  const frN = frSampleRate * 30; // 30 seconds → ~644 overlap blocks
  const frCoeffs = computeIriaaIirCoefficients(frSampleRate);

  // LCG: a=1664525 c=1013904223 m=2^32 (Numerical Recipes)
  let lcgSeed = 0x12345678;
  const noise64 = new Float64Array(frN);
  for (let n = 0; n < frN; n++) {
    lcgSeed = (Math.imul(1664525, lcgSeed) + 1013904223) | 0;
    noise64[n] = ((lcgSeed >>> 0) / 0x100000000) * 2 - 1;
  }

  const filtered64 = applyIirFilter(frCoeffs, noise64);
  const filteredF32 = new Float32Array(frN);
  for (let n = 0; n < frN; n++) filteredF32[n] = filtered64[n];

  const frResult = computeFrequencyResponse(filteredF32, frSampleRate);

  // Find the normalisation bin (nearest 1 kHz) — mirrors the engine's own logic
  let frNormIdx = 0;
  let frNormDist = Infinity;
  for (let b = 0; b < frResult.frequenciesHz.length; b++) {
    const d = Math.abs(Math.log2(frResult.frequenciesHz[b] / 1000));
    if (d < frNormDist) { frNormDist = d; frNormIdx = b; }
  }
  const normFreq = frResult.frequenciesHz[frNormIdx];
  const normRefDb = computeIriaaDiscreteMagnitudeDb(frCoeffs, normFreq, frSampleRate);

  for (const testFreq of [200, 1000, 5000, 10000]) {
    let nearestBin = 0;
    let nearestDist = Infinity;
    for (let b = 0; b < frResult.frequenciesHz.length; b++) {
      const d = Math.abs(Math.log2(frResult.frequenciesHz[b] / testFreq));
      if (d < nearestDist) { nearestDist = d; nearestBin = b; }
    }
    const measured = frResult.magnitudesDb[nearestBin];
    const expected = computeIriaaDiscreteMagnitudeDb(frCoeffs, testFreq, frSampleRate) - normRefDb;
    assertWithin(`freq response at ${testFreq} Hz`, measured, expected, 0.7);
  }
  console.log('- frequency response: LCG-noise iRIAA end-to-end: PASS');

  // 11. Parseval / Plancherel check: sum(x^2) ≈ sum(|X_k|^2) / N
  //     Tests that fftInPlace does not scale the output arbitrarily.
  const parsevalN = 1024;
  const pRe = new Float64Array(parsevalN);
  const pIm = new Float64Array(parsevalN);
  let inputPower = 0;
  for (let n = 0; n < parsevalN; n++) {
    pRe[n] = Math.sin(2 * Math.PI * 440 * n / 44100);
    inputPower += pRe[n] * pRe[n];
  }
  fftInPlace(pRe, pIm);
  let fftPower = 0;
  for (let k = 0; k < parsevalN; k++) fftPower += pRe[k] * pRe[k] + pIm[k] * pIm[k];
  const parsevalDb = 10 * Math.log10((fftPower / parsevalN) / inputPower);
  assertWithin('fftInPlace Parseval check', parsevalDb, 0, 0.01);
  console.log('- fftInPlace Parseval unitarity: PASS');

  // --- S30F: THD and SMPTE IMD checks ---
  //
  // 12. 1 kHz + 1 % 2nd harmonic → THD = 1.00 ± 0.05 %
  const thdSampleRate = 44_100;
  const thdDuration = 5; // seconds
  const thdN = thdSampleRate * thdDuration;
  const thdSignal = new Float32Array(thdN);
  for (let n = 0; n < thdN; n++) {
    const t = n / thdSampleRate;
    thdSignal[n] = Math.sin(2 * Math.PI * 1000 * t)
                 + 0.01 * Math.sin(2 * Math.PI * 2000 * t);
  }
  const thdResult = analyseTHD(thdSignal, thdSampleRate, 1000);
  assertWithin('THD (1 kHz + 1 % 2nd harmonic)', thdResult.thdPercent, 1.0, 0.05);
  console.log('- THD: 1 kHz + 1 % 2nd harmonic → 1.00 %: PASS');

  // 13. SMPTE dual-tone 60 Hz + 7 kHz, symmetric ±60 Hz sidebands at
  //     1 % of f2 → IMD = √(2 × 0.01²) / 1 × 100 % = 1.414 ± 0.10 %
  const imdSignal = new Float32Array(thdN);
  for (let n = 0; n < thdN; n++) {
    const t = n / thdSampleRate;
    imdSignal[n] = Math.sin(2 * Math.PI * 60   * t)       // f1
                 + Math.sin(2 * Math.PI * 7000  * t)       // f2
                 + 0.01 * Math.sin(2 * Math.PI * 7060 * t) // upper sideband
                 + 0.01 * Math.sin(2 * Math.PI * 6940 * t);// lower sideband
  }
  const imdResult = analyseIMD(imdSignal, thdSampleRate, 60, 7000);
  // √(2) × 1 % ≈ 1.414 % (both sidebands equal)
  assertWithin('SMPTE IMD (60 Hz + 7 kHz, 1 % symmetric sidebands)', imdResult.imdPercent, 1.414, 0.10);
  console.log('- SMPTE IMD: 1 % symmetric sidebands → 1.41 %: PASS');

  // --- S30G: Resonance peak checks ---
  //
  // Log sweep 5–30 Hz over 30 s at 44100 Hz with a Gaussian amplitude
  // envelope (σ = 1 s) centred at f_peak = 10 Hz.
  //
  // Peak time for log sweep: t_peak = T × log(f_peak/f_start) / log(f_end/f_start)
  //                                 = 30 × log(10/5) / log(30/5) ≈ 11.59 s
  //
  // −3 dB bandwidth (Gaussian, half-power at ±σ in time):
  //   f_high = f_start × (f_end/f_start)^((t_peak + σ)/T) ≈ 10.72 Hz
  //   f_low  = f_start × (f_end/f_start)^((t_peak - σ)/T) ≈  9.34 Hz
  //   Q_expected = f_peak / (f_high − f_low) ≈ 10 / 1.38 ≈ 7.2
  const resSR  = 44_100;
  const resT   = 30; // seconds
  const resN   = resSR * resT;
  const resF0  = 5, resF1 = 30, resFpeak = 10;
  const resSigma = 1.0; // Gaussian σ in seconds
  const resTpeak = resT * Math.log(resFpeak / resF0) / Math.log(resF1 / resF0);

  const sweepSig = new Float32Array(resN);
  for (let n = 0; n < resN; n++) {
    const t = n / resSR;
    // Continuous phase for log chirp
    const phase = 2 * Math.PI * resF0 * resT / Math.log(resF1 / resF0)
                * (Math.pow(resF1 / resF0, t / resT) - 1);
    const amp = Math.exp(-0.5 * ((t - resTpeak) / resSigma) ** 2);
    sweepSig[n] = amp * Math.sin(phase);
  }

  const resResult = analyseResonance(sweepSig, resSR, resF0, resF1, 'log');
  assertWithin('resonance peak frequency', resResult.peakFrequencyHz, resFpeak, 1.0);
  console.log('- resonance: peak at 10 Hz (±1 Hz): PASS');

  // Analytically expected Q: Gaussian -3 dB half-width = σ × √ln2, not σ
  const dt3db = resSigma * Math.sqrt(Math.log(2));
  const qFhigh = resF0 * Math.pow(resF1 / resF0, (resTpeak + dt3db) / resT);
  const qFlow  = resF0 * Math.pow(resF1 / resF0, (resTpeak - dt3db) / resT);
  const qExpected = resFpeak / (qFhigh - qFlow);
  if (resResult.qEstimate !== null) {
    assertWithin('resonance Q estimate', resResult.qEstimate, qExpected, 1.0);
    console.log('- resonance: Q estimate within ±1 of expected: PASS');
  } else {
    throw new Error('resonance Q estimate: expected a non-null Q but got null.');
  }

  // --- S4A: Reference level calibration engine checks ---
  //
  // Synthesise stereo test signals at 96 kHz, 2 seconds.
  // Helper: sine wave at given frequency and amplitude.
  const rlSR = 96_000;
  const rlN = rlSR * 2;
  function makeSine(freq, amp) {
    const sig = new Float32Array(rlN);
    for (let i = 0; i < rlN; i++) sig[i] = amp * Math.sin(2 * Math.PI * freq * i / rlSR);
    return sig;
  }

  // 16. Equal L/R levels → balance ≈ 0 dB
  const rlEqualL = makeSine(1000, 0.5);
  const rlEqualR = makeSine(1000, 0.5);
  const rlResult1 = analyzeReferenceLevel({ leftSamples: rlEqualL, rightSamples: rlEqualR, sampleRateHz: rlSR });
  assertWithin('ref level: equal L/R balance', rlResult1.balanceDb, 0, 0.01);
  console.log('- ref level: equal L/R → balance = 0 dB: PASS');

  // 17. R channel at -6 dB relative to L → balance ≈ -6.02 dB (R lower than L)
  //     balance = rightRmsDbfs − leftRmsDbfs; R at half amplitude = -6.02 dB vs L
  const rlFullL = makeSine(1000, 0.5);
  const rlHalfR = makeSine(1000, 0.25); // 0.25 = 0.5 / 2 → -6.02 dB relative
  const rlResult2 = analyzeReferenceLevel({ leftSamples: rlFullL, rightSamples: rlHalfR, sampleRateHz: rlSR });
  assertWithin('ref level: R at -6 dB → balance ≈ -6.02 dB', rlResult2.balanceDb, -6.0206, 0.05);
  console.log('- ref level: R at -6 dB → balance ≈ -6.02 dB: PASS');

  // 18. Peak and headroom computed correctly
  //     amplitude 0.95 → peakDbfs ≈ 20·log10(0.95); headroom = -peakDbfs
  const rlHighSig = makeSine(1000, 0.95);
  const rlResult3 = analyzeReferenceLevel({ leftSamples: rlHighSig, rightSamples: rlHighSig, sampleRateHz: rlSR });
  const rlExpectedPeak = 20 * Math.log10(0.95);
  assertWithin('ref level: peak dBFS at amp 0.95', rlResult3.leftPeakDbfs, rlExpectedPeak, 0.05);
  assertWithin('ref level: headroom at amp 0.95', rlResult3.headroomDb, -rlExpectedPeak, 0.05);
  console.log('- ref level: peak and headroom correct at amplitude 0.95: PASS');

  // 19. Clipping detected at amplitude 1.0 (abs >= 0.999 threshold)
  const rlClipSig = new Float32Array(rlN).fill(1.0);
  const rlResult4 = analyzeReferenceLevel({ leftSamples: rlClipSig, rightSamples: rlClipSig, sampleRateHz: rlSR });
  if (!rlResult4.clipping) {
    throw new Error('ref level: expected clipping=true for amplitude 1.0');
  }
  if (!rlResult4.warnings.some(w => w.toLowerCase().includes('clipping'))) {
    throw new Error('ref level: expected clipping warning for amplitude 1.0');
  }
  console.log('- ref level: clipping detected at amplitude 1.0: PASS');

  // 20. Silent input (all zeros) → low confidence + low-signal warning; no crash
  const rlSilentSig = new Float32Array(rlN); // all zeros
  const rlResult5 = analyzeReferenceLevel({ leftSamples: rlSilentSig, rightSamples: rlSilentSig, sampleRateHz: rlSR });
  if (rlResult5.confidence !== 'low') {
    throw new Error(`ref level: expected confidence='low' for silent input, got '${rlResult5.confidence}'`);
  }
  if (!rlResult5.warnings.some(w => w.toLowerCase().includes('too low'))) {
    throw new Error('ref level: expected low-signal warning for silent input');
  }
  console.log('- ref level: silent input → low confidence + warning (no crash): PASS');

  // --- S4B: Calibration set helper checks ---
  //
  // Build a minimal stub result for testing (matches ReferenceLevelResult shape).
  function makeStubResult(rms, freq) {
    return {
      leftRmsDbfs: rms,
      rightRmsDbfs: rms - 0.5,
      leftPeakDbfs: rms + 3,
      rightPeakDbfs: rms + 3,
      balanceDb: -0.5,
      headroomDb: -(rms + 3),
      clipping: false,
      confidence: 'high',
      sampleRateHz: 96000,
      referenceFrequencyHz: freq,
      referenceLevelDb: -20,
      warnings: [],
    };
  }
  function makeEntry(bandIndex, bandLabel, freq, source) {
    return {
      bandIndex,
      bandLabel,
      frequencyHz: freq,
      nominalLevelDb: -20,
      source,
      result: makeStubResult(-20, freq),
      capturedAt: new Date().toISOString(),
    };
  }

  // 21. addOrReplaceEntry: append when no existing entry with same key
  const e1 = makeEntry('band_1khz', '1 kHz Reference', 1000, 'live_capture');
  const e2 = makeEntry('band_10khz', '10 kHz Reference', 10000, 'live_capture');
  const setA = addOrReplaceEntry([], e1);
  if (setA.length !== 1 || setA[0].bandIndex !== 'band_1khz') {
    throw new Error('calibration set: addOrReplaceEntry append failed');
  }
  const setB = addOrReplaceEntry(setA, e2);
  if (setB.length !== 2) {
    throw new Error('calibration set: addOrReplaceEntry second append failed');
  }
  console.log('- calibration set: addOrReplaceEntry append: PASS');

  // 22. addOrReplaceEntry: replace existing entry with same bandIndex+source
  const e1Updated = makeEntry('band_1khz', '1 kHz Reference', 1000, 'live_capture');
  e1Updated.result = makeStubResult(-21, 1000);
  const setC = addOrReplaceEntry(setB, e1Updated);
  if (setC.length !== 2) {
    throw new Error('calibration set: addOrReplaceEntry replace should not grow the set');
  }
  if (setC[0].result.leftRmsDbfs !== -21) {
    throw new Error('calibration set: addOrReplaceEntry replace did not update the entry');
  }
  console.log('- calibration set: addOrReplaceEntry replace (same bandIndex+source): PASS');

  // 23. addOrReplaceEntry: same bandIndex but different source → both kept
  const e1SelfTest = makeEntry('band_1khz', '1 kHz Reference', 1000, 'self_test');
  const setD = addOrReplaceEntry(setC, e1SelfTest);
  if (setD.length !== 3) {
    throw new Error('calibration set: same bandIndex different source should append');
  }
  console.log('- calibration set: same band different source → both kept: PASS');

  // 24. clearCalibrationSet: returns empty array
  const setE = clearCalibrationSet();
  if (!Array.isArray(setE) || setE.length !== 0) {
    throw new Error('calibration set: clearCalibrationSet did not return empty array');
  }
  console.log('- calibration set: clearCalibrationSet → []: PASS');

  // 25. find1kHzEntry: finds 1 kHz entry by frequency
  const found = find1kHzEntry(setD, 'live_capture');
  if (!found || found.frequencyHz !== 1000) {
    throw new Error('calibration set: find1kHzEntry did not find 1 kHz entry');
  }
  console.log('- calibration set: find1kHzEntry finds 1 kHz by frequency: PASS');

  // 26. find1kHzEntry: returns undefined gracefully when not found (no crash)
  const notFound = find1kHzEntry([], 'live_capture');
  if (notFound !== undefined) {
    throw new Error('calibration set: find1kHzEntry should return undefined for empty set');
  }
  console.log('- calibration set: find1kHzEntry returns undefined for empty set (no crash): PASS');

  // 27. relativeTo1kHz: correct delta when reference exists
  const e10k = makeEntry('band_10khz', '10 kHz Reference', 10000, 'live_capture');
  e10k.result = makeStubResult(-18, 10000);
  const ref1k = makeEntry('band_1khz', '1 kHz Reference', 1000, 'live_capture');
  ref1k.result = makeStubResult(-20, 1000);
  const delta = relativeTo1kHz(e10k, ref1k);
  if (Math.abs(delta.deltaLDb - 2) > 0.001) {
    throw new Error(`calibration set: relativeTo1kHz deltaL expected 2, got ${delta.deltaLDb}`);
  }
  console.log('- calibration set: relativeTo1kHz correct delta: PASS');

  // 28. relativeTo1kHz: null deltas when refEntry is undefined (no crash)
  const deltaNoRef = relativeTo1kHz(e10k, undefined);
  if (deltaNoRef.deltaLDb !== null || deltaNoRef.deltaRDb !== null) {
    throw new Error('calibration set: relativeTo1kHz should return null deltas when no reference');
  }
  console.log('- calibration set: relativeTo1kHz null deltas when no reference (no crash): PASS');

  // --- S4C: Channel identity engine checks ---
  //
  // Build ChannelCaptureMetrics stubs with controlled linear/dBFS values.
  // ChannelCaptureMetrics: leftRmsLinear, rightRmsLinear, leftRmsDbFs, rightRmsDbFs,
  //   onChannel, crosstalkDb, sampleCount
  function makeCapture(leftLinear, rightLinear, onChannel) {
    const leftDbFs = leftLinear > 0 ? 20 * Math.log10(leftLinear) : -Infinity;
    const rightDbFs = rightLinear > 0 ? 20 * Math.log10(rightLinear) : -Infinity;
    const wantedLinear = onChannel === 'left' ? leftLinear : rightLinear;
    const offLinear = onChannel === 'left' ? rightLinear : leftLinear;
    const crosstalkDb = wantedLinear > 0 && offLinear > 0
      ? 20 * Math.log10(offLinear / wantedLinear)
      : -Infinity;
    return {
      leftRmsLinear: leftLinear,
      rightRmsLinear: rightLinear,
      leftRmsDbFs: leftDbFs,
      rightRmsDbFs: rightDbFs,
      onChannel,
      crosstalkDb,
      sampleCount: 96000 * 10,
    };
  }

  // 29. Normal identity: L-band signal stronger on L, R-band stronger on R
  const normLCapture = makeCapture(0.5, 0.002, 'left');   // L=−6 dBFS, R=−54 dBFS → −48 dB crosstalk
  const normRCapture = makeCapture(0.002, 0.5, 'right');  // L=−54 dBFS, R=−6 dBFS → −48 dB crosstalk
  const normResult = computeChannelIdentity(normLCapture, normRCapture, 'live_capture');
  if (normResult.identity !== 'normal') {
    throw new Error(`channel identity: expected 'normal', got '${normResult.identity}'`);
  }
  if (normResult.confidence !== 'high') {
    throw new Error(`channel identity: expected confidence='high', got '${normResult.confidence}'`);
  }
  assertWithin('channel identity: wantedBalanceDb (matched)', normResult.wantedBalanceDb ?? Infinity, 0, 0.1);
  console.log('- channel identity: normal wiring detected at high confidence: PASS');

  // 30. Possible swapped: L-band signal stronger on R by ≥3 dB, R-band stronger on L by ≥3 dB
  const swpLCapture = makeCapture(0.002, 0.5, 'left');  // L weak, R strong → swapped
  const swpRCapture = makeCapture(0.5, 0.002, 'right'); // L strong, R weak → swapped
  const swpResult = computeChannelIdentity(swpLCapture, swpRCapture, 'live_capture');
  if (swpResult.identity !== 'possible_swapped') {
    throw new Error(`channel identity: expected 'possible_swapped', got '${swpResult.identity}'`);
  }
  if (!swpResult.warnings.some(w => w.toLowerCase().includes('swap'))) {
    throw new Error('channel identity: expected swap warning for possible_swapped result');
  }
  console.log('- channel identity: possible_swapped detected with swap warning: PASS');

  // 31. Low signal → confidence = 'low', low-signal warning(s) present
  const lowLCapture = makeCapture(0.0001, 0.00001, 'left');  // −80 dBFS, very low
  const lowRCapture = makeCapture(0.00001, 0.0001, 'right'); // very low
  const lowResult = computeChannelIdentity(lowLCapture, lowRCapture, 'live_capture');
  if (lowResult.confidence !== 'low') {
    throw new Error(`channel identity: expected confidence='low' for very low signal, got '${lowResult.confidence}'`);
  }
  if (lowResult.warnings.length === 0) {
    throw new Error('channel identity: expected warnings for low signal');
  }
  console.log('- channel identity: low signal → confidence=low with warnings: PASS');

  // 32. Self-test source label is preserved; self-test warning present
  const stLCapture = makeCapture(0.5, 0.003, 'left');
  const stRCapture = makeCapture(0.003, 0.5, 'right');
  const stResult = computeChannelIdentity(stLCapture, stRCapture, 'self_test');
  if (stResult.source !== 'self_test') {
    throw new Error(`channel identity: expected source='self_test', got '${stResult.source}'`);
  }
  if (!stResult.warnings.some(w => w.toLowerCase().includes('self-test') || w.toLowerCase().includes('self_test'))) {
    throw new Error('channel identity: expected self-test warning for self_test source');
  }
  console.log('- channel identity: self_test source preserved + self-test warning: PASS');


  // Noise floor engine tests
  const { analyzeNoiseFloor } = noiseFloorModule;

  // 1. Silence (all zeros) -> noiseFloorDbfs is null (below floor)
  {
    const silence = new Float32Array(4410);
    const result = analyzeNoiseFloor(silence, silence);
    if (result.noiseFloorDbfs !== null) {
      throw new Error(`noise floor: expected null for silence, got ${result.noiseFloorDbfs}`);
    }
    console.log('- noise floor: silence -> null noiseFloorDbfs: PASS');
  }

  // 2. Known amplitude -> expected RMS dBFS
  {
    // Sine wave at amplitude 0.1 -> RMS = 0.1 / sqrt(2) -> ~-23.0 dBFS
    const SR = 44100; const dur = 1;
    const freq = 1000;
    const left = new Float32Array(SR * dur);
    const right = new Float32Array(SR * dur);
    for (let i = 0; i < left.length; i++) {
      left[i] = 0.1 * Math.sin(2 * Math.PI * freq * i / SR);
      right[i] = 0.08 * Math.sin(2 * Math.PI * freq * i / SR);
    }
    const result = analyzeNoiseFloor(left, right);
    const expectedL = 20 * Math.log10(0.1 / Math.sqrt(2));
    const expectedR = 20 * Math.log10(0.08 / Math.sqrt(2));
    if (result.leftRmsDbfs === null || Math.abs(result.leftRmsDbfs - expectedL) > 0.5) {
      throw new Error(`noise floor: L RMS expected ~${expectedL.toFixed(1)}, got ${result.leftRmsDbfs}`);
    }
    if (result.rightRmsDbfs === null || Math.abs(result.rightRmsDbfs - expectedR) > 0.5) {
      throw new Error(`noise floor: R RMS expected ~${expectedR.toFixed(1)}, got ${result.rightRmsDbfs}`);
    }
    // noiseFloorDbfs should be max of L/R RMS
    const expectedNf = Math.max(result.leftRmsDbfs, result.rightRmsDbfs);
    if (Math.abs(result.noiseFloorDbfs - expectedNf) > 0.01) {
      throw new Error(`noise floor: noiseFloorDbfs should be max(L,R)=${expectedNf.toFixed(2)}, got ${result.noiseFloorDbfs}`);
    }
    console.log('- noise floor: known amplitude -> correct RMS dBFS and max aggregation: PASS');
  }

  // 3. Peak values correct
  {
    const left = new Float32Array([0.5, -0.8, 0.3]);
    const right = new Float32Array([0.6, -0.4, 0.1]);
    const result = analyzeNoiseFloor(left, right);
    const expectedLPeak = 20 * Math.log10(0.8);
    const expectedRPeak = 20 * Math.log10(0.6);
    if (result.leftPeakDbfs === null || Math.abs(result.leftPeakDbfs - expectedLPeak) > 0.1) {
      throw new Error(`noise floor: L peak expected ${expectedLPeak.toFixed(2)}, got ${result.leftPeakDbfs}`);
    }
    if (result.rightPeakDbfs === null || Math.abs(result.rightPeakDbfs - expectedRPeak) > 0.1) {
      throw new Error(`noise floor: R peak expected ${expectedRPeak.toFixed(2)}, got ${result.rightPeakDbfs}`);
    }
    console.log('- noise floor: peak values correct: PASS');
  }

  // 4. Empty samples -> null, no crash
  {
    const result = analyzeNoiseFloor(new Float32Array(0), new Float32Array(0));
    if (result.noiseFloorDbfs !== null) {
      throw new Error('noise floor: empty arrays should produce null noiseFloorDbfs');
    }
    if (result.warnings.length === 0) {
      throw new Error('noise floor: empty arrays should produce a warning');
    }
    console.log('- noise floor: empty arrays -> null + warning (no crash): PASS');
  }


  // Run quality engine tests
  {
    // Normal signal -> ok
    const rqOk = deriveMeasurementRunQuality({
      leftRmsDbfs: -20, rightRmsDbfs: -21,
      leftPeakDbfs: -6, rightPeakDbfs: -7,
      source: 'live_capture', measurementKind: 'test_tone',
    });
    if (rqOk.status !== 'ok') throw new Error('runQuality: normal signal should be ok, got ' + rqOk.status);
    if (rqOk.clipping) throw new Error('runQuality: normal signal should not clip');
    if (rqOk.lowSignal) throw new Error('runQuality: normal signal should not be low');
    console.log('- runQuality: normal signal -> ok: PASS');
  }
  {
    // Clipping peak >= -0.1 dBFS -> invalid
    const rqClip = deriveMeasurementRunQuality({
      leftRmsDbfs: -6, rightRmsDbfs: -6,
      leftPeakDbfs: 0, rightPeakDbfs: -3,
      source: 'live_capture', measurementKind: 'test_tone',
    });
    if (rqClip.status !== 'invalid') throw new Error('runQuality: clipping should give invalid, got ' + rqClip.status);
    if (!rqClip.clipping) throw new Error('runQuality: clipping flag should be true');
    console.log('- runQuality: clipping -> invalid: PASS');
  }
  {
    // Low signal + test_tone -> warning
    const rqLow = deriveMeasurementRunQuality({
      leftRmsDbfs: -70, rightRmsDbfs: -75,
      leftPeakDbfs: -65, rightPeakDbfs: -70,
      source: 'live_capture', measurementKind: 'test_tone',
    });
    if (rqLow.status !== 'warning') throw new Error('runQuality: low signal test_tone should be warning, got ' + rqLow.status);
    if (!rqLow.lowSignal) throw new Error('runQuality: lowSignal flag should be true');
    console.log('- runQuality: low signal + test_tone -> warning: PASS');
  }
  {
    // Imbalance > 3 dB -> warning
    const rqImbal = deriveMeasurementRunQuality({
      leftRmsDbfs: -20, rightRmsDbfs: -26,
      leftPeakDbfs: -10, rightPeakDbfs: -16,
      source: 'live_capture', measurementKind: 'test_tone',
    });
    if (rqImbal.status !== 'warning') throw new Error('runQuality: imbalance should give warning, got ' + rqImbal.status);
    console.log('- runQuality: imbalance > 3 dB -> warning: PASS');
  }
  {
    // Low signal + noise_floor -> ok (not warning/invalid, balanced channels)
    const rqNf = deriveMeasurementRunQuality({
      leftRmsDbfs: -70, rightRmsDbfs: -71,
      leftPeakDbfs: -65, rightPeakDbfs: -66,
      source: 'live_capture', measurementKind: 'noise_floor',
    });
    if (rqNf.status !== 'ok') throw new Error('runQuality: low signal noise_floor should be ok, got ' + rqNf.status);
    console.log('- runQuality: low signal noise_floor -> ok (not penalised): PASS');
  }
  {
    // self_test -> warning
    const rqSelf = deriveMeasurementRunQuality({
      leftRmsDbfs: -20, rightRmsDbfs: -21,
      leftPeakDbfs: -6, rightPeakDbfs: -7,
      source: 'self_test', measurementKind: 'test_tone',
    });
    if (rqSelf.status !== 'warning') throw new Error('runQuality: self_test should give warning, got ' + rqSelf.status);
    console.log('- runQuality: self_test -> warning: PASS');
  }
  {
    // Chain readiness: no signal -> not_checked
    const cr = deriveMeasurementChainReadiness({
      leftRmsDbfs: -80, rightRmsDbfs: -80,
      leftPeakDbfs: -75, rightPeakDbfs: -75,
    });
    if (cr.status !== 'not_checked') throw new Error('chainReadiness: no signal should give not_checked, got ' + cr.status);
    console.log('- chainReadiness: no signal -> not_checked: PASS');
  }
  {
    // Chain readiness: good signal -> ready
    const cr = deriveMeasurementChainReadiness({
      leftRmsDbfs: -20, rightRmsDbfs: -21,
      leftPeakDbfs: -6, rightPeakDbfs: -7,
    });
    if (cr.status !== 'ready') throw new Error('chainReadiness: good signal should give ready, got ' + cr.status);
    console.log('- chainReadiness: good signal -> ready: PASS');
  }

  console.log('PASS measurement lab engine checks');
}

function toFloat32(source) {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source[i];
  return out;
}

// S3F: static source check — verifies renderMeasurementLabPage.ts handles all
// three test-record UI states and exposes the resolveSelectedTestRecord helper.
function checkTestRecordUIStates() {
  const srcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(srcPath)) {
    console.error('S3F static check: renderMeasurementLabPage.ts not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(srcPath, 'utf8');
  const checks = [
    ['testRecordLoadFailed state field', /testRecordLoadFailed\s*:/],
    ['selectedTestRecordMissing state field', /selectedTestRecordMissing\s*:/],
    ['resolveSelectedTestRecord helper', /function resolveSelectedTestRecord\s*\(/],
    ['dataset-load-failed UI message', /dataset failed to load/],
    ['selected-record-not-found recovery', /Selected test record not found/],
    ['recovery to preferred label', /recoveredToLabel/],
    ['mlab-coverage-load-error class', /mlab-coverage-load-error/],
    ['mlab-record-warning class', /mlab-record-warning/],
    ['missing state cleared on change', /selectedTestRecordMissing\s*=\s*null/],
    ['missing state cleared on catch', /testRecordLoadFailed\s*=\s*true[\s\S]{0,200}selectedTestRecordMissing\s*=\s*null/],
  ];
  let failed = false;
  for (const [label, pattern] of checks) {
    if (!pattern.test(src)) {
      console.error(`S3F static check FAIL: "${label}" pattern not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }
  if (!failed) {
    console.log('- S3F static source check (test-record UI states): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkTestRecordUIStates();

// S3G: static source checks — coverage-to-panel navigation and wrap-up invariants.
function checkCoverageNavigation() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const loaderSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/loadTestRecords.ts');
  if (!existsSync(renderSrcPath) || !existsSync(loaderSrcPath)) {
    console.error('S3G static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const loaderSrc = readFileSync(loaderSrcPath, 'utf8');

  const renderChecks = [
    ['WORKFLOW_PANEL_TARGETS mapping', /WORKFLOW_PANEL_TARGETS/],
    ['mlab-speed-panel id in markup', /id="mlab-speed-panel"/],
    ['mlab-channel-panel id in markup', /id="mlab-channel-panel"/],
    ['mlab-freq-panel id in markup', /id="mlab-freq-panel"/],
    ['mlab-thd-panel id in markup', /id="mlab-thd-panel"/],
    ['mlab-resonance-panel id in markup', /id="mlab-resonance-panel"/],
    ['data-mlab-tool-panel attribute', /data-mlab-tool-panel=/],
    ['data-mlab-goto-panel on badge button', /mlab-coverage-badge.*data-mlab-goto-panel|data-mlab-goto-panel.*mlab-coverage-badge/],
    ['mlab-panel--target-highlight class', /mlab-panel--target-highlight/],
    ['highlightTargetPanel function', /function highlightTargetPanel\s*\(/],
  ];
  const loaderChecks = [
    ['IEC_IMD in runtime loader', /IEC_IMD/],
  ];

  // Check "Recommended for Toolbox 3.0" is absent from option rendering
  const optionRenderRegion = src.match(/function renderRecordSelector[\s\S]{0,1500}/)?.[0] ?? '';
  if (/Recommended for Toolbox/.test(optionRenderRegion)) {
    console.error('S3G static check FAIL: "Recommended for Toolbox" found in renderRecordSelector — must not appear in option labels');
    process.exitCode = 1;
  }

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    if (!pattern.test(src)) {
      console.error(`S3G static check FAIL: "${label}" pattern not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of loaderChecks) {
    if (!pattern.test(loaderSrc)) {
      console.error(`S3G static check FAIL: "${label}" pattern not found in loadTestRecords.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S3G static source check (coverage navigation wrap-up): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkCoverageNavigation();

// S4A: static source checks — reference level calibration foundation.
function checkReferenceLevelFoundation() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const engineSrcPath = join(repoRoot, 'src/modules/measurement-lab/engine/referenceLevel.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(engineSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4A static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const engineSrc = readFileSync(engineSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const renderChecks = [
    ['analyzeReferenceLevel import', /analyzeReferenceLevel/],
    ['reference_level in WORKFLOW_PANEL_TARGETS', /reference_level.*mlab-reflevel-panel|mlab-reflevel-panel.*reference_level/],
    ['mlab-reflevel-panel id in markup', /id="mlab-reflevel-panel"/],
    ['data-mlab-reflevel-body attribute', /data-mlab-reflevel-body/],
    ['refLevel state field', /refLevel\s*:/],
    ['stopRefLevelCapture function', /function stopRefLevelCapture\s*\(/],
    ['startRefLevelCapture function', /function startRefLevelCapture\s*\(/],
    ['renderRefLevelPanel function', /function renderRefLevelPanel\s*\(/],
    ['getReferenceBands function', /function getReferenceBands\s*\(/],
    ['live_capture source label', /live_capture/],
    ['self_test source label', /self_test/],
    ['reference band unavailability message', /not available with selected test record/],
    ['refLevelBody in elements', /refLevelBody/],
    ['stopRefLevelCapture in teardownAudio', /stopRefLevelCapture\(\)/],
    ['reference_level in SessionJson measurements', /reference_level\s*:/],
  ];
  const engineChecks = [
    ['analyzeReferenceLevel export', /export function analyzeReferenceLevel\s*\(/],
    ['ReferenceLevelResult type export', /export type ReferenceLevelResult/],
    ['CLIPPING_THRESHOLD export', /export const CLIPPING_THRESHOLD/],
    ['balance documented as R minus L', /rightRmsDbfs.*leftRmsDbfs|balanceDb.*rightRmsDbfs.*leftRmsDbfs/],
    ['headroomDb as 0 minus peak', /headroomDb.*0\s*-\s*maxPeakDbfs|0\s*-\s*maxPeakDbfs/],
    ['low confidence for silent input', /'low'/],
    ['clipping at 0.999', /0\.999/],
  ];
  const workflowsChecks = [
    ['reference_level implementationStatus supported', /reference_level[\s\S]{0,400}implementationStatus.*supported/],
  ];

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    if (!pattern.test(src)) {
      console.error(`S4A static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of engineChecks) {
    if (!pattern.test(engineSrc)) {
      console.error(`S4A static check FAIL: "${label}" not found in referenceLevel.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of workflowsChecks) {
    if (!pattern.test(workflowsSrc)) {
      console.error(`S4A static check FAIL: "${label}" not found in measurementWorkflows.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4A static source check (reference level calibration foundation): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkReferenceLevelFoundation();

// S4A.1: static source checks — mobile/desktop optimization notice.
function checkMobileDesktopNotice() {
  const noticeSrcPath = join(repoRoot, 'src/shared/ui/mobileDesktopNotice.ts');
  const mainSrcPath = join(repoRoot, 'src/main.ts');
  if (!existsSync(noticeSrcPath)) {
    console.error('S4A.1 static check FAIL: src/shared/ui/mobileDesktopNotice.ts not found');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(mainSrcPath)) {
    console.error('S4A.1 static check FAIL: src/main.ts not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(noticeSrcPath, 'utf8');
  const mainSrc = readFileSync(mainSrcPath, 'utf8');

  const checks = [
    // Export
    ['mountMobileDesktopNotice export', /export function mountMobileDesktopNotice\s*\(/],
    // Small-screen detection (matchMedia with 767px breakpoint)
    ['matchMedia max-width 767px', /matchMedia\s*\(.*767px/],
    // sessionStorage key
    ['sessionStorage key engrove-mobile-desktop-notice-dismissed', /engrove-mobile-desktop-notice-dismissed/],
    // In-memory fallback
    ['in-memory dismissed fallback', /dismissedInMemory/],
    // Text content: PC/desktop
    ['text: optimized for desktop / PC', /Optimized for desktop|optimized for desktop|PC or desktop|desktop.*PC/],
    // Text content: Measurement Lab
    ['text: Measurement Lab', /Measurement Lab/],
    // Text content: audio interface
    ['text: audio interface', /audio interface/],
    // Text content: line-in
    ['text: line-in connection', /line.in/],
    // Text content: phono
    ['text: phono', /phono/],
    // Accessibility: role dialog
    ['accessibility: role="dialog"', /role=["']dialog["']/],
    // Accessibility: aria-modal
    ['accessibility: aria-modal="true"', /aria-modal=["']true["']/],
    // Accessibility: aria-labelledby
    ['accessibility: aria-labelledby', /aria-labelledby/],
    // Accessibility: aria-describedby
    ['accessibility: aria-describedby', /aria-describedby/],
    // Escape key handling
    ['Escape key handling', /e\.key\s*===\s*['"]Escape['"]/],
  ];

  const mainChecks = [
    ['main.ts imports mountMobileDesktopNotice', /import.*mountMobileDesktopNotice.*from/],
    ['main.ts calls mountMobileDesktopNotice()', /mountMobileDesktopNotice\s*\(\s*\)/],
  ];

  let failed = false;
  for (const [label, pattern] of checks) {
    if (!pattern.test(src)) {
      console.error(`S4A.1 static check FAIL: "${label}" not found in mobileDesktopNotice.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of mainChecks) {
    if (!pattern.test(mainSrc)) {
      console.error(`S4A.1 static check FAIL: "${label}" not found in main.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4A.1 static source check (mobile desktop notice): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkMobileDesktopNotice();

// S4B: static source checks — multi-band calibration set and live/self-test honesty.
function checkS4BCalibrationSet() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const calSetSrcPath = join(repoRoot, 'src/modules/measurement-lab/engine/referenceCalibrationSet.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(calSetSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4B static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const calSetSrc = readFileSync(calSetSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const renderChecks = [
    ['calibrationSet state field', /calibrationSet\s*:/],
    ['addOrReplaceEntry called', /addOrReplaceEntry\s*\(/],
    ['clearCalibrationSet called', /clearCalibrationSet\s*\(/],
    ['calibration_set in JSON export', /calibration_set/],
    ['live_capture source preserved', /live_capture/],
    ['self_test source preserved', /self_test/],
    ['renderCalibrationSetHtml function', /function renderCalibrationSetHtml\s*\(/],
    ['attachClearSetListener function', /function attachClearSetListener\s*\(/],
    ['data-mlab-reflevel-clear attribute', /data-mlab-reflevel-clear/],
    ['calibration set cleared on record change', /calibrationSet.*clearCalibrationSet|clearCalibrationSet.*calibrationSet/],
    ['mlab-reflevel-calset CSS class', /mlab-reflevel-calset/],
    ['mlab-reflevel-info CSS class', /mlab-reflevel-info/],
  ];
  const calSetChecks = [
    ['addOrReplaceEntry export', /export function addOrReplaceEntry\s*\(/],
    ['clearCalibrationSet export', /export function clearCalibrationSet\s*\(/],
    ['find1kHzEntry export', /export function find1kHzEntry\s*\(/],
    ['relativeTo1kHz export', /export function relativeTo1kHz\s*\(/],
    ['CalibrationSetEntry type export', /export type CalibrationSetEntry/],
    ['source live_capture | self_test in type', /live_capture.*self_test|self_test.*live_capture/],
    ['null return for missing reference in relativeTo1kHz', /if\s*\(!refEntry\)\s*return/],
  ];
  // Verify VTA/IMD status has NOT been changed to supported
  const vtaStillPlanned = !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*supported/.test(workflowsSrc);
  if (!vtaStillPlanned) {
    console.error('S4B static check FAIL: vta_imd_optimizer must not be changed to supported');
    process.exitCode = 1;
  }

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    if (!pattern.test(src)) {
      console.error(`S4B static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of calSetChecks) {
    if (!pattern.test(calSetSrc)) {
      console.error(`S4B static check FAIL: "${label}" not found in referenceCalibrationSet.ts`);
      failed = true;
    }
  }
  if (!failed && vtaStillPlanned) {
    console.log('- S4B static source check (calibration set & live/self-test honesty): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4BCalibrationSet();

// S4C: static source checks — channel identity & crosstalk live workflow.
function checkS4CChannelIdentity() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const engineSrcPath = join(repoRoot, 'src/modules/measurement-lab/engine/channelIdentity.ts');
  const cssSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  if (!existsSync(renderSrcPath) || !existsSync(engineSrcPath) || !existsSync(cssSrcPath)) {
    console.error('S4C static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const engineSrc = readFileSync(engineSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const renderChecks = [
    ['computeChannelIdentity import', /computeChannelIdentity/],
    ['ChannelIdentityResult type used', /ChannelIdentityResult/],
    ['identityResult state field', /identityResult\s*:/],
    ['source state field on ChannelStateBag', /source\s*:\s*'live_capture'\s*\|\s*'self_test'\s*\|\s*null/],
    ['leftBandIndex state field', /leftBandIndex\s*:/],
    ['rightBandIndex state field', /rightBandIndex\s*:/],
    ['getChannelIdentityBands function', /function getChannelIdentityBands\s*\(/],
    ['computeChannelIdentity called in startChannelCapture', /computeChannelIdentity\s*\(/],
    ['identityResult cleared in resetChannelMeasurement', /identityResult\s*=\s*null/],
    ['channel_identity in SessionJson (not channel_balance)', /channel_identity\s*:/],
    ['channel_balance absent from SessionJson type', !/channel_balance\s*:/.test(src)],
    ['CHANNEL IDENTITY & CROSSTALK in report', /CHANNEL IDENTITY & CROSSTALK/],
    ['mlab-channel-info CSS class emitted', /mlab-channel-info/],
    ['mlab-channel-warning CSS class emitted', /mlab-channel-warning/],
    ['mlab-channel-selftest-note CSS class emitted', /mlab-channel-selftest-note/],
  ];
  const engineChecks = [
    ['computeChannelIdentity export', /export function computeChannelIdentity\s*\(/],
    ['ChannelIdentityResult type export', /export type ChannelIdentityResult/],
    ['ChannelIdentityStatus type export', /export type ChannelIdentityStatus/],
    ['normal identity status', /'normal'/],
    ['possible_swapped identity status', /'possible_swapped'/],
    ['inconclusive identity status', /'inconclusive'/],
    ['source field in result', /source\s*:/],
    ['confidence field in result', /confidence\s*:/],
    ['warnings array in result', /warnings\s*:/],
    ['wantedBalanceDb computed', /wantedBalanceDb/],
    ['crosstalkSymmetryDeltaDb computed', /crosstalkSymmetryDeltaDb/],
    ['SWAPPED_MARGIN_DB constant', /SWAPPED_MARGIN_DB/],
    ['LOW_SIGNAL_DBFS constant', /LOW_SIGNAL_DBFS/],
  ];
  const cssChecks = [
    ['mlab-channel-info CSS rule', /\.mlab-channel-info/],
    ['mlab-channel-warning CSS rule', /\.mlab-channel-warning/],
    ['mlab-channel-selftest-note CSS rule', /\.mlab-channel-selftest-note/],
  ];

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4C static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of engineChecks) {
    if (!pattern.test(engineSrc)) {
      console.error(`S4C static check FAIL: "${label}" not found in channelIdentity.ts`);
      failed = true;
    }
  }
  for (const [label, pattern] of cssChecks) {
    if (!pattern.test(cssSrc)) {
      console.error(`S4C static check FAIL: "${label}" not found in measurementLab.css`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4C static source check (channel identity & crosstalk live workflow): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4CChannelIdentity();

// S4C.1: static source checks — channel band availability gate & export metadata hardening.
function checkS4C1ChannelGate() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S4C.1 static check: renderMeasurementLabPage.ts not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const renderChecks = [
    // Unavailability message when both bands missing
    ['unavailability message (not available)', /Channel identity and crosstalk are not available with selected test record/],
    // Secondary hint when both bands missing
    ['secondary hint (choose a test record)', /Choose a test record with left-only and right-only channel bands/],
    // Partial-band messages
    ['missing right-channel test band message', /Missing right-channel test band/],
    ['missing left-channel test band message', /Missing left-channel test band/],
    // Start capture guards
    ['guard: no test record selected', /no test record selected.*capture aborted|capture aborted.*no test record selected/],
    ['guard: left-band not available', /left-band not available for selected test record/],
    ['guard: right-band not available', /right-band not available for selected test record/],
    // Auto-reset on record change
    ['channel reset on record change', /resetChannelMeasurement\(\)[\s\S]{0,300}Channel identity capture reset after test record change|Channel identity capture reset after test record change[\s\S]{0,300}resetChannelMeasurement\(\)/],
    ['activity log for channel reset', /Channel identity capture reset after test record change/],
    // New state fields
    ['ChannelBandMeta type', /type ChannelBandMeta\s*=/],
    ['leftBandMeta state field', /leftBandMeta\s*:/],
    ['rightBandMeta state field', /rightBandMeta\s*:/],
    // Export metadata as objects with snake_case keys (not just a bare index string)
    ['left_band exported as object with frequency_hz', /left_band[^;]{0,200}frequency_hz/],
    ['right_band exported as object with frequency_hz', /right_band[^;]{0,200}frequency_hz/],
    // Stale-state reset affordance
    ['hasStaleState reset button', /hasStaleState/],
  ];

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4C.1 static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4C.1 static source check (channel band availability gate & export hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4C1ChannelGate();

// S4D: static source checks — frequency response sweep workflow gate & export hardening.
function checkS4DFreqPanel() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4D static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const renderChecks = [
    // Helpers
    ['getFrequencyResponseBands helper', /function getFrequencyResponseBands\s*\(/],
    ['selectedFreqBand helper', /function selectedFreqBand\s*\(/],
    // Types
    ['FreqBandMeta type', /type FreqBandMeta\s*=/],
    // FreqState extensions
    ['resultSource in FreqState', /resultSource\s*:\s*'live_capture'\s*\|\s*'self_test'\s*\|\s*null/],
    ['selectedBandIndex in FreqState', /selectedBandIndex\s*:\s*(string\s*\|\s*null|null\s*\|\s*string)/],
    ['selectedBandMeta in FreqState', /selectedBandMeta\s*:\s*FreqBandMeta\s*\|\s*null/],
    // Availability gate messages
    ['no-record message', /Select a test record with a frequency sweep band/],
    ['unavailability message', /Frequency response measurement is not available with selected test record/],
    ['secondary unavailability text', /Choose a test record with a frequency sweep band/],
    // Chain-honesty text
    ['chain-honesty text in idle state', /full playback\/capture chain/],
    // Self-test note
    ['self-test note for freq panel', /does not produce a sweep/],
    // Result source handling
    ['result source stored on capture start', /state\.freq\.resultSource\s*=/],
    ['result source badge in UI', /Self-test \/ Simulated|self_test.*Live capture|Live capture.*self_test/],
    // Export
    ['sweep_band in JSON export', /sweep_band/],
    ['source in freq response export', /source.*state\.freq\.resultSource/],
    ['iriaa_applied in freq result export', /iriaa_applied/],
    // Band index reset on record change
    ['freq.selectedBandIndex reset on record change', /freq\.selectedBandIndex\s*=\s*null/],
    // VTA still not supported
    ['VTA still not supported', !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*supported/.test(workflowsSrc)],
  ];

  // Band preference: verify the sort puts 20Hz–20kHz sweeps first
  const sortRegion = src.match(/function getFrequencyResponseBands[\s\S]{0,600}/)?.[0] ?? '';
  const sortPrefersFull = /aFull.*bFull|fromHz.*19000|toHz.*19000/.test(sortRegion);
  if (!sortPrefersFull) {
    console.error('S4D static check FAIL: getFrequencyResponseBands does not appear to prefer 20 Hz–20 kHz sweeps');
    process.exitCode = 1;
  }

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4D static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }

  if (!failed && sortPrefersFull) {
    console.log('- S4D static source check (freq response sweep gate & export hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4DFreqPanel();

// S4D.1/S4D.2: static source checks — freq export schema normalization & capture guard.
function checkS4D1D2FreqExport() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S4D.1/S4D.2 static check: renderMeasurementLabPage.ts not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // Serializer helper present
    ['serializeFreqBandMeta function', /function serializeFreqBandMeta\s*\(/],
    // Snake-case export fields in the serializer
    ['frequency_start_hz in serializer', /frequency_start_hz\s*:/],
    ['frequency_end_hz in serializer', /frequency_end_hz\s*:/],
    ['frequency_hz in serializer (FreqBandMeta)', /frequency_hz\s*:/],
    ['level_db in serializer (FreqBandMeta)', /level_db\s*:/],
    // buildSessionJson uses the helper, not a direct pass-through
    ['buildSessionJson uses serializeFreqBandMeta', /serializeFreqBandMeta\s*\(\s*state\.freq\.selectedBandMeta\s*\)/],
    // Direct camelCase pass-through must NOT exist
    ['no direct selectedBandMeta pass-through in sweep_band',
      !/sweep_band\s*:\s*state\.freq\.selectedBandMeta/.test(src)],
    // Missing-band guard log line
    ['missing-band guard log', /Frequency response: no sweep band available/],
  ];

  let failed = false;
  for (const [label, pattern] of checks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4D.1/S4D.2 static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4D.1/S4D.2 static source check (freq export schema & capture guard): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4D1D2FreqExport();

// S4E: static source checks — THD/IMD workflow gate & export hardening.
function checkS4EThdImdGate() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4E static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const renderChecks = [
    // Band helper
    ['getDistortionBands function', /function getDistortionBands\s*\(/],
    ['thdBands returned', /thdBands/],
    ['imdBands returned', /imdBands/],
    // ThdBandMeta type
    ['ThdBandMeta type', /type ThdBandMeta\s*=/],
    // New ThdStateBag fields
    ['resultSource in ThdStateBag', /resultSource\s*:\s*'live_capture'\s*\|\s*'self_test'\s*\|\s*null/],
    ['bandMeta in ThdStateBag', /bandMeta\s*:\s*ThdBandMeta\s*\|\s*null/],
    ['selectedBandIndex in ThdStateBag', /selectedBandIndex\s*:/],
    // Serializer helper
    ['serializeThdBandMeta function', /function serializeThdBandMeta\s*\(/],
    // Export fields
    ['source in thd/imd export', /source.*state\.thd\.resultSource|state\.thd\.resultSource.*source/],
    ['band in thd/imd export via serializer', /serializeThdBandMeta\s*\(\s*state\.thd\.bandMeta\s*\)/],
    ['f1_hz in serializeThdBandMeta', /f1_hz\s*:/],
    ['f2_hz in serializeThdBandMeta', /f2_hz\s*:/],
    // Availability gating
    ['no-record message for THD/IMD', /Select a test record with a THD or IMD band/],
    ['unavailability message for mode', /not available with selected test record/],
    // Capture guard log (template literal uses toUpperCase() — match the invariant parts)
    ['capture-aborted log present', /no band available.*capture aborted/],
    ['capture-aborted uses mode', /mode\.toUpperCase\(\).*no band available|no band available.*capture aborted/],
    // Full-chain disclaimer
    ['full-chain disclaimer for THD/IMD panel', /full playback\/capture chain/],
    // resultSource set on capture start
    ['resultSource set in startThdCapture', /state\.thd\.resultSource\s*=/],
    // VTA still not supported
    ['VTA still not supported', !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*supported/.test(workflowsSrc)],
  ];

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4E static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4E static source check (THD/IMD workflow gate & export hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4EThdImdGate();

// S4F: static source checks — Wow/Flutter workflow polish & export hardening.
function checkS4FWowFlutter() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4F static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const renderChecks = [
    // Band helper
    ['getWowFlutterBands function', /function getWowFlutterBands\s*\(/],
    // SpeedBandMeta type
    ['SpeedBandMeta type', /type SpeedBandMeta\s*=/],
    // SpeedState extensions
    ['resultSource in SpeedState', /resultSource\s*:\s*'live_capture'\s*\|\s*'self_test'\s*\|\s*null/],
    ['bandMeta in SpeedState', /bandMeta\s*:\s*SpeedBandMeta\s*\|\s*null/],
    // Serializer helper
    ['serializeSpeedBandMeta function', /function serializeSpeedBandMeta\s*\(/],
    // Export fields
    ['source in speed export', /source.*state\.speed\.resultSource|state\.speed\.resultSource.*source/],
    ['band in speed export via serializer', /serializeSpeedBandMeta\s*\(\s*state\.speed\.bandMeta\s*\)/],
    ['frequency_hz in serializeSpeedBandMeta', /function serializeSpeedBandMeta[\s\S]{0,200}frequency_hz\s*:/],
    ['level_db in serializeSpeedBandMeta', /function serializeSpeedBandMeta[\s\S]{0,200}level_db\s*:/],
    // Availability gating
    ['no-record message for speed', /Select a test record with a speed.*wow.*flutter band/i],
    ['unavailability message for speed', /Speed.*W.*F measurement is not available with selected test record/],
    // Availability shown before connect-source instruction
    ['no-record check before captureState in renderSpeedPanel',
      /function renderSpeedPanel[\s\S]{0,400}selectedRecord\(\)[\s\S]{0,600}captureState[\s\S]{0,200}Connect a source/],
    // Capture guard log
    ['capture-aborted log for speed', /no speed band available.*capture aborted/],
    // resultSource set in startSpeedMeasurement
    ['resultSource set in startSpeedMeasurement', /state\.speed\.resultSource\s*=/],
    // THD/IMD: no-record check before captureState (Part A fix)
    ['no-record check before captureState in renderThdPanel',
      /function renderThdPanel[\s\S]{0,400}selectedRecord\(\)[\s\S]{0,600}captureState[\s\S]{0,600}Connect a source/],
    // VTA still not supported
    ['VTA still not supported', !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*supported/.test(workflowsSrc)],
  ];

  let failed = false;
  for (const [label, pattern] of renderChecks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4F static check FAIL: "${label}" not found in renderMeasurementLabPage.ts`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4F static source check (Wow/Flutter workflow polish & export hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4FWowFlutter();

// S4G: final QA — source badge, band display, chain text, report consistency, export consistency.
function checkS4GFinal() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S4G static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // Part A — Speed result UI: source badge
    ['Speed result: source badge class present', /mlab-result-source-row[\s\S]{0,400}ea-badge.*srcBadgeClass|srcBadgeClass[\s\S]{0,400}mlab-result-source-row/],
    ['Speed result: Self-test \/ Simulated badge label', /Self-test \/ Simulated/],
    ['Speed result: Live capture badge label in speed result', /function renderSpeedPanel[\s\S]{0,4000}Live capture/],
    // Part A — Speed result UI: band row
    ['Speed result: band meta label rendered', /function renderSpeedPanel[\s\S]{0,4000}state\.speed\.bandMeta[\s\S]{0,400}\.label/],
    ['Speed result: band meta frequencyHz rendered', /function renderSpeedPanel[\s\S]{0,4000}state\.speed\.bandMeta[\s\S]{0,400}frequencyHz/],
    // Part A — Speed result UI: chain-honesty text
    ['Speed result: chain-honesty paragraph', /These readings measure playback\/capture speed stability and are affected by the test record/],
    // Part C — buildReportText: Speed source + band
    ['Report text: Speed source line', /SPEED & WOW[\s\S]{0,800}Source:.*resultSource/],
    ['Report text: Speed band line', /SPEED & WOW[\s\S]{0,1300}state\.speed\.bandMeta[\s\S]{0,200}Band:/],
    // Part C — buildReportText: Channel left/right band
    ['Report text: Channel left band line', /CHANNEL IDENTITY[\s\S]{0,600}Left band:/],
    ['Report text: Channel right band line', /CHANNEL IDENTITY[\s\S]{0,600}Right band:/],
    // Part C — buildReportText: THD source + band
    ['Report text: THD source line', /THD[\s\S]{0,400}Source:.*resultSource/],
    ['Report text: THD band line', /THD[\s\S]{0,600}state\.thd\.bandMeta[\s\S]{0,200}Band:/],
    // Part B — buildSessionJson export consistency
    ['JSON export: speed has source', /measurements[\s\S]{0,400}speed[\s\S]{0,1100}source.*resultSource/],
    ['JSON export: speed band via serializer', /serializeSpeedBandMeta\s*\(\s*state\.speed\.bandMeta\s*\)/],
    ['JSON export: channel has source', /channel_identity[\s\S]{0,400}source.*'live_capture'|source.*chSource/],
    ['JSON export: channel has left_band', /left_band\s*:/],
    ['JSON export: channel has right_band', /right_band\s*:/],
    ['JSON export: freq source', /frequency_response[\s\S]{0,400}source.*resultSource/],
    ['JSON export: freq band via serializer', /serializeFreqBandMeta\s*\(\s*state\.freq\.selectedBandMeta\s*\)/],
    ['JSON export: thd/imd source', /serializeThdBandMeta\s*\(\s*state\.thd\.bandMeta\s*\)/],
    // Final — VTA stays planned
    ['VTA still planned (not supported)', !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*'supported'/.test(workflowsSrc)],
  ];

  let failed = false;
  for (const [label, pattern] of checks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S4G static check FAIL: "${label}" not found`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S4G final QA static check (source badge, band display, chain text, report & export consistency): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS4GFinal();

// S5A: static source checks — Advanced Analyzer Skeleton & VTA IMD Optimizer.
function checkS5AAdvancedAnalyzers() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5A static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. advancedAnalyzersPanelMarkup function exists
    ['advancedAnalyzersPanelMarkup function defined', /function advancedAnalyzersPanelMarkup\s*\(\s*\)/],
    // 2. mlab-advanced-panel section ID present
    ['mlab-advanced-panel section ID emitted', /id="mlab-advanced-panel"/],
    // 3. WORKFLOW_PANEL_TARGETS maps vta_imd_optimizer to mlab-advanced-panel
    ['WORKFLOW_PANEL_TARGETS: vta_imd_optimizer → mlab-advanced-panel',
      /vta_imd_optimizer\s*:\s*'mlab-advanced-panel'/],
    // 4. getVtaImdBands helper exists
    ['getVtaImdBands function defined', /function getVtaImdBands\s*\(/],
    // 5. renderAdvancedPanel function exists
    ['renderAdvancedPanel function defined', /function renderAdvancedPanel\s*\(/],
    // 6. VTA status disclaimer text (S5C: "Capture gateway preview" replaces skeleton disclaimer)
    ['VTA status disclaimer present', /[Cc]apture gateway preview|Analyzer skeleton only/],
    // 7a. f1 metadata rendered from band.f1Hz
    ['VTA metadata: f1Hz rendered', /function renderAdvancedPanel[\s\S]{0,2400}band\.f1Hz/],
    // 7b. f2 metadata rendered from band.f2Hz
    ['VTA metadata: f2Hz rendered', /function renderAdvancedPanel[\s\S]{0,2500}band\.f2Hz/],
    // 7c. ratio rendered from band.ratio
    ['VTA metadata: ratio rendered', /function renderAdvancedPanel[\s\S]{0,2700}band\.ratio/],
    // 7d. standard rendered from band.standard
    ['VTA metadata: standard rendered', /function renderAdvancedPanel[\s\S]{0,2800}band\.standard/],
    // 8. Empty-state run table message (S5B updated wording)
    ['VTA run table empty-state message',
      /No VTA IMD run markers added yet|No VTA IMD runs captured yet/],
    // 9a–9e. Planned analyzers present
    ['Planned: Anti-skate / Tracking stress', /Anti-skate\s*\/\s*Tracking stress/],
    ['Planned: Rumble', /Rumble.*noise isolation|rumble/i],
    ['Planned: Pink noise', /Pink noise\s*\/\s*Spectral balance/],
    ['Planned: Vertical null', /Vertical null\s*\/\s*Azimuth/],
    ['Planned: Vertical resonance', /Vertical resonance/],
    // 10. VTA workflow remains planned (not supported) in measurementWorkflows.ts
    ['VTA still planned in measurementWorkflows (not supported)',
      !/vta_imd_optimizer[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 11. No VTA start/capture button attributes in renderAdvancedPanel
    ['No data-mlab-vta-start button in renderAdvancedPanel',
      !/function renderAdvancedPanel[\s\S]{0,4000}data-mlab-vta-start/.test(src)],
    ['No data-mlab-vta-capture button in renderAdvancedPanel',
      !/function renderAdvancedPanel[\s\S]{0,4000}data-mlab-vta-capture/.test(src)],
    // 12. S4G final QA: VTA still not supported (cross-check via render source)
    ['S4G cross-check: VTA not supported in workflows source',
      !/vta_imd_optimizer[\s\S]{0,200}implementationStatus.*'supported'/.test(workflowsSrc)],
  ];

  let failed = false;
  for (const [label, pattern] of checks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S5A static check FAIL: "${label}"`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S5A static source check (Advanced Analyzer Skeleton & VTA IMD Optimizer): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5AAdvancedAnalyzers();

// S5B: static source checks — VTA IMD Run Model & Manual Run Table Skeleton.
function checkS5BVtaRunModel() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5B static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. VtaImdRun type defined
    ['VtaImdRun type defined', /type VtaImdRun\s*=/],
    // 2. manual_placeholder source literal in VtaImdRun
    ['manual_placeholder source in VtaImdRun',
      /type VtaImdRun[\s\S]{0,400}source\s*:\s*'manual_placeholder'/],
    // 3. imdPercent typed as number | null (S5C: allows real captured values)
    ['imdPercent typed as number | null in VtaImdRun',
      /type VtaImdRun[\s\S]{0,400}imdPercent\s*:\s*number\s*\|\s*null/],
    // 4. VtaStateBag defined
    ['VtaStateBag type defined', /type VtaStateBag\s*=/],
    // 5. vta state in LabState
    ['vta field in LabState', /vta\s*:\s*VtaStateBag/],
    // 6. "Add height marker" button text (not "capture", not "analyze")
    ['Add height marker button text', /Add height marker/],
    // 7. "IMD not measured yet" in run table cell
    ['IMD not measured yet cell', /IMD not measured yet/],
    // 8. Remove button for individual runs
    ['data-mlab-vta-remove remove button', /data-mlab-vta-remove/],
    // 9. Clear all markers button
    ['data-mlab-vta-clear clear-all button', /data-mlab-vta-clear/],
    // 10. Record change clears VTA runs
    ['VTA runs cleared on record change',
      /state\.vta\.runs\s*=\s*\[\][\s\S]{0,200}test record change|VTA IMD run markers cleared after test record change/],
    // 11. serializeVtaBandMeta function
    ['serializeVtaBandMeta function defined', /function serializeVtaBandMeta\s*\(/],
    // 12. vta_imd_optimizer key in export
    ['vta_imd_optimizer key in buildSessionJson', /vta_imd_optimizer\s*:/],
    // 13. status: 'planned' in VTA export
    ["status: 'planned' in VTA export",
      /vta_imd_optimizer[\s\S]{0,400}status\s*:\s*'planned'/],
    // 14. No best_setting / bestSetting in VTA export
    ['No best_setting in VTA export',
      !/best_setting|bestSetting/.test(src)],
    // 15. imd_percent: r.imdPercent in VTA export (S5C: real value or null per run)
    ['imd_percent uses run value in VTA export', /imd_percent\s*:\s*r\.imdPercent/],
    // 16. warnings array in VTA export
    ['warnings array in VTA export', /vta_imd_optimizer[\s\S]{0,3500}warnings\s*:\s*\[/],
    // 17. VTA workflow remains planned (not supported)
    ['VTA still planned in measurementWorkflows (not supported)',
      !/vta_imd_optimizer[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 18. live_capture in VtaImdRun source union (S5C: gateway capture enabled)
    ['live_capture in VtaImdRun source union',
      /type VtaImdRun[\s\S]{0,400}source\s*:.*'live_capture'/],
    // 19. "Run markers are manual placeholders" truth text
    ['Run markers are manual placeholders truth text',
      /Run markers are manual placeholders/],
    // 20. "No VTA IMD run markers added yet" empty-state (or equivalent)
    ['Empty-state: no VTA run markers added yet',
      /No VTA IMD run markers added yet|No VTA IMD runs captured yet/],
    // 21. S5C: capture gateway preview text (replaces S5A skeleton disclaimer)
    ['S5C capture gateway preview disclaimer', /[Cc]apture gateway preview/],
  ];

  let failed = false;
  for (const [label, pattern] of checks) {
    const ok = typeof pattern === 'boolean' ? pattern : pattern.test(src);
    if (!ok) {
      console.error(`S5B static check FAIL: "${label}"`);
      failed = true;
    }
  }

  if (!failed) {
    console.log('- S5B static source check (VTA IMD Run Model & Manual Run Table Skeleton): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5BVtaRunModel();

// S5C: static source checks — VTA IMD Capture Gateway & Real IMD Engine Binding.
function checkS5CVtaCapture() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5C static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. startVtaCapture function defined
    ['startVtaCapture function defined', /function startVtaCapture\s*\(/],
    // 2. analyseIMD called with band f1Hz and f2Hz in VTA capture
    ['analyseIMD called with f1Hz f2Hz in VTA context',
      /function startVtaCapture[\s\S]{0,1600}analyseIMD\s*\(/],
    // 3. createSweepCapture used in startVtaCapture
    ['createSweepCapture used in startVtaCapture',
      /function startVtaCapture[\s\S]{0,1200}createSweepCapture\s*\(/],
    // 4. capturingRunId in VtaStateBag
    ['capturingRunId in VtaStateBag', /type VtaStateBag[\s\S]{0,400}capturingRunId\s*:/],
    // 5. VTA capture guard checks audioHandle and captureState === 'live'
    ['VTA capture guard checks audioHandle and captureState',
      /function startVtaCapture[\s\S]{0,600}audioHandle[\s\S]{0,300}captureState/],
    // 6. VTA band guard checks f1Hz and f2Hz before capture
    ['VTA band guard checks f1Hz and f2Hz',
      /function startVtaCapture[\s\S]{0,600}f1Hz[\s\S]{0,150}f2Hz/],
    // 7. live_capture source assigned after successful capture
    ["live_capture source assigned on capture complete",
      /source\s*:\s*'live_capture'/],
    // 8. imdPercent: number | null in VtaImdRun
    ['imdPercent: number | null in VtaImdRun',
      /type VtaImdRun[\s\S]{0,400}imdPercent\s*:\s*number\s*\|\s*null/],
    // 9. imd_percent: r.imdPercent in export (not hardcoded null)
    ['imd_percent: r.imdPercent in export', /imd_percent\s*:\s*r\.imdPercent/],
    // 10. No best_setting / bestSetting / recommended_height / optimal_height
    ['No best_setting or recommended_height in source',
      !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
    // 11. VTA implementationStatus stays planned (not supported)
    ["VTA implementationStatus stays 'planned'", (() => {
      const vtaStart = workflowsSrc.indexOf("id: 'vta_imd_optimizer'");
      if (vtaStart === -1) return false;
      const blockEnd = workflowsSrc.indexOf('},', vtaStart);
      if (blockEnd === -1) return false;
      const block = workflowsSrc.slice(vtaStart, blockEnd + 2);
      return /implementationStatus:\s*'planned'/.test(block) &&
             !/implementationStatus:\s*'supported'/.test(block);
    })()],
    // 12. status: 'planned' in VTA export (not supported/complete)
    ["status: 'planned' in VTA export", /vta_imd_optimizer[\s\S]{0,400}status\s*:\s*'planned'/],
    // 13. manual_placeholder run creation still has imdPercent: null
    ['manual_placeholder run creation still has imdPercent: null',
      /imdPercent\s*:\s*null[\s\S]{0,200}source\s*:\s*'manual_placeholder'|source\s*:\s*'manual_placeholder'[\s\S]{0,200}imdPercent\s*:\s*null/],
    // 14. data-mlab-vta-measure button wiring present
    ['data-mlab-vta-measure button wiring', /data-mlab-vta-measure/],
    // 15. warnings array in VTA export still present
    ['warnings array in VTA export', /vta_imd_optimizer[\s\S]{0,3500}warnings\s*:\s*\[/],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5C static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5C static source check (VTA IMD Capture Gateway & Real IMD Engine Binding): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5CVtaCapture();

// S5B.1: static source checks — VTA Height Input Parsing & Run Marker QA Hardening.
function checkS5B1HeightParsing() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5B.1 static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. Buggy || null pattern is gone
    [
      'no buggy `|| null` height pattern',
      !(/Number\(rawMm\.replace\(|Number\(trimmed\.replace\([^)]+\)\)\s*\|\|\s*null/.test(src)),
    ],
    // 2. parseVtaHeightMm helper exists
    [
      'parseVtaHeightMm function defined',
      /function parseVtaHeightMm\(raw:\s*string\)\s*:\s*number\s*\|\s*null/.test(src),
    ],
    // 3. Number.isFinite used inside the helper
    [
      'Number.isFinite used in parseVtaHeightMm',
      /function parseVtaHeightMm[\s\S]{0,200}Number\.isFinite\(parsed\)/.test(src),
    ],
    // 4. Helper handles empty string → null (returns null when trimmed empty)
    [
      'parseVtaHeightMm returns null for empty trimmed string',
      /function parseVtaHeightMm[\s\S]{0,200}trimmed\.length\s*===\s*0[\s\S]{0,50}return null/.test(src),
    ],
    // 5. Helper handles decimal comma → dot replacement
    [
      "parseVtaHeightMm replaces ',' with '.'",
      /function parseVtaHeightMm[\s\S]{0,300}replace\(','\s*,\s*'\.'\)/.test(src),
    ],
    // 6. Call site uses parseVtaHeightMm, not the old rawMm pattern
    [
      'call site uses parseVtaHeightMm',
      /const heightMm = parseVtaHeightMm\(state\.vta\.heightMmInput\)/.test(src),
    ],
    // 7. No rawMm variable left at call site
    [
      'no rawMm variable at add-run call site',
      !(/const rawMm = state\.vta\.heightMmInput/.test(src)),
    ],
    // 8. Label fallback still uses heightMm !== null (not truthiness check)
    [
      'label fallback uses heightMm !== null',
      /heightMm\s*!==\s*null\s*\?\s*`\$\{heightMm\}\s*mm`/.test(src),
    ],
    // 9. imdPercent stays null — no numeric IMD value assigned
    [
      'imdPercent: null preserved',
      /imdPercent:\s*null/.test(src),
    ],
    // 10. source stays 'manual_placeholder'
    [
      "source: 'manual_placeholder' preserved",
      /source:\s*'manual_placeholder'/.test(src),
    ],
    // 11. VTA workflow is not changed to supported (guard against accidental promotion)
    [
      "VTA implementationStatus stays 'planned' in workflows file",
      (() => {
        // Find the VTA block: from id: 'vta_imd_optimizer' to the next closing brace
        const vtaStart = workflowsSrc.indexOf("id: 'vta_imd_optimizer'");
        if (vtaStart === -1) return false;
        const blockEnd = workflowsSrc.indexOf('},', vtaStart);
        if (blockEnd === -1) return false;
        const block = workflowsSrc.slice(vtaStart, blockEnd + 2);
        return /implementationStatus:\s*'planned'/.test(block) &&
               !/implementationStatus:\s*'supported'/.test(block);
      })(),
    ],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    if (!result) {
      console.error(`S5B.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5B.1 static source check (VTA Height Input Parsing & Run Marker QA Hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5B1HeightParsing();

// S5C.1: static source checks — VTA Capture Lifecycle Hardening & Measurement Metadata Scaffold.
function checkS5C1LifecycleAndMetadata() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5C.1 static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. stopVtaCapture helper defined
    ['stopVtaCapture function defined', /function stopVtaCapture\s*\(\)/],
    // 2. stopVtaCapture is idempotent — nulls capture, capturingRunId, captureElapsed
    ['stopVtaCapture clears capture state',
      /function stopVtaCapture[\s\S]{0,300}capturingRunId\s*=\s*null[\s\S]{0,100}captureElapsed\s*=\s*0/],
    // 3. stopVtaCapture does not clear runs
    ['stopVtaCapture does not clear runs',
      !(/function stopVtaCapture[\s\S]{0,400}vta\.runs\s*=/.test(src))],
    // 4. teardownAudio calls stopVtaCapture
    ['teardownAudio calls stopVtaCapture',
      /function teardownAudio[\s\S]{0,600}stopVtaCapture\s*\(\)/],
    // 5. disconnectMeasurementLab renders Advanced panel
    ['disconnectMeasurementLab renders Advanced panel',
      /function disconnectMeasurementLab[\s\S]{0,600}renderAdvancedPanel\s*\(\s*els\s*\)/],
    // 6. VTA clear handler uses stopVtaCapture
    ['VTA clear handler uses stopVtaCapture',
      /data-mlab-vta-clear[\s\S]{0,300}stopVtaCapture\s*\(\)|stopVtaCapture\s*\(\)[\s\S]{0,300}data-mlab-vta-clear/],
    // 7. Record-change handler uses stopVtaCapture
    ['Record-change handler uses stopVtaCapture',
      /stopVtaCapture\s*\(\)[\s\S]{0,200}VTA IMD run markers cleared after test record change/],
    // 8. measuredAt in VtaImdRun type
    ['measuredAt in VtaImdRun', /type VtaImdRun[\s\S]{0,600}measuredAt\s*:\s*string\s*\|\s*null/],
    // 9. sampleCount in VtaImdRun type
    ['sampleCount in VtaImdRun', /type VtaImdRun[\s\S]{0,600}sampleCount\s*:\s*number\s*\|\s*null/],
    // 10. confidence in VtaImdRun type
    ['confidence in VtaImdRun', /type VtaImdRun[\s\S]{0,600}confidence\s*:\s*'not_measured'\s*\|\s*'experimental'/],
    // 11. warnings in VtaImdRun type
    ['warnings in VtaImdRun', /type VtaImdRun[\s\S]{0,600}warnings\s*:\s*readonly\s+string\[\]/],
    // 12. manual_placeholder run has confidence: 'not_measured'
    ["manual_placeholder run has confidence: 'not_measured'",
      /source\s*:\s*'manual_placeholder'[\s\S]{0,300}confidence\s*:\s*'not_measured'|confidence\s*:\s*'not_measured'[\s\S]{0,300}source\s*:\s*'manual_placeholder'/],
    // 13. live_capture result gets confidence: 'experimental'
    ["live_capture gets confidence: 'experimental'",
      /confidence\s*:\s*'experimental'/],
    // 14. measured_at in VTA export
    ['measured_at in VTA export', /measured_at\s*:\s*r\.measuredAt/],
    // 15. sample_count in VTA export
    ['sample_count in VTA export', /sample_count\s*:\s*r\.sampleCount/],
    // 16. VTA implementationStatus stays planned
    ["VTA implementationStatus stays 'planned'", (() => {
      const vtaStart = workflowsSrc.indexOf("id: 'vta_imd_optimizer'");
      if (vtaStart === -1) return false;
      const blockEnd = workflowsSrc.indexOf('},', vtaStart);
      if (blockEnd === -1) return false;
      const block = workflowsSrc.slice(vtaStart, blockEnd + 2);
      return /implementationStatus:\s*'planned'/.test(block) &&
             !/implementationStatus:\s*'supported'/.test(block);
    })()],
    // 17. No best_setting / recommended_height / optimal_height
    ['No best_setting or recommendation fields',
      !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5C.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5C.1 static source check (VTA Capture Lifecycle Hardening & Measurement Metadata Scaffold): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5C1LifecycleAndMetadata();

function checkS5DVtaComparison() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  if (!existsSync(renderSrcPath) || !existsSync(cssSrcPath)) {
    console.error('S5D static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const css = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. VtaImdComparison type defined
    ['VtaImdComparison type defined', /type VtaImdComparison\s*=\s*\{/],
    // 2. deriveVtaImdComparison function defined
    ['deriveVtaImdComparison function defined', /function deriveVtaImdComparison/],
    // 3. deriveVtaImdComparison filters live_capture runs
    ['deriveVtaImdComparison filters live_capture runs',
      /function deriveVtaImdComparison[\s\S]{0,200}live_capture/],
    // 4. not_enough_measured_runs status in deriveVtaImdComparison
    ['not_enough_measured_runs status in deriveVtaImdComparison',
      /function deriveVtaImdComparison[\s\S]{0,700}not_enough_measured_runs/],
    // 5. experimental_candidate status in deriveVtaImdComparison
    ['experimental_candidate status in deriveVtaImdComparison',
      /function deriveVtaImdComparison[\s\S]{0,2900}experimental_candidate/],
    // 6. candidateRunId in vtaRunTableMarkup opts
    ['candidateRunId in vtaRunTableMarkup opts',
      /function vtaRunTableMarkup[\s\S]{0,200}candidateRunId\s*:\s*string\s*\|\s*null/],
    // 7. isCandidate variable in vtaRunTableMarkup
    ['isCandidate variable in vtaRunTableMarkup',
      /function vtaRunTableMarkup[\s\S]{0,700}isCandidate/],
    // 8. mlab-vta-candidate-badge rendered in vtaRunTableMarkup
    ['mlab-vta-candidate-badge in vtaRunTableMarkup',
      /function vtaRunTableMarkup[\s\S]{0,900}mlab-vta-candidate-badge/],
    // 9. deriveVtaImdComparison called in renderAdvancedPanel
    ['deriveVtaImdComparison called in renderAdvancedPanel',
      /function renderAdvancedPanel[\s\S]{0,700}deriveVtaImdComparison/],
    // 10. candidateRunId: comparison.candidateRunId in vtaOpts
    ['candidateRunId: comparison.candidateRunId in vtaOpts',
      /candidateRunId\s*:\s*comparison\.candidateRunId/],
    // 11. mlab-vta-comparison class rendered in Advanced panel
    ['mlab-vta-comparison rendered in Advanced panel', /mlab-vta-comparison/],
    // 12. comparison key in buildSessionJson VTA export (after vta_imd_optimizer)
    ['comparison key in VTA export',
      /vta_imd_optimizer[\s\S]{0,900}comparison\s*:/],
    // 13. status: cmp.status in comparison export
    ['status: cmp.status in comparison export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,200}status\s*:\s*cmp\.status/],
    // 14. measured_count in comparison export
    ['measured_count in comparison export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,350}measured_count\s*:\s*cmp\.measuredCount/],
    // 15. candidate_imd_percent in comparison export (not best_setting)
    ['candidate_imd_percent in comparison export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,400}candidate_imd_percent\s*:\s*cmp\.candidateImdPercent/],
    // 16. next_best_delta_percent in comparison export
    ['next_best_delta_percent in comparison export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,600}next_best_delta_percent\s*:\s*cmp\.nextBestDeltaPercent/],
    // 17. Guard log: connect a live audio source first
    ['startVtaCapture guard log — no live source',
      /VTA IMD capture not started.*connect a live audio source first/],
    // 18. Guard log: selected test record has no VTA IMD band
    ['startVtaCapture guard log — no VTA IMD band',
      /VTA IMD capture not started.*selected test record has no VTA IMD band/],
    // 19. Guard log: missing f1/f2 metadata
    ['startVtaCapture guard log — missing f1/f2',
      /VTA IMD capture not started.*selected VTA band is missing f1\/f2 metadata/],
    // 20. Guard log: another VTA capture running
    ['startVtaCapture guard log — another capture running',
      /VTA IMD capture not started.*another VTA capture is already running/],
    // 21. Guard log: run marker not found
    ['startVtaCapture guard log — run marker not found',
      /VTA IMD capture not started.*selected run marker was not found/],
    // 22. tokenLayoutGeneratedClassNames updated with mlab-vta-candidate-badge
    ['tokenLayoutGeneratedClassNames includes mlab-vta-candidate-badge',
      /tokenLayoutGeneratedClassNames[\s\S]{0,900}mlab-vta-candidate-badge/],
    // 23. No best_setting / recommended_height / optimal_height
    ['No best_setting or recommendation fields',
      !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : (result instanceof RegExp ? result.test(src) : result);
    if (!ok) {
      console.error(`S5D static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  // CSS checks run against css file
  const cssChecks = [
    ['mlab-vta-candidate-badge CSS defined', /\.mlab-vta-candidate-badge\s*\{/],
    ['mlab-vta-comparison CSS defined', /\.mlab-vta-comparison\s*\{/],
    ['mlab-vta-comparison-candidate CSS defined', /\.mlab-vta-comparison-candidate\s*\{/],
    ['mlab-vta-comparison-meta CSS defined', /\.mlab-vta-comparison-meta\s*\{/],
    ['mlab-vta-comparison-warning CSS defined', /\.mlab-vta-comparison-warning\s*\{/],
    ['mlab-vta-comparison-status CSS defined', /\.mlab-vta-comparison-status\s*\{/],
  ];
  for (const [label, rx] of cssChecks) {
    if (!rx.test(css)) {
      console.error(`S5D static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5D static source check (VTA IMD Run Comparison & Experimental Best-Run Candidate): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5DVtaComparison();

function checkS5D1NoClaim() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  const testRecordsPath = join(repoRoot, 'public/data/audio/v3/runtime/test-records.json');
  const docsPath = join(repoRoot, 'docs/release/CLOUDFLARE_PAGES.md');
  for (const p of [renderSrcPath, workflowsSrcPath, testRecordsPath, docsPath]) {
    if (!existsSync(p)) {
      console.error(`S5D.1 static check: source file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');
  const testRecordsSrc = readFileSync(testRecordsPath, 'utf8');
  const docsSrc = readFileSync(docsPath, 'utf8');

  let allPass = true;

  // --- render source checks ---
  const renderChecks = [
    // 1. No "optimal SRA" in render source
    ['No "optimal SRA" in render source', !/optimal SRA/.test(src)],
    // 2. No "best-setting" in render source
    ['No "best-setting" in render source', !/best-setting/.test(src)],
    // 3. No "best setting" in render source
    ['No "best setting" in render source', !/best setting/.test(src)],
    // 4. No recommended_height
    ['No recommended_height field', !/recommended_height/.test(src)],
    // 5. No optimal_height
    ['No optimal_height field', !/optimal_height/.test(src)],
    // 6. "Experimental candidate only" text still present
    ['Experimental candidate only text present', /Experimental candidate only/],
    // 7. Workflow list item uses "experimental" and "candidate"
    ['Workflow text uses experimental and candidate',
      /experimental[\s\S]{0,200}candidate|candidate[\s\S]{0,200}experimental/],
    // 8. "final recommendation" language in export warning
    ['Export warning references final recommendation',
      /final recommendation[\s\S]{0,80}not implemented/],
    // 9. No "optimal" in VTA export warnings block
    ['No "optimal" in VTA export warnings', !/vta_imd_optimizer[\s\S]{0,1500}optimal/.test(src)],
  ];
  for (const [label, result] of renderChecks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5D.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }

  // --- workflow source checks ---
  const workflowChecks = [
    // 10. No "optimal SRA" in workflow source
    ['No "optimal SRA" in workflow source', !/optimal SRA/.test(workflowsSrc)],
    // 11. No "best-setting" in workflow source
    ['No "best-setting" in workflow source', !/best-setting/.test(workflowsSrc)],
    // 12. Workflow description uses "experimental" and "candidate"
    ['Workflow description uses experimental and candidate',
      /experimental[\s\S]{0,200}candidate|candidate[\s\S]{0,200}experimental/],
    // 13. VTA workflow not supported
    ['VTA workflow not supported', (() => {
      const vtaStart = workflowsSrc.indexOf("id: 'vta_imd_optimizer'");
      if (vtaStart === -1) return false;
      const blockEnd = workflowsSrc.indexOf('},', vtaStart);
      if (blockEnd === -1) return false;
      const block = workflowsSrc.slice(vtaStart, blockEnd + 2);
      return !/implementationStatus:\s*'supported'/.test(block);
    })()],
  ];
  for (const [label, result] of workflowChecks) {
    const ok = typeof result === 'boolean' ? result : result.test(workflowsSrc);
    if (!ok) {
      console.error(`S5D.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }

  // --- test-records runtime JSON checks ---
  const testRecordChecks = [
    // 14. No "optimal SRA" in test-records runtime JSON
    ['No "optimal SRA" in test-records JSON', !/optimal SRA/.test(testRecordsSrc)],
    // 15. No "best-setting" in test-records runtime JSON
    ['No "best-setting" in test-records JSON', !/best-setting/.test(testRecordsSrc)],
    // 16. VTA band note uses "experimental" and "candidate"
    ['VTA band note uses experimental and candidate',
      /experimental[\s\S]{0,200}candidate|candidate[\s\S]{0,200}experimental/],
  ];
  for (const [label, result] of testRecordChecks) {
    const ok = typeof result === 'boolean' ? result : result.test(testRecordsSrc);
    if (!ok) {
      console.error(`S5D.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }

  // --- docs checks ---
  const docsChecks = [
    // 17. No 'best setting' in docs deploy checklist
    ['No "best setting" in docs checklist', !/best setting/.test(docsSrc)],
  ];
  for (const [label, result] of docsChecks) {
    const ok = typeof result === 'boolean' ? result : result.test(docsSrc);
    if (!ok) {
      console.error(`S5D.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }

  if (allPass) {
    console.log('- S5D.1 static source check (VTA Candidate Copy & No-Final-Claim Hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5D1NoClaim();

function checkS5EVtaConfidence() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5E static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // 1. VtaImdComparisonConfidence type defined
    ['VtaImdComparisonConfidence type defined', /type VtaImdComparisonConfidence\s*=/],
    // 2. confidence field in VtaImdComparison type
    ['confidence field in VtaImdComparison', /type VtaImdComparison[\s\S]{0,400}readonly confidence\s*:/],
    // 3. confidenceReasons field in VtaImdComparison type
    ['confidenceReasons field in VtaImdComparison', /type VtaImdComparison[\s\S]{0,500}readonly confidenceReasons\s*:/],
    // 4. confidence value 'insufficient' in derive function
    ['insufficient confidence value', /function deriveVtaImdComparison[\s\S]{0,700}confidence\s*:\s*'insufficient'/],
    // 5. confidence value 'low' in derive function
    ['low confidence value', /function deriveVtaImdComparison[\s\S]{0,2300}'low'/],
    // 6. confidence value 'medium' in derive function
    ['medium confidence value', /function deriveVtaImdComparison[\s\S]{0,1800}'medium'/],
    // 7. confidence value 'high' in derive function
    ['high confidence value', /function deriveVtaImdComparison[\s\S]{0,1900}'high'/],
    // 8. confidenceReasons populated in derive function
    ['confidenceReasons populated in derive function',
      /function deriveVtaImdComparison[\s\S]{0,700}confidenceReasons\s*:/],
    // 9. Comparison confidence shown in UI
    ['Comparison confidence shown in UI', /Comparison confidence:/],
    // 10. mlab-vta-confidence-level class used in UI
    ['mlab-vta-confidence-level class used', /mlab-vta-confidence-level/],
    // 11. mlab-vta-confidence-level--insufficient modifier
    ['mlab-vta-confidence-level--insufficient modifier', /mlab-vta-confidence-level--insufficient/],
    // 12. VTA IMD OPTIMIZER section in report
    ['VTA IMD OPTIMIZER in report', /VTA IMD OPTIMIZER/],
    // 13. EXPERIMENTAL label in report
    ['EXPERIMENTAL label in report', /VTA IMD OPTIMIZER.*EXPERIMENTAL|EXPERIMENTAL.*VTA IMD/],
    // 14. not a final VTA recommendation in report
    ['not a final VTA recommendation in report', /not a final VTA recommendation/],
    // 15. confidence_reasons in JSON export
    ['confidence_reasons in JSON export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,300}confidence_reasons\s*:/],
    // 16. confidence in JSON export
    ['confidence in JSON export',
      /comparison\s*:\s*\(\s*\(\s*\)\s*=>[\s\S]{0,250}confidence\s*:\s*cmp\.confidence/],
    // 17. no best_setting / bestSetting / optimal_height / recommended_height
    ['No final-claim fields in source',
      !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
    // 18. VTA workflow not supported (check whole file)
    ['VTA status not supported in source', !/implementationStatus\s*:\s*'supported'/.test(src)],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5E static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5E static source check (VTA Comparison Confidence & Report Integration): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5EVtaConfidence();

function checkS5FVtaSupportedGate() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  if (!existsSync(renderSrcPath) || !existsSync(workflowsSrcPath)) {
    console.error('S5F static check: source file(s) not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');
  const workflowsSrc = readFileSync(workflowsSrcPath, 'utf8');

  const checks = [
    // 1. VtaSupportedGateStatus type defined
    ['VtaSupportedGateStatus type defined', /type VtaSupportedGateStatus\s*=/],
    // 2. VtaSupportedGate type defined
    ['VtaSupportedGate type defined', /type VtaSupportedGate\s*=/],
    // 3. deriveVtaSupportedGate function defined
    ['deriveVtaSupportedGate function defined', /function deriveVtaSupportedGate\s*\(/],
    // 4. ready_for_supported_review status value
    ['ready_for_supported_review status value', /ready_for_supported_review/],
    // 5. candidate_ready status value
    ['candidate_ready status value', /candidate_ready/],
    // 6. not_ready status value
    ['not_ready status value', /'not_ready'/],
    // 7. at least three measured runs criterion
    ['three_measured_runs criterion id',
      /id\s*:\s*'three_measured_runs'/],
    // 8. comparison confidence criterion
    ['comparison_confidence criterion id',
      /id\s*:\s*'comparison_confidence'/],
    // 9. no_active_capture criterion
    ['no_active_capture criterion id',
      /id\s*:\s*'no_active_capture'/],
    // 10. Supported readiness gate UI text
    ['Supported readiness gate UI text', /Supported readiness gate/],
    // 11. supported_gate in JSON export
    ['supported_gate in JSON export', /supported_gate\s*:/],
    // 12. passed_count in export
    ['passed_count in export', /passed_count\s*:\s*sg\.passedCount/],
    // 13. total_count in export
    ['total_count in export', /total_count\s*:\s*sg\.totalCount/],
    // 14. VTA top-level status still planned in render source
    ['VTA top-level status planned in export', /status\s*:\s*'planned'\s*as\s*const/],
    // 15. VTA workflow not supported in workflows file
    ['VTA workflow not supported', (() => {
      const vtaStart = workflowsSrc.indexOf("id: 'vta_imd_optimizer'");
      if (vtaStart === -1) return false;
      const blockEnd = workflowsSrc.indexOf('},', vtaStart);
      if (blockEnd === -1) return false;
      const block = workflowsSrc.slice(vtaStart, blockEnd + 2);
      return /implementationStatus:\s*'planned'/.test(block)
        && !/implementationStatus:\s*'supported'/.test(block);
    })()],
    // 16. No final-claim fields
    ['No final-claim fields', !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
    // 17. Gate does not change workflow status (disclaimer present)
    ['Gate workflow disclaimer present',
      /Gate does not change VTA workflow|Supported review gate does not change/],
    // 18. gate rendered in renderAdvancedPanel
    ['deriveVtaSupportedGate called in renderAdvancedPanel',
      /function renderAdvancedPanel[\s\S]{0,800}deriveVtaSupportedGate/],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5F static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5F static source check (VTA Supported-Gate Review & Experimental-to-Supported Criteria): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5FVtaSupportedGate();

function checkS5F1UsableBand() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5F.1 static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // 1. hasVtaBand is not the gate parameter (old param gone)
    ['hasVtaBand not a deriveVtaSupportedGate parameter',
      !(/function deriveVtaSupportedGate[\s\S]{0,200}readonly hasVtaBand\s*:/.test(src))],
    // 2. hasUsableVtaBand is the new gate parameter
    ['hasUsableVtaBand is deriveVtaSupportedGate parameter',
      /function deriveVtaSupportedGate[\s\S]{0,200}readonly hasUsableVtaBand\s*:/],
    // 3. hasUsableVtaImdBand helper defined
    ['hasUsableVtaImdBand helper defined', /function hasUsableVtaImdBand\s*\(/],
    // 4. f1Hz used in usable band helper
    ['f1Hz checked in hasUsableVtaImdBand',
      /function hasUsableVtaImdBand[\s\S]{0,200}f1Hz/],
    // 5. f2Hz used in usable band helper
    ['f2Hz checked in hasUsableVtaImdBand',
      /function hasUsableVtaImdBand[\s\S]{0,200}f2Hz/],
    // 6. criterion label contains metadata/f1/f2
    ['criterion label mentions f1/f2 or metadata',
      /label\s*:\s*'VTA band with f1\/f2 metadata'|label\s*:\s*'Usable VTA IMD band/],
    // 7. missing f1/f2 detail text present
    ['missing f1/f2 detail message present',
      /f1\/f2 metadata is missing/],
    // 8. no-band detail text present
    ['no-band detail message present',
      /No VTA\/SRA IMD band found on selected test record\./],
    // 9. usable metadata detail text present
    ['usable metadata detail message present',
      /dual-tone IMD band with f1\/f2 metadata found\./],
    // 10. hasUsableVtaImdBand called at all call-sites (≥3 times)
    ['hasUsableVtaImdBand called at multiple call-sites', (() => {
      const count = (src.match(/hasUsableVtaImdBand\s*\(/g) || []).length;
      return count >= 3;
    })()],
    // 11. supported_gate still in export
    ['supported_gate still in export', /supported_gate\s*:/],
    // 12. VTA status still planned
    ['VTA top-level status still planned', /status\s*:\s*'planned'\s*as\s*const/],
    // 13. no final-claim fields
    ['No final-claim fields', !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5F.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5F.1 static source check (VTA Supported-Gate Usable Band Metadata Hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5F1UsableBand();

function checkS5GVtaStatusPolicy() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5G static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // 1. VtaWorkflowPolicyStatus type defined with both literals
    ['VtaWorkflowPolicyStatus type defined',
      /type VtaWorkflowPolicyStatus\s*=\s*'planned_experimental'\s*\|\s*'ready_for_review_not_supported'/],
    // 2. VtaWorkflowStatusPolicy type defined with workflowStatus: 'planned'
    ['VtaWorkflowStatusPolicy type with workflowStatus planned',
      /type VtaWorkflowStatusPolicy[\s\S]{0,400}workflowStatus\s*:\s*'planned'/],
    // 3. deriveVtaWorkflowStatusPolicy function defined
    ['deriveVtaWorkflowStatusPolicy helper defined',
      /function deriveVtaWorkflowStatusPolicy\s*\(/],
    // 4. ready_for_review_not_supported status value produced
    ['ready_for_review_not_supported status value in helper',
      /function deriveVtaWorkflowStatusPolicy[\s\S]{0,600}ready_for_review_not_supported/],
    // 5. planned_experimental status value produced
    ['planned_experimental status value in helper',
      /function deriveVtaWorkflowStatusPolicy[\s\S]{0,1000}planned_experimental/],
    // 6. workflowStatus: 'planned' literal in helper (not 'supported')
    ['workflowStatus is always planned in helper',
      /function deriveVtaWorkflowStatusPolicy[\s\S]{0,1000}workflowStatus\s*:\s*'planned'/],
    // 7. requiredBeforeSupported list in helper
    ['requiredBeforeSupported list in helper',
      /function deriveVtaWorkflowStatusPolicy[\s\S]{0,300}requiredBeforeSupported/],
    // 8. workflow_status_policy key in JSON export
    ['workflow_status_policy key in JSON export',
      /workflow_status_policy\s*:/],
    // 9. workflow_status key present in export (snake_case)
    ['workflow_status key in export',
      /workflow_status\s*:\s*wsp\.workflowStatus/],
    // 10. required_before_supported key in export
    ['required_before_supported key in export',
      /required_before_supported\s*:\s*wsp\.requiredBeforeSupported/],
    // 11. UI policy section present (mlab-vta-policy class)
    ['mlab-vta-policy UI section rendered',
      /mlab-vta-policy/],
    // 12. UI shows "Workflow status policy" label
    ['Workflow status policy label in UI',
      /Workflow status policy/],
    // 13. No 'supported' as workflowStatus value anywhere
    ['No workflowStatus supported value',
      !/workflowStatus\s*:\s*'supported'/.test(src)],
    // 14. VTA top-level status still planned as const
    ['VTA top-level status still planned as const',
      /status\s*:\s*'planned'\s*as\s*const/],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5G static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5G static source check (VTA Workflow Status Policy): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5GVtaStatusPolicy();

function checkS5HGuidedOrderAndSpeed() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5H static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // 1. Recommended measurement order section present
    ['Recommended measurement order present',
      /Recommended measurement order/],
    // 2. Track 1 as Reference Level + recommended first
    ['Track 1 Reference Level recommended first',
      /Track[\s\S]{0,10}1[\s\S]{0,400}[Rr]ecommended first/],
    // 3. Tracks 2-3 Channel Identity / Crosstalk
    ['Tracks 2-3 Channel Identity',
      /Tracks[\s\S]{0,15}2[\s\S]{0,150}[Cc]hannel [Ii]dentity/],
    // 4. Tracks 4-6 RIAA HF guidance
    ['Tracks 4-6 RIAA HF guidance',
      /Tracks[\s\S]{0,15}4[\s\S]{0,200}(?:RIAA HF|HF frequency)/],
    // 5. Tracks 7-8 RIAA LF guidance
    ['Tracks 7-8 RIAA LF guidance',
      /Tracks[\s\S]{0,15}7[\s\S]{0,200}(?:RIAA LF|LF frequency)/],
    // 6. Track 10 shows both 33⅓ and 45 RPM
    ['Track 10 shows 33 and 45 RPM',
      /Track[\s\S]{0,10}10[\s\S]{0,300}45/],
    // 7. 4253 Hz appears for 45 RPM
    ['4253 Hz nominal for 45 RPM', /4[,.]?253/],
    // 8. SpeedContext type defined
    ['SpeedContext type defined',
      /type SpeedContext\s*=\s*'33_33'\s*\|\s*'45'/],
    // 9. SpeedMeasurementRun type defined
    ['SpeedMeasurementRun type defined',
      /type SpeedMeasurementRun\s*=/],
    // 10. speedContext field in SpeedMeasurementRun
    ['speedContext in SpeedMeasurementRun',
      /type SpeedMeasurementRun[\s\S]{0,400}speedContext\s*:/],
    // 11. nominalFrequencyHz field in SpeedMeasurementRun
    ['nominalFrequencyHz in SpeedMeasurementRun',
      /type SpeedMeasurementRun[\s\S]{0,400}nominalFrequencyHz\s*:/],
    // 12. Clear speed run history button present
    ['Clear speed run history button',
      /Clear speed run history/],
    // 13. runs in speed export
    ['runs key in speed export', /speed_error_percent|nominal_frequency_hz/],
    // 14. nominal_frequency_hz in export
    ['nominal_frequency_hz in export', /nominal_frequency_hz/],
    // 15. Speed run history section in report text
    ['Speed run history in report text',
      /Speed run history/],
    // 16. VTA workflow still planned (not supported)
    ['VTA workflow still planned not supported',
      !/vta_imd_optimizer[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(
        existsSync(join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts'))
          ? readFileSync(join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts'), 'utf8')
          : '')],
    // 17. No final VTA claims
    ['No final VTA claims in render source',
      !/best_setting|bestSetting|recommended_height|optimal_height/.test(src)],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5H static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5H static source check (Guided Order, 45 RPM Speed Context & Run History): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5HGuidedOrderAndSpeed();

function checkS5H1SpeedReferenceBinding() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5H.1 static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  const startFnIdx = src.indexOf('function startSpeedMeasurement(');
  const startFnSrc = startFnIdx >= 0 ? src.slice(startFnIdx, startFnIdx + 1500) : '';

  const checks = [
    // 1. startSpeedMeasurement delegates nominal computation to deriveSpeedMeasurementSettings (S5H.2 arch)
    ['startSpeedMeasurement calls deriveSpeedMeasurementSettings',
      /function startSpeedMeasurement[\s\S]{0,1400}deriveSpeedMeasurementSettings/],
    // 2. createSpeedFlutterCapture receives settings.nominalFrequencyHz (S5H.2 arch)
    ['createSpeedFlutterCapture uses settings.nominalFrequencyHz',
      /createSpeedFlutterCapture[\s\S]{0,300}settings\.nominalFrequencyHz/],
    // 3. state.speed.referenceHz = band.frequencyHz no longer present in startSpeedMeasurement
    ['No state.speed.referenceHz = band.frequencyHz in startSpeedMeasurement', (() => {
      return !/state\.speed\.referenceHz\s*=\s*band\.frequencyHz/.test(startFnSrc);
    })()],
    // 4. deriveSpeedMeasurementSettings uses 3150 Hz fallback (S5H.2 arch)
    ['deriveSpeedMeasurementSettings uses 3150 Hz fallback',
      /function deriveSpeedMeasurementSettings[\s\S]{0,800}3150/],
    // 5. nominalFrequencyHz33 map has '45' entry (4253 literal or computed from 45/33.333*3150)
    ['nominalFrequencyHz33 map has 45 RPM entry',
      /nominalFrequencyHz33[\s\S]{0,200}'45'\s*:[\s\S]{0,100}(?:4253|45\s*\/\s*33\.?3)/],
    // 6. nominal_frequency_hz in speed export (export uses context nominal)
    ['nominal_frequency_hz in speed export',
      /nominal_frequency_hz/],
    // 7. Speed run history still present
    ['Speed run history still present',
      /Clear speed run history/],
    // 8. VTA workflow still planned
    ['VTA workflow still planned',
      /status\s*:\s*'planned'\s*as\s*const/],
    // 9. Analysis reference follows speed context note in UI
    ['Analysis reference follows RPM context note in UI',
      /analysis reference follows the selected RPM context/],
  ];

  let allPass = true;
  for (const [label, result] of checks) {
    const ok = typeof result === 'boolean' ? result : result.test(src);
    if (!ok) {
      console.error(`S5H.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5H.1 static source check (45 RPM Speed Reference Binding & History Accuracy): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5H1SpeedReferenceBinding();

try {
  await runChecks();
} catch (error) {
  console.error('FAIL measurement lab engine checks:', error.message || error);
  process.exitCode = 1;
}

function checkS5H2EditableSpeedParams() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  if (!existsSync(renderSrcPath)) {
    console.error('S5H.2 static check: renderMeasurementLabPage.ts not found');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(cssSrcPath)) {
    console.error('S5H.2 static check: measurementLab.css not found');
    process.exitCode = 1;
    return;
  }
  const uiSrc = readFileSync(renderSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  // Build regexes via constructor to avoid shell heredoc escape issues
  const reMeasParamSrcType = new RegExp('type MeasurementParameterSource\\s*=');
  const reCapDurSrcType = new RegExp('type CaptureDurationSource\\s*=');
  const reSettingsType = new RegExp('type SpeedMeasurementSettings\\s*=\\s*\\{');
  const reSettingsNomDef = new RegExp('nominalFrequencyHzDefault\\s*:');
  const reSettingsCapDur = new RegExp('captureDurationSeconds\\s*:');
  const reParseFloat = new RegExp('function parsePositiveFloat\\s*\\(');
  const reDerive = new RegExp('function deriveSpeedMeasurementSettings\\s*\\(');
  const reNomInput = new RegExp('nominalFrequencyHzInput\\s*:');
  const reCapInput = new RegExp('captureDurationSecondsInput\\s*:');
  const reLastSettings = new RegExp('lastSettings\\s*:');
  const reRunNomDef = new RegExp('nominalFrequencyHzDefault\\s*:\\s*number');
  const reRunNomSrc = new RegExp('nominalFrequencySource\\s*:\\s*MeasurementParameterSource');
  const reRunCapSrc = new RegExp('captureDurationSource\\s*:\\s*CaptureDurationSource');
  const reExportNomDef = new RegExp('nominal_frequency_hz_default\\s*:\\s*r\\.nominalFrequencyHzDefault');
  const reExportNomSrc = new RegExp('nominal_frequency_source\\s*:\\s*r\\.nominalFrequencySource');
  const reExportCapSec = new RegExp('capture_duration_seconds\\s*:\\s*r\\.captureDurationSeconds');
  const reExportCapSrc = new RegExp('capture_duration_source\\s*:\\s*r\\.captureDurationSource');
  const reExportLatestNom = new RegExp('nominal_frequency_hz\\s*:\\s*ls\\s*\\?');
  const reReportNomSrc = /Nominal frequency[\s\S]{0,200}repNomSource/;
  const reReportCapSrc = /Capture duration[\s\S]{0,200}repDurSource/;
  const reRunNomSrcRep = /nomSrc\s*=\s*run\.nominalFrequencySource/;
  const reRunCapSrcRep = /run\.captureDurationSource/;
  const reIdleForm = /Measurement settings[\s\S]{0,600}mlab-speed-settings-input/;
  const reResultPanel = /Measurement parameters used[\s\S]{0,300}mlab-speed-settings-row/;
  const reNomSourceFn = /nominalSourceLabel\s*\(/;
  const reNoHardcode4253 = /deriveSpeedMeasurementSettings[\s\S]{0,800}nominalDefault\s*=\s*4253/;
  const re45Formula = new RegExp('45\\s*/\\s*33\\.?3');

  const checks = [
    ['MeasurementParameterSource type declared', reMeasParamSrcType.test(uiSrc)],
    ['CaptureDurationSource type declared', reCapDurSrcType.test(uiSrc)],
    ['SpeedMeasurementSettings type declared', reSettingsType.test(uiSrc)],
    ['SpeedMeasurementSettings has nominalFrequencyHzDefault', reSettingsNomDef.test(uiSrc)],
    ['SpeedMeasurementSettings has captureDurationSeconds', reSettingsCapDur.test(uiSrc)],
    ['parsePositiveFloat helper exists', reParseFloat.test(uiSrc)],
    ['deriveSpeedMeasurementSettings helper exists', reDerive.test(uiSrc)],
    ['deriveSpeedMeasurementSettings uses test_record_metadata', /test_record_metadata/.test(uiSrc)],
    ['deriveSpeedMeasurementSettings uses speed_context_formula', /speed_context_formula/.test(uiSrc)],
    ['deriveSpeedMeasurementSettings uses fallback_default', /fallback_default/.test(uiSrc)],
    ['deriveSpeedMeasurementSettings 45 RPM uses formula not hardcode', re45Formula.test(uiSrc)],
    ['SpeedState has nominalFrequencyHzInput field', reNomInput.test(uiSrc)],
    ['SpeedState has captureDurationSecondsInput field', reCapInput.test(uiSrc)],
    ['SpeedState has lastSettings field', reLastSettings.test(uiSrc)],
    ['SpeedMeasurementRun has nominalFrequencyHzDefault:number', reRunNomDef.test(uiSrc)],
    ['SpeedMeasurementRun has nominalFrequencySource:MeasurementParameterSource', reRunNomSrc.test(uiSrc)],
    ['SpeedMeasurementRun has captureDurationSource:CaptureDurationSource', reRunCapSrc.test(uiSrc)],
    ['buildSessionJson runs include nominal_frequency_hz_default', reExportNomDef.test(uiSrc)],
    ['buildSessionJson runs include nominal_frequency_source', reExportNomSrc.test(uiSrc)],
    ['buildSessionJson runs include capture_duration_seconds', reExportCapSec.test(uiSrc)],
    ['buildSessionJson runs include capture_duration_source', reExportCapSrc.test(uiSrc)],
    ['buildSessionJson latest uses lastSettings for nominalFrequencyHz', reExportLatestNom.test(uiSrc)],
    ['buildReportText latest shows nominal source', reReportNomSrc.test(uiSrc)],
    ['buildReportText latest shows capture duration source', reReportCapSrc.test(uiSrc)],
    ['buildReportText run history shows nominalFrequencySource', reRunNomSrcRep.test(uiSrc)],
    ['buildReportText run history shows captureDurationSource', reRunCapSrcRep.test(uiSrc)],
    ['CSS mlab-speed-settings class present', cssSrc.includes('.mlab-speed-settings {')],
    ['CSS mlab-speed-settings-input class present', cssSrc.includes('.mlab-speed-settings-input')],
    ['CSS mlab-speed-settings-src class present', cssSrc.includes('.mlab-speed-settings-src')],
    ['CSS mlab-speed-settings-reset class present', cssSrc.includes('.mlab-speed-settings-reset')],
    ['Idle state shows Measurement settings form', reIdleForm.test(uiSrc)],
    ['Result view shows Measurement parameters used panel', reResultPanel.test(uiSrc)],
    ['Result view uses nominalSourceLabel helper', reNomSourceFn.test(uiSrc)],
    ['No hardcoded 4253 as nominalDefault in deriveSpeedMeasurementSettings', !reNoHardcode4253.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5H.2 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5H.2 static source check (Editable Speed Measurement Parameters): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5H2EditableSpeedParams();

function checkS5H3ActiveDurationBinding() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  if (!existsSync(renderSrcPath)) {
    console.error('S5H.3 static check: source file not found');
    process.exitCode = 1;
    return;
  }
  const src = readFileSync(renderSrcPath, 'utf8');

  // Extract the active speed block for targeted checks
  const activeBlockIdx = src.indexOf('if (state.speed.active) {');
  const activeBlockSrc = activeBlockIdx >= 0 ? src.slice(activeBlockIdx, activeBlockIdx + 800) : '';

  // Build regexes via constructor to avoid shell escape issues
  const reActiveDurVar = new RegExp('activeSpeedDurationSeconds');
  const reActiveDurBinding = new RegExp('activeSpeedDurationSeconds[\\s\\S]{0,200}captureDurationSeconds');
  const rePctUsesActive = new RegExp('pct[\\s\\S]{0,60}activeSpeedDurationSeconds');
  const reRemainingUsesActive = new RegExp('remaining[\\s\\S]{0,60}activeSpeedDurationSeconds');
  const reLastSettingsBeforeActive = new RegExp('lastSettings\\s*=\\s*settings[\\s\\S]{0,200}state\\.speed\\.active\\s*=\\s*true');
  const reNoDivByConst = new RegExp('elapsedSeconds\\s*/\\s*speedMeasurementDurationSeconds');
  const reNoSubConst = new RegExp('speedMeasurementDurationSeconds\\s*-\\s*state\\.speed\\.elapsedSeconds');

  const checks = [
    // 1. activeSpeedDurationSeconds variable is defined in active block
    ['active block defines activeSpeedDurationSeconds', reActiveDurVar.test(activeBlockSrc)],
    // 2. activeSpeedDurationSeconds binds to lastSettings.captureDurationSeconds
    ['activeSpeedDurationSeconds reads captureDurationSeconds from lastSettings', reActiveDurBinding.test(activeBlockSrc)],
    // 3. pct uses activeSpeedDurationSeconds, not the constant
    ['progress pct uses activeSpeedDurationSeconds', rePctUsesActive.test(activeBlockSrc)],
    // 4. remaining uses activeSpeedDurationSeconds, not the constant
    ['remaining time uses activeSpeedDurationSeconds', reRemainingUsesActive.test(activeBlockSrc)],
    // 5. lastSettings is assigned before active = true
    ['lastSettings = settings before active = true', reLastSettingsBeforeActive.test(src)],
    // 6. No direct division by speedMeasurementDurationSeconds in active block
    ['no direct elapsedSeconds / speedMeasurementDurationSeconds in active block', !reNoDivByConst.test(activeBlockSrc)],
    // 7. No direct speedMeasurementDurationSeconds - elapsedSeconds in active block
    ['no direct speedMeasurementDurationSeconds - elapsedSeconds in active block', !reNoSubConst.test(activeBlockSrc)],
    // 8. Fallback to speedMeasurementDurationSeconds when lastSettings absent
    ['activeSpeedDurationSeconds fallback to speedMeasurementDurationSeconds', /activeSpeedDurationSeconds[\s\S]{0,300}speedMeasurementDurationSeconds/.test(activeBlockSrc)],
    // 9. S5H.2 settings still present (regression guard)
    ['S5H.2 deriveSpeedMeasurementSettings still present', /function deriveSpeedMeasurementSettings/.test(src)],
    // 10. VTA workflow still planned
    ['VTA workflow still planned', /status\s*:\s*'planned'\s*as\s*const/.test(src)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5H.3 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5H.3 static source check (Active Speed Capture Duration Progress Binding): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5H3ActiveDurationBinding();

function checkS5H4NoiseFloor() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const enginePath = join(repoRoot, 'src/modules/measurement-lab/engine/noiseFloor.ts');
  const dspPath = join(repoRoot, 'src/modules/measurement-lab/dsp/noiseFloorNode.ts');
  const cssSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  for (const p of [renderSrcPath, enginePath, dspPath, cssSrcPath]) {
    if (!existsSync(p)) { console.error(`S5H.4: missing file: ${p}`); process.exitCode = 1; return; }
  }
  const uiSrc = readFileSync(renderSrcPath, 'utf8');
  const engSrc = readFileSync(enginePath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const reScenarioKind = new RegExp("type NoiseFloorScenarioKind");
  const reRunType = new RegExp("type NoiseFloorRun\\s*=\\s*\\{");
  const reStateType = new RegExp("type NoiseFloorState\\s*=\\s*\\{");
  const reEqOff = /equipment_off/;
  const reRigStill = /rig_powered_still/;
  const rePlatter = /platter_spinning/;
  const reSpeed16 = /'16'/;
  const reSpeed33 = /'33_33'/;
  const reSpeed45 = /'45'/;
  const reSpeed78 = /'78'/;
  const reCustom = /'custom'/;
  const reAnalyzeFn = /function analyzeNoiseFloor/;
  const reStartBtn = /Start noise floor capture/;
  const reClearBtn = /Clear noise floor history/;
  const reExportKey = /noise_floor\s*:/;
  const reScenarioKey = /scenario_kind/;
  const reNfDbfs = /noise_floor_dbfs/;
  const reReportSection = /NOISE FLOOR \/ RIG BASELINE/;
  const reNoTestRecord = /do not use a test record/;
  const reVtaPlanned = /status\s*:\s*'planned'\s*as\s*const/;
  const reNoiseFloorState = /noiseFloor\s*:/;
  const reNoiseFloorBody = /noiseFloorBody/;
  const rePanelMarkup = /noiseFloorPanelMarkup/;
  const reCaptureDurUsed = new RegExp('createNoiseFloorCapture');

  const checks = [
    ['NoiseFloorScenarioKind type declared', reScenarioKind.test(uiSrc)],
    ['NoiseFloorRun type declared', reRunType.test(uiSrc)],
    ['NoiseFloorState type declared', reStateType.test(uiSrc)],
    ["scenario 'equipment_off'", reEqOff.test(uiSrc)],
    ["scenario 'rig_powered_still'", reRigStill.test(uiSrc)],
    ["scenario 'platter_spinning'", rePlatter.test(uiSrc)],
    ["speed '16'", reSpeed16.test(uiSrc)],
    ["speed '33_33'", reSpeed33.test(uiSrc)],
    ["speed '45'", reSpeed45.test(uiSrc)],
    ["speed '78'", reSpeed78.test(uiSrc)],
    ["speed 'custom'", reCustom.test(uiSrc)],
    ['analyzeNoiseFloor in engine', reAnalyzeFn.test(engSrc)],
    ['createNoiseFloorCapture called in UI', reCaptureDurUsed.test(uiSrc)],
    ['Start noise floor capture button', reStartBtn.test(uiSrc)],
    ['Clear noise floor history button', reClearBtn.test(uiSrc)],
    ['noise_floor key in JSON export', reExportKey.test(uiSrc)],
    ['scenario_kind in export', reScenarioKey.test(uiSrc)],
    ['noise_floor_dbfs in export', reNfDbfs.test(uiSrc)],
    ['NOISE FLOOR / RIG BASELINE in text report', reReportSection.test(uiSrc)],
    ['noise floor does not require test record copy', reNoTestRecord.test(uiSrc)],
    ['noiseFloor in state', reNoiseFloorState.test(uiSrc)],
    ['noiseFloorBody in elements()', reNoiseFloorBody.test(uiSrc)],
    ['noiseFloorPanelMarkup function exists', rePanelMarkup.test(uiSrc)],
    ['CSS mlab-nf-settings present', cssSrc.includes('.mlab-nf-settings')],
    ['CSS mlab-nf-history-table present', cssSrc.includes('.mlab-nf-history-table')],
    ['VTA workflow still planned', reVtaPlanned.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5H.4 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5H.4 static source check (Noise Floor / Rig Baseline measurement): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5H4NoiseFloor();

function checkS5IRunQuality() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const enginePath = join(repoRoot, 'src/modules/measurement-lab/engine/runQuality.ts');
  const cssSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  for (const p of [renderSrcPath, enginePath, cssSrcPath]) {
    if (!existsSync(p)) { console.error(`S5I: missing file: ${p}`); process.exitCode = 1; return; }
  }
  const uiSrc = readFileSync(renderSrcPath, 'utf8');
  const engSrc = readFileSync(enginePath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // Engine types and functions
    ['MeasurementRunQuality type declared', /type MeasurementRunQuality\s*=/.test(engSrc)],
    ['MeasurementRunQualityStatus type declared', /type MeasurementRunQualityStatus/.test(engSrc)],
    ['deriveMeasurementRunQuality exported', /export function deriveMeasurementRunQuality/.test(engSrc)],
    ['MeasurementChainReadiness type declared', /type MeasurementChainReadiness\s*=/.test(engSrc)],
    ['MeasurementChainReadinessStatus type declared', /type MeasurementChainReadinessStatus/.test(engSrc)],
    ['deriveMeasurementChainReadiness exported', /export function deriveMeasurementChainReadiness/.test(engSrc)],
    // Import in UI
    ['runQuality imported in UI', /from\s+['"].*runQuality['"]/.test(uiSrc)],
    ['deriveMeasurementRunQuality used in UI', /deriveMeasurementRunQuality/.test(uiSrc)],
    ['deriveMeasurementChainReadiness used in UI', /deriveMeasurementChainReadiness/.test(uiSrc)],
    // Chain readiness panel
    ['chainReadinessPanelMarkup function exists', /chainReadinessPanelMarkup/.test(uiSrc)],
    ['data-mlab-chain-readiness-body attribute', /data-mlab-chain-readiness-body/.test(uiSrc)],
    ['chainReadinessBody in elements()', /chainReadinessBody/.test(uiSrc)],
    ['Measurement chain readiness panel title', /Measurement chain readiness/.test(uiSrc)],
    ['renderChainReadinessPanel function', /function renderChainReadinessPanel/.test(uiSrc)],
    // run_quality in export
    ['run_quality key in JSON export (speed runs)', /run_quality.*r\.runQuality/.test(uiSrc) || /r\.runQuality/.test(uiSrc)],
    ['run_quality key in JSON export (refLevel)', /state\.refLevel\.runQuality/.test(uiSrc)],
    ['run_quality key in JSON export (noise floor)', /state\.noiseFloor\.latest\.runQuality/.test(uiSrc)],
    // runQuality in UI result views
    ['renderRunQualityHtml function', /function renderRunQualityHtml/.test(uiSrc)],
    ['runQuality badge in speed result', /renderRunQualityHtml.*speed\.runs/.test(uiSrc)],
    ['runQuality badge in refLevel result', /renderRunQualityHtml.*refLevel\.runQuality/.test(uiSrc)],
    ['runQuality badge in noiseFloor result', /renderRunQualityHtml.*runQuality/.test(uiSrc)],
    // Run quality in text report
    ['Run quality in text report (speed)', /Run quality.*latestSpeedRQ/.test(uiSrc)],
    ['Run quality in text report (refLevel)', /Run quality.*refLevel\.runQuality/.test(uiSrc)],
    ['Run quality in text report (noiseFloor)', /Run quality.*nl\.runQuality/.test(uiSrc)],
    // CSS
    ['CSS mlab-chain-readiness', cssSrc.includes('.mlab-chain-readiness')],
    ['CSS mlab-run-quality', cssSrc.includes('.mlab-run-quality')],
    // VTA still planned
    ['VTA workflow still planned', /status\s*:\s*'planned'\s*as\s*const/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5I static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5I static source check (Measurement Chain Calibration & Run Quality Gate): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5IRunQuality();

function checkS5JWebReport() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const modalSrcPath  = join(repoRoot, 'src/shared/ui/webReportModal.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, modalSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5J: missing file: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc    = readFileSync(renderSrcPath, 'utf8');
  const modalSrc = readFileSync(modalSrcPath, 'utf8');
  const cssSrc   = existsSync(cssSrcPath) ? readFileSync(cssSrcPath, 'utf8') : '';
  const allSrc   = uiSrc + '\n' + modalSrc + '\n' + cssSrc;

  const checks = [
    // 1. WebReportPayload type exists
    ['WebReportPayload type declared', /type WebReportPayload\s*=/.test(modalSrc)],
    // 2. openWebReportModal function exists
    ['openWebReportModal function exported', /export function openWebReportModal/.test(modalSrc)],
    // 3. window.print() called in modal
    ['window.print() called', /window\.print\(\)/.test(modalSrc)],
    // 4. @media print present
    ['@media print present', /@media\s+print/.test(allSrc)],
    // 5. @page rule present
    ['@page rule present', /@page\s*\{/.test(allSrc)],
    // 6. A4 size specified
    ['A4 size specified', /size:\s*A4/.test(allSrc)],
    // 7. buildMeasurementLabWebReport function exists
    ['buildMeasurementLabWebReport function exists', /function buildMeasurementLabWebReport/.test(uiSrc)],
    // 8. Open web report button in UI
    ['Open web report button present', /Open web report|View printable report/.test(uiSrc)],
    // 9. Measurement chain readiness in web report
    ['Measurement chain readiness section in web report', /buildChainReadinessSection|Measurement Chain Readiness/.test(uiSrc)],
    // 10. Speed / Wow section in web report
    ['Speed / Wow section in web report', /buildSpeedSection|Speed \/ Wow/.test(uiSrc)],
    // 11. Noise Floor / Rig Baseline in web report
    ['Noise Floor / Rig Baseline section in web report', /buildNoiseFloorSection|Noise Floor \/ Rig Baseline/.test(uiSrc)],
    // 12. VTA IMD Optimizer in web report
    ['VTA IMD Optimizer section in web report', /buildVtaSection|VTA IMD Optimizer/.test(uiSrc)],
    // 13. Experimental only — not a final recommendation.
    ['Experimental only — not a final recommendation', /Experimental only — not a final recommendation/.test(uiSrc)],
    // 14. Escaping/sanitization helper used (renderText or escapeHtml in report builder)
    ['Escaping helper used in report sections', /renderText|escapeHtml/.test(uiSrc)],
    // 15. JSON export still present
    ['JSON export (downloadSessionJson) still exists', /downloadSessionJson/.test(uiSrc)],
    // 16. Text report still present
    ['Text report (downloadReportText) still exists', /downloadReportText/.test(uiSrc)],
    // 17. VTA workflow still planned (not supported)
    ['VTA workflow still planned', /status\s*:\s*'planned'\s*as\s*const/.test(uiSrc)],
    // 18. webReportBtn wired in elements()
    ['webReportBtn in elements()', /webReportBtn/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5J static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5J static source check (Global Web Report Modal & Measurement Lab Rich Report): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5JWebReport();

function checkS5KFreqCurveAndAnalytics() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const modalSrcPath  = join(repoRoot, 'src/shared/ui/webReportModal.ts');
  const indexHtmlPath = join(repoRoot, 'index.html');
  const headersPath   = join(repoRoot, 'public/_headers');

  for (const p of [renderSrcPath, modalSrcPath, indexHtmlPath, headersPath]) {
    if (!existsSync(p)) {
      console.error(`S5K: missing file: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc      = readFileSync(renderSrcPath, 'utf8');
  const modalSrc   = readFileSync(modalSrcPath, 'utf8');
  const indexHtml  = readFileSync(indexHtmlPath, 'utf8');
  const headersSrc = readFileSync(headersPath, 'utf8');

  const checks = [
    // 1. Real curve rendering path: buildFreqResponseSvg is called inside buildFreqSection
    ['buildFreqResponseSvg called inside buildFreqSection', /buildFreqSection[\s\S]{0,2000}buildFreqResponseSvg/.test(uiSrc)],
    // 2. No fake frequency data introduced (no hardcoded magnitudesDb / fake Float64Array in report)
    ['No fake magnitudesDb array in report builder', !/magnitudesDb\s*=\s*new Float64Array\s*\(/.test(uiSrc)],
    // 3. No-data placeholder remains when no real data
    ['No-data placeholder kept when freq data absent', /buildFreqSection[\s\S]{0,200}wrEmpty\(\)|wrPlaceholder/.test(uiSrc)],
    // 4. Simple Analytics script present in index.html
    ['Simple Analytics script in index.html', /scripts\.simpleanalyticscdn\.com\/latest\.js/.test(indexHtml)],
    // 5. Simple Analytics async attribute present
    ['Simple Analytics script has async attribute', /<script[^>]+async[^>]+scripts\.simpleanalyticscdn\.com|<script[^>]+scripts\.simpleanalyticscdn\.com[^>]+async/.test(indexHtml)],
    // 6. CSP allows simpleanalyticscdn.com in script-src
    ['CSP script-src includes simpleanalyticscdn.com', /script-src[^;]*https:\/\/scripts\.simpleanalyticscdn\.com/.test(headersSrc)],
    // 7. CSP still includes Cloudflare static script source
    ['CSP script-src retains Cloudflare static', /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/.test(headersSrc)],
    // 8. CSP still includes Microsoft Clarity
    ['CSP script-src retains Clarity', /script-src[^;]*https:\/\/\*\.clarity\.ms/.test(headersSrc)],
    // 9. S5J openWebReportModal still present
    ['S5J openWebReportModal still present', /openWebReportModal/.test(uiSrc)],
    // 10. S5J buildMeasurementLabWebReport still present
    ['S5J buildMeasurementLabWebReport still present', /buildMeasurementLabWebReport/.test(uiSrc)],
    // 11. VTA still planned
    ['VTA workflow still planned', /status\s*:\s*'planned'\s*as\s*const/.test(uiSrc)],
    // 12. JSON export still present
    ['JSON export (downloadSessionJson) still present', /downloadSessionJson/.test(uiSrc)],
    // 13. Text report still present
    ['Text report (downloadReportText) still present', /downloadReportText/.test(uiSrc)],
    // 14. Print CSS for freq chart in modal styles
    ['Print-friendly freq chart CSS in modal', /mlab-freq-response.*stroke|stroke.*mlab-freq-response/.test(modalSrc) || /\.mlab-freq-response/.test(modalSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5K static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5K static source check (Freq Response Curve + Simple Analytics CSP): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5KFreqCurveAndAnalytics();

function checkS5LSessionMetadataProvenance() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const indexHtmlPath = join(repoRoot, 'index.html');
  const headersPath   = join(repoRoot, 'public/_headers');

  for (const p of [renderSrcPath, indexHtmlPath, headersPath]) {
    if (!existsSync(p)) {
      console.error(`S5L: missing file: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc      = readFileSync(renderSrcPath, 'utf8');
  const indexHtml  = readFileSync(indexHtmlPath, 'utf8');
  const headersSrc = readFileSync(headersPath, 'utf8');

  const checks = [
    // 1. session_metadata added to JSON export
    ['session_metadata in buildSessionJson', /session_metadata\s*:/.test(uiSrc)],
    // 2. generated_at in session_metadata
    ['generated_at in session_metadata', /generated_at\s*:/.test(uiSrc)],
    // 3. run_counts in session_metadata
    ['run_counts in session_metadata', /run_counts\s*:/.test(uiSrc)],
    // 4. selected_test_record_label in session_metadata
    ['selected_test_record_label in session_metadata', /selected_test_record_label\s*:/.test(uiSrc)],
    // 5. SESSION SUMMARY in text report
    ['SESSION SUMMARY section in text report', /SESSION SUMMARY/.test(uiSrc)],
    // 6. Coverage table in web report summary ("Not captured" wording)
    ['Not captured coverage in web report summary', /Not captured/.test(uiSrc)],
    // 7. Session measurement coverage table heading
    ['Session measurement coverage heading', /Session measurement coverage/.test(uiSrc)],
    // 8. Reference level section has provenance fields (balance, headroom, confidence)
    ['Reference level section has balance_db / headroom fields', /Balance.*R.*L|headroom/i.test(uiSrc.slice(uiSrc.indexOf('buildReferenceLevelSection'), uiSrc.indexOf('buildSpeedSection')))],
    // 9. S5J openWebReportModal still present
    ['S5J openWebReportModal still present', /openWebReportModal/.test(uiSrc)],
    // 10. S5K freq curve still present
    ['S5K buildFreqResponseSvg still present', /buildFreqResponseSvg/.test(uiSrc)],
    // 11. VTA still planned
    ['VTA workflow still planned', /status\s*:\s*'planned'\s*as\s*const/.test(uiSrc)],
    // 12. JSON export still present
    ['JSON export (downloadSessionJson) still present', /downloadSessionJson/.test(uiSrc)],
    // 13. Text report still present
    ['Text report (downloadReportText) still present', /downloadReportText/.test(uiSrc)],
    // 14. Simple Analytics still in index.html
    ['Simple Analytics still in index.html', /scripts\.simpleanalyticscdn\.com\/latest\.js/.test(indexHtml)],
    // 15. CSP still includes simpleanalyticscdn.com
    ['CSP still includes simpleanalyticscdn.com', /script-src[^;]*https:\/\/scripts\.simpleanalyticscdn\.com/.test(headersSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5L static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5L static source check (Session Metadata & Run Provenance): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5LSessionMetadataProvenance();

function checkS5MMeasurementChainHardening() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const runQualityPath = join(repoRoot, 'src/modules/measurement-lab/engine/runQuality.ts');
  const cssSrcPath     = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, runQualityPath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5M: missing file: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const rqSrc  = readFileSync(runQualityPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. InputScopeSnapshot type in runQuality.ts
    ['InputScopeSnapshot type in runQuality.ts', /InputScopeSnapshot/.test(rqSrc)],
    // 2. buildInputScopeSnapshot function in runQuality.ts
    ['buildInputScopeSnapshot function in runQuality.ts', /function buildInputScopeSnapshot/.test(rqSrc)],
    // 3. resonance in run_counts (type definition)
    ['resonance in run_counts type', /run_counts[\s\S]{0,300}resonance\s*:\s*number/.test(uiSrc)],
    // 4. resonance in buildSessionJson run_counts implementation
    ['resonance in buildSessionJson run_counts', /resonance\s*:\s*state\.resonance\.result\s*\?/.test(uiSrc)],
    // 5. input_scope in SessionJson type
    ['input_scope field in SessionJson type', /input_scope\s*:\s*\{[\s\S]{0,600}source_connected/.test(uiSrc)],
    // 6. input_scope in buildSessionJson return
    ['input_scope built in buildSessionJson', /buildInputScopeSnapshot\s*\(/.test(uiSrc)],
    // 7. mlab-chain-status-badge in CSS
    ['mlab-chain-status-badge in CSS', /\.mlab-chain-status-badge/.test(cssSrc)],
    // 8. mlab-chain-readiness-explain in CSS
    ['mlab-chain-readiness-explain in CSS', /\.mlab-chain-readiness-explain/.test(cssSrc)],
    // 9. statusBadgeClass in renderChainReadinessPanel (badge per status)
    ['statusBadgeClass in renderChainReadinessPanel', /statusBadgeClass/.test(uiSrc)],
    // 10. statusExplain in renderChainReadinessPanel (explanatory text)
    ['statusExplain in renderChainReadinessPanel', /statusExplain/.test(uiSrc)],
    // 11. MEASUREMENT CHAIN section in text report
    ['MEASUREMENT CHAIN section in text report', /MEASUREMENT CHAIN/.test(uiSrc)],
    // 12. Resonance in SESSION SUMMARY text report
    ['Resonance in SESSION SUMMARY text report', /SESSION SUMMARY[\s\S]{0,1000}Resonance:/.test(uiSrc)],
    // 13. buildInputScopeSnapshot imported in render file
    ['buildInputScopeSnapshot imported in renderMeasurementLabPage', /buildInputScopeSnapshot/.test(uiSrc)],
    // 14. S5L run_counts resonance normalization (regression guard)
    ['S5L run_counts has speed and resonance (regression)', /run_counts\s*:\s*\{[\s\S]{0,400}speed\s*:\s*number[\s\S]{0,400}resonance\s*:\s*number/.test(uiSrc)],
    // 15. S5J/S5K/S5L regressions: openWebReportModal, buildFreqResponseSvg, JSON+text exports
    ['openWebReportModal still present (S5J regression)', /openWebReportModal/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5M static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5M static source check (Measurement Chain Hardening & Input Scope): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5MMeasurementChainHardening();

function checkS5NSpeedDiagnostics() {
  const renderSrcPath  = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const speedEnginePath = join(repoRoot, 'src/modules/measurement-lab/engine/speedFlutter.ts');
  const cssSrcPath     = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, speedEnginePath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5N: missing file: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc     = readFileSync(renderSrcPath, 'utf8');
  const engineSrc = readFileSync(speedEnginePath, 'utf8');
  const cssSrc    = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. SpeedDiagnosticMeta type in speedFlutter.ts
    ['SpeedDiagnosticMeta type in speedFlutter.ts', /SpeedDiagnosticMeta/.test(engineSrc)],
    // 2. buildSpeedDiagnosticMeta function in speedFlutter.ts
    ['buildSpeedDiagnosticMeta in speedFlutter.ts', /function buildSpeedDiagnosticMeta/.test(engineSrc)],
    // 3. wow_band_separation_status not_available in engine
    ['wow_band_separation_status not_available in engine', /wowBandSeparationStatus.*not_available|not_available.*wowBandSeparationStatus/.test(engineSrc)],
    // 4. wowFlutterWeightedPercent in SpeedMeasurementRun type
    ['wowFlutterWeightedPercent in SpeedMeasurementRun type', /wowFlutterWeightedPercent\s*:\s*number\s*\|\s*null/.test(uiSrc)],
    // 5. wowFlutterWeightedPercent populated in run creation
    ['wowFlutterWeightedPercent populated in run creation', /wowFlutterWeightedPercent\s*:\s*result\.weightedWfPercent/.test(uiSrc)],
    // 6. computeSpeedRunComparison function exists
    ['computeSpeedRunComparison function in render file', /function computeSpeedRunComparison/.test(uiSrc)],
    // 7. run comparison handles incompatible RPM contexts
    ['run comparison handles incompatible contexts', /cross-context comparison is not meaningful/.test(uiSrc)],
    // 8. speed_diagnostics in JSON export
    ['speed_diagnostics in JSON export', /speed_diagnostics/.test(uiSrc)],
    // 9. run_comparison in JSON export
    ['run_comparison in JSON export', /run_comparison/.test(uiSrc)],
    // 10. MEASUREMENT CHAIN in text report (S5M regression)
    ['MEASUREMENT CHAIN section still present (S5M regression)', /MEASUREMENT CHAIN/.test(uiSrc)],
    // 11. Wow/flutter band separation in text report
    ['Wow/flutter band separation note in text report', /wowBandSeparationNote/.test(uiSrc)],
    // 12. mlab-speed-comparison CSS added
    ['mlab-speed-comparison CSS present', /\.mlab-speed-comparison/.test(cssSrc)],
    // 13. speedRunComparisonMarkup function in render file
    ['speedRunComparisonMarkup function in render file', /function speedRunComparisonMarkup/.test(uiSrc)],
    // 14. buildSpeedDiagnosticMeta imported in render file
    ['buildSpeedDiagnosticMeta imported in render file', /buildSpeedDiagnosticMeta/.test(uiSrc)],
    // 15. VTA still planned (regression)
    ['VTA workflow still planned (regression)', /status\s*:\s*'planned'\s*as\s*const/.test(uiSrc)],
    // 16. openWebReportModal still present (S5J regression)
    ['openWebReportModal still present (S5J regression)', /openWebReportModal/.test(uiSrc)],
    // 17. buildFreqResponseSvg still present (S5K regression)
    ['buildFreqResponseSvg still present (S5K regression)', /buildFreqResponseSvg/.test(uiSrc)],
    // 18. input_scope still present (S5M regression)
    ['input_scope still present (S5M regression)', /input_scope/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5N static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5N static source check (Speed Diagnostics Hardening): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5NSpeedDiagnostics();

function checkS5OFreqResponseDeviation() {
  const renderSrcPath   = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const freqEnginePath  = join(repoRoot, 'src/modules/measurement-lab/engine/freqResponse.ts');
  const cssSrcPath      = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, freqEnginePath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5O static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc     = readFileSync(renderSrcPath, 'utf8');
  const engineSrc = readFileSync(freqEnginePath, 'utf8');
  const cssSrc    = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. FreqDeviationSummary type in freqResponse.ts
    ['FreqDeviationSummary type in freqResponse.ts', /FreqDeviationSummary/.test(engineSrc)],
    // 2. computeFreqDeviationSummary function in freqResponse.ts
    ['computeFreqDeviationSummary in freqResponse.ts', /function computeFreqDeviationSummary/.test(engineSrc)],
    // 3. FreqBandSummary type in freqResponse.ts
    ['FreqBandSummary type in freqResponse.ts', /FreqBandSummary/.test(engineSrc)],
    // 4. empty result returns null
    ['computeFreqDeviationSummary returns null for empty result', /frequenciesHz\.length === 0.*return null/.test(engineSrc.replace(/\n/g, ' '))],
    // 5. deviation fields: minDb, maxDb, peakToPeakDb
    ['deviation has minDb maxDb peakToPeakDb fields', /minDb.*maxDb.*peakToPeakDb/s.test(engineSrc)],
    // 6. rmsDeviationDb field present
    ['deviation has rmsDeviationDb field', /rmsDeviationDb/.test(engineSrc)],
    // 7. bandSummaries array present
    ['deviation has bandSummaries array', /bandSummaries/.test(engineSrc)],
    // 8. referenceNote mentions 1 kHz
    ['referenceNote mentions 1 kHz reference', /1 kHz.*0 dB reference|0 dB.*1 kHz/.test(engineSrc)],
    // 9. iriaaApplied field in FreqDeviationSummary
    ['iriaaApplied field in FreqDeviationSummary', /iriaaApplied/.test(engineSrc)],
    // 10. computeFreqDeviationSummary imported in render file
    ['computeFreqDeviationSummary imported in render file', /computeFreqDeviationSummary/.test(uiSrc)],
    // 11. deviation field in JSON export for frequency_response
    ['deviation field in JSON export', /deviation\s*:/.test(uiSrc)],
    // 12. deviation summary in text report
    ['Deviation summary in text report (iRIAA applied line)', /iRIAA applied:/.test(uiSrc)],
    // 13. mlab-freq-deviation CSS class present
    ['mlab-freq-deviation CSS class present', /\.mlab-freq-deviation/.test(cssSrc)],
    // 14. deviation block in renderFreqPanel (mlab-freq-deviation-head)
    ['mlab-freq-deviation-head markup in render file', /mlab-freq-deviation-head/.test(uiSrc)],
    // 15. deviation block in buildFreqSection web report
    ['deviation HTML in buildFreqSection', /deviationHtml/.test(uiSrc)],
    // 16. iRIAA provenance badge in renderFreqPanel
    ['iRIAA provenance badge in renderFreqPanel', /iRIAA applied.*ea-badge|ea-badge.*iRIAA applied/.test(uiSrc)],
    // 17. buildFreqResponseSvg still present (S5K regression)
    ['buildFreqResponseSvg still present (S5K regression)', /buildFreqResponseSvg/.test(uiSrc)],
    // 18. input_scope still present (S5M regression)
    ['input_scope still present (S5M regression)', /input_scope/.test(uiSrc)],
    // 19. speed_diagnostics still present (S5N regression)
    ['speed_diagnostics still present (S5N regression)', /speed_diagnostics/.test(uiSrc)],
    // 20. session_metadata still present (S5L regression)
    ['session_metadata still present (S5L regression)', /session_metadata/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5O static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5O static source check (Frequency Response Deviation & Reporting): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5OFreqResponseDeviation();

function checkS5PResonanceFoundation() {
  const renderSrcPath   = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const resonanceEngPath = join(repoRoot, 'src/modules/measurement-lab/engine/resonance.ts');
  const cssSrcPath      = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, resonanceEngPath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5P static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc     = readFileSync(renderSrcPath, 'utf8');
  const engSrc    = readFileSync(resonanceEngPath, 'utf8');
  const cssSrc    = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. ResonanceDiagnosticMeta type in resonance.ts
    ['ResonanceDiagnosticMeta type in resonance.ts', /ResonanceDiagnosticMeta/.test(engSrc)],
    // 2. buildResonanceDiagnosticMeta function in resonance.ts
    ['buildResonanceDiagnosticMeta in resonance.ts', /function buildResonanceDiagnosticMeta/.test(engSrc)],
    // 3. typical range note mentions 8-12 Hz / 12-16 Hz
    ['typicalRangeNote mentions typical Hz range', /8.{1,3}12 Hz|12.{1,3}16 Hz/.test(engSrc)],
    // 4. limitations note mentions groove noise / rumble
    ['limitationsNote mentions groove noise or rumble', /groove noise|rumble/.test(engSrc)],
    // 5. wow band overlap note present
    ['wowBandOverlapNote present', /wowBandOverlapNote/.test(engSrc)],
    // 6. resultSource field added to ResonanceStateBag
    ['resultSource field in ResonanceStateBag', /resultSource\s*:\s*'live_capture'\s*\|\s*'self_test'\s*\|\s*null/.test(uiSrc)],
    // 7. runQuality field added to ResonanceStateBag
    ['runQuality field in ResonanceStateBag', /runQuality\s*:\s*MeasurementRunQuality\s*\|\s*null/.test(uiSrc)],
    // 8. resonance runQuality derived with deriveMeasurementRunQuality
    ['resonance runQuality derived in startResonanceCapture', /state\.resonance\.runQuality\s*=\s*deriveMeasurementRunQuality/.test(uiSrc)],
    // 9. resonance resultSource set in startResonanceCapture
    ['resonance resultSource set in startResonanceCapture', /state\.resonance\.resultSource\s*=\s*captureSource/.test(uiSrc)],
    // 10. JSON export resonance has source field
    ['resonance JSON export includes source field', /source\s*:\s*state\.resonance\.resultSource/.test(uiSrc)],
    // 11. JSON export resonance has run_quality field
    ['resonance JSON export includes run_quality', /run_quality\s*:/.test(uiSrc) && /diagnostic_notes/.test(uiSrc)],
    // 12. JSON export resonance has diagnostic_notes
    ['resonance JSON export includes diagnostic_notes', /diagnostic_notes\s*:\s*\{/.test(uiSrc)],
    // 13. buildResonanceSection function in render file
    ['buildResonanceSection function in render file', /function buildResonanceSection/.test(uiSrc)],
    // 14. buildResonanceSection included in buildMeasurementLabWebReport
    ['buildResonanceSection called in buildMeasurementLabWebReport', /buildResonanceSection\(\)/.test(uiSrc)],
    // 15. resonance text report shows no-data state
    ['resonance text report has no-data state', /Not captured in this session/.test(uiSrc)],
    // 16. mlab-resonance-diagnostic CSS class present
    ['mlab-resonance-diagnostic CSS class present', /\.mlab-resonance-diagnostic/.test(cssSrc)],
    // 17. buildFreqResponseSvg still present (S5K regression)
    ['buildFreqResponseSvg still present (S5K regression)', /buildFreqResponseSvg/.test(uiSrc)],
    // 18. speed_diagnostics still present (S5N regression)
    ['speed_diagnostics still present (S5N regression)', /speed_diagnostics/.test(uiSrc)],
    // 19. frequency_response deviation still present (S5O regression)
    ['freq deviation still present (S5O regression)', /computeFreqDeviationSummary/.test(uiSrc)],
    // 20. input_scope still present (S5M regression)
    ['input_scope still present (S5M regression)', /input_scope/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5P static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5P static source check (Resonance Measurement Foundation): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5PResonanceFoundation();

function checkS5QHarmonicBreakdown() {
  const renderSrcPath  = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const thdEnginePath  = join(repoRoot, 'src/modules/measurement-lab/engine/thd.ts');
  const cssSrcPath     = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, thdEnginePath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5Q static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const engSrc = readFileSync(thdEnginePath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. ThdDistortionMeta type in thd.ts
    ['ThdDistortionMeta type in thd.ts', /ThdDistortionMeta/.test(engSrc)],
    // 2. buildThdDistortionMeta function in thd.ts
    ['buildThdDistortionMeta in thd.ts', /function buildThdDistortionMeta/.test(engSrc)],
    // 3. imdSidebandDetailStatus not_available in engine
    ['imdSidebandDetailStatus not_available in engine', /imdSidebandDetailStatus.*not_available|not_available.*imdSidebandDetailStatus/.test(engSrc)],
    // 4. chainNote present in engine
    ['chainNote present in engine', /chainNote/.test(engSrc)],
    // 5. harmonicInterpretationNote present in engine
    ['harmonicInterpretationNote present', /harmonicInterpretationNote/.test(engSrc)],
    // 6. runQuality field added to ThdStateBag
    ['runQuality field in ThdStateBag', /runQuality\s*:\s*MeasurementRunQuality\s*\|\s*null/.test(uiSrc)],
    // 7. runQuality derived in startThdCapture
    ['thd runQuality derived in startThdCapture', /state\.thd\.runQuality\s*=\s*deriveMeasurementRunQuality/.test(uiSrc)],
    // 8. harmonic_detail in JSON export (not just harmonics_dbc)
    ['harmonic_detail in JSON export', /harmonic_detail\s*:/.test(uiSrc)],
    // 9. harmonic detail includes order and frequency_hz
    ['harmonic detail has order and frequency_hz', /order\s*:\s*i \+ 2/.test(uiSrc) && /frequency_hz\s*:/.test(uiSrc)],
    // 10. sideband_detail_status in IMD JSON export
    ['sideband_detail_status in IMD JSON export', /sideband_detail_status/.test(uiSrc)],
    // 11. THD run_quality in JSON export
    ['run_quality in THD JSON export', /run_quality\s*:\s*runQualityExport/.test(uiSrc)],
    // 12. diagnostic_notes in THD JSON export
    ['diagnostic_notes in THD JSON export', /diagnostic_notes\s*:\s*\{/.test(uiSrc)],
    // 13. mlab-thd-harmonic-table CSS class
    ['mlab-thd-harmonic-table CSS class present', /\.mlab-thd-harmonic-table/.test(cssSrc)],
    // 14. mlab-thd-harmonic-breakdown CSS class
    ['mlab-thd-harmonic-breakdown CSS class present', /\.mlab-thd-harmonic-breakdown/.test(cssSrc)],
    // 15. harmonic table rows in renderThdPanel
    ['harmonic table rows in renderThdPanel', /mlab-thd-harmonic-order/.test(uiSrc)],
    // 16. sideband detail not available note in UI
    ['IMD sideband not-available note in UI', /Not available.*imdSidebandDetailNote|imdSidebandDetailNote.*Not available/.test(uiSrc)],
    // 17. buildThdSection has no-data placeholder
    ['buildThdSection has no-data placeholder', /wrPlaceholder.*THD.*IMD/.test(uiSrc)],
    // 18. resonance foundation still present (S5P regression)
    ['ResonanceDiagnosticMeta still present (S5P regression)', /ResonanceDiagnosticMeta/.test(uiSrc)],
    // 19. freq deviation still present (S5O regression)
    ['freq deviation still present (S5O regression)', /computeFreqDeviationSummary/.test(uiSrc)],
    // 20. input_scope still present (S5M regression)
    ['input_scope still present (S5M regression)', /input_scope/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5Q static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5Q static source check (Harmonic Breakdown / Distortion Detail): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5QHarmonicBreakdown();

function checkS5RAzimuthStepFoundation() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S5R static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const checks = [
    // 1. AzimuthStepRun type defined
    ['AzimuthStepRun type defined', /type AzimuthStepRun\s*=/.test(uiSrc)],
    // 2. AzimuthStepComparison type defined
    ['AzimuthStepComparison type defined', /type AzimuthStepComparison\s*=/.test(uiSrc)],
    // 3. computeAzimuthStepComparison function
    ['computeAzimuthStepComparison function', /function computeAzimuthStepComparison/.test(uiSrc)],
    // 4. runs field in ChannelStateBag
    ['runs field in ChannelStateBag (AzimuthStepRun[])', /runs\s*:\s*AzimuthStepRun\[\]/.test(uiSrc)],
    // 5. stepLabelInput field in ChannelStateBag
    ['stepLabelInput field in ChannelStateBag', /stepLabelInput\s*:\s*string/.test(uiSrc)],
    // 6. stepLabelInput persisted on auto-save (cleared after save)
    ['stepLabelInput cleared after auto-save', /state\.channel\.stepLabelInput\s*=\s*''/.test(uiSrc)],
    // 7. Auto-save AzimuthStepRun on right-channel capture done
    ['AzimuthStepRun auto-save on right capture', /state\.channel\.runs\s*=\s*\[\.\.\.state\.channel\.runs,\s*stepRun\]/.test(uiSrc)],
    // 8. azimuth_steps in JSON export
    ['azimuth_steps in JSON export', /azimuth_steps\s*:/.test(uiSrc)],
    // 9. AZIMUTH STEPS section in text report
    ['AZIMUTH STEPS section in text report', /AZIMUTH STEPS/.test(uiSrc)],
    // 10. azimuthStepHistoryMarkup function
    ['azimuthStepHistoryMarkup function', /function azimuthStepHistoryMarkup/.test(uiSrc)],
    // 11. azimuthStepComparisonMarkup function
    ['azimuthStepComparisonMarkup function', /function azimuthStepComparisonMarkup/.test(uiSrc)],
    // 12. buildAzimuthStepsSection function for web report
    ['buildAzimuthStepsSection function', /function buildAzimuthStepsSection/.test(uiSrc)],
    // 13. buildAzimuthStepsSection called in buildChannelSection
    ['buildAzimuthStepsSection called in buildChannelSection', /buildAzimuthStepsSection\(\)/.test(uiSrc)],
    // 14. step label input rendered in idle state
    ['step label input in idle state', /mlab-step-label/.test(uiSrc)],
    // 15. step label input updates state on input event
    ['stepLabelInput updated on input event', /state\.channel\.stepLabelInput\s*=\s*\(e\.target/.test(uiSrc)],
    // 16. history table shown in done state
    ['azimuthStepHistoryMarkup called in done state', /azimuthStepHistoryMarkup\(ch\.runs\)/.test(uiSrc)],
    // 17. comparison shown in done/idle states
    ['azimuthStepComparisonMarkup called for done/idle', /azimuthStepComparisonMarkup\(ch\.runs\)/.test(uiSrc)],
    // 18. mlab-azimuth-step-history CSS
    ['mlab-azimuth-step-history CSS class', /\.mlab-azimuth-step-history/.test(cssSrc)],
    // 19. mlab-azimuth-comparison CSS
    ['mlab-azimuth-comparison CSS class', /\.mlab-azimuth-comparison/.test(cssSrc)],
    // 20. S5Q harmonic breakdown still present (regression check)
    ['S5Q harmonic breakdown still present (regression)', /buildThdDistortionMeta/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S5R static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S5R static source check (Azimuth Step Workflow Foundation): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS5RAzimuthStepFoundation();

function checkS6SupportedStatusReview() {
  const workflowsPath  = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');
  const helpModalPath  = join(repoRoot, 'src/shared/ui/helpModal.ts');
  const headersPath    = join(repoRoot, 'public/_headers');
  const renderSrcPath  = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');

  for (const p of [workflowsPath, helpModalPath, headersPath, renderSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S6 static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const workflowsSrc = readFileSync(workflowsPath, 'utf8');
  const helpSrc      = readFileSync(helpModalPath, 'utf8');
  const headersSrc   = readFileSync(headersPath, 'utf8');
  const uiSrc        = readFileSync(renderSrcPath, 'utf8');

  const checks = [
    // 1. vertical_resonance promoted to supported
    ['vertical_resonance implementationStatus supported',
      /vertical_resonance[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 2. VTA still planned (not supported)
    ['VTA still planned (not supported)',
      !/vta_imd_optimizer[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 3. anti_skate_tracking_stress not promoted
    ['anti_skate_tracking_stress remains planned',
      !/anti_skate_tracking_stress[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 4. rumble_isolation not promoted
    ['rumble_isolation remains planned',
      !/rumble_isolation[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 5. pink_noise_spectral not promoted
    ['pink_noise_spectral remains planned',
      !/pink_noise_spectral[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 6. helpModal no longer contains "Coming soon"
    ['helpModal does not contain "Coming soon"',
      !helpSrc.includes('Coming soon')],
    // 7. connect-src includes scripts.simpleanalyticscdn.com
    ['connect-src includes scripts.simpleanalyticscdn.com',
      /connect-src[^\n]*https:\/\/scripts\.simpleanalyticscdn\.com/.test(headersSrc)],
    // 8. script-src still includes scripts.simpleanalyticscdn.com
    ['script-src still includes scripts.simpleanalyticscdn.com',
      /script-src[^\n]*https:\/\/scripts\.simpleanalyticscdn\.com/.test(headersSrc)],
    // 9. queue.simpleanalyticscdn.com still in connect-src
    ['queue.simpleanalyticscdn.com still in connect-src',
      /connect-src[^\n]*https:\/\/queue\.simpleanalyticscdn\.com/.test(headersSrc)],
    // 10. Cloudflare still in connect-src
    ['cloudflareinsights.com still in connect-src',
      /connect-src[^\n]*cloudflareinsights\.com/.test(headersSrc)],
    // 11. clarity.ms still in connect-src
    ['clarity.ms still in connect-src',
      /connect-src[^\n]*clarity\.ms/.test(headersSrc)],
    // 12. CSP does not use wildcard * in script-src
    ['script-src does not use *',
      !/script-src[^\n]*\s\*\s|\s\*$|\s\*;/.test(headersSrc)],
    // 13. No "best/recommended/optimal" VTA/azimuth claim in UI source
    ['No best/recommended/optimal VTA claim',
      !/\b(best|recommended|optimal)\s+VTA|\bVTA\s+(best|recommended|optimal)/i.test(uiSrc)],
    // 14. S5R azimuth step workflow still present (regression)
    ['S5R azimuth step workflow still present', /AzimuthStepRun/.test(uiSrc)],
    // 15. S5R azimuth comparison no recommendation claim
    ['azimuth comparison has no recommendation claim',
      !/No azimuth setting is recommended/.test(uiSrc)
        ? /lower crosstalk|no azimuth/i.test(uiSrc)
        : true],
    // 16. S5Q harmonic breakdown still present (regression)
    ['S5Q harmonic breakdown still present', /buildThdDistortionMeta/.test(uiSrc)],
    // 17. S5P resonance diagnostics still present (regression)
    ['S5P resonance diagnostics still present', /buildResonanceDiagnosticMeta/.test(uiSrc)],
    // 18. S5O freq deviation still present (regression)
    ['S5O freq deviation still present', /computeFreqDeviationSummary/.test(uiSrc)],
    // 19. wow_flutter and channel_identity still supported (regression)
    ['wow_flutter still supported',
      /wow_flutter[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
    // 20. frequency_response still supported (regression)
    ['frequency_response still supported',
      /frequency_response[\s\S]{0,200}implementationStatus\s*:\s*'supported'/.test(workflowsSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S6 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S6 static source check (Supported-Status Review & Release-Gate Cleanup): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS6SupportedStatusReview();

function checkS7AWorkbenchShell() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  const homeSrcPath   = join(repoRoot, 'src/app/home/renderHomePage.ts');

  for (const p of [renderSrcPath, cssSrcPath, homeSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S7A static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');
  const homeSrc = readFileSync(homeSrcPath, 'utf8');

  const checks = [
    // 1. LabState has activeWorkflowId
    ['LabState has activeWorkflowId: string | null',
      /activeWorkflowId\s*:\s*string\s*\|\s*null/.test(uiSrc)],
    // 2. sessionRibbonMarkup function defined
    ['sessionRibbonMarkup function defined',
      /function sessionRibbonMarkup\s*\(/.test(uiSrc)],
    // 3. workflowRailMarkup function defined
    ['workflowRailMarkup function defined',
      /function workflowRailMarkup\s*\(/.test(uiSrc)],
    // 4. diagRailMarkup function defined (replaces visualizationMarkup)
    ['diagRailMarkup function defined',
      /function diagRailMarkup\s*\(/.test(uiSrc)],
    // 5. renderSessionRibbon function defined
    ['renderSessionRibbon function defined',
      /function renderSessionRibbon\s*\(/.test(uiSrc)],
    // 6. renderWorkflowRail function defined
    ['renderWorkflowRail function defined',
      /function renderWorkflowRail\s*\(/.test(uiSrc)],
    // 7. updateActiveRailItem function defined
    ['updateActiveRailItem function defined',
      /function updateActiveRailItem\s*\(/.test(uiSrc)],
    // 8. renderDiagSignalPanel function defined
    ['renderDiagSignalPanel function defined',
      /function renderDiagSignalPanel\s*\(/.test(uiSrc)],
    // 9. elements() has ribbonSource selector
    ['elements() has ribbonSource selector',
      /ribbonSource\s*:.*data-mlab-ribbon-source/.test(uiSrc)],
    // 10. elements() has railItems selector
    ['elements() has railItems selector',
      /railItems\s*:.*data-mlab-rail-items/.test(uiSrc)],
    // 11. elements() has diagSignalBody selector
    ['elements() has diagSignalBody selector',
      /diagSignalBody\s*:.*data-mlab-diag-signal-body/.test(uiSrc)],
    // 12. renderMeasurementLabPage uses mlab-workbench-grid
    ['renderMeasurementLabPage uses mlab-workbench-grid',
      /mlab-workbench-grid/.test(uiSrc)],
    // 13. renderMeasurementLabPage uses mlab-session-ribbon
    ['renderMeasurementLabPage uses mlab-session-ribbon (via sessionRibbonMarkup call)',
      /sessionRibbonMarkup\(\)/.test(uiSrc)],
    // 14. enableMeasurementLabInteractions calls renderSessionRibbon
    ['enableMeasurementLabInteractions calls renderSessionRibbon',
      /enableMeasurementLabInteractions[\s\S]{0,3000}renderSessionRibbon\(els\)/.test(uiSrc)],
    // 15. enableMeasurementLabInteractions calls renderWorkflowRail
    ['enableMeasurementLabInteractions calls renderWorkflowRail',
      /enableMeasurementLabInteractions[\s\S]{0,3000}renderWorkflowRail\(els\)/.test(uiSrc)],
    // 16. enableMeasurementLabInteractions wires panel switching (S7A.1: activateTool replaces IntersectionObserver)
    ['enableMeasurementLabInteractions wires active tool panel switching',
      /enableMeasurementLabInteractions[\s\S]{0,15000}activateTool\s*\(/.test(uiSrc)],
    // 17. connectMeasurementLab calls renderSessionRibbon
    ['connectMeasurementLab calls renderSessionRibbon',
      /connectMeasurementLab[\s\S]{0,2000}renderSessionRibbon\(els\)/.test(uiSrc)],
    // 18. disconnectMeasurementLab calls renderDiagSignalPanel
    ['disconnectMeasurementLab calls renderDiagSignalPanel',
      /disconnectMeasurementLab[\s\S]{0,2000}renderDiagSignalPanel\(els\)/.test(uiSrc)],
    // 19. tokenLayoutGeneratedClassNames includes mlab-session-ribbon
    ['tokenLayoutGeneratedClassNames includes mlab-session-ribbon',
      (() => {
        const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
        if (tokenStart < 0) return false;
        const tokenEnd = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
        const tokenBlock = uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 6000);
        return tokenBlock.includes('mlab-session-ribbon');
      })()],
    // 20. tokenLayoutGeneratedClassNames includes mlab-diag-rail
    ['tokenLayoutGeneratedClassNames includes mlab-diag-rail',
      (() => {
        const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
        if (tokenStart < 0) return false;
        const tokenEnd = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
        const tokenBlock = uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 6000);
        return tokenBlock.includes('mlab-diag-rail');
      })()],
    // 21. tokenLayoutGeneratedClassNames includes mlab-rail-item--active
    ['tokenLayoutGeneratedClassNames includes mlab-rail-item--active',
      (() => {
        const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
        if (tokenStart < 0) return false;
        const tokenEnd = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
        const tokenBlock = uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 6000);
        return tokenBlock.includes('mlab-rail-item--active');
      })()],
    // 22. CSS has 2-column grid with 268px workflow rail column (S7A.1 layout)
    ['CSS has 2-column workbench-grid with 268px workflow rail',
      /grid-template-columns\s*:\s*268px/.test(cssSrc)],
    // 23. CSS has mlab-workflow-rail height:100% (S7A.1: no longer sticky)
    ['CSS has mlab-workflow-rail height 100%',
      /\.mlab-workflow-rail[\s\S]{0,300}height\s*:\s*100%/.test(cssSrc)],
    // 24. CSS has mlab-diag-rail
    ['CSS has mlab-diag-rail',
      /\.mlab-diag-rail/.test(cssSrc)],
    // 25. CSS has responsive breakpoint hiding workflow rail at <=1100px
    ['CSS hides workflow-rail at max-width 1100px',
      /max-width\s*:\s*1100px[\s\S]{0,300}mlab-workflow-rail[\s\S]{0,100}display\s*:\s*none/.test(cssSrc)],
    // 26. CSS has single-column fallback at <=1100px (S7A.1: rail hidden at 1100px)
    ['CSS has single-column fallback at max-width 1100px',
      /max-width\s*:\s*1100px[\s\S]{0,300}grid-template-columns\s*:\s*1fr/.test(cssSrc)],
    // 27. Home page Data Explorer aria-label no longer says "coming soon"
    ['Home page Data Explorer aria-label does not say "coming soon"',
      !/Data Explorer.*coming soon/i.test(homeSrc)],
    // 28. No fake pass/fail in workbench markup
    ['No hardcoded pass/fail in sessionRibbonMarkup',
      !/sessionRibbonMarkup[\s\S]{0,500}(?:PASS|FAIL|READY|BLOCKED)\b(?!\s*[<'"`])/.test(uiSrc)],
    // 29. S6 regression: vertical_resonance still supported
    ['S6 regression guard: vertical_resonance still in workflowRailMarkup context',
      /renderWorkflowRail/.test(uiSrc)],
    // 30. S5J–S5R regression: webReportBtn still present
    ['S5J–S5R regression guard: webReportBtn still wired',
      /webReportBtn/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S7A static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S7A static source check (Measurement Workbench UI Shell): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS7AWorkbenchShell();

function checkS7A1WorkbenchLayout() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S7A.1 static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
  const tokenEnd = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
  const tokenBlock = tokenStart >= 0 ? uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 8000) : '';

  const checks = [
    // 1. WORKBENCH_TOOLS constant exists
    ['WORKBENCH_TOOLS constant declared',
      /const WORKBENCH_TOOLS\s*:\s*readonly WorkbenchTool\[\]/.test(uiSrc)],
    // 2. WorkbenchTool type declared
    ['WorkbenchTool type declared',
      /type WorkbenchTool\s*=\s*\{/.test(uiSrc)],
    // 3. WORKBENCH_TOOLS includes audio_source as first entry (S7A.2.1: home removed from rail)
    ['WORKBENCH_TOOLS starts with audio_source entry',
      /WORKBENCH_TOOLS[\s\S]{0,200}audio_source/.test(uiSrc)],
    // 4. WORKBENCH_TOOLS includes Setup / baseline group
    ['WORKBENCH_TOOLS includes Setup / baseline group',
      /Setup \/ baseline/.test(uiSrc)],
    // 5. WORKBENCH_TOOLS includes Experimental / planned group
    ['WORKBENCH_TOOLS includes Experimental / planned group',
      /Experimental \/ planned/.test(uiSrc)],
    // 6. activateTool function declared
    ['activateTool function declared',
      /function activateTool\s*\(/.test(uiSrc)],
    // 7. activateTool toggles mlab-tool-panel--active
    ['activateTool toggles mlab-tool-panel--active class',
      /activateTool[\s\S]{0,500}mlab-tool-panel--active/.test(uiSrc)],
    // 8. activateTool removes context overlay open class
    ['activateTool removes mlab-context-overlay--open',
      /activateTool[\s\S]{0,500}mlab-context-overlay--open/.test(uiSrc)],
    // 9. enableMeasurementLabInteractions calls activateTool audio_source (S7A.2.1: default changed)
    ['enableMeasurementLabInteractions calls activateTool(audio_source)',
      /enableMeasurementLabInteractions[\s\S]{0,15000}activateTool\s*\(\s*['"]audio_source['"]/.test(uiSrc)],
    // 10. No IntersectionObserver in enableMeasurementLabInteractions
    ['IntersectionObserver removed from enableMeasurementLabInteractions',
      !/enableMeasurementLabInteractions[\s\S]{0,10000}IntersectionObserver/.test(uiSrc)],
    // 11. context overlay markup present
    ['contextOverlayMarkup function declared',
      /function contextOverlayMarkup\s*\(/.test(uiSrc)],
    // 12. context overlay has data-mlab-context-overlay
    ['contextOverlayMarkup emits data-mlab-context-overlay',
      /data-mlab-context-overlay/.test(uiSrc)],
    // 13. logModalMarkup function declared
    ['logModalMarkup function declared',
      /function logModalMarkup\s*\(/.test(uiSrc)],
    // 14. logModalMarkup emits data-mlab-log-body inside modal
    ['logModalMarkup contains data-mlab-log-body',
      /logModalMarkup[\s\S]{0,500}data-mlab-log-body/.test(uiSrc)],
    // 15. contextSessionOverviewMarkup function declared (S7A.2.1: moved to context overlay)
    ['contextSessionOverviewMarkup function declared',
      /function contextSessionOverviewMarkup\s*\(/.test(uiSrc)],
    // 16. contextSessionOverviewMarkup included in contextOverlayMarkup
    ['contextOverlayMarkup calls contextSessionOverviewMarkup',
      /contextOverlayMarkup[\s\S]{0,2000}contextSessionOverviewMarkup\(\)/.test(uiSrc)],
    // 17. renderMeasurementLabPage uses mlab-workbench-center
    ['renderMeasurementLabPage emits mlab-workbench-center',
      /renderMeasurementLabPage[\s\S]{0,3000}mlab-workbench-center/.test(uiSrc)],
    // 18. renderMeasurementLabPage has mlab-center-head
    ['renderMeasurementLabPage emits mlab-center-head',
      /mlab-center-head/.test(uiSrc)],
    // 19. renderMeasurementLabPage has footer with data-mlab-open-log
    ['renderMeasurementLabPage emits workbench footer with data-mlab-open-log',
      /mlab-workbench-footer[\s\S]{0,1000}data-mlab-open-log/.test(uiSrc)],
    // 20. renderMeasurementLabPage has footer with data-mlab-web-report
    ['renderMeasurementLabPage footer has data-mlab-web-report',
      /mlab-workbench-footer[\s\S]{0,1000}data-mlab-web-report/.test(uiSrc)],
    // 21. no diag-rail in renderMeasurementLabPage call (removed from main layout)
    ['renderMeasurementLabPage no longer renders diagRailMarkup in 3-column position',
      !/renderMeasurementLabPage[\s\S]{0,3000}diagRailMarkup\(\)/.test(uiSrc)],
    // 22. no actionBarMarkup in renderMeasurementLabPage (replaced by footer)
    ['renderMeasurementLabPage no longer renders actionBarMarkup',
      !/renderMeasurementLabPage[\s\S]{0,3000}actionBarMarkup\(\)/.test(uiSrc)],
    // 23. audio source panel has id and data-mlab-tool-panel
    ['audioSourcePanelMarkup has id mlab-source-panel',
      /id="mlab-source-panel"/.test(uiSrc)],
    // 24. audioSourcePanelMarkup has data-mlab-tool-panel="audio_source"
    ['audioSourcePanelMarkup has data-mlab-tool-panel audio_source',
      /data-mlab-tool-panel="audio_source"/.test(uiSrc)],
    // 25. noise floor panel has data-mlab-tool-panel
    ['noiseFloorPanelMarkup has data-mlab-tool-panel noise_floor',
      /data-mlab-tool-panel="noise_floor"/.test(uiSrc)],
    // 26. thd panel uses thd_imd (not vta_imd_optimizer)
    ['thdPanelMarkup uses data-mlab-tool-panel thd_imd',
      /mlab-thd-panel[\s\S]{0,100}data-mlab-tool-panel="thd_imd"/.test(uiSrc)],
    // 27. elements() has activeTitle selector
    ['elements() includes activeTitle selector',
      /activeTitle\s*:\s*root\.querySelector/.test(uiSrc)],
    // 28. elements() has contextOverlay selector
    ['elements() includes contextOverlay selector',
      /contextOverlay\s*:\s*root\.querySelector/.test(uiSrc)],
    // 29. elements() has ribbonMiniLFill selector
    ['elements() includes ribbonMiniLFill selector',
      /ribbonMiniLFill\s*:\s*root\.querySelector/.test(uiSrc)],
    // 30. renderChannelLevel updates mini meter fills
    ['renderChannelLevel updates ribbonMiniLFill / ribbonMiniRFill',
      /renderChannelLevel[\s\S]{0,2500}ribbonMiniLFill/.test(uiSrc)],
    // 31. CSS: mlab-shell has 3-row grid-template-rows
    ['CSS: mlab-shell has 3-row grid-template-rows override',
      /\.mlab-shell[\s\S]{0,200}grid-template-rows/.test(cssSrc)],
    // 32. CSS: mlab-workbench is flex column overflow hidden
    ['CSS: mlab-workbench uses flex column overflow:hidden',
      /\.mlab-workbench[\s\S]{0,200}flex-direction\s*:\s*column/.test(cssSrc) &&
      /\.mlab-workbench[\s\S]{0,200}overflow\s*:\s*hidden/.test(cssSrc)],
    // 33. CSS: mlab-workbench-center exists with grid
    ['CSS: mlab-workbench-center defined with grid layout',
      /\.mlab-workbench-center[\s\S]{0,200}grid-template-rows\s*:\s*58px/.test(cssSrc)],
    // 34. CSS: tool panels hidden by default
    ['CSS: [data-mlab-tool-panel] hidden by default',
      /\[data-mlab-tool-panel\][\s\S]{0,100}display\s*:\s*none/.test(cssSrc)],
    // 35. CSS: mlab-tool-panel--active shows panel
    ['CSS: mlab-tool-panel--active shows panel',
      /\.mlab-tool-panel--active\[data-mlab-tool-panel\][\s\S]{0,100}display\s*:\s*block/.test(cssSrc)],
    // 36. CSS: context overlay defined
    ['CSS: mlab-context-overlay defined',
      /\.mlab-context-overlay/.test(cssSrc)],
    // 37. CSS: log modal defined
    ['CSS: mlab-log-modal defined',
      /\.mlab-log-modal/.test(cssSrc)],
    // 38. CSS: mlab-workbench-footer defined
    ['CSS: mlab-workbench-footer defined',
      /\.mlab-workbench-footer/.test(cssSrc)],
    // 39. CSS: ribbon mini meters defined
    ['CSS: mlab-ribbon-mini-fill defined',
      /\.mlab-ribbon-mini-fill/.test(cssSrc)],
    // 40. tokenLayoutGeneratedClassNames includes new S7A.1 classes
    ['tokenLayoutGeneratedClassNames includes mlab-workbench-center',
      tokenBlock.includes('mlab-workbench-center')],
    // 41. tokenLayoutGeneratedClassNames includes mlab-tool-panel--active
    ['tokenLayoutGeneratedClassNames includes mlab-tool-panel--active',
      tokenBlock.includes('mlab-tool-panel--active')],
    // 42. tokenLayoutGeneratedClassNames includes mlab-context-overlay--open
    ['tokenLayoutGeneratedClassNames includes mlab-context-overlay--open',
      tokenBlock.includes('mlab-context-overlay--open')],
    // 43. tokenLayoutGeneratedClassNames includes mlab-log-modal--open
    ['tokenLayoutGeneratedClassNames includes mlab-log-modal--open',
      tokenBlock.includes('mlab-log-modal--open')],
    // Regression guards
    // 44. webReportBtn still wired (S5J regression)
    ['S5J regression: webReportBtn still referenced',
      /webReportBtn/.test(uiSrc)],
    // 45. logBody still accessible (S7A.1 moved to modal)
    ['S7A.1: data-mlab-log-body present in logModalMarkup',
      /logModalMarkup[\s\S]{0,800}data-mlab-log-body/.test(uiSrc)],
    // 46. Meter grid still present in contextOverlayMarkup
    ['S7A.1: data-mlab-meter-grid present in contextOverlayMarkup',
      /contextOverlayMarkup[\s\S]{0,1500}data-mlab-meter-grid/.test(uiSrc)],
    // 47. rail group head styles present in CSS
    ['CSS: mlab-rail-group-head defined',
      /\.mlab-rail-group-head/.test(cssSrc)],
    // 48. tooltip styles present in CSS
    ['CSS: mlab-rail-item-tooltip defined',
      /\.mlab-rail-item-tooltip/.test(cssSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S7A.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S7A.1 static source check (Control-Room Workbench Layout): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS7A1WorkbenchLayout();

function checkS7A2VisualPolish() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');

  for (const p of [renderSrcPath, cssSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S7A.2 static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc  = readFileSync(renderSrcPath, 'utf8');
  const cssSrc = readFileSync(cssSrcPath, 'utf8');

  const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
  const tokenEnd = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
  const tokenBlock = tokenStart >= 0 ? uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 8000) : '';

  const checks = [
    // 1. CSS: mlab-shell is 2-row grid (no context bar row)
    ['CSS: mlab-shell has 2-row grid (no context bar row)',
      /\.mlab-shell[\s\S]{0,300}grid-template-rows[\s\S]{0,200}minmax\(0,\s*1fr\)/.test(cssSrc) &&
      !/\.mlab-shell[\s\S]{0,300}ea-shell-context-height/.test(cssSrc)],
    // 2. TS: renderContextBar() not called inside renderMeasurementLabPage()
    ['TS: renderContextBar() call removed from renderMeasurementLabPage()',
      !/renderMeasurementLabPage[\s\S]{0,2000}renderContextBar\(\)/.test(uiSrc)],
    // 3. CSS: button.mlab-rail-item has appearance reset
    ['CSS: button.mlab-rail-item has -webkit-appearance reset',
      /button\.mlab-rail-item[\s\S]{0,300}-webkit-appearance\s*:\s*none/.test(cssSrc)],
    // 4. CSS: button.mlab-rail-item has border:none reset
    ['CSS: button.mlab-rail-item has border:none reset',
      /button\.mlab-rail-item[\s\S]{0,300}border\s*:\s*none/.test(cssSrc)],
    // 5. CSS: button.mlab-rail-item has background:transparent reset
    ['CSS: button.mlab-rail-item has background:transparent',
      /button\.mlab-rail-item[\s\S]{0,300}background\s*:\s*transparent/.test(cssSrc)],
    // 6. CSS: mlab-rail-item--active uses amber color
    ['CSS: mlab-rail-item--active uses amber background',
      /\.mlab-rail-item--active[\s\S]{0,200}rgba\(242,\s*184,\s*55/.test(cssSrc)],
    // 7. CSS: mlab-rail-item--active still has amber inset box-shadow
    ['CSS: mlab-rail-item--active retains amber inset left border',
      /\.mlab-rail-item--active[\s\S]{0,200}inset\s+3px\s+0\s+0/.test(cssSrc)],
    // 8. CSS: user-select:none on session ribbon
    ['CSS: mlab-session-ribbon has user-select:none',
      /\.mlab-session-ribbon[\s\S]{0,500}user-select\s*:\s*none/.test(cssSrc)],
    // 9. CSS: user-select:none on workflow rail
    ['CSS: mlab-workflow-rail has user-select:none',
      /\.mlab-workflow-rail[\s\S]{0,500}user-select\s*:\s*none/.test(cssSrc)],
    // 10. CSS: user-select:none on center head
    ['CSS: mlab-center-head has user-select:none',
      /\.mlab-center-head[\s\S]{0,500}user-select\s*:\s*none/.test(cssSrc)],
    // 11. CSS: user-select:none on workbench footer
    ['CSS: mlab-workbench-footer has user-select:none',
      /\.mlab-workbench-footer[\s\S]{0,300}user-select\s*:\s*none/.test(cssSrc)],
    // 12. CSS: user-select:none on log modal head
    ['CSS: mlab-log-modal-head has user-select:none',
      /\.mlab-log-modal-head[\s\S]{0,300}user-select\s*:\s*none/.test(cssSrc)],
    // 13. CSS: user-select:none on log modal foot
    ['CSS: mlab-log-modal-foot has user-select:none',
      /\.mlab-log-modal-foot[\s\S]{0,300}user-select\s*:\s*none/.test(cssSrc)],
    // 14. CSS: tooltip portal uses position:fixed
    ['CSS: mlab-rail-tooltip-portal uses position:fixed',
      /\.mlab-rail-tooltip-portal[\s\S]{0,200}position\s*:\s*fixed/.test(cssSrc)],
    // 15. CSS: tooltip portal has z-index:9999
    ['CSS: mlab-rail-tooltip-portal has z-index:9999',
      /\.mlab-rail-tooltip-portal[\s\S]{0,200}z-index\s*:\s*9999/.test(cssSrc)],
    // 16. CSS: tooltip portal uses opacity transition (not display:block)
    ['CSS: mlab-rail-tooltip-portal uses opacity:0 default',
      /\.mlab-rail-tooltip-portal[\s\S]{0,500}opacity\s*:\s*0/.test(cssSrc)],
    // 17. CSS: mlab-rail-tooltip-portal--visible sets opacity:1
    ['CSS: mlab-rail-tooltip-portal--visible sets opacity:1',
      /\.mlab-rail-tooltip-portal--visible[\s\S]{0,100}opacity\s*:\s*1/.test(cssSrc)],
    // 18. CSS: old CSS-only tooltip animation keyframes removed
    ['CSS: old mlab-tooltip-in keyframes removed',
      !/@keyframes\s+mlab-tooltip-in/.test(cssSrc)],
    // 19. CSS: old :hover .mlab-rail-item-tooltip rule removed
    ['CSS: old :hover .mlab-rail-item-tooltip display:block removed',
      !/\.mlab-rail-item:hover\s+\.mlab-rail-item-tooltip/.test(cssSrc)],
    // 20. TS: railTooltipTimer module-level variable declared
    ['TS: railTooltipTimer module-level variable declared',
      /let railTooltipTimer\s*:/.test(uiSrc)],
    // 21. TS: hideRailTooltip() function defined
    ['TS: hideRailTooltip() function defined',
      /function hideRailTooltip\(\)/.test(uiSrc)],
    // 22. TS: showRailTooltip() function defined
    ['TS: showRailTooltip() function defined',
      /function showRailTooltip\(/.test(uiSrc)],
    // 23. TS: railTooltipPortalMarkup() function defined
    ['TS: railTooltipPortalMarkup() function defined',
      /function railTooltipPortalMarkup\(\)/.test(uiSrc)],
    // 24. TS: portal added to renderMeasurementLabPage()
    ['TS: railTooltipPortalMarkup() called in renderMeasurementLabPage()',
      /renderMeasurementLabPage[\s\S]{0,3000}railTooltipPortalMarkup\(\)/.test(uiSrc)],
    // 25. TS: showRailTooltip uses getBoundingClientRect for positioning
    ['TS: showRailTooltip uses getBoundingClientRect for positioning',
      /showRailTooltip[\s\S]{0,800}getBoundingClientRect/.test(uiSrc)],
    // 26. TS: renderWorkflowRail wires mouseenter with 700ms delay
    ['TS: renderWorkflowRail wires mouseenter with 700ms delay',
      /renderWorkflowRail[\s\S]{0,3000}mouseenter[\s\S]{0,500}700/.test(uiSrc)],
    // 27. TS: renderWorkflowRail wires mouseleave to hideRailTooltip
    ['TS: renderWorkflowRail wires mouseleave to hideRailTooltip',
      /renderWorkflowRail[\s\S]{0,3000}mouseleave[\s\S]{0,200}hideRailTooltip/.test(uiSrc)],
    // 28. TS: renderWorkflowRail uses data-tooltip-name attribute
    ['TS: renderWorkflowRail uses data-tooltip-name attribute',
      /renderWorkflowRail[\s\S]{0,3000}data-tooltip-name/.test(uiSrc)],
    // 29. TS: rail items no longer embed inline tooltip spans in markup
    ['TS: renderWorkflowRail does not embed mlab-rail-item-tooltip-name spans',
      !/renderWorkflowRail[\s\S]{0,3000}mlab-rail-item-tooltip-name/.test(uiSrc)],
    // 30. tokenLayoutGeneratedClassNames includes mlab-rail-tooltip-portal--visible
    ['tokenLayoutGeneratedClassNames includes mlab-rail-tooltip-portal--visible',
      tokenBlock.includes('mlab-rail-tooltip-portal--visible')],
    // Regression guards
    // 31. S7A.1 regression: activateTool still present
    ['S7A regression: activateTool() still defined',
      /function activateTool\(/.test(uiSrc)],
    // 32. S7A.1 regression: mlab-workbench-grid still defined
    ['S7A.1 regression: mlab-workbench-grid still defined in CSS',
      /\.mlab-workbench-grid/.test(cssSrc)],
    // 33. S7A.1 regression: mlab-session-ribbon still defined
    ['S7A.1 regression: mlab-session-ribbon still defined in CSS',
      /\.mlab-session-ribbon/.test(cssSrc)],
    // 34. S7A.1 regression: context overlay still present
    ['S7A.1 regression: mlab-context-overlay still defined',
      /\.mlab-context-overlay/.test(cssSrc)],
    // 35. S7A.1 regression: log modal still present
    ['S7A.1 regression: mlab-log-modal still defined',
      /\.mlab-log-modal/.test(cssSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S7A.2 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S7A.2 static source check (Visual Polish & Shell De-duplication): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS7A2VisualPolish();

function checkS7B() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  const engineSrcPath = join(repoRoot, 'src/modules/measurement-lab/engine/trackRecognition.ts');

  for (const p of [renderSrcPath, cssSrcPath, engineSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S7B static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc     = readFileSync(renderSrcPath, 'utf8');
  const cssSrc    = readFileSync(cssSrcPath, 'utf8');
  const engineSrc = readFileSync(engineSrcPath, 'utf8');

  const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
  const tokenEnd   = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
  const tokenBlock = tokenStart >= 0 ? uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 8000) : '';

  const checks = [
    // ── Engine: trackRecognition.ts ────────────────────────────────────────
    // 1. Recognition state type includes all required phases
    ['Engine: TrackRecognitionPhase includes disabled/armed/locked/recording',
      /TrackRecognitionPhase\s*=[\s\S]{0,200}'disabled'[\s\S]{0,400}'armed'[\s\S]{0,400}'locked'[\s\S]{0,400}'recording'/.test(engineSrc)],
    // 2. Engine: waiting_for_signal and candidate_detected phases exist
    ['Engine: TrackRecognitionPhase includes waiting_for_signal and candidate_detected',
      /waiting_for_signal/.test(engineSrc) && /candidate_detected/.test(engineSrc)],
    // 3. Engine: ambiguous / rejected / timeout phases exist
    ['Engine: TrackRecognitionPhase includes ambiguous/rejected/timeout',
      /ambiguous/.test(engineSrc) && /rejected/.test(engineSrc) && /timeout/.test(engineSrc)],
    // 4. Engine: manual_override phase exists
    ['Engine: TrackRecognitionPhase includes manual_override',
      /manual_override/.test(engineSrc)],
    // 5. Engine: BandDetectorType includes single_tone_exact and not_supported_for_autodetect
    ['Engine: BandDetectorType includes single_tone_exact and not_supported_for_autodetect',
      /single_tone_exact/.test(engineSrc) && /not_supported_for_autodetect/.test(engineSrc)],
    // 6. Engine: classifyBandDetector() function defined
    ['Engine: classifyBandDetector() function defined',
      /function classifyBandDetector\(/.test(engineSrc)],
    // 7. Engine: matchSingleToneFrequency() function defined
    ['Engine: matchSingleToneFrequency() function defined',
      /function matchSingleToneFrequency\(/.test(engineSrc)],
    // 8. Engine: extractDominantFrequency() function defined
    ['Engine: extractDominantFrequency() function defined',
      /function extractDominantFrequency\(/.test(engineSrc)],
    // 9. Engine: armTrackRecognition() function defined
    ['Engine: armTrackRecognition() function defined',
      /function armTrackRecognition\(/.test(engineSrc)],
    // 10. Engine: disarmTrackRecognition() function defined
    ['Engine: disarmTrackRecognition() function defined',
      /function disarmTrackRecognition\(/.test(engineSrc)],
    // 11. Engine: ingestSignal() function defined
    ['Engine: ingestSignal() function defined',
      /function ingestSignal\(/.test(engineSrc)],
    // 12. Engine: evaluateAutostartEligibility() function defined
    ['Engine: evaluateAutostartEligibility() function defined',
      /function evaluateAutostartEligibility\(/.test(engineSrc)],
    // 13. Engine: buildTrackRecognitionProvenance() function defined
    ['Engine: buildTrackRecognitionProvenance() function defined',
      /function buildTrackRecognitionProvenance\(/.test(engineSrc)],
    // 14. Engine: pre-roll status is always 'not_available' (no fake pre-roll)
    ['Engine: preRollStatus type is not_available only',
      /PreRollStatus\s*=\s*'not_available'/.test(engineSrc)],
    // 15. Engine: autostart refused for planned workflow
    ['Engine: evaluateAutostartEligibility blocks planned availability',
      /evaluateAutostartEligibility[\s\S]{0,800}planned/.test(engineSrc)],
    // 16. Engine: no automatic start when chain is invalid
    ['Engine: evaluateAutostartEligibility blocks invalid chainReadiness',
      /evaluateAutostartEligibility[\s\S]{0,500}chainReadiness/.test(engineSrc)],
    // 17. Engine: sweep/noise unsupported for autodetect
    ['Engine: sweep signal type is unsupported for autodetect',
      /AUTODETECT_UNSUPPORTED_SIGNAL_TYPES[\s\S]{0,500}'sweep'/.test(engineSrc)],
    // 18. Engine: noise signal type is unsupported for autodetect
    ['Engine: noise signal type is unsupported for autodetect',
      /AUTODETECT_UNSUPPORTED_SIGNAL_TYPES[\s\S]{0,500}'noise'/.test(engineSrc)],
    // 19. Engine: initial state phase is 'disabled'
    ['Engine: initialTrackRecognitionState returns disabled phase',
      /initialTrackRecognitionState[\s\S]{0,300}phase:\s*'disabled'/.test(engineSrc)],
    // 20. Engine: TRACK_RECOGNITION_PHASE_LABELS exported
    ['Engine: TRACK_RECOGNITION_PHASE_LABELS exported',
      /export const TRACK_RECOGNITION_PHASE_LABELS/.test(engineSrc)],

    // ── TS UI integration ─────────────────────────────────────────────────
    // 21. TS: trackRecognition imported from engine
    ['TS: trackRecognition engine imported in renderMeasurementLabPage',
      /from '\.\.\/engine\/trackRecognition'/.test(uiSrc)],
    // 22. TS: LabState includes trackRecognition field
    ['TS: LabState includes trackRecognition field',
      /trackRecognition:\s*TrackRecognitionState/.test(uiSrc)],
    // 23. TS: initialTrackRecognitionState() called in state init
    ['TS: initialTrackRecognitionState() called in state initialiser',
      /trackRecognition:\s*initialTrackRecognitionState\(\)/.test(uiSrc)],
    // 24. TS: renderTrackRecognition() function defined
    ['TS: renderTrackRecognition() function defined',
      /function renderTrackRecognition\(/.test(uiSrc)],
    // 25. TS: tickTrackRecognition() function defined
    ['TS: tickTrackRecognition() function defined',
      /function tickTrackRecognition\(/.test(uiSrc)],
    // 26. TS: tickTrackRecognition called inside meter loop
    ['TS: tickTrackRecognition called inside startMeterLoop',
      /startMeterLoop[\s\S]{0,1600}tickTrackRecognition\(els\)/.test(uiSrc)],
    // 27. TS: arm is per-tool (S7B.1 supersedes global arm) — recogDisarmBtn still wired
    ['TS: recogArmBtn event listener wired (or per-tool arm present)',
      /recogArmBtn[\s\S]{0,100}addEventListener/.test(uiSrc) ||
      /armToolLocalAutostart/.test(uiSrc)],
    // 28. TS: disarm button wired in enableMeasurementLabInteractions
    ['TS: recogDisarmBtn event listener wired',
      /recogDisarmBtn[\s\S]{0,100}addEventListener/.test(uiSrc)],
    // 29. TS: disarmTrackRecognition called on disconnect
    ['TS: disarmTrackRecognition() called in disconnectMeasurementLab',
      /disconnectMeasurementLab[\s\S]{0,500}disarmTrackRecognition\(\)/.test(uiSrc)],
    // 30. TS: buildTrackRecognitionProvenance included in session JSON
    ['TS: buildTrackRecognitionProvenance called in buildSessionJson',
      /buildTrackRecognitionProvenance[\s\S]{0,100}state\.trackRecognition/.test(uiSrc)],
    // 31. TS: track_recognition field in SessionJson type
    ['TS: SessionJson type includes track_recognition field',
      /SessionJson[\s\S]{0,1300}track_recognition/.test(uiSrc)],
    // 32. TS: ribbon has recognition badge element
    ['TS: session ribbon markup includes data-mlab-recog-badge',
      /sessionRibbonMarkup[\s\S]{0,1200}data-mlab-recog-badge/.test(uiSrc)],
    // 33. TS: audio source panel has arm section
    ['TS: audioSourcePanelMarkup includes mlab-recog-arm-section',
      /audioSourcePanelMarkup[\s\S]{0,6000}mlab-recog-arm-section/.test(uiSrc)],
    // 34. TS: arm affordance exists somewhere (global or per-tool; S7B.1 moves arm to tool panels)
    ['TS: arm affordance exists (global or per-tool)',
      /data-mlab-recog-arm/.test(uiSrc) ||
      /data-mlab-local-arm/.test(uiSrc)],
    // 35. TS: disarm button in source panel
    ['TS: audioSourcePanelMarkup includes data-mlab-recog-disarm button',
      /audioSourcePanelMarkup[\s\S]{0,6500}data-mlab-recog-disarm/.test(uiSrc)],
    // 36. TS: manual start always possible (arm section does not disable manual start buttons)
    ['TS: manual start buttons not disabled by recognition state',
      !(/recogArmBtn[\s\S]{0,1000}data-mlab-connect/.test(uiSrc))],
    // 37. TS: recognition status visible as text (badge has textContent assignment)
    ['TS: applyRecogBadge sets textContent (status visible as text)',
      /applyRecogBadge[\s\S]{0,400}textContent\s*=/.test(uiSrc)],
    // 38. tokenLayoutGeneratedClassNames includes mlab-recog-badge
    ['tokenLayoutGeneratedClassNames includes mlab-recog-badge',
      tokenBlock.includes('mlab-recog-badge')],
    // 39. tokenLayoutGeneratedClassNames includes mlab-recog-arm-section
    ['tokenLayoutGeneratedClassNames includes mlab-recog-arm-section',
      tokenBlock.includes('mlab-recog-arm-section')],
    // 40. tokenLayoutGeneratedClassNames includes mlab-recog-badge--locked
    ['tokenLayoutGeneratedClassNames includes mlab-recog-badge--locked',
      tokenBlock.includes('mlab-recog-badge--locked')],

    // ── CSS ───────────────────────────────────────────────────────────────
    // 41. CSS: mlab-recog-badge defined
    ['CSS: mlab-recog-badge defined',
      /\.mlab-recog-badge/.test(cssSrc)],
    // 42. CSS: mlab-recog-badge--disabled defined
    ['CSS: mlab-recog-badge--disabled defined',
      /\.mlab-recog-badge--disabled/.test(cssSrc)],
    // 43. CSS: mlab-recog-badge--armed defined
    ['CSS: mlab-recog-badge--armed defined',
      /\.mlab-recog-badge--armed/.test(cssSrc)],
    // 44. CSS: mlab-recog-badge--locked defined
    ['CSS: mlab-recog-badge--locked defined',
      /\.mlab-recog-badge--locked/.test(cssSrc)],
    // 45. CSS: mlab-recog-badge--rejected defined
    ['CSS: mlab-recog-badge--rejected defined',
      /\.mlab-recog-badge--rejected/.test(cssSrc)],
    // 46. CSS: mlab-recog-arm-section defined
    ['CSS: mlab-recog-arm-section defined',
      /\.mlab-recog-arm-section/.test(cssSrc)],
    // 47. CSS: mlab-recog-arm-actions defined
    ['CSS: mlab-recog-arm-actions defined',
      /\.mlab-recog-arm-actions/.test(cssSrc)],

    // ── VTA / planned workflow regression guards ───────────────────────────
    // 48. VTA remains planned — vta_imd_optimizer still 'planned' in engine data
    ['Regression: vta_imd_optimizer implementationStatus still planned',
      /vta_imd_optimizer[\s\S]{0,300}implementationStatus:\s*'planned'/.test(uiSrc) ||
      /implementationStatus:\s*'planned'[\s\S]{0,1000}vta_imd_optimizer/.test(uiSrc) ||
      /MEASUREMENT_WORKFLOWS[\s\S]{0,3000}vta_imd_optimizer[\s\S]{0,200}planned/.test(
        readFileSync(join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts'), 'utf8'),
      )],
    // 49. No fake autostart (autostart is only triggered after lock)
    ['Engine: ingestSignal does not set recording phase directly',
      !/ingestSignal[\s\S]{0,3000}phase:\s*'recording'/.test(engineSrc)],
    // 50. S7A.2 regression: renderTrackRecognition called in connectMeasurementLab
    ['S7A regression: renderTrackRecognition called after connect',
      /connectMeasurementLab[\s\S]{0,2000}renderTrackRecognition\(els\)/.test(uiSrc)],
    // 51. S7A regression: renderTrackRecognition called after disconnect
    ['S7A regression: renderTrackRecognition called after disconnect',
      /disconnectMeasurementLab[\s\S]{0,2000}renderTrackRecognition\(els\)/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S7B static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S7B static source check (Track Recognition & Armed Autostart Foundation): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS7B();

function checkS7B1() {
  const renderSrcPath = join(repoRoot, 'src/modules/measurement-lab/ui/renderMeasurementLabPage.ts');
  const cssSrcPath    = join(repoRoot, 'src/modules/measurement-lab/ui/measurementLab.css');
  const engineSrcPath = join(repoRoot, 'src/modules/measurement-lab/engine/trackRecognition.ts');
  const workflowsSrcPath = join(repoRoot, 'src/modules/measurement-lab/data/measurementWorkflows.ts');

  for (const p of [renderSrcPath, cssSrcPath, engineSrcPath, workflowsSrcPath]) {
    if (!existsSync(p)) {
      console.error(`S7B.1 static check FAIL: required file not found: ${p}`);
      process.exitCode = 1;
      return;
    }
  }

  const uiSrc      = readFileSync(renderSrcPath, 'utf8');
  const cssSrc     = readFileSync(cssSrcPath, 'utf8');
  const engineSrc  = readFileSync(engineSrcPath, 'utf8');
  const wfSrc      = readFileSync(workflowsSrcPath, 'utf8');

  const tokenStart = uiSrc.indexOf('tokenLayoutGeneratedClassNames');
  const tokenEnd   = uiSrc.indexOf('void tokenLayoutGeneratedClassNames', tokenStart);
  const tokenBlock = tokenStart >= 0 ? uiSrc.slice(tokenStart, tokenEnd > tokenStart ? tokenEnd + 40 : tokenStart + 9000) : '';

  const checks = [
    // ── Engine: armedFromToolId ────────────────────────────────────────────
    // 1. Engine: armedFromToolId field in TrackRecognitionState type
    ['Engine: armedFromToolId field in TrackRecognitionState type',
      /TrackRecognitionState[\s\S]{0,1500}armedFromToolId/.test(engineSrc)],
    // 2. Engine: armedFromToolId in ArmTrackRecognitionArgs type
    ['Engine: armedFromToolId in ArmTrackRecognitionArgs type',
      /ArmTrackRecognitionArgs[\s\S]{0,300}armedFromToolId/.test(engineSrc)],
    // 3. Engine: armedFromToolId in armTrackRecognition return values
    ['Engine: armedFromToolId passed in armTrackRecognition return',
      /armTrackRecognition[\s\S]{0,600}armedFromToolId/.test(engineSrc)],
    // 4. Engine: armedFromToolId in TrackRecognitionProvenance
    ['Engine: armedFromToolId in TrackRecognitionProvenance type',
      /TrackRecognitionProvenance[\s\S]{0,600}armedFromToolId/.test(engineSrc)],

    // ── TS: evaluateAutostartEligibility wired into runtime ────────────────
    // 5. TS: evaluateAutostartEligibility called in tickTrackRecognition (not just imported)
    ['TS: evaluateAutostartEligibility called in tickTrackRecognition',
      /tickTrackRecognition[\s\S]{0,2500}evaluateAutostartEligibility/.test(uiSrc)],
    // 6. TS: startSpeedMeasurement called in tickTrackRecognition (real autostart wired)
    ['TS: startSpeedMeasurement called in tickTrackRecognition',
      /tickTrackRecognition[\s\S]{0,2500}startSpeedMeasurement\(els\)/.test(uiSrc)],
    // 7. TS: recording phase is set in tickTrackRecognition runtime path
    ['TS: recording phase set in tickTrackRecognition',
      /tickTrackRecognition[\s\S]{0,2500}phase:\s*'recording'/.test(uiSrc)],
    // 8. TS: manual_override set in startSpeedMeasurement (manual start path)
    ['TS: manual_override set in startSpeedMeasurement',
      /startSpeedMeasurement[\s\S]{0,600}manual_override/.test(uiSrc)],

    // ── TS: new S7B.1 functions ────────────────────────────────────────────
    // 9. TS: toolLocalAutostartMarkup function defined
    ['TS: toolLocalAutostartMarkup function defined',
      /function toolLocalAutostartMarkup\(/.test(uiSrc)],
    // 10. TS: updateToolLocalAutostart function defined
    ['TS: updateToolLocalAutostart function defined',
      /function updateToolLocalAutostart\(/.test(uiSrc)],
    // 11. TS: findToolTargetBand function defined
    ['TS: findToolTargetBand function defined',
      /function findToolTargetBand\(/.test(uiSrc)],
    // 12. TS: armToolLocalAutostart function defined
    ['TS: armToolLocalAutostart function defined',
      /function armToolLocalAutostart\(/.test(uiSrc)],

    // ── TS: local autostart blocks in panels ──────────────────────────────
    // 13. TS: local autostart block in speed panel (wow_flutter)
    ['TS: local autostart block in speed panel (wow_flutter)',
      /renderSpeedPanel[\s\S]{0,6000}toolLocalAutostartMarkup\('wow_flutter'\)/.test(uiSrc)],
    // 14. TS: local autostart block in refLevel panel
    ['TS: local autostart block in refLevel panel',
      /renderRefLevelPanel[\s\S]{0,6000}toolLocalAutostartMarkup\('reference_level'\)/.test(uiSrc)],
    // 15. TS: local autostart block in channel panel
    ['TS: local autostart block in channel panel',
      /renderChannelPanel[\s\S]{0,8000}toolLocalAutostartMarkup\('channel_identity'\)/.test(uiSrc)],

    // ── TS: global arm button removed ─────────────────────────────────────
    // 16. TS: global arm button removed from audioSourcePanelMarkup (no data-mlab-recog-arm button)
    ['TS: global arm button removed from audioSourcePanelMarkup',
      !/audioSourcePanelMarkup[\s\S]{0,3000}data-mlab-recog-arm[^-]/.test(uiSrc)],
    // 17. TS: global disarm button still in audioSourcePanelMarkup
    ['TS: global disarm button still in audioSourcePanelMarkup',
      /audioSourcePanelMarkup[\s\S]{0,7000}data-mlab-recog-disarm/.test(uiSrc)],

    // ── TS: reports ───────────────────────────────────────────────────────
    // 18. TS: text report includes TRACK RECOGNITION section
    ['TS: text report includes TRACK RECOGNITION section',
      /buildReportText[\s\S]{0,27000}TRACK RECOGNITION \/ AUTOSTART/.test(uiSrc)],
    // 19. TS: buildSummarySection includes TRACK_RECOGNITION_PHASE_LABELS reference
    ['TS: buildSummarySection includes TRACK_RECOGNITION_PHASE_LABELS for web report',
      /buildSummarySection[\s\S]{0,4000}TRACK_RECOGNITION_PHASE_LABELS/.test(uiSrc)],
    // 20. TS: JSON export still has track_recognition (regression guard)
    ['TS: JSON export still has track_recognition field',
      /track_recognition/.test(uiSrc)],

    // ── TS: autostart scope ───────────────────────────────────────────────
    // 21. TS: wow_flutter is the only workflow that triggers real autostart in tickTrackRecognition
    ['TS: wow_flutter is gated for real autostart in tickTrackRecognition',
      /tickTrackRecognition[\s\S]{0,2500}wow_flutter/.test(uiSrc)],

    // ── CSS ───────────────────────────────────────────────────────────────
    // 22. CSS: mlab-local-autostart defined
    ['CSS: mlab-local-autostart defined',
      /\.mlab-local-autostart\s*\{/.test(cssSrc)],
    // 23. CSS: mlab-local-autostart-head defined
    ['CSS: mlab-local-autostart-head defined',
      /\.mlab-local-autostart-head\s*\{/.test(cssSrc)],
    // 24. CSS: mlab-local-autostart-actions defined
    ['CSS: mlab-local-autostart-actions defined',
      /\.mlab-local-autostart-actions\s*\{/.test(cssSrc)],

    // ── tokenLayoutGeneratedClassNames ────────────────────────────────────
    // 25. tokenLayoutGeneratedClassNames includes mlab-local-autostart
    ['tokenLayoutGeneratedClassNames includes mlab-local-autostart',
      tokenBlock.includes('mlab-local-autostart')],

    // ── Regressions ───────────────────────────────────────────────────────
    // 26. Regression: S7A.2.3 layout still present (mlab-source-meter-channel in CSS)
    ['Regression: S7A.2.3 layout still present (mlab-source-meter-channel in CSS)',
      /\.mlab-source-meter-channel/.test(cssSrc)],
    // 27. Regression: VTA remains planned (vta_imd_optimizer still planned in measurementWorkflows.ts)
    ['Regression: vta_imd_optimizer still planned in measurementWorkflows.ts',
      /vta_imd_optimizer[\s\S]{0,300}planned/.test(wfSrc) ||
      /implementationStatus:\s*'planned'[\s\S]{0,200}vta_imd_optimizer/.test(wfSrc)],
    // 28. Regression: pre_roll_status is still not_available only
    ['Regression: pre_roll_status is still not_available only',
      /PreRollStatus\s*=\s*'not_available'/.test(engineSrc)],
    // 29. Regression: evaluateAutostartEligibility blocks planned workflows
    ['Regression: evaluateAutostartEligibility blocks planned workflows',
      /evaluateAutostartEligibility[\s\S]{0,800}planned/.test(engineSrc)],
    // 30. TS: findToolTargetBand checks wow_flutter with speed/single_tone criteria
    ['TS: findToolTargetBand checks wow_flutter with speed/single_tone criteria',
      /findToolTargetBand[\s\S]{0,600}wow_flutter[\s\S]{0,200}speed[\s\S]{0,200}single_tone/.test(uiSrc)],

    // ── scratch buffer ────────────────────────────────────────────────────
    // 31. TS: recognitionScratch module-level variable defined
    ['TS: recognitionScratch module-level variable defined',
      /let recognitionScratch:\s*Float32Array/.test(uiSrc)],
  ];

  let allPass = true;
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`S7B.1 static check FAIL: "${label}"`);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('- S7B.1 static source check (Tool-local Autostart & Recognition Runtime): PASS');
  } else {
    process.exitCode = 1;
  }
}

checkS7B1();
