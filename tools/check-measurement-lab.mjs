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

try {
  await runChecks();
} catch (error) {
  console.error('FAIL measurement lab engine checks:', error.message || error);
  process.exitCode = 1;
}
