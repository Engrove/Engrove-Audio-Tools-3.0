/*
 * Track-Recognition Engine — S7B
 *
 * Truthful, conservative automatic recognition of test-record bands from
 * live audio input. Supports exact/near-exact single-tone frequency matching
 * only. Sweep, noise, dual-tone, silence, pulse, and amplitude-sweep bands
 * are explicitly unsupported for auto-detection and reported as such.
 *
 * The recogniser never fabricates a result. If it cannot determine the
 * playing band with confidence it stays in 'waiting_for_signal' or
 * transitions to 'ambiguous' / 'rejected'. Autostart is only permitted
 * when the state is 'locked' and the user has explicitly armed it.
 *
 * VTA and all planned/experimental workflows remain unsupported here.
 */

import type { TestBand, TestBandSignalType } from '../data/loadTestRecords';
import type { WorkflowAvailability } from '../data/measurementWorkflows';

// ── Recognition state machine ─────────────────────────────────────────────────

export type TrackRecognitionPhase =
  | 'disabled'            // Recognition is off; user has not armed anything
  | 'armed'               // User armed; system is ready but not yet triggered
  | 'waiting_for_signal'  // Armed; audio connected; awaiting detectable signal
  | 'candidate_detected'  // Candidate frequency found; awaiting confirmation
  | 'locked'              // Confirmed match to a known band
  | 'recording'           // Autostart triggered; measurement is in progress
  | 'ambiguous'           // Signal present but matches multiple bands / unclear
  | 'rejected'            // Signal present but does not match expected band
  | 'timeout'             // No confirmation within the deadline
  | 'manual_override';    // User started a measurement manually while armed

// Whether a band's signal type can be auto-detected by frequency matching.
export type BandDetectorType =
  | 'single_tone_exact'         // Exact known frequency — fully supported
  | 'not_supported_for_autodetect'; // Sweep, noise, dual-tone, silence, etc.

// Input/chain readiness for autostart gating.
export type AutostartChainReadiness =
  | 'ready'     // Chain checks pass
  | 'invalid';  // Chain is not ready (clipping, imbalance, low signal, etc.)

export type PreRollStatus = 'not_available';

// The full recognition state object — attached to LabState.
export type TrackRecognitionState = {
  // Current phase of the state machine
  readonly phase: TrackRecognitionPhase;
  // Which workflow the user has selected to arm (null if disabled)
  readonly selectedWorkflowId: string | null;
  // Which test record band is the target (null if disabled or no record)
  readonly targetBandIndex: string | null;
  // Human-readable label of the target band
  readonly targetBandLabel: string | null;
  // Expected fundamental frequency for single-tone bands (Hz); null otherwise
  readonly expectedFrequencyHz: number | null;
  // Detector type for the target band
  readonly detectorType: BandDetectorType | null;
  // Observed dominant frequency (Hz) from FFT peak; null if no signal
  readonly observedFrequencyHz: number | null;
  // Normalised confidence score 0–1; only meaningful in candidate/locked phases
  readonly confidence: number | null;
  // Human-readable reason string explaining the current phase
  readonly reason: string;
  // When the current phase was entered (epoch ms); null if disabled
  readonly phaseEnteredAt: number | null;
  // Input scope / chain readiness at the time of the last arm action
  readonly chainReadiness: AutostartChainReadiness;
  // Pre-roll status — always 'not_available' in this release
  readonly preRollStatus: PreRollStatus;
  // Which tool panel initiated the arm action (null if global arm or disabled)
  readonly armedFromToolId: string | null;
};

// ── Default / initial state ───────────────────────────────────────────────────

export const initialTrackRecognitionState = (): TrackRecognitionState => ({
  phase: 'disabled',
  selectedWorkflowId: null,
  targetBandIndex: null,
  targetBandLabel: null,
  expectedFrequencyHz: null,
  detectorType: null,
  observedFrequencyHz: null,
  confidence: null,
  reason: 'Recognition is disabled. Arm a workflow to begin.',
  phaseEnteredAt: null,
  chainReadiness: 'invalid',
  preRollStatus: 'not_available',
  armedFromToolId: null,
});

