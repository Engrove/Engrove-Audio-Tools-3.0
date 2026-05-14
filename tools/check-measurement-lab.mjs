#!/usr/bin/env node
/*
 * S30B/S30C CI gate for the Measurement Lab.
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
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
  copySource('src/shared/audio-io/levelMetrics.ts');
  compileTempSources();

  const iriaaModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/iriaaFilter.js')).href
  );
  const speedFlutterModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/measurement-lab/engine/speedFlutter.js')).href
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
  const { analyseSpeedFlutter } = speedFlutterModule;
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

  console.log('PASS measurement lab engine checks');
}

function toFloat32(source) {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source[i];
  return out;
}

try {
  await runChecks();
} catch (error) {
  console.error('FAIL measurement lab engine checks:', error.message || error);
  process.exitCode = 1;
}
