/*
 * Inverse-RIAA filter for the Measurement Lab.
 *
 * Background. A vinyl recording is graved with the RIAA pre-emphasis
 * curve: low frequencies cut, high frequencies boosted. The playback
 * chain (the phono pre-amp) applies the inverse — the RIAA playback
 * curve — to restore a flat spectrum. When the user feeds the lab a
 * signal that has already been through a phono pre-amp, the audible
 * spectrum on the cartridge is reconstructed and frequency-response
 * analysis is meaningful as-is. When the user instead feeds the raw
 * cartridge directly into a high-gain ADC (without a phono stage),
 * the captured signal is still pre-emphasised and must be RIAA-de-
 * emphasised in software before any frequency-response analysis is
 * trustworthy. This module computes that software de-emphasis.
 *
 * The label "iRIAA" follows the conventional audio-engineering use:
 * "inverse RIAA" sometimes refers to the recording curve and some-
 * times to the playback curve. In Engrove we use it for the curve
 * applied at playback / analysis time, i.e. the standard RIAA
 * playback de-emphasis. The reference values produced by the helpers
 * below match the canonical RIAA playback table (0 dB at 1 kHz,
 * +19.27 dB at 20 Hz, -19.62 dB at 20 kHz, no Neumann extension).
 *
 * Implementation. The analog transfer function is the canonical
 * 3-time-constant RIAA playback curve
 *
 *   H(s) = (1 + s*t2) / [(1 + s*t1) * (1 + s*t3)]
 *
 * with t1 = 3180 us, t2 = 318 us, t3 = 75 us. The Neumann pole at
 * 50 kHz (t4 = 3.18 us) that some recording chains include is
 * intentionally omitted: virtually every analog phono pre-amp
 * implements the 3-time-constant form, the published reference
 * table is the 3-time-constant table, and dropping the fourth pole
 * keeps every singularity well below Nyquist so bilinear distortion
 * is invisible across the audible band. The result is a 2nd-order
 * IIR with three feedforward and three feedback coefficients,
 * normalised so the gain at 1 kHz is exactly 0 dB.
 *
 * The exported helpers are pure functions with no Web Audio
 * dependency so the same code is exercised by the CI gate in
 * tools/check-measurement-lab.mjs.
 */

export const riaaTimeConstantsSeconds = {
  t1: 3180e-6,
  t2: 318e-6,
  t3: 75e-6,
} as const;

export const riaaReferenceFrequencyHz = 1000;

export type RiaaCoefficients = {
  readonly feedforward: readonly number[];
  readonly feedback: readonly number[];
};

type Complex = { readonly re: number; readonly im: number };

