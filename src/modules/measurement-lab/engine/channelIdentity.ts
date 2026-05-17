import type { ChannelCaptureMetrics } from './crosstalk';

export type ChannelIdentityStatus = 'normal' | 'possible_swapped' | 'inconclusive';

export type ChannelIdentityResult = {
  readonly identity: ChannelIdentityStatus;
  readonly leftToRightCrosstalkDb: number;
  readonly rightToLeftCrosstalkDb: number;
  readonly wantedBalanceDb: number | null;
  readonly crosstalkSymmetryDeltaDb: number | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
  readonly source: 'live_capture' | 'self_test';
};

const LOW_SIGNAL_DBFS = -60;
const SWAPPED_MARGIN_DB = 3;

/*
 * Classify the channel wiring from two separate captures:
 *   leftCapture  — audio recorded while the L-only test band plays
 *   rightCapture — audio recorded while the R-only test band plays
 *
 * identity:
 *   'normal'          — L-band signal is stronger on the L output,
 *                       R-band signal is stronger on the R output.
 *   'possible_swapped'— L-band is louder on R by ≥ SWAPPED_MARGIN_DB,
 *                       AND R-band is louder on L by ≥ SWAPPED_MARGIN_DB.
 *   'inconclusive'    — evidence is ambiguous or signal is too low.
 *
 * wantedBalanceDb = rightCapture.rightRmsDbFs − leftCapture.leftRmsDbFs
 *   Positive = R wanted channel louder than L wanted channel.
 */
export function computeChannelIdentity(
  leftCapture: ChannelCaptureMetrics,
  rightCapture: ChannelCaptureMetrics,
  source: 'live_capture' | 'self_test',
): ChannelIdentityResult {
  const ltrDb = leftCapture.crosstalkDb;    // off-channel R when L-band plays
  const rtlDb = rightCapture.crosstalkDb;   // off-channel L when R-band plays

  const leftWantedDbFs = leftCapture.leftRmsDbFs;
  const rightWantedDbFs = rightCapture.rightRmsDbFs;

  const wantedBalanceDb =
    Number.isFinite(leftWantedDbFs) && Number.isFinite(rightWantedDbFs)
      ? rightWantedDbFs - leftWantedDbFs
      : null;

  const crosstalkSymmetryDeltaDb =
    Number.isFinite(ltrDb) && Number.isFinite(rtlDb) ? ltrDb - rtlDb : null;

  // Identity — requires signal margin to avoid noise-floor ambiguity
  const lBandNormal = leftCapture.leftRmsLinear > leftCapture.rightRmsLinear;
  const rBandNormal = rightCapture.rightRmsLinear > rightCapture.leftRmsLinear;
  const lBandSwapped = leftCapture.rightRmsDbFs >= leftCapture.leftRmsDbFs + SWAPPED_MARGIN_DB;
  const rBandSwapped = rightCapture.leftRmsDbFs >= rightCapture.rightRmsDbFs + SWAPPED_MARGIN_DB;

  let identity: ChannelIdentityStatus;
  if (lBandNormal && rBandNormal) {
    identity = 'normal';
  } else if (lBandSwapped && rBandSwapped) {
    identity = 'possible_swapped';
  } else {
    identity = 'inconclusive';
  }

  const warnings: string[] = [];
  if (leftWantedDbFs < LOW_SIGNAL_DBFS) {
    warnings.push('Left channel signal very low — check connection or volume.');
  }
  if (rightWantedDbFs < LOW_SIGNAL_DBFS) {
    warnings.push('Right channel signal very low — check connection or volume.');
  }
  if (identity === 'possible_swapped') {
    warnings.push('Channels appear swapped — check left/right connections.');
  }
  if (source === 'self_test') {
    warnings.push('Self-test mode does not produce channel-separated signals. Results are indicative only.');
  }

  let confidence: 'high' | 'medium' | 'low';
  if (leftWantedDbFs < LOW_SIGNAL_DBFS || rightWantedDbFs < LOW_SIGNAL_DBFS) {
    confidence = 'low';
  } else if (identity === 'inconclusive' || identity === 'possible_swapped') {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  return {
    identity,
    leftToRightCrosstalkDb: ltrDb,
    rightToLeftCrosstalkDb: rtlDb,
    wantedBalanceDb,
    crosstalkSymmetryDeltaDb,
    confidence,
    warnings,
    source,
  };
}