// ── Band eligibility ──────────────────────────────────────────────────────────

const AUTODETECT_UNSUPPORTED_SIGNAL_TYPES: ReadonlySet<TestBandSignalType> = new Set([
  'sweep',
  'amplitude_sweep',
  'noise',
  'silence',
  'pulse',
  'tracking_burst',
  'dual_tone',
]);

/**
 * Returns the detector type for a given band. A band is eligible for
 * auto-detection only if it has signal_type === 'single_tone' and a
 * known frequencyHz. All other signal types are unsupported.
 */
export function classifyBandDetector(band: TestBand): BandDetectorType {
  const signalType = band.signalType;
  if (signalType !== undefined && AUTODETECT_UNSUPPORTED_SIGNAL_TYPES.has(signalType)) {
    return 'not_supported_for_autodetect';
  }
  if (signalType === 'single_tone' && band.frequencyHz != null && band.frequencyHz > 0) {
    return 'single_tone_exact';
  }
  // Conservative fallback: if signal_type is absent or not single_tone, unsupported
  return 'not_supported_for_autodetect';
}

// ── Frequency matching ────────────────────────────────────────────────────────

// Tolerance for single-tone frequency match (±1.5 semitones ≈ ±8.9%)
const SINGLE_TONE_TOLERANCE_RATIO = 0.089;

export type FrequencyMatchResult = {
  readonly matched: boolean;
  readonly confidence: number; // 0–1
  readonly deviationCents: number | null;
};

/**
 * Attempts to match an observed frequency against an expected frequency.
 * Returns a confidence score and whether it meets the match threshold.
 * Only called for single_tone_exact bands.
 */
export function matchSingleToneFrequency(
  observedHz: number,
  expectedHz: number,
): FrequencyMatchResult {
  if (observedHz <= 0 || expectedHz <= 0) {
    return { matched: false, confidence: 0, deviationCents: null };
  }
  const ratio = observedHz / expectedHz;
  const deviationCents = 1200 * Math.log2(ratio);
  const absDev = Math.abs(ratio - 1);
  if (absDev > SINGLE_TONE_TOLERANCE_RATIO) {
    return { matched: false, confidence: 0, deviationCents };
  }
  // Confidence decays linearly from 1 at 0% deviation to 0 at tolerance edge
  const confidence = Math.max(0, 1 - absDev / SINGLE_TONE_TOLERANCE_RATIO);
  return { matched: true, confidence, deviationCents };
}

// ── FFT peak extraction ───────────────────────────────────────────────────────

const RECOGNITION_FFT_MIN_DB = -60; // ignore bins below this threshold

/**
 * Extracts the dominant frequency from an FFT magnitude buffer.
 * Returns null if no bin exceeds the minimum threshold.
 * The buffer must be a Float32Array of dBFS magnitudes (from getFloatFrequencyData).
 */
export function extractDominantFrequency(
  magnitudeDbfs: Float32Array<ArrayBuffer>,
  sampleRateHz: number,
): number | null {
  const binCount = magnitudeDbfs.length;
  if (binCount === 0 || sampleRateHz <= 0) return null;

  let peakDb = RECOGNITION_FFT_MIN_DB;
  let peakBin = -1;

  for (let i = 1; i < binCount; i++) {
    const db = magnitudeDbfs[i]!;
    if (db > peakDb) {
      peakDb = db;
      peakBin = i;
    }
  }

  if (peakBin < 0) return null;

  // Convert bin index to frequency
  const binWidthHz = sampleRateHz / (2 * binCount);
  return peakBin * binWidthHz;
}

// ── Band candidates from a test record ───────────────────────────────────────

