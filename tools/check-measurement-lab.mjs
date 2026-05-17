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

try {
  await runChecks();
} catch (error) {
  console.error('FAIL measurement lab engine checks:', error.message || error);
  process.exitCode = 1;
}
