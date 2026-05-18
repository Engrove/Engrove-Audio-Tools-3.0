/*
 * Measurement Run Quality helper.
 *
 * Pure computation; no Web Audio or DOM dependency.
 *
 * Thresholds:
 *   Clipping  — peak >= -0.1 dBFS on either channel (status: invalid)
 *   Low signal — both channel RMS < -60 dBFS (status: warning for test_tone,
 *                ignored for noise_floor where low RMS is expected)
 *   Imbalance  — |L RMS − R RMS| > 3 dB (status: warning)
 *   Self-test  — source === 'self_test' adds a simulated-result warning
 */

export type MeasurementRunQualityStatus = 'ok' | 'warning' | 'invalid';

export type MeasurementRunQuality = {
  readonly status: MeasurementRunQualityStatus;
  readonly clipping: boolean;
  readonly lowSignal: boolean;
  readonly channelImbalanceDb: number | null;
  readonly warnings: readonly string[];
};

export type MeasurementChainReadinessStatus =
  | 'not_checked'
  | 'ready'
  | 'warning'
  | 'blocked';

export type MeasurementChainReadiness = {
  readonly status: MeasurementChainReadinessStatus;
  readonly signalPresent: boolean;
  readonly clipping: boolean;
  readonly lowSignal: boolean;
  readonly channelImbalanceDb: number | null;
  readonly warnings: readonly string[];
};

const CLIPPING_THRESHOLD_DBFS = -0.1;
const LOW_SIGNAL_THRESHOLD_DBFS = -60;
const IMBALANCE_THRESHOLD_DB = 3;

export function deriveMeasurementRunQuality(args: {
  readonly leftRmsDbfs: number | null;
  readonly rightRmsDbfs: number | null;
  readonly leftPeakDbfs: number | null;
  readonly rightPeakDbfs: number | null;
  readonly source: 'live_capture' | 'self_test';
  readonly measurementKind?: 'test_tone' | 'noise_floor';
}): MeasurementRunQuality {
  const { leftRmsDbfs, rightRmsDbfs, leftPeakDbfs, rightPeakDbfs, source } = args;
  const kind = args.measurementKind ?? 'test_tone';
  const warnings: string[] = [];

  const clipping =
    (leftPeakDbfs !== null && leftPeakDbfs >= CLIPPING_THRESHOLD_DBFS) ||
    (rightPeakDbfs !== null && rightPeakDbfs >= CLIPPING_THRESHOLD_DBFS);

  const lowSignal =
    (leftRmsDbfs === null || leftRmsDbfs < LOW_SIGNAL_THRESHOLD_DBFS) &&
    (rightRmsDbfs === null || rightRmsDbfs < LOW_SIGNAL_THRESHOLD_DBFS);

  const channelImbalanceDb =
    leftRmsDbfs !== null && rightRmsDbfs !== null
      ? Math.abs(leftRmsDbfs - rightRmsDbfs)
      : null;

  const imbalance = channelImbalanceDb !== null && channelImbalanceDb > IMBALANCE_THRESHOLD_DB;

  if (clipping) {
    warnings.push('Clipping detected — reduce input gain before measuring.');
  }
  if (lowSignal && kind === 'test_tone') {
    warnings.push('Signal too low for reliable measurement. Check connections and playback level.');
  }
  if (imbalance && channelImbalanceDb !== null) {
    warnings.push(`Channel imbalance: ${channelImbalanceDb.toFixed(1)} dB L/R difference.`);
  }
  if (source === 'self_test') {
    warnings.push('Self-test / simulated result — not a real capture.');
  }

  let status: MeasurementRunQualityStatus;
  if (clipping) {
    status = 'invalid';
  } else if (
    (lowSignal && kind === 'test_tone') ||
    imbalance ||
    source === 'self_test'
  ) {
    status = 'warning';
  } else {
    status = 'ok';
  }

  return { status, clipping, lowSignal, channelImbalanceDb, warnings };
}

export function deriveMeasurementChainReadiness(args: {
  readonly leftRmsDbfs: number | null;
  readonly rightRmsDbfs: number | null;
  readonly leftPeakDbfs: number | null;
  readonly rightPeakDbfs: number | null;
}): MeasurementChainReadiness {
  const { leftRmsDbfs, rightRmsDbfs, leftPeakDbfs, rightPeakDbfs } = args;
  const warnings: string[] = [];

  const clipping =
    (leftPeakDbfs !== null && leftPeakDbfs >= CLIPPING_THRESHOLD_DBFS) ||
    (rightPeakDbfs !== null && rightPeakDbfs >= CLIPPING_THRESHOLD_DBFS);

  const lowSignal =
    (leftRmsDbfs === null || leftRmsDbfs < LOW_SIGNAL_THRESHOLD_DBFS) &&
    (rightRmsDbfs === null || rightRmsDbfs < LOW_SIGNAL_THRESHOLD_DBFS);

  const signalPresent =
    (leftRmsDbfs !== null && leftRmsDbfs >= LOW_SIGNAL_THRESHOLD_DBFS) ||
    (rightRmsDbfs !== null && rightRmsDbfs >= LOW_SIGNAL_THRESHOLD_DBFS);

  const channelImbalanceDb =
    leftRmsDbfs !== null && rightRmsDbfs !== null
      ? Math.abs(leftRmsDbfs - rightRmsDbfs)
      : null;

  const imbalance = channelImbalanceDb !== null && channelImbalanceDb > IMBALANCE_THRESHOLD_DB;

  if (clipping) warnings.push('Clipping detected — reduce input gain.');
  if (imbalance && channelImbalanceDb !== null) warnings.push(`Channel imbalance: ${channelImbalanceDb.toFixed(1)} dB L/R difference.`);
  if (!signalPresent && !clipping) warnings.push('No signal detected. Check connections.');

  let status: MeasurementChainReadinessStatus;
  if (clipping) {
    status = 'blocked';
  } else if (!signalPresent) {
    status = 'not_checked';
  } else if (imbalance || lowSignal) {
    status = 'warning';
  } else {
    status = 'ready';
  }

  return { status, signalPresent, clipping, lowSignal, channelImbalanceDb, warnings };
}
