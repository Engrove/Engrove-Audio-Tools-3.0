/*
 * Channel balance and crosstalk engine for the Measurement Lab.
 *
 * Pure functions over Float32 arrays — no DOM or Web Audio imports so
 * the Node CI gate in tools/check-measurement-lab.mjs can exercise the
 * same code paths the browser runs.
 *
 * Workflow. The user plays an L-only band, then an R-only band; each
 * step records stereo audio. For each capture this module computes
 * per-channel RMS and the on-channel-to-off-channel ratio (crosstalk
 * in dB = 20 × log10(off / on)). After both captures are in, it also
 * derives channel balance (right level / left level in dB; positive =
 * right louder) and the bidirectional crosstalk pair.
 *
 * The off-channel value should be the deliberate test signal of the
 * other band leaking through the cartridge's opposite coil; for a
 * perfect cartridge it is the noise floor.
 */

export type CrosstalkChannel = 'left' | 'right';

export type ChannelCaptureMetrics = {
  readonly leftRmsLinear: number;
  readonly rightRmsLinear: number;
  readonly leftRmsDbFs: number;
  readonly rightRmsDbFs: number;
  readonly onChannel: CrosstalkChannel;
  readonly crosstalkDb: number;
  readonly sampleCount: number;
};

export type ChannelBalanceSummary = {
  readonly leftCapture: ChannelCaptureMetrics | null;
  readonly rightCapture: ChannelCaptureMetrics | null;
  readonly balanceDb: number | null;
  readonly leftToRightCrosstalkDb: number | null;
  readonly rightToLeftCrosstalkDb: number | null;
};

const silenceFloorDb = -120;

export function computeRms(
  samples: Float32Array | Float64Array,
  settlingSamples = 0,
): number {
  if (samples.length === 0) return 0;
  const skip = Math.max(0, Math.min(settlingSamples, samples.length - 1));
  let sumSq = 0;
  let n = 0;
  for (let i = skip; i < samples.length; i += 1) {
    const v = samples[i];
    sumSq += v * v;
    n += 1;
  }
  return n === 0 ? 0 : Math.sqrt(sumSq / n);
}

function linearToDbFs(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0) return silenceFloorDb;
  return Math.max(silenceFloorDb, 20 * Math.log10(linear));
}

function ratioToDb(num: number, den: number): number {
  if (num <= 0 || den <= 0) return silenceFloorDb;
  return 20 * Math.log10(num / den);
}

/*
 * Analyse one stereo capture taken while the user played a single-
 * channel band. settlingSeconds discards the initial transient (band
 * cue, lead-in groove etc.). Returns per-channel RMS plus the on-to-
 * off channel crosstalk.
 */
export function analyseChannelCapture(
  left: Float32Array | Float64Array,
  right: Float32Array | Float64Array,
  onChannel: CrosstalkChannel,
  sampleRateHz: number,
  settlingSeconds = 0.5,
): ChannelCaptureMetrics {
  const settlingSamples = Math.floor(settlingSeconds * sampleRateHz);
  const leftRms = computeRms(left, settlingSamples);
  const rightRms = computeRms(right, settlingSamples);
  const onRms = onChannel === 'left' ? leftRms : rightRms;
  const offRms = onChannel === 'left' ? rightRms : leftRms;
  const crosstalkDb = ratioToDb(offRms, onRms);
  const sampleCount = Math.max(0, Math.min(left.length, right.length) - settlingSamples);
  return {
    leftRmsLinear: leftRms,
    rightRmsLinear: rightRms,
    leftRmsDbFs: linearToDbFs(leftRms),
    rightRmsDbFs: linearToDbFs(rightRms),
    onChannel,
    crosstalkDb,
    sampleCount,
  };
}

/*
 * Combine left and right band captures into a balance summary.
 * balanceDb is the right-band on-channel RMS divided by the left-band
 * on-channel RMS, expressed in dB. Positive means R louder.
 */
export function summariseChannelBalance(
  leftCapture: ChannelCaptureMetrics | null,
  rightCapture: ChannelCaptureMetrics | null,
): ChannelBalanceSummary {
  let balanceDb: number | null = null;
  if (leftCapture && rightCapture) {
    const lLevel = leftCapture.leftRmsLinear;
    const rLevel = rightCapture.rightRmsLinear;
    if (lLevel > 0 && rLevel > 0) {
      balanceDb = 20 * Math.log10(rLevel / lLevel);
    }
  }
  return {
    leftCapture,
    rightCapture,
    balanceDb,
    leftToRightCrosstalkDb: leftCapture?.crosstalkDb ?? null,
    rightToLeftCrosstalkDb: rightCapture?.crosstalkDb ?? null,
  };
}