export type RecognitionCandidate = {
  readonly band: TestBand;
  readonly bandIndex: string;
  readonly detectorType: BandDetectorType;
  readonly expectedFrequencyHz: number | null;
  readonly workflowIds: readonly string[];
};

/**
 * Returns all bands on a test record that are eligible for single-tone
 * auto-detection (detectorType === 'single_tone_exact') and are associated
 * with at least one supported workflow. Planned/experimental bands are
 * included in the list but their workflowIds will reflect planned status.
 */
export function buildRecognitionCandidates(
  bands: readonly TestBand[],
  workflowAvailability: ReadonlyMap<string, WorkflowAvailability>,
): readonly RecognitionCandidate[] {
  const candidates: RecognitionCandidate[] = [];

  for (const band of bands) {
    const detectorType = classifyBandDetector(band);
    if (detectorType !== 'single_tone_exact') continue;
    if (band.frequencyHz == null) continue;

    // Map analyzerModule to workflow id (direct match)
    const wfIds: string[] = [];
    const am = band.analyzerModule;
    if (am) {
      for (const [wfId] of workflowAvailability) {
        // Treat workflow id matching analyzerModule (underscore-normalized)
        if (wfId === am.replace(/_/g, '_')) wfIds.push(wfId);
      }
    }
    if (band.analyzerModules) {
      for (const amod of band.analyzerModules) {
        for (const [wfId] of workflowAvailability) {
          if (wfId === amod && !wfIds.includes(wfId)) wfIds.push(wfId);
        }
      }
    }
    // Also include by purpose mapping for speed and reference bands
    if (band.purpose === 'speed' && !wfIds.includes('wow_flutter')) wfIds.push('wow_flutter');
    if ((band.purpose === 'freq_response' || band.purpose === 'thd') && !wfIds.includes('reference_level')) wfIds.push('reference_level');
    if (band.purpose === 'crosstalk') {
      if (!wfIds.includes('azimuth_crosstalk')) wfIds.push('azimuth_crosstalk');
      if (!wfIds.includes('channel_identity')) wfIds.push('channel_identity');
    }

    candidates.push({
      band,
      bandIndex: band.index,
      detectorType,
      expectedFrequencyHz: band.frequencyHz,
      workflowIds: wfIds,
    });
  }

  return candidates;
}

// ── Arm / disarm actions ──────────────────────────────────────────────────────

export type ArmTrackRecognitionArgs = {
  readonly workflowId: string;
  readonly targetBand: TestBand;
  readonly chainReadiness: AutostartChainReadiness;
  readonly armedFromToolId: string | null;
};

/**
 * Transitions recognition state to 'armed'. Validates that the target band
 * is eligible for single-tone auto-detection. Returns the new state.
 * If the band is not supported for auto-detection, returns 'disabled' with
 * a descriptive reason — we never silently arm an unsupported band.
 */
export function armTrackRecognition(args: ArmTrackRecognitionArgs): TrackRecognitionState {
  const { workflowId, targetBand, chainReadiness, armedFromToolId } = args;
  const detectorType = classifyBandDetector(targetBand);

  if (detectorType !== 'single_tone_exact') {
    return {
      phase: 'disabled',
      selectedWorkflowId: null,
      targetBandIndex: null,
      targetBandLabel: null,
      expectedFrequencyHz: null,
      detectorType: null,
      observedFrequencyHz: null,
      confidence: null,
      reason: `Band "${targetBand.label}" cannot be auto-detected (signal type: ${targetBand.signalType ?? 'unknown'}). Manual start required.`,
      phaseEnteredAt: null,
      chainReadiness,
      preRollStatus: 'not_available',
      armedFromToolId: null,
    };
  }

  return {
    phase: 'armed',
    selectedWorkflowId: workflowId,
    targetBandIndex: targetBand.index,
    targetBandLabel: targetBand.label,
    expectedFrequencyHz: targetBand.frequencyHz ?? null,
    detectorType: 'single_tone_exact',
    observedFrequencyHz: null,
    confidence: null,
    reason: `Armed for "${targetBand.label}" (${targetBand.frequencyHz} Hz). Waiting for audio connection.`,
    phaseEnteredAt: Date.now(),
    chainReadiness,
    preRollStatus: 'not_available',
    armedFromToolId,
  };
}