function complexMultiply(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function complexDivide(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function complexMagnitude(value: Complex): number {
  return Math.hypot(value.re, value.im);
}

function analogRiaaTransfer(omega: number): Complex {
  const { t1, t2, t3 } = riaaTimeConstantsSeconds;
  const num: Complex = { re: 1, im: omega * t2 };
  const denomFactor1: Complex = { re: 1, im: omega * t1 };
  const denomFactor2: Complex = { re: 1, im: omega * t3 };
  const denom = complexMultiply(denomFactor1, denomFactor2);
  return complexDivide(num, denom);
}

/*
 * Magnitude of the playback RIAA curve, normalised to 0 dB at 1 kHz.
 * Returns dB. Pure function, no Web Audio API.
 */
export function computeRiaaMagnitudeDb(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const omega = 2 * Math.PI * frequencyHz;
  const omegaRef = 2 * Math.PI * riaaReferenceFrequencyHz;
  const magnitude = complexMagnitude(analogRiaaTransfer(omega));
  const reference = complexMagnitude(analogRiaaTransfer(omegaRef));
  return 20 * Math.log10(magnitude / reference);
}

/*
 * Discrete-time IIR coefficients for the playback RIAA curve at the
 * given sample rate. Bilinear transform of the 3-pole 1-zero analog
 * prototype, normalised so the digital filter has unity gain at 1 kHz.
 *
 * The returned arrays are arranged for Web Audio's IIRFilterNode:
 *   feedforward = [b0, b1, b2, b3] applied to x[n], x[n-1], ...
 *   feedback    = [1,  a1, a2, a3] applied to y[n], y[n-1], ...
 *
 * That convention matches the IIRFilterNode contract: feedback[0] is
 * always 1 after normalisation and the recurrence is
 *
 *   y[n] = sum_i (feedforward[i] * x[n-i]) - sum_i (feedback[i] * y[n-i])
 *
 * for i = 1..3 in the feedback sum.
 */
export function computeIriaaIirCoefficients(sampleRateHz: number): RiaaCoefficients {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new RangeError('sampleRateHz must be a positive finite number.');
  }
  const { t1, t2, t3 } = riaaTimeConstantsSeconds;
  const k = 2 * sampleRateHz;

  // Numerator: (1 + t2*s) bilinear-transformed and multiplied by (z+1)
  // to match the denominator's degree-2 expansion below.
  //   (1 + t2*s) -> ((1 + t2*k)*z + (1 - t2*k)) / (z+1)
  // Multiply by (z+1):
  //   ((1 + t2*k)*z + (1 - t2*k)) * (z + 1)
  //   = (1 + t2*k)*z^2 + ((1 + t2*k) + (1 - t2*k))*z + (1 - t2*k)
  //   = (1 + t2*k)*z^2 + 2*z + (1 - t2*k)
  const num0 = 1 + t2 * k;
  const num1 = 2;
  const num2 = 1 - t2 * k;

  // Denominator: (1 + t1*s)(1 + t3*s). After bilinear and clearing
  // (z+1)^2 each factor becomes ((1 + ti*k)*z + (1 - ti*k)). The
  // product is degree 2.
  const d1A = 1 + t1 * k; const d1B = 1 - t1 * k;
  const d3A = 1 + t3 * k; const d3B = 1 - t3 * k;
  const den0 = d1A * d3A;
  const den1 = d1A * d3B + d1B * d3A;
  const den2 = d1B * d3B;

  // Normalise by den0 so feedback[0] = 1 (IIRFilterNode convention).
  const a0 = den0;
  const rawFeedforward = [num0 / a0, num1 / a0, num2 / a0];
  const rawFeedback = [1, den1 / a0, den2 / a0];

  // Compute the discrete-time gain at the 1 kHz reference and scale
  // the feedforward path so the final filter is unity-gain there.
  const refMag = discreteMagnitude(rawFeedforward, rawFeedback, riaaReferenceFrequencyHz, sampleRateHz);
  if (!Number.isFinite(refMag) || refMag <= 0) {
    throw new Error('Failed to normalise iRIAA filter at the 1 kHz reference frequency.');
  }
  const scale = 1 / refMag;
  return {
    feedforward: rawFeedforward.map((value) => value * scale),
    feedback: rawFeedback,
  };
}

function discreteMagnitude(
  feedforward: readonly number[],
  feedback: readonly number[],
  frequencyHz: number,
  sampleRateHz: number,
): number {
  const theta = (2 * Math.PI * frequencyHz) / sampleRateHz;
  let num: Complex = { re: 0, im: 0 };
  for (let i = 0; i < feedforward.length; i += 1) {
    const angle = -i * theta;
    num = {
      re: num.re + feedforward[i] * Math.cos(angle),
      im: num.im + feedforward[i] * Math.sin(angle),
    };
  }
  let den: Complex = { re: 0, im: 0 };
  for (let i = 0; i < feedback.length; i += 1) {
    const angle = -i * theta;
    den = {
      re: den.re + feedback[i] * Math.cos(angle),
      im: den.im + feedback[i] * Math.sin(angle),
    };
  }
  return complexMagnitude(complexDivide(num, den));
}

/*
 * Discrete-time magnitude of the iRIAA filter in dB. Pure function;
 * used both by the in-browser display and by the CI gate.
 */
export function computeIriaaDiscreteMagnitudeDb(
  coefficients: RiaaCoefficients,
  frequencyHz: number,
  sampleRateHz: number,
): number {
  const magnitude = discreteMagnitude(coefficients.feedforward, coefficients.feedback, frequencyHz, sampleRateHz);
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return 20 * Math.log10(magnitude);
}

/*
 * Run an IIR filter sample-by-sample over an input buffer. Pure
 * function over Float64 maths so the CI gate can validate the live
 * coefficients against a synthesised reference signal without spinning
 * up a Web Audio context.
 */
export function applyIirFilter(
  coefficients: RiaaCoefficients,
  input: readonly number[] | Float32Array | Float64Array,
): Float64Array {
  const { feedforward, feedback } = coefficients;
  if (feedback[0] !== 1) {
    throw new Error('feedback[0] must equal 1 (filter must be normalised).');
  }
  const out = new Float64Array(input.length);
  for (let n = 0; n < input.length; n += 1) {
    let acc = 0;
    for (let i = 0; i < feedforward.length; i += 1) {
      const x = n - i >= 0 ? input[n - i] : 0;
      acc += feedforward[i] * x;
    }
    for (let i = 1; i < feedback.length; i += 1) {
      const y = n - i >= 0 ? out[n - i] : 0;
      acc -= feedback[i] * y;
    }
    out[n] = acc;
  }
  return out;
}