/**
 * Disarms recognition — resets to disabled state.
 */
export function disarmTrackRecognition(): TrackRecognitionState {
  return initialTrackRecognitionState();
}

// ── Signal ingestion and phase transitions ────────────────────────────────────

export type IngestSignalArgs = {
  readonly current: TrackRecognitionState;
  readonly dominantFrequencyHz: number | null;
  readonly nowMs: number;
  // Timeout after which armed-but-no-signal → timeout (ms); 0 to disable
  readonly waitingTimeoutMs: number;
  // Timeout after candidate_detected phase before locking or rejecting (ms)
  readonly candidateConfirmMs: number;
  // Minimum confidence to lock
  readonly lockConfidenceThreshold: number;
};

/**
 * Pure function: transitions recognition state based on new signal data.
 * Does not trigger autostart — that is the caller's responsibility.
 */
export function ingestSignal(args: IngestSignalArgs): TrackRecognitionState {
  const {
    current,
    dominantFrequencyHz,
    nowMs,
    waitingTimeoutMs,
    candidateConfirmMs,
    lockConfidenceThreshold,
  } = args;

  // Only active phases respond to signal
  if (
    current.phase !== 'armed' &&
    current.phase !== 'waiting_for_signal' &&
    current.phase !== 'candidate_detected'
  ) {
    return current;
  }

  const expectedHz = current.expectedFrequencyHz;
  if (expectedHz == null || current.detectorType !== 'single_tone_exact') {
    return current;
  }

  // Transition from armed → waiting_for_signal once audio is flowing
  const phase = current.phase === 'armed' ? 'waiting_for_signal' : current.phase;
  const phaseEnteredAt = phase !== current.phase ? nowMs : (current.phaseEnteredAt ?? nowMs);

  // No signal yet
  if (dominantFrequencyHz == null || dominantFrequencyHz <= 0) {
    const elapsed = nowMs - phaseEnteredAt;
    if (waitingTimeoutMs > 0 && phase === 'waiting_for_signal' && elapsed >= waitingTimeoutMs) {
      return {
        ...current,
        phase: 'timeout',
        reason: `No detectable signal within ${Math.round(waitingTimeoutMs / 1000)} s. Manual start required.`,
        phaseEnteredAt: nowMs,
      };
    }
    return { ...current, phase, phaseEnteredAt, observedFrequencyHz: null };
  }

  // We have a signal — attempt to match
  const matchResult = matchSingleToneFrequency(dominantFrequencyHz, expectedHz);

  if (!matchResult.matched) {
    // Signal present but wrong frequency
    return {
      ...current,
      phase: 'rejected',
      observedFrequencyHz: dominantFrequencyHz,
      confidence: 0,
      reason: `Signal detected at ${dominantFrequencyHz.toFixed(0)} Hz, expected ${expectedHz} Hz. Manual start required.`,
      phaseEnteredAt: nowMs,
    };
  }

  // Frequency matches — check for lock
  if (phase === 'waiting_for_signal') {
    return {
      ...current,
      phase: 'candidate_detected',
      observedFrequencyHz: dominantFrequencyHz,
      confidence: matchResult.confidence,
      reason: `Candidate: ${dominantFrequencyHz.toFixed(0)} Hz (expected ${expectedHz} Hz). Confirming…`,
      phaseEnteredAt: nowMs,
    };
  }

  if (phase === 'candidate_detected') {
    const elapsed = nowMs - phaseEnteredAt;
    if (elapsed >= candidateConfirmMs && matchResult.confidence >= lockConfidenceThreshold) {
      return {
        ...current,
        phase: 'locked',
        observedFrequencyHz: dominantFrequencyHz,
        confidence: matchResult.confidence,
        reason: `Locked: ${dominantFrequencyHz.toFixed(0)} Hz matches "${current.targetBandLabel}" (${expectedHz} Hz).`,
        phaseEnteredAt: nowMs,
      };
    }
    // Still confirming
    return {
      ...current,
      phase: 'candidate_detected',
      observedFrequencyHz: dominantFrequencyHz,
      confidence: matchResult.confidence,
      reason: `Confirming ${dominantFrequencyHz.toFixed(0)} Hz…`,
    };
  }

  return current;
}

// ── Autostart eligibility ─────────────────────────────────────────────────────

export type AutostartEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Returns whether autostart may be triggered. All conditions must pass.
 * Autostart is only permitted when:
 *   - phase is 'locked'
 *   - chain readiness is 'ready'
 *   - workflow is not planned/experimental (caller must verify via availability)
 *   - no current measurement is in progress (caller must verify)
 */
export function evaluateAutostartEligibility(
  recog: TrackRecognitionState,
  workflowAvailability: WorkflowAvailability | null,
): AutostartEligibility {
  if (recog.phase !== 'locked') {
    return { eligible: false, reason: `Recognition phase is '${recog.phase}', not locked.` };
  }
  if (recog.chainReadiness !== 'ready') {
    return { eligible: false, reason: 'Measurement chain is not ready.' };
  }
  if (workflowAvailability === null || workflowAvailability === 'unavailable') {
    return { eligible: false, reason: 'Workflow not available for selected test record.' };
  }
  if (workflowAvailability === 'planned') {
    return { eligible: false, reason: 'Workflow is planned/experimental — autostart not permitted.' };
  }
  return { eligible: true };
}

// ── Human-readable phase labels ───────────────────────────────────────────────

export const TRACK_RECOGNITION_PHASE_LABELS: Readonly<Record<TrackRecognitionPhase, string>> = {
  disabled: 'Off',
  armed: 'Armed',
  waiting_for_signal: 'Waiting',
  candidate_detected: 'Detecting',
  locked: 'Locked',
  recording: 'Recording',
  ambiguous: 'Ambiguous',
  rejected: 'No match',
  timeout: 'Timed out',
  manual_override: 'Manual',
};

// ── Export provenance ─────────────────────────────────────────────────────────

export type TrackRecognitionProvenance = {
  readonly phase: TrackRecognitionPhase;
  readonly detectorType: BandDetectorType | null;
  readonly selectedWorkflowId: string | null;
  readonly targetBandIndex: string | null;
  readonly targetBandLabel: string | null;
  readonly expectedFrequencyHz: number | null;
  readonly observedFrequencyHz: number | null;
  readonly confidence: number | null;
  readonly chainReadiness: AutostartChainReadiness;
  readonly preRollStatus: PreRollStatus;
  readonly reason: string;
  readonly startMode: 'auto' | 'manual' | 'not_started';
  readonly armedFromToolId: string | null;
};

/**
 * Builds a provenance record for inclusion in JSON exports and reports.
 * The startMode reflects whether the measurement was started automatically,
 * manually, or not at all.
 */
export function buildTrackRecognitionProvenance(
  recog: TrackRecognitionState,
  startMode: 'auto' | 'manual' | 'not_started',
): TrackRecognitionProvenance {
  return {
    phase: recog.phase,
    detectorType: recog.detectorType,
    selectedWorkflowId: recog.selectedWorkflowId,
    targetBandIndex: recog.targetBandIndex,
    targetBandLabel: recog.targetBandLabel,
    expectedFrequencyHz: recog.expectedFrequencyHz,
    observedFrequencyHz: recog.observedFrequencyHz,
    confidence: recog.confidence,
    chainReadiness: recog.chainReadiness,
    preRollStatus: recog.preRollStatus,
    reason: recog.reason,
    startMode,
    armedFromToolId: recog.armedFromToolId,
  };
}
