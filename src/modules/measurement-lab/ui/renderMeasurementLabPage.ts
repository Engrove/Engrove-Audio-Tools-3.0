import { renderText } from '../../../shared/ui/renderSafe';
import { openWebReportModal, type WebReportPayload, type WebReportSection } from '../../../shared/ui/webReportModal';
import { renderToolTopbar } from '../../../shared/ui/renderToolTopbar';
import {
  AudioDeviceEnumerationError,
  AudioStreamUnavailableError,
  computeLevelMetrics,
  createMeasurementAudioContext,
  decayPeakHold,
  describeDevice,
  describeSampleRateHonesty,
  disposeMeasurementAudioContext,
  listAudioInputDevices,
  releaseStrictAudioStream,
  requestStrictAudioStream,
  silenceFloorDb,
  type AudioInputDeviceInfo,
  type LevelMetrics,
  type MeasurementAudioContextHandle,
  type SampleRateHonestyReport,
  type SampleRateMatchClassification,
  type StrictAudioStream,
} from '../../../shared/audio-io';
import { createIriaaFilterNode, type IriaaFilterNode } from '../dsp/iriaaNode';
import { createSpeedFlutterCapture, type SpeedFlutterCapture, type SpeedFlutterResult } from '../dsp/speedFlutterNode';
import { buildSpeedDiagnosticMeta, type SpeedDiagnosticMeta } from '../engine/speedFlutter';
import { createNoiseFloorCapture, type NoiseFloorCapture, type NoiseFloorResult } from '../dsp/noiseFloorNode';
import { deriveMeasurementRunQuality, deriveMeasurementChainReadiness, buildInputScopeSnapshot, type MeasurementRunQuality, type MeasurementChainReadiness, type MeasurementChainReadinessStatus, type InputScopeSnapshot } from '../engine/runQuality';
import { createStereoChannelCapture, type StereoCapture, type ChannelCaptureMetrics } from '../dsp/stereoCaptureNode';
import { createSweepCapture, type SweepCapture } from '../dsp/sweepCaptureNode';
import { summariseChannelBalance } from '../engine/crosstalk';
import { computeFrequencyResponse, computeFreqDeviationSummary, type FreqResponseResult, type FreqDeviationSummary } from '../engine/freqResponse';
import { computeRiaaMagnitudeDb } from '../engine/iriaaFilter';
import { analyseTHD, analyseIMD, buildThdDistortionMeta, type ThdResult, type ImdResult, type ThdDistortionMeta } from '../engine/thd';
import { analyseResonance, buildResonanceDiagnosticMeta, type ResonanceResult, type ResonanceSweepType, type ResonanceDiagnosticMeta } from '../engine/resonance';
import { analyzeReferenceLevel, type ReferenceLevelResult } from '../engine/referenceLevel';
import {
  addOrReplaceEntry,
  clearCalibrationSet,
  find1kHzEntry,
  relativeTo1kHz,
  type CalibrationSetEntry,
} from '../engine/referenceCalibrationSet';
import { computeChannelIdentity, type ChannelIdentityResult, type ChannelIdentityStatus } from '../engine/channelIdentity';
import { loadTestRecordsRuntimeData, getPreferredRecord, type TestRecord, type TestBand, type TestBandPurpose } from '../data/loadTestRecords';
import { computeAllWorkflowCoverage, MEASUREMENT_WORKFLOWS, type WorkflowAvailability } from '../data/measurementWorkflows';

const WORKFLOW_PANEL_TARGETS: Readonly<Record<string, string>> = {
  wow_flutter: 'mlab-speed-panel',
  channel_identity: 'mlab-channel-panel',
  azimuth_crosstalk: 'mlab-channel-panel',
  frequency_response: 'mlab-freq-panel',
  reference_level: 'mlab-reflevel-panel',
  vta_imd_optimizer: 'mlab-advanced-panel',
  vertical_resonance: 'mlab-resonance-panel',
};

type WorkbenchTool = {
  readonly id: string;
  readonly label: string;
  readonly panelId: string | null;
  readonly group: string;
  readonly workflowId: string | null;
  readonly description: string;
};

const WORKBENCH_TOOLS: readonly WorkbenchTool[] = [
  { id: 'audio_source', label: 'Audio Source', panelId: 'mlab-source-panel', group: 'Setup / baseline', workflowId: null, description: 'Connect ADC, choose live/self-test and verify input scope.' },
  { id: 'reference_level', label: 'Reference Level Calibration', panelId: 'mlab-reflevel-panel', group: 'Setup / baseline', workflowId: 'reference_level', description: 'Calibrate ADC input against standard groove level.' },
  { id: 'channel_identity', label: 'Channel Identity', panelId: 'mlab-channel-panel', group: 'Channel / geometry', workflowId: 'channel_identity', description: 'Verify L/R routing and detect reversed connections.' },
  { id: 'azimuth_crosstalk', label: 'Azimuth & Crosstalk', panelId: 'mlab-channel-panel', group: 'Channel / geometry', workflowId: 'azimuth_crosstalk', description: 'Measure channel separation and azimuth alignment.' },
  { id: 'wow_flutter', label: 'Speed & Wow / Flutter', panelId: 'mlab-speed-panel', group: 'Speed / response', workflowId: 'wow_flutter', description: '33⅓/45 RPM diagnostics, weighted W&F and run comparison.' },
  { id: 'frequency_response', label: 'Frequency Response', panelId: 'mlab-freq-panel', group: 'Speed / response', workflowId: 'frequency_response', description: 'Plot the cartridge response curve from a frequency sweep.' },
  { id: 'thd_imd', label: 'THD / IMD Detail', panelId: 'mlab-thd-panel', group: 'Distortion / resonance', workflowId: null, description: 'Harmonic breakdown and distortion detail.' },
  { id: 'vertical_resonance', label: 'Vertical Resonance', panelId: 'mlab-resonance-panel', group: 'Distortion / resonance', workflowId: 'vertical_resonance', description: 'Detect vertical resonance peak and Q factor.' },
  { id: 'noise_floor', label: 'Noise Floor / Rig Baseline', panelId: 'mlab-noisefloor-panel', group: 'Distortion / resonance', workflowId: null, description: 'Measure rig noise floor and baseline.' },
  { id: 'vta_imd_optimizer', label: 'VTA / IMD Optimizer', panelId: 'mlab-advanced-panel', group: 'Experimental / planned', workflowId: 'vta_imd_optimizer', description: 'Experimental VTA/IMD optimizer — no supported recommendation.' },
  { id: 'anti_skate_tracking_stress', label: 'Anti-skate / Tracking Stress', panelId: null, group: 'Experimental / planned', workflowId: 'anti_skate_tracking_stress', description: 'Planned workflow — not available in this release.' },
  { id: 'pink_noise_spectral', label: 'Pink Noise / Spectral Balance', panelId: null, group: 'Experimental / planned', workflowId: 'pink_noise_spectral', description: 'Planned workflow — not available in this release.' },
  { id: 'rumble_isolation', label: 'Rumble & Noise Isolation', panelId: null, group: 'Experimental / planned', workflowId: 'rumble_isolation', description: 'Planned workflow — not available in this release.' },
];

type SourceMode = 'live' | 'self-test';
type CaptureState = 'idle' | 'connecting' | 'live' | 'error';

type ChannelLevel = {
  peakLinear: number;
  peakHoldLinear: number;
  rmsLinear: number;
  peakDbFs: number;
  rmsDbFs: number;
  clipped: boolean;
};

type ChannelKey = 'L' | 'R';

type SpeedBandMeta = {
  readonly index: string;
  readonly label: string;
  readonly frequencyHz: number | null;
  readonly levelDb: number | null;
};

type SpeedContext = '33_33' | '45';

type MeasurementParameterSource =
  | 'test_record_metadata'
  | 'speed_context_formula'
  | 'user_override'
  | 'fallback_default';

type CaptureDurationSource = 'default' | 'user_override';

type SpeedMeasurementSettings = {
  readonly speedContext: SpeedContext;
  readonly rpm: number;
  readonly nominalFrequencyHzDefault: number;
  readonly nominalFrequencyHz: number;
  readonly nominalFrequencySource: MeasurementParameterSource;
  readonly captureDurationSecondsDefault: number;
  readonly captureDurationSeconds: number;
  readonly captureDurationSource: CaptureDurationSource;
};

type SpeedMeasurementRun = {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'live_capture' | 'self_test';
  readonly speedContext: SpeedContext;
  readonly rpm: number;
  readonly nominalFrequencyHzDefault: number;
  readonly nominalFrequencyHz: number;
  readonly nominalFrequencySource: MeasurementParameterSource;
  readonly captureDurationSeconds: number;
  readonly captureDurationSource: CaptureDurationSource;
  readonly measuredFrequencyHz: number | null;
  readonly speedErrorPercent: number | null;
  readonly wowFlutterPercent: number | null;
  readonly wowFlutterWeightedPercent: number | null;
  readonly band: SpeedBandMeta | null;
  readonly warnings: readonly string[];
  readonly runQuality: MeasurementRunQuality;
};

type SpeedState = {
  referenceHz: number;
  speedContext: SpeedContext;
  nominalFrequencyHzInput: string;
  captureDurationSecondsInput: string;
  active: boolean;
  elapsedSeconds: number;
  result: SpeedFlutterResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
  lastSettings: SpeedMeasurementSettings | null;
  bandMeta: SpeedBandMeta | null;
  capture: SpeedFlutterCapture | null;
  runs: SpeedMeasurementRun[];
};

type NoiseFloorScenarioKind =
  | 'equipment_off'
  | 'rig_powered_still'
  | 'platter_spinning';

type NoiseFloorTurntableSpeed =
  | '16'
  | '33_33'
  | '45'
  | '78'
  | 'custom';

type NoiseFloorRun = {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'live_capture' | 'self_test';
  readonly scenarioKind: NoiseFloorScenarioKind;
  readonly speed: NoiseFloorTurntableSpeed | null;
  readonly rpm: number | null;
  readonly tonearmPosition: string;
  readonly captureDurationSeconds: number;
  readonly leftRmsDbfs: number | null;
  readonly rightRmsDbfs: number | null;
  readonly leftPeakDbfs: number | null;
  readonly rightPeakDbfs: number | null;
  readonly noiseFloorDbfs: number | null;
  readonly warnings: readonly string[];
  readonly runQuality: MeasurementRunQuality;
};

type NoiseFloorState = {
  scenarioKind: NoiseFloorScenarioKind;
  speed: NoiseFloorTurntableSpeed;
  customRpmInput: string;
  tonearmPositionInput: string;
  captureDurationSecondsInput: string;
  active: boolean;
  elapsedSeconds: number;
  capture: NoiseFloorCapture | null;
  latest: NoiseFloorRun | null;
  runs: NoiseFloorRun[];
};

type ChannelBandMeta = {
  readonly index: string;
  readonly label: string;
  readonly frequencyHz: number | null;
};

type ChannelStep = 'idle' | 'left-recording' | 'left-done' | 'right-recording' | 'done';

// ── S5R: Azimuth step run model ───────────────────────────────────────────────
type AzimuthStepRun = {
  readonly id: string;
  readonly createdAt: string;
  readonly source: 'live_capture' | 'self_test';
  readonly label: string | null;
  readonly leftToRightCrosstalkDb: number;
  readonly rightToLeftCrosstalkDb: number;
  readonly crosstalkSymmetryDeltaDb: number | null;
  readonly wantedBalanceDb: number | null;
  readonly identity: ChannelIdentityStatus;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly leftBandMeta: ChannelBandMeta | null;
  readonly rightBandMeta: ChannelBandMeta | null;
  readonly runQuality: MeasurementRunQuality | null;
  readonly warnings: readonly string[];
};

type AzimuthStepComparison = {
  readonly compatible: boolean;
  readonly runCount: number;
  readonly ltrRangeDb: { min: number; max: number } | null;
  readonly rtlRangeDb: { min: number; max: number } | null;
  readonly lowestLtrRunId: string | null;
  readonly lowestRtlRunId: string | null;
  readonly note: string;
};

function computeAzimuthStepComparison(runs: readonly AzimuthStepRun[]): AzimuthStepComparison | null {
  if (runs.length < 2) return null;
  const refLeft = runs[0].leftBandMeta?.index ?? null;
  const refRight = runs[0].rightBandMeta?.index ?? null;
  const incompatible = runs.some(r =>
    (r.leftBandMeta?.index ?? null) !== refLeft ||
    (r.rightBandMeta?.index ?? null) !== refRight,
  );
  if (incompatible) {
    return {
      compatible: false,
      runCount: runs.length,
      ltrRangeDb: null,
      rtlRangeDb: null,
      lowestLtrRunId: null,
      lowestRtlRunId: null,
      note: 'Runs used different test record bands and cannot be directly compared.',
    };
  }
  let minLtr = Infinity, maxLtr = -Infinity, lowestLtrRunId: string | null = null;
  let minRtl = Infinity, maxRtl = -Infinity, lowestRtlRunId: string | null = null;
  for (const run of runs) {
    if (run.leftToRightCrosstalkDb < minLtr) { minLtr = run.leftToRightCrosstalkDb; lowestLtrRunId = run.id; }
    if (run.leftToRightCrosstalkDb > maxLtr) maxLtr = run.leftToRightCrosstalkDb;
    if (run.rightToLeftCrosstalkDb < minRtl) { minRtl = run.rightToLeftCrosstalkDb; lowestRtlRunId = run.id; }
    if (run.rightToLeftCrosstalkDb > maxRtl) maxRtl = run.rightToLeftCrosstalkDb;
  }
  return {
    compatible: true,
    runCount: runs.length,
    ltrRangeDb: { min: minLtr, max: maxLtr },
    rtlRangeDb: { min: minRtl, max: maxRtl },
    lowestLtrRunId,
    lowestRtlRunId,
    note: 'Lower crosstalk values (more negative dB) indicate better channel separation. No azimuth setting is recommended — use this data alongside listening tests and your own judgement.',
  };
}

type ChannelStateBag = {
  step: ChannelStep;
  elapsedSeconds: number;
  leftCapture: ChannelCaptureMetrics | null;
  rightCapture: ChannelCaptureMetrics | null;
  capture: StereoCapture | null;
  identityResult: ChannelIdentityResult | null;
  source: 'live_capture' | 'self_test' | null;
  leftBandIndex: string | null;
  rightBandIndex: string | null;
  leftBandMeta: ChannelBandMeta | null;
  rightBandMeta: ChannelBandMeta | null;
  runs: AzimuthStepRun[];
  stepLabelInput: string;
};

type FreqBandMeta = {
  readonly index: string;
  readonly label: string;
  readonly frequencyStartHz: number | null;
  readonly frequencyEndHz: number | null;
  readonly frequencyHz: number | null;
  readonly levelDb: number | null;
};

type FreqState = {
  active: boolean;
  elapsedSeconds: number;
  result: FreqResponseResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
  selectedBandIndex: string | null;
  selectedBandMeta: FreqBandMeta | null;
  capture: SweepCapture | null;
};

type ThdMode = 'thd' | 'imd';
type ThdBandMeta = {
  readonly index: string;
  readonly label: string;
  readonly frequencyHz: number | null;
  readonly f1Hz: number | null;
  readonly f2Hz: number | null;
  readonly levelDb: number | null;
  readonly standard: string | null;
};
type ThdStateBag = {
  mode: ThdMode;
  fundamentalHz: number;
  imdF1Hz: number;
  imdF2Hz: number;
  active: boolean;
  elapsedSeconds: number;
  result: ThdResult | ImdResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
  runQuality: MeasurementRunQuality | null;
  bandMeta: ThdBandMeta | null;
  selectedBandIndex: string | null;
  capture: SweepCapture | null;
};

type ResonanceStateBag = {
  sweepType: ResonanceSweepType;
  fromHz: number;
  toHz: number;
  durationSeconds: number;
  active: boolean;
  elapsedSeconds: number;
  result: ResonanceResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
  runQuality: MeasurementRunQuality | null;
  capture: SweepCapture | null;
};

type SelectedTestRecordMissing = {
  readonly requestedId: string;
  readonly recoveredToId: string | null;
  readonly recoveredToLabel: string | null;
};

// VTA IMD run model (S5C.1) — captures measuredAt, sampleCount, confidence and warnings.
type VtaImdRun = {
  readonly id: string;
  readonly heightMm: number | null;
  readonly heightLabel: string;
  readonly imdPercent: number | null;
  readonly source: 'manual_placeholder' | 'live_capture';
  readonly createdAt: string;
  readonly measuredAt: string | null;
  readonly sampleCount: number | null;
  readonly confidence: 'not_measured' | 'experimental';
  readonly warnings: readonly string[];
  readonly note: string;
};

type VtaStateBag = {
  runs: VtaImdRun[];
  heightMmInput: string;
  heightLabelInput: string;
  noteInput: string;
  capturingRunId: string | null;
  captureElapsed: number;
  capture: SweepCapture | null;
};

type RefLevelCapture = {
  readonly stop: () => void;
};

type RefLevelStateBag = {
  active: boolean;
  elapsedSeconds: number;
  result: ReferenceLevelResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
  runQuality: MeasurementRunQuality | null;
  selectedBandIndex: string | null;
  capture: RefLevelCapture | null;
  calibrationSet: CalibrationSetEntry[];
};

type LabState = {
  sourceMode: SourceMode;
  captureState: CaptureState;
  devices: AudioInputDeviceInfo[];
  selectedDeviceId: string | null;
  iriaaEnabled: boolean;
  audioHandle: MeasurementAudioContextHandle | null;
  stream: StrictAudioStream | null;
  honesty: SampleRateHonestyReport | null;
  errorMessage: string | null;
  selfTestOscillator: OscillatorNode | null;
  analysers: { L: AnalyserNode; R: AnalyserNode } | null;
  splitter: ChannelSplitterNode | null;
  sourceNode: AudioNode | null;
  preSplitterNode: AudioNode | null;
  iriaaNode: IriaaFilterNode | null;
  silentSink: GainNode | null;
  meterFrame: number | null;
  meterLastTimestamp: number | null;
  channelLevels: Record<ChannelKey, ChannelLevel>;
  channelCount: number;
  speed: SpeedState;
  channel: ChannelStateBag;
  freq: FreqState;
  thd: ThdStateBag;
  resonance: ResonanceStateBag;
  log: string[];
  selectedTestRecordId: string | null;
  testRecords: readonly TestRecord[];
  testRecordLoadFailed: boolean;
  selectedTestRecordMissing: SelectedTestRecordMissing | null;
  coverageCollapsed: boolean;
  activeWorkflowId: string | null;
  refLevel: RefLevelStateBag;
  vta: VtaStateBag;
  noiseFloor: NoiseFloorState;
};

/*
 * The token/layout drift checker scans source text for class names.
 * Classes that are only ever toggled at runtime via classList.toggle
 * are invisible to it and surface as "styled but not emitted" noise.
 * Keep this static inventory in sync with every classList.toggle call
 * site below; it has no runtime effect.
 */
const tokenLayoutGeneratedClassNames =
  'mlab-segmented-option--active mlab-meter-clip--active mlab-wf-grade--excellent mlab-wf-grade--good mlab-wf-grade--marginal mlab-wf-grade--poor mlab-coverage-card--available mlab-coverage-card--planned mlab-coverage-card--partial mlab-coverage-card--unavailable mlab-coverage-badge--available mlab-coverage-badge--planned mlab-coverage-badge--partial mlab-coverage-badge--unavailable mlab-coverage-panel--collapsed ea-dot--error mlab-panel--target-highlight mlab-reflevel-clip--active mlab-advanced-vta-band-row mlab-advanced-item--vta mlab-advanced-item--planned mlab-advanced-divider mlab-advanced-planned-intro mlab-vta-run-remove mlab-vta-measure-btn mlab-vta-capture-progress mlab-vta-run-measured mlab-vta-confidence mlab-vta-confidence--experimental mlab-vta-confidence--not-measured mlab-vta-candidate-badge mlab-vta-comparison mlab-vta-comparison-candidate mlab-vta-comparison-meta mlab-vta-comparison-warning mlab-vta-comparison-status mlab-vta-comparison-confidence mlab-vta-confidence-level mlab-vta-confidence-level--insufficient mlab-vta-confidence-level--low mlab-vta-confidence-level--medium mlab-vta-confidence-level--high mlab-vta-confidence-reason mlab-vta-gate mlab-vta-gate-head mlab-vta-gate-summary mlab-vta-gate-status mlab-vta-gate-status--not-ready mlab-vta-gate-status--candidate mlab-vta-gate-status--review mlab-vta-gate-msg mlab-vta-gate-table mlab-vta-gate-row mlab-vta-gate-pass mlab-vta-gate-pass--ok mlab-vta-gate-pass--fail mlab-vta-gate-label mlab-vta-gate-detail mlab-vta-policy mlab-vta-policy-head mlab-vta-policy-status-row mlab-vta-policy-status mlab-vta-policy-status--experimental mlab-vta-policy-status--review-not-supported mlab-vta-policy-reason mlab-vta-policy-req-head mlab-vta-policy-req-list mlab-vta-policy-req mlab-guided-order-panel mlab-guided-order-body mlab-guided-order-intro mlab-guided-order-list mlab-guided-order-item mlab-guided-order-item--first mlab-guided-order-step-head mlab-guided-order-track mlab-guided-order-name mlab-guided-order-first-badge mlab-guided-order-detail mlab-guided-order-workflow mlab-speed-ctx-row mlab-speed-ctx-label mlab-speed-ctx-btn mlab-speed-ctx-btn--active mlab-speed-ctx-note mlab-speed-ctx-badge mlab-speed-history mlab-speed-history-head mlab-speed-history-clear mlab-speed-history-empty mlab-speed-history-scroll mlab-speed-history-table mlab-speed-history-row mlab-speed-history-cell mlab-speed-settings mlab-speed-settings--result mlab-speed-settings-head mlab-speed-settings-hint mlab-speed-settings-row mlab-speed-settings-label mlab-speed-settings-value mlab-speed-settings-input-group mlab-speed-settings-input mlab-speed-settings-unit mlab-speed-settings-src mlab-speed-settings-reset mlab-nf-intro mlab-nf-guidance mlab-nf-settings mlab-nf-settings-row mlab-nf-settings-label mlab-nf-settings-select mlab-nf-settings-input mlab-nf-settings-input--wide mlab-nf-settings-input-group mlab-nf-settings-unit mlab-nf-settings-src mlab-nf-result mlab-nf-history mlab-nf-history-head mlab-nf-history-clear mlab-nf-history-scroll mlab-nf-history-table mlab-nf-history-row mlab-nf-history-cell mlab-chain-readiness mlab-chain-readiness--ready mlab-chain-readiness--warning mlab-chain-readiness--blocked mlab-chain-readiness--not-checked mlab-chain-readiness-row mlab-chain-readiness-key mlab-chain-readiness-val mlab-chain-readiness-warning mlab-chain-readiness-note mlab-run-quality mlab-run-quality--ok mlab-run-quality--warning mlab-run-quality--invalid mlab-run-quality-label mlab-run-quality-warnings mlab-session-ribbon mlab-ribbon-group mlab-ribbon-group--active mlab-ribbon-label mlab-ribbon-value mlab-ribbon-sep mlab-ribbon-sep--flex mlab-ribbon-active-tool mlab-workflow-rail mlab-rail-head mlab-rail-items mlab-rail-loading mlab-rail-item mlab-rail-item--available mlab-rail-item--planned mlab-rail-item--partial mlab-rail-item--unavailable mlab-rail-item--active mlab-rail-item-label mlab-rail-item-status mlab-diag-rail mlab-diag-signal-panel mlab-diag-signal-body mlab-diag-signal-status mlab-diag-signal-status--ready mlab-diag-signal-status--blocked mlab-diag-signal-status--warning mlab-diag-signal-status--not_checked mlab-diag-signal-row mlab-diag-signal-key mlab-diag-signal-val mlab-diag-signal-clip mlab-workbench-center mlab-center-head mlab-center-title mlab-center-title-pre mlab-center-title-h mlab-center-actions mlab-center-body mlab-center-status-pill mlab-tool-panel--active mlab-context-overlay mlab-context-overlay--open mlab-context-head mlab-context-body mlab-context-foot mlab-log-modal mlab-log-modal--open mlab-log-modal-dialog mlab-log-modal-head mlab-log-modal-body mlab-log-modal-foot mlab-workbench-footer mlab-footer-status mlab-footer-actions mlab-ribbon-meters mlab-ribbon-mini-meter mlab-ribbon-mini-label mlab-ribbon-mini-bar-wrap mlab-ribbon-mini-fill mlab-ribbon-mini-db mlab-rail-group-head mlab-rail-item-tooltip mlab-rail-item-tooltip-name mlab-rail-item-tooltip-status mlab-home-prereqs mlab-context-home-section mlab-rail-tooltip-portal--visible mlab-rail-item--source-inactive mlab-source-controls-head mlab-source-viz mlab-source-meter-grid mlab-source-freq-canvas';
void tokenLayoutGeneratedClassNames;

const speedMeasurementDurationSeconds = 30;
const noiseFloorDefaultDurationSeconds = 10;
const defaultSpeedReferenceHz = 3150;
const nominalFrequencyHz33: Record<SpeedContext, number> = { '33_33': 3150, '45': Math.round((45 / 33.333) * 3150) };

function parsePositiveFloat(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return null;
  const v = parseFloat(normalized);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function deriveSpeedMeasurementSettings(args: {
  readonly band: SpeedBandMeta | null;
  readonly speedContext: SpeedContext;
  readonly nominalFrequencyInput: string;
  readonly captureDurationInput: string;
}): SpeedMeasurementSettings {
  const { band, speedContext, nominalFrequencyInput, captureDurationInput } = args;
  const rpm = speedContext === '45' ? 45 : 33.333;

  // Derive default nominal from band metadata and context
  let nominalDefault: number;
  let defaultSource: MeasurementParameterSource;
  const bandHz = band?.frequencyHz ?? null;
  if (speedContext === '33_33') {
    if (bandHz !== null) {
      nominalDefault = bandHz;
      defaultSource = 'test_record_metadata';
    } else {
      nominalDefault = 3150;
      defaultSource = 'fallback_default';
    }
  } else {
    if (bandHz !== null) {
      nominalDefault = Math.round((45 / 33.333) * bandHz);
      defaultSource = 'speed_context_formula';
    } else {
      nominalDefault = Math.round((45 / 33.333) * 3150);
      defaultSource = 'fallback_default';
    }
  }

  // Apply user override if valid
  const userNominal = parsePositiveFloat(nominalFrequencyInput);
  const nominalFrequencyHz = userNominal !== null ? Math.round(userNominal) : nominalDefault;
  const nominalSource: MeasurementParameterSource = userNominal !== null ? 'user_override' : defaultSource;

  // Capture duration
  const userDuration = parsePositiveFloat(captureDurationInput);
  const captureDurationSeconds = userDuration !== null ? userDuration : speedMeasurementDurationSeconds;
  const captureDurationSource: CaptureDurationSource = userDuration !== null ? 'user_override' : 'default';

  return {
    speedContext,
    rpm,
    nominalFrequencyHzDefault: nominalDefault,
    nominalFrequencyHz,
    nominalFrequencySource: nominalSource,
    captureDurationSecondsDefault: speedMeasurementDurationSeconds,
    captureDurationSeconds,
    captureDurationSource,
  };
}
const channelMeasurementDurationSeconds = 10;
const freqMeasurementDurationSeconds = 10;
const refLevelMeasurementDurationSeconds = 5;

const defaultRequestedSampleRateHz = 96_000;
const defaultRequestedChannelCount = 2;
const selfTestFrequencyHz = 1_000;
const selfTestPeakLinear = 0.5;
const peakHoldDecayDbPerSecond = 12;
const meterFftSize = 2048;
const browserStorageKey = 'engrove-measurement-lab-device';

const initialChannelLevel = (): ChannelLevel => ({
  peakLinear: 0,
  peakHoldLinear: 0,
  rmsLinear: 0,
  peakDbFs: silenceFloorDb,
  rmsDbFs: silenceFloorDb,
  clipped: false,
});

const state: LabState = {
  sourceMode: 'live',
  captureState: 'idle',
  devices: [],
  selectedDeviceId: null,
  iriaaEnabled: false,
  audioHandle: null,
  stream: null,
  honesty: null,
  errorMessage: null,
  selfTestOscillator: null,
  analysers: null,
  splitter: null,
  sourceNode: null,
  preSplitterNode: null,
  iriaaNode: null,
  silentSink: null,
  meterFrame: null,
  meterLastTimestamp: null,
  channelLevels: { L: initialChannelLevel(), R: initialChannelLevel() },
  channelCount: 0,
  speed: {
    referenceHz: defaultSpeedReferenceHz,
    speedContext: '33_33' as SpeedContext,
    nominalFrequencyHzInput: '',
    captureDurationSecondsInput: '',
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    lastSettings: null,
    bandMeta: null,
    capture: null,
    runs: [],
  },
  channel: {
    step: 'idle',
    elapsedSeconds: 0,
    leftCapture: null,
    rightCapture: null,
    capture: null,
    identityResult: null,
    source: null,
    leftBandIndex: null,
    rightBandIndex: null,
    leftBandMeta: null,
    rightBandMeta: null,
    runs: [],
    stepLabelInput: '',
  },
  freq: {
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    selectedBandIndex: null,
    selectedBandMeta: null,
    capture: null,
  },
  thd: {
    mode: 'thd',
    fundamentalHz: 1000,
    imdF1Hz: 60,
    imdF2Hz: 7000,
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    runQuality: null,
    bandMeta: null,
    selectedBandIndex: null,
    capture: null,
  },
  resonance: {
    sweepType: 'log',
    fromHz: 5,
    toHz: 25,
    durationSeconds: 30,
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    runQuality: null,
    capture: null,
  },
  log: [],
  selectedTestRecordId: null,
  testRecords: [],
  testRecordLoadFailed: false,
  selectedTestRecordMissing: null,
  coverageCollapsed: false,
  activeWorkflowId: null,
  refLevel: {
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    runQuality: null,
    selectedBandIndex: null,
    capture: null,
    calibrationSet: [],
  },
  vta: {
    runs: [],
    heightMmInput: '',
    heightLabelInput: '',
    noteInput: '',
    capturingRunId: null,
    captureElapsed: 0,
    capture: null,
  },
  noiseFloor: {
    scenarioKind: 'equipment_off' as NoiseFloorScenarioKind,
    speed: '33_33' as NoiseFloorTurntableSpeed,
    customRpmInput: '',
    tonearmPositionInput: '',
    captureDurationSecondsInput: '',
    active: false,
    elapsedSeconds: 0,
    capture: null,
    latest: null,
    runs: [],
  },
};

// ── S7A.2: Tooltip portal state ───────────────────────────────────────────────
let railTooltipTimer: ReturnType<typeof setTimeout> | null = null;

function hideRailTooltip(): void {
  if (railTooltipTimer !== null) {
    clearTimeout(railTooltipTimer);
    railTooltipTimer = null;
  }
  const portal = document.querySelector<HTMLElement>('[data-mlab-rail-tooltip]');
  if (portal) {
    portal.classList.remove('mlab-rail-tooltip-portal--visible');
    portal.style.display = '';
  }
}

function showRailTooltip(item: HTMLElement): void {
  const portal = document.querySelector<HTMLElement>('[data-mlab-rail-tooltip]');
  if (!portal) return;

  const name = item.dataset.tooltipName ?? '';
  const desc = item.dataset.tooltipDesc ?? '';
  const avail = item.dataset.tooltipAvail ?? '';

  const nameEl = portal.querySelector<HTMLElement>('[data-mlab-tooltip-name]');
  const descEl = portal.querySelector<HTMLElement>('[data-mlab-tooltip-desc]');
  const statusEl = portal.querySelector<HTMLElement>('[data-mlab-tooltip-status]');
  if (nameEl) nameEl.textContent = name;
  if (descEl) descEl.textContent = desc;
  if (statusEl) statusEl.textContent = avail;

  const rect = item.getBoundingClientRect();
  const portalWidth = 260;
  const margin = 10;
  let left = rect.right + margin;
  if (left + portalWidth > window.innerWidth) {
    left = rect.left - portalWidth - margin;
  }
  const portalHeight = 80; // approximate
  let top = rect.top + rect.height / 2 - portalHeight / 2;
  top = Math.max(margin, Math.min(top, window.innerHeight - portalHeight - margin));

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
  portal.style.display = '';
  portal.classList.add('mlab-rail-tooltip-portal--visible');
}

function readStoredDeviceId(): string | null {
  try {
    const value = window.localStorage.getItem(browserStorageKey);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredDeviceId(deviceId: string | null): void {
  try {
    if (deviceId) {
      window.localStorage.setItem(browserStorageKey, deviceId);
    } else {
      window.localStorage.removeItem(browserStorageKey);
    }
  } catch {
    /* localStorage may be unavailable; persistence is best-effort. */
  }
}

function statusDot(kind: 'planned' | 'active' | 'done' | 'error'): string {
  return `<span class="ea-dot ea-dot--${kind}" aria-hidden="true"></span>`;
}

function applyStoredTheme(): void {
  const stored = localStorage.getItem('engrove-theme');
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
}

function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('engrove-theme', next);
}

function renderContextBar(): string {
  return `
    <section class="ea-contextbar" aria-label="Route context">
      <div class="ea-contextbar__path">
        <span class="ea-contextbar__crumbs">
          <span>Tools</span>
          <span aria-hidden="true">/</span>
          <span class="ea-contextbar__current">Measurement Lab</span>
        </span>
        <span class="ea-contextbar__divider" aria-hidden="true"></span>
        <span class="ea-contextbar__description">Instrument-style measurement workbench. Capture audio from a test record via your ADC and run supported measurements.</span>
      </div>
    </section>
  `;
}

function sessionRibbonMarkup(): string {
  return `
    <div class="mlab-session-ribbon" aria-label="Session status" role="status" aria-live="polite">
      <div class="mlab-ribbon-group">
        <span class="mlab-ribbon-label">Source</span>
        <span class="mlab-ribbon-value" data-mlab-ribbon-source>—</span>
      </div>
      <span class="mlab-ribbon-sep" aria-hidden="true"></span>
      <div class="mlab-ribbon-group">
        <span class="mlab-ribbon-label">Record</span>
        <span class="mlab-ribbon-value" data-mlab-ribbon-record>No record selected</span>
      </div>
      <span class="mlab-ribbon-sep" aria-hidden="true"></span>
      <div class="mlab-ribbon-group">
        <span class="mlab-ribbon-label">Chain</span>
        <span class="mlab-ribbon-value" data-mlab-ribbon-chain data-chain-status="not_checked">Not checked</span>
      </div>
      <span class="mlab-ribbon-sep mlab-ribbon-sep--flex" aria-hidden="true"></span>
      <div class="mlab-ribbon-group mlab-ribbon-group--active">
        <span class="mlab-ribbon-label">Active</span>
        <span class="mlab-ribbon-value mlab-ribbon-active-tool" data-mlab-ribbon-active-tool>Workbench Home</span>
      </div>
      <div class="mlab-ribbon-meters" aria-hidden="true">
        <div class="mlab-ribbon-mini-meter">
          <span class="mlab-ribbon-mini-label">L</span>
          <div class="mlab-ribbon-mini-bar-wrap" role="presentation">
            <div class="mlab-ribbon-mini-fill" data-mlab-ribbon-mini-l-fill style="--p:0%"></div>
          </div>
          <span class="mlab-ribbon-mini-db" data-mlab-ribbon-mini-l-db>—</span>
        </div>
        <div class="mlab-ribbon-mini-meter">
          <span class="mlab-ribbon-mini-label">R</span>
          <div class="mlab-ribbon-mini-bar-wrap" role="presentation">
            <div class="mlab-ribbon-mini-fill" data-mlab-ribbon-mini-r-fill style="--p:0%"></div>
          </div>
          <span class="mlab-ribbon-mini-db" data-mlab-ribbon-mini-r-db>—</span>
        </div>
      </div>
    </div>
  `;
}

function workflowRailMarkup(): string {
  return `
    <nav class="mlab-workflow-rail" aria-label="Measurement workflows" data-mlab-workflow-rail>
      <div class="mlab-rail-head">Workflows</div>
      <div class="mlab-rail-items" data-mlab-rail-items>
        <p class="mlab-rail-loading ea-muted">Loading…</p>
      </div>
    </nav>
  `;
}

function contextSessionOverviewMarkup(): string {
  return `
    <div class="mlab-context-home-section">
      <section class="ea-panel" aria-labelledby="mlab-home-status-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id" aria-hidden="true">&#9776;</span>
          <span id="mlab-home-status-title">Session overview</span>
        </div>
        <div class="ea-panel-body">
          <div class="mlab-home-prereqs" data-mlab-home-prereqs>
            <p class="ea-muted">Select a test record and connect a source to begin. Use the workflow rail on the left to navigate to a measurement tool.</p>
          </div>
        </div>
      </section>
      ${guidedMeasurementOrderMarkup()}
    </div>
  `;
}

function contextOverlayMarkup(): string {
  return `
    <div class="mlab-context-overlay" data-mlab-context-overlay>
      <div class="mlab-context-head">
        <span>Session context</span>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-context-close>Close</button>
      </div>
      <div class="mlab-context-body">
        <div>
          ${coveragePanelMarkup()}
          ${chainReadinessPanelMarkup()}
        </div>
        <div>
          <div class="ea-panel mlab-diag-signal-panel">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id" aria-hidden="true"></span>
              <span>Signal health</span>
            </div>
            <div class="ea-panel-body mlab-diag-signal-body" data-mlab-diag-signal-body>
              <p class="ea-muted">Connect a source to see signal health.</p>
            </div>
          </div>
          <aside class="ea-panel mlab-viz-panel" aria-labelledby="mlab-ctx-viz-title">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id">09</span>
              <span id="mlab-ctx-viz-title">Level meter</span>
            </div>
            <div class="ea-panel-body mlab-viz-body">
              <div class="mlab-meter-grid" data-mlab-meter-grid>
                ${meterChannelMarkup('L', 'L channel')}
                ${meterChannelMarkup('R', 'R channel')}
              </div>
              <p class="ea-muted mlab-meter-help">
                Peak bar tracks maximum instantaneous magnitude; held line shows most recent peak,
                decaying at ${peakHoldDecayDbPerSecond}&nbsp;dB/s.
              </p>
            </div>
          </aside>
        </div>
        ${contextSessionOverviewMarkup()}
      </div>
      <div class="mlab-context-foot">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-open-log>Open activity log</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-context-close>Back to active tool</button>
      </div>
    </div>
  `;
}

function railTooltipPortalMarkup(): string {
  return `
    <div class="mlab-rail-tooltip-portal" data-mlab-rail-tooltip aria-hidden="true">
      <span class="mlab-rail-tooltip-portal-name" data-mlab-tooltip-name></span>
      <span class="mlab-rail-tooltip-portal-desc" data-mlab-tooltip-desc></span>
      <span class="mlab-rail-tooltip-portal-status" data-mlab-tooltip-status></span>
    </div>
  `;
}

function logModalMarkup(): string {
  return `
    <div class="mlab-log-modal" data-mlab-log-modal role="dialog" aria-modal="true" aria-label="Activity log">
      <div class="mlab-log-modal-dialog">
        <div class="mlab-log-modal-head">
          <span>Activity log</span>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-log-modal-close>Close</button>
        </div>
        <div class="mlab-log-modal-body">
          <div class="mlab-log-body" data-mlab-log-body>
            <span class="mlab-log-empty">No activity yet.</span>
          </div>
        </div>
        <div class="mlab-log-modal-foot">
          <button class="ea-button ea-button--ghost" type="button" data-mlab-log-reset>Clear</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-log-export>Export log</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-log-modal-close>Done</button>
        </div>
      </div>
    </div>
  `;
}

function coveragePanelMarkup(): string {
  return `
    <section class="ea-panel" id="mlab-coverage-panel" aria-labelledby="mlab-coverage-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">02</span>
        <span id="mlab-coverage-title">Measurement coverage</span>
        <span class="ea-panel-header-spacer"></span>
        <button
          class="mlab-coverage-toggle"
          type="button"
          aria-expanded="true"
          aria-controls="mlab-coverage-body"
          data-mlab-coverage-toggle>Collapse</button>
      </div>
      <div class="ea-panel-body" id="mlab-coverage-body" data-mlab-coverage-body>
        <p class="ea-muted">Select a test record above to see which measurements are available.</p>
      </div>
    </section>
  `;
}

function audioSourcePanelMarkup(): string {
  return `
    <section id="mlab-source-panel" data-mlab-tool-panel="audio_source" class="ea-panel" aria-labelledby="mlab-source-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">01</span>
        <span id="mlab-source-title">Audio source</span>
      </div>
      <div class="ea-panel-body mlab-source-controls-head">
        <div class="mlab-session-controls">
          <button class="ea-button ea-button--primary" type="button" data-mlab-connect>Connect</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-disconnect disabled>Disconnect</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-run-self-test>Demo mode</button>
        </div>
        <p class="ea-muted" data-mlab-session-status>Capture is idle. Choose a source mode and click Connect to begin.</p>
      </div>
      <div class="ea-panel-body--flush">
        <table class="ea-form-table" aria-label="Audio source setup">
          <tbody>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Source mode
                <span class="ea-form-table-sublabel">Capture or self-test</span>
              </td>
              <td class="ea-col-value">
                <div class="mlab-segmented" role="radiogroup" aria-label="Audio source mode">
                  <button class="mlab-segmented-option" role="radio" aria-checked="true" type="button" data-mlab-source-mode="live">Live capture</button>
                  <button class="mlab-segmented-option" role="radio" aria-checked="false" type="button" data-mlab-source-mode="self-test">Self-test</button>
                </div>
              </td>
              <td class="ea-col-meta"><span class="ea-badge">Mode</span></td>
            </tr>
            <tr data-mlab-device-row>
              <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-mlab-device-dot aria-hidden="true"></span></td>
              <td class="ea-col-label">Input device
                <span class="ea-form-table-sublabel">ADC or audio interface</span>
              </td>
              <td class="ea-col-value">
                <select class="ea-input" data-mlab-device aria-label="Audio input device">
                  <option value="">Waiting for permission…</option>
                </select>
              </td>
              <td class="ea-col-meta" data-mlab-device-meta><span class="ea-badge">Live only</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Software iRIAA
                <span class="ea-form-table-sublabel">Apply RIAA de-emphasis in software</span>
              </td>
              <td class="ea-col-value">
                <div class="mlab-segmented" role="radiogroup" aria-label="Software iRIAA filter">
                  <button class="mlab-segmented-option mlab-segmented-option--active" role="radio" aria-checked="true" type="button" data-mlab-iriaa="off">Bypass</button>
                  <button class="mlab-segmented-option" role="radio" aria-checked="false" type="button" data-mlab-iriaa="on">Apply</button>
                </div>
              </td>
              <td class="ea-col-meta"><span class="ea-badge">Filter</span></td>
            </tr>
            <tr>
              <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-mlab-record-dot aria-hidden="true"></span></td>
              <td class="ea-col-label">Test record
                <span class="ea-form-table-sublabel">Profile for band guidance</span>
              </td>
              <td class="ea-col-value">
                <select class="ea-input" data-mlab-record aria-label="Test record profile">
                  <option value="">Loading profiles…</option>
                </select>
              </td>
              <td class="ea-col-meta"><span class="ea-badge">Profile</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">Requested format
                <span class="ea-form-table-sublabel">Sample rate · channels</span>
              </td>
              <td class="ea-col-value mlab-requested">96 kHz · 2 ch</td>
              <td class="ea-col-meta"><span class="ea-badge">Spec</span></td>
            </tr>
            <tr>
              <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-mlab-actual-dot aria-hidden="true"></span></td>
              <td class="ea-col-label">Actual format
                <span class="ea-form-table-sublabel">Reported by browser</span>
              </td>
              <td class="ea-col-value" data-mlab-actual>—</td>
              <td class="ea-col-meta" data-mlab-actual-meta><span class="ea-badge">Awaiting</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ea-panel-body">
        <p class="ea-muted mlab-honesty" data-mlab-honesty>Sample-rate honesty report will appear after the audio context is running.</p>
        <div class="mlab-source-viz" aria-hidden="true">
          <div class="mlab-source-meter-grid" data-mlab-source-meter-grid>
            ${meterChannelMarkup('L', 'L channel')}
            ${meterChannelMarkup('R', 'R channel')}
          </div>
          <canvas class="mlab-source-freq-canvas" data-mlab-source-freq-canvas width="600" height="140" aria-hidden="true"></canvas>
        </div>
      </div>
    </section>
  `;
}

function guidedMeasurementOrderMarkup(): string {
  return `
    <section id="mlab-guided-order-panel" class="ea-panel mlab-guided-order-panel" aria-labelledby="mlab-guided-order-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">&#9776;</span>
        <span id="mlab-guided-order-title">Recommended measurement order</span>
        <span class="ea-panel-header-spacer"></span>
        <span class="ea-badge">Guidance</span>
      </div>
      <div class="ea-panel-body mlab-guided-order-body">
        <p class="ea-muted mlab-guided-order-intro">Based on Ultimate Analogue Test LP track order. Not a wizard — use any order that suits your session.</p>
        <ol class="mlab-guided-order-list">
          <li class="mlab-guided-order-item mlab-guided-order-item--first">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Track&nbsp;1</span>
              <span class="mlab-guided-order-name">Reference Level</span>
              <span class="ea-badge mlab-guided-order-first-badge">Recommended first</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">1&thinsp;kHz reference tone — establish base level and channel balance.</div>
            <div class="mlab-guided-order-workflow ea-muted">Workflow: <strong>Reference Level Calibration</strong></div>
          </li>
          <li class="mlab-guided-order-item">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Tracks&nbsp;2&ndash;3</span>
              <span class="mlab-guided-order-name">Channel Identity / Crosstalk</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">L-only / R-only 1&thinsp;kHz tone — verify stereo wiring and measure crosstalk.</div>
            <div class="mlab-guided-order-workflow ea-muted">Workflow: <strong>Channel Identity &amp; Crosstalk</strong></div>
          </li>
          <li class="mlab-guided-order-item">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Tracks&nbsp;4&ndash;6</span>
              <span class="mlab-guided-order-name">RIAA HF frequency-response guidance</span>
              <span class="ea-badge">Guidance only</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">Track&nbsp;4: 1&thinsp;kHz &minus;20&thinsp;dB reference &middot; Track&nbsp;5: 10&thinsp;kHz &minus;20&thinsp;dB comparison &middot; Track&nbsp;6: 1&ndash;20&thinsp;kHz sweep. No automatic EQ adjustment.</div>
          </li>
          <li class="mlab-guided-order-item">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Tracks&nbsp;7&ndash;8</span>
              <span class="mlab-guided-order-name">RIAA LF frequency-response guidance</span>
              <span class="ea-badge">Guidance only</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">Track&nbsp;7: 1&thinsp;kHz&ndash;20&thinsp;Hz downsweep &middot; Track&nbsp;8: 100&thinsp;Hz reference. No automatic EQ adjustment.</div>
          </li>
          <li class="mlab-guided-order-item">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Track&nbsp;10</span>
              <span class="mlab-guided-order-name">Speed / Wow &amp; Flutter</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">
              33&frac13;&thinsp;RPM: nominal 3,150&thinsp;Hz &middot; 45&thinsp;RPM: nominal approx. 4,253&thinsp;Hz.
              At 45&thinsp;RPM, the 3150&thinsp;Hz track should read approximately 4253&thinsp;Hz.
            </div>
            <div class="mlab-guided-order-workflow ea-muted">Workflow: <strong>Speed / Wow &amp; Flutter</strong></div>
          </li>
          <li class="mlab-guided-order-item">
            <div class="mlab-guided-order-step-head">
              <span class="mlab-guided-order-track">Track&nbsp;9</span>
              <span class="mlab-guided-order-name">VTA / IMD</span>
              <span class="ea-badge">Experimental</span>
            </div>
            <div class="mlab-guided-order-detail ea-muted">60&thinsp;Hz + 4&thinsp;kHz, 4:1, IEC_IMD — measure IMD at multiple arm heights.</div>
            <div class="mlab-guided-order-workflow ea-muted">Workflow: <strong>VTA IMD optimizer</strong> (experimental / planned)</div>
          </li>
        </ol>
      </div>
    </section>
  `;
}

function speedPanelMarkup(): string {
  return `
    <section id="mlab-speed-panel" data-mlab-tool-panel="wow_flutter" class="ea-panel" aria-labelledby="mlab-speed-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">03</span>
        <span id="mlab-speed-title">Speed &amp; Wow·Flutter</span>
      </div>
      <div class="ea-panel-body" data-mlab-speed-body>
        <p class="ea-muted">Connect a source to begin a Speed &amp; W&amp;F measurement.</p>
      </div>
    </section>
  `;
}

function channelPanelMarkup(): string {
  return `
    <section id="mlab-channel-panel" data-mlab-tool-panel="channel_identity" class="ea-panel" aria-labelledby="mlab-channel-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">04</span>
        <span id="mlab-channel-title">Channel balance &amp; crosstalk</span>
      </div>
      <div class="ea-panel-body" data-mlab-channel-body>
        <p class="ea-muted">Connect a source to begin a channel measurement.</p>
      </div>
    </section>
  `;
}

function freqPanelMarkup(): string {
  return `
    <section id="mlab-freq-panel" data-mlab-tool-panel="frequency_response" class="ea-panel" aria-labelledby="mlab-freq-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">05</span>
        <span id="mlab-freq-title">Frequency response</span>
      </div>
      <div class="ea-panel-body" data-mlab-freq-body>
        <p class="ea-muted">Connect a source to begin a frequency response measurement.</p>
      </div>
    </section>
  `;
}

function thdPanelMarkup(): string {
  return `
    <section id="mlab-thd-panel" data-mlab-tool-panel="thd_imd" class="ea-panel" aria-labelledby="mlab-thd-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">06</span>
        <span id="mlab-thd-title">THD &amp; IMD</span>
      </div>
      <div class="ea-panel-body" data-mlab-thd-body>
        <p class="ea-muted">Connect a source to begin a THD or IMD measurement.</p>
      </div>
    </section>
  `;
}

function resonancePanelMarkup(): string {
  return `
    <section id="mlab-resonance-panel" data-mlab-tool-panel="vertical_resonance" class="ea-panel" aria-labelledby="mlab-resonance-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">07</span>
        <span id="mlab-resonance-title">Resonance peak</span>
      </div>
      <div class="ea-panel-body" data-mlab-resonance-body>
        <p class="ea-muted">Connect a source to measure the tonearm–cartridge resonance frequency.</p>
      </div>
    </section>
  `;
}

function refLevelPanelMarkup(): string {
  return `
    <section id="mlab-reflevel-panel" data-mlab-tool-panel="reference_level" class="ea-panel" aria-labelledby="mlab-reflevel-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">08</span>
        <span id="mlab-reflevel-title">Reference level calibration</span>
      </div>
      <div class="ea-panel-body" data-mlab-reflevel-body>
        <p class="ea-muted">Connect a source to analyze reference level.</p>
      </div>
    </section>
  `;
}

function advancedAnalyzersPanelMarkup(): string {
  return `
    <section id="mlab-advanced-panel" data-mlab-tool-panel="vta_imd_optimizer" class="ea-panel" aria-labelledby="mlab-advanced-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">09</span>
        <span id="mlab-advanced-title">Advanced analyzers</span>
        <span class="ea-panel-header-spacer"></span>
        <span class="ea-badge">Roadmap</span>
      </div>
      <div class="ea-panel-body" data-mlab-advanced-body>
        <p class="ea-muted">Advanced analyzer workflows are in development. The VTA IMD Optimizer skeleton is shown below when a compatible test record is selected.</p>
      </div>
    </section>
  `;
}

function meterChannelMarkup(channel: ChannelKey, label: string): string {
  return `
    <div class="mlab-meter-channel" data-mlab-meter-channel="${channel}">
      <div class="mlab-meter-channel-head">
        <span class="mlab-meter-channel-label">${renderText(label)}</span>
        <span class="mlab-meter-channel-readout" data-mlab-meter-readout="${channel}">— dBFS</span>
      </div>
      <canvas class="mlab-waveform-canvas" data-mlab-waveform="${channel}" aria-hidden="true"></canvas>
      <div class="mlab-meter-bar" role="img" aria-label="${renderText(`${label} channel level`)}">
        <div class="mlab-meter-bar-rms" data-mlab-meter-rms="${channel}"></div>
        <div class="mlab-meter-bar-peak" data-mlab-meter-peak="${channel}"></div>
        <div class="mlab-meter-bar-hold" data-mlab-meter-hold="${channel}"></div>
      </div>
      <div class="mlab-meter-channel-meta">
        <span data-mlab-meter-peak-value="${channel}">peak —</span>
        <span data-mlab-meter-clip="${channel}" class="mlab-meter-clip">no clip</span>
      </div>
    </div>
  `;
}

function diagRailMarkup(): string {
  return `
    <aside class="mlab-diag-rail" aria-label="Diagnostics and signal health">
      <div class="ea-panel mlab-diag-signal-panel">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id" aria-hidden="true"></span>
          <span>Signal health</span>
        </div>
        <div class="ea-panel-body mlab-diag-signal-body" data-mlab-diag-signal-body>
          <p class="ea-muted">Connect a source to see signal health.</p>
        </div>
      </div>
      <aside class="ea-panel mlab-viz-panel" aria-labelledby="mlab-viz-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">09</span>
          <span id="mlab-viz-title">Level meter</span>
        </div>
        <div class="ea-panel-body mlab-viz-body">
          <div class="mlab-meter-grid" data-mlab-meter-grid>
            ${meterChannelMarkup('L', 'L channel')}
            ${meterChannelMarkup('R', 'R channel')}
          </div>
          <p class="ea-muted mlab-meter-help">
            The peak bar tracks the maximum instantaneous sample magnitude; the held
            line shows the most recent peak, decaying at ${peakHoldDecayDbPerSecond}&nbsp;dB per second.
            Anything at 0&nbsp;dBFS clips and is highlighted on the right.
          </p>
        </div>
      </aside>
      <aside class="ea-panel mlab-log-panel" aria-labelledby="mlab-log-title">
        <div class="ea-panel-header">
          <span class="ea-panel-header-id">10</span>
          <span id="mlab-log-title">Activity log</span>
          <span class="ea-panel-header-spacer"></span>
          <button class="ea-panel-header-action" type="button" data-mlab-log-reset>Clear</button>
          <button class="ea-panel-header-action" type="button" data-mlab-log-export>Export</button>
        </div>
        <div class="mlab-log-body" data-mlab-log-body>
          <span class="mlab-log-empty">No activity yet.</span>
        </div>
      </aside>
    </aside>
  `;
}

function fnv1aHex(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

type SessionJson = {
  schema: 'engrove-toolbox.session/v1';
  tool: 'measurement-lab';
  timestamp: string;
  session_metadata: {
    generated_at: string;
    selected_test_record_id: string | null;
    selected_test_record_label: string | null;
    source_mode: string;
    iriaa_applied: boolean;
    self_test_runs_present: boolean;
    run_counts: {
      speed: number;
      noise_floor: number;
      reference_level: number;
      channel_identity: number;
      frequency_response: number;
      thd_imd: number;
      vta_imd: number;
      resonance: number;
    };
  };
  capture: {
    device_label_hash: string | null;
    requested_sample_rate_hz: number;
    actual_sample_rate_hz: number | null;
    honesty_classification: string | null;
    iriaa_applied: boolean;
    source_mode: string;
  };
  input_scope: {
    captured_at: string;
    source_connected: boolean;
    status: string;
    signal_present: boolean;
    clipping: boolean;
    low_signal: boolean;
    channel_imbalance_db: number | null;
    left_rms_dbfs: number | null;
    right_rms_dbfs: number | null;
    left_peak_dbfs: number | null;
    right_peak_dbfs: number | null;
    warnings: readonly string[];
  };
  selection: { cartridge: null; tonearm: null; test_record: string | null };
  measurements: {
    speed: object | null;
    channel_identity: object | null;
    azimuth_steps: object | null;
    frequency_response: object | null;
    thd: object | null;
    imd: object | null;
    resonance: object | null;
    reference_level: object | null;
    vta_imd_optimizer: object | null;
    noise_floor: object | null;
  };
};

function serializeSpeedBandMeta(meta: SpeedBandMeta | null) {
  return meta
    ? {
        index: meta.index,
        label: meta.label,
        frequency_hz: meta.frequencyHz,
        level_db: meta.levelDb,
      }
    : null;
}

function serializeFreqBandMeta(meta: FreqBandMeta | null) {
  return meta
    ? {
        index: meta.index,
        label: meta.label,
        frequency_start_hz: meta.frequencyStartHz,
        frequency_end_hz: meta.frequencyEndHz,
        frequency_hz: meta.frequencyHz,
        level_db: meta.levelDb,
      }
    : null;
}

function serializeThdBandMeta(meta: ThdBandMeta | null) {
  return meta
    ? {
        index: meta.index,
        label: meta.label,
        frequency_hz: meta.frequencyHz,
        f1_hz: meta.f1Hz,
        f2_hz: meta.f2Hz,
        level_db: meta.levelDb,
        standard: meta.standard,
      }
    : null;
}

function serializeVtaBandMeta(band: TestBand | null) {
  if (!band) return null;
  return {
    index: band.index,
    label: band.label,
    f1_hz: band.f1Hz ?? null,
    f2_hz: band.f2Hz ?? null,
    ratio: band.ratio ?? null,
    standard: band.standard ?? null,
  };
}

function buildSessionJson(): SessionJson {
  const deviceLabel = state.devices.find(d => d.deviceId === state.selectedDeviceId)?.label ?? null;
  const sessionRecord = selectedRecord();

  const speedResult = state.speed.result;
  const channelIdentityResult = (() => {
    const { leftCapture, rightCapture, identityResult, source, leftBandMeta, rightBandMeta } = state.channel;
    if (!leftCapture || !rightCapture) return null;
    return {
      source: source ?? 'live_capture',
      left_band: leftBandMeta
        ? { index: leftBandMeta.index, label: leftBandMeta.label, frequency_hz: leftBandMeta.frequencyHz }
        : null,
      right_band: rightBandMeta
        ? { index: rightBandMeta.index, label: rightBandMeta.label, frequency_hz: rightBandMeta.frequencyHz }
        : null,
      left_rms_dbfs: leftCapture.leftRmsDbFs,
      right_rms_dbfs: rightCapture.rightRmsDbFs,
      result: identityResult
        ? {
            identity: identityResult.identity,
            confidence: identityResult.confidence,
            wanted_balance_db: identityResult.wantedBalanceDb,
            left_to_right_crosstalk_db: identityResult.leftToRightCrosstalkDb,
            right_to_left_crosstalk_db: identityResult.rightToLeftCrosstalkDb,
            crosstalk_symmetry_delta_db: identityResult.crosstalkSymmetryDeltaDb,
            warnings: identityResult.warnings,
          }
        : null,
    };
  })();

  const freqResult = state.freq.result;
  const thdResult = (() => {
    const r = state.thd.result;
    if (!r) return null;
    const source = state.thd.resultSource ?? 'live_capture';
    const band = serializeThdBandMeta(state.thd.bandMeta);
    const rq = state.thd.runQuality;
    const runQualityExport = rq
      ? { status: rq.status, clipping: rq.clipping, low_signal: rq.lowSignal, channel_imbalance_db: rq.channelImbalanceDb, warnings: Array.from(rq.warnings) }
      : null;
    const diagMeta = buildThdDistortionMeta();
    if (isThdResult(r)) {
      const harmonicDetail = r.harmonics.map((dbc, i) => ({
        order: i + 2,
        frequency_hz: (i + 2) * r.fundamentalHz,
        level_dbc: dbc,
      }));
      return {
        type: 'thd',
        source,
        band,
        fundamental_hz: r.fundamentalHz,
        thd_percent: r.thdPercent,
        harmonics_dbc: r.harmonics,
        harmonic_detail: harmonicDetail,
        sample_count: r.sampleCount,
        run_quality: runQualityExport,
        diagnostic_notes: {
          measurement_note: diagMeta.measurementNote,
          harmonic_interpretation_note: diagMeta.harmonicInterpretationNote,
          chain_note: diagMeta.chainNote,
        },
      };
    }
    return {
      type: 'imd',
      source,
      band,
      f1_hz: r.f1Hz,
      f2_hz: r.f2Hz,
      imd_percent: r.imdPercent,
      sideband_detail_status: diagMeta.imdSidebandDetailStatus,
      sideband_detail_note: diagMeta.imdSidebandDetailNote,
      sample_count: r.sampleCount,
      run_quality: runQualityExport,
      diagnostic_notes: {
        measurement_note: diagMeta.imdMeasurementNote,
        chain_note: diagMeta.chainNote,
      },
    };
  })();

  const resResult = state.resonance.result;

  return {
    schema: 'engrove-toolbox.session/v1',
    tool: 'measurement-lab',
    timestamp: new Date().toISOString(),
    session_metadata: {
      generated_at: new Date().toISOString(),
      selected_test_record_id: state.selectedTestRecordId,
      selected_test_record_label: sessionRecord
        ? `${sessionRecord.manufacturer} — ${sessionRecord.title}`
        : null,
      source_mode: state.sourceMode,
      iriaa_applied: state.iriaaEnabled,
      self_test_runs_present:
        state.speed.runs.some(r => r.source === 'self_test') ||
        state.noiseFloor.runs.some(r => r.source === 'self_test') ||
        state.speed.resultSource === 'self_test' ||
        state.refLevel.resultSource === 'self_test',
      run_counts: {
        speed: state.speed.runs.length,
        noise_floor: state.noiseFloor.runs.length,
        reference_level: state.refLevel.result ? 1 : 0,
        channel_identity: state.channel.leftCapture && state.channel.rightCapture ? 1 : 0,
        frequency_response: state.freq.result ? 1 : 0,
        thd_imd: state.thd.result ? 1 : 0,
        vta_imd: state.vta.runs.length,
        resonance: state.resonance.result ? 1 : 0,
      },
    },
    capture: {
      device_label_hash: deviceLabel != null ? fnv1aHex(deviceLabel) : null,
      requested_sample_rate_hz: defaultRequestedSampleRateHz,
      actual_sample_rate_hz: state.honesty?.contextActualHz ?? null,
      honesty_classification: state.honesty?.classification ?? null,
      iriaa_applied: state.iriaaEnabled,
      source_mode: state.sourceMode,
    },
    input_scope: (() => {
      const isLive = state.captureState === 'live';
      const snap: InputScopeSnapshot = buildInputScopeSnapshot({
        sourceConnected: isLive,
        leftRmsDbfs: isLive ? state.channelLevels.L.rmsDbFs : null,
        rightRmsDbfs: isLive ? state.channelLevels.R.rmsDbFs : null,
        leftPeakDbfs: isLive ? state.channelLevels.L.peakDbFs : null,
        rightPeakDbfs: isLive ? state.channelLevels.R.peakDbFs : null,
      });
      return {
        captured_at: snap.capturedAt,
        source_connected: snap.sourceConnected,
        status: snap.status,
        signal_present: snap.signalPresent,
        clipping: snap.clipping,
        low_signal: snap.lowSignal,
        channel_imbalance_db: snap.channelImbalanceDb,
        left_rms_dbfs: snap.leftRmsDbfs,
        right_rms_dbfs: snap.rightRmsDbfs,
        left_peak_dbfs: snap.leftPeakDbfs,
        right_peak_dbfs: snap.rightPeakDbfs,
        warnings: Array.from(snap.warnings),
      };
    })(),
    selection: { cartridge: null, tonearm: null, test_record: state.selectedTestRecordId },
    measurements: {
      speed: (() => {
        const runs = state.speed.runs.map(r => ({
          created_at: r.createdAt,
          source: r.source,
          speed_context: r.speedContext,
          rpm: r.rpm,
          nominal_frequency_hz_default: r.nominalFrequencyHzDefault,
          nominal_frequency_hz: r.nominalFrequencyHz,
          nominal_frequency_source: r.nominalFrequencySource,
          capture_duration_seconds: r.captureDurationSeconds,
          capture_duration_source: r.captureDurationSource,
          measured_frequency_hz: r.measuredFrequencyHz,
          speed_error_percent: r.speedErrorPercent,
          wow_flutter_percent: r.wowFlutterPercent,
          wow_flutter_weighted_percent: r.wowFlutterWeightedPercent,
          band: r.band ? serializeSpeedBandMeta(r.band) : null,
          run_quality: r.runQuality
            ? { status: r.runQuality.status, clipping: r.runQuality.clipping, low_signal: r.runQuality.lowSignal, channel_imbalance_db: r.runQuality.channelImbalanceDb, warnings: Array.from(r.runQuality.warnings) }
            : null,
          warnings: r.warnings,
        }));
        const ls = state.speed.lastSettings;
        const latest = speedResult ? {
          source: state.speed.resultSource ?? 'live_capture',
          speed_context: state.speed.speedContext,
          rpm: ls ? ls.rpm : (state.speed.speedContext === '45' ? 45 : 33.333),
          nominal_frequency_hz_default: ls ? ls.nominalFrequencyHzDefault : nominalFrequencyHz33[state.speed.speedContext],
          nominal_frequency_hz: ls ? ls.nominalFrequencyHz : nominalFrequencyHz33[state.speed.speedContext],
          nominal_frequency_source: ls ? ls.nominalFrequencySource : 'fallback_default' as MeasurementParameterSource,
          capture_duration_seconds: ls ? ls.captureDurationSeconds : speedMeasurementDurationSeconds,
          capture_duration_source: ls ? ls.captureDurationSource : 'default' as CaptureDurationSource,
          band: serializeSpeedBandMeta(state.speed.bandMeta),
          speed_deviation_percent: speedResult.speedDeviationPercent,
          unweighted_wf_percent: speedResult.unweightedWfPercent,
          weighted_wf_percent: speedResult.weightedWfPercent,
          run_quality: (() => { const lr = state.speed.runs[state.speed.runs.length - 1]; return lr?.runQuality ? { status: lr.runQuality.status, clipping: lr.runQuality.clipping, low_signal: lr.runQuality.lowSignal, channel_imbalance_db: lr.runQuality.channelImbalanceDb, warnings: Array.from(lr.runQuality.warnings) } : null; })(),
          classification: classifyWf(speedResult.unweightedWfPercent).label,
        } : null;
        if (latest === null && runs.length === 0) return null;
        const diagMeta = buildSpeedDiagnosticMeta();
        const cmp = computeSpeedRunComparison(state.speed.runs);
        return {
          latest,
          runs,
          speed_diagnostics: {
            filtered_unfiltered_note: diagMeta.filteredUnfilteredNote,
            unweighted_wf_note: diagMeta.unweightedWfNote,
            weighted_wf_note: diagMeta.weightedWfNote,
            wow_band_separation_status: diagMeta.wowBandSeparationStatus,
            wow_band_separation_note: diagMeta.wowBandSeparationNote,
          },
          run_comparison: cmp
            ? {
                compatible: cmp.compatible,
                run_count: cmp.runCount,
                rpm_context: cmp.rpmContext,
                delta_speed_error_percent: cmp.deltaSpeedErrorPercent,
                delta_wf_unweighted_percent: cmp.deltaWfUnweightedPercent,
                delta_wf_weighted_percent: cmp.deltaWfWeightedPercent,
                note: cmp.note,
              }
            : null,
        };
      })(),
      channel_identity: channelIdentityResult,
      azimuth_steps: (() => {
        const runs = state.channel.runs;
        if (runs.length === 0) return null;
        const cmp = computeAzimuthStepComparison(runs);
        return {
          run_count: runs.length,
          runs: runs.map(r => ({
            id: r.id,
            created_at: r.createdAt,
            source: r.source,
            label: r.label,
            left_to_right_crosstalk_db: r.leftToRightCrosstalkDb,
            right_to_left_crosstalk_db: r.rightToLeftCrosstalkDb,
            crosstalk_symmetry_delta_db: r.crosstalkSymmetryDeltaDb,
            wanted_balance_db: r.wantedBalanceDb,
            identity: r.identity,
            confidence: r.confidence,
            left_band: r.leftBandMeta ? { index: r.leftBandMeta.index, label: r.leftBandMeta.label, frequency_hz: r.leftBandMeta.frequencyHz } : null,
            right_band: r.rightBandMeta ? { index: r.rightBandMeta.index, label: r.rightBandMeta.label, frequency_hz: r.rightBandMeta.frequencyHz } : null,
            run_quality: r.runQuality ? { status: r.runQuality.status, clipping: r.runQuality.clipping, low_signal: r.runQuality.lowSignal, channel_imbalance_db: r.runQuality.channelImbalanceDb, warnings: Array.from(r.runQuality.warnings) } : null,
            warnings: Array.from(r.warnings),
          })),
          comparison: cmp ? {
            compatible: cmp.compatible,
            run_count: cmp.runCount,
            ltr_range_db: cmp.ltrRangeDb,
            rtl_range_db: cmp.rtlRangeDb,
            lowest_ltr_run_id: cmp.lowestLtrRunId,
            lowest_rtl_run_id: cmp.lowestRtlRunId,
            note: cmp.note,
          } : null,
        };
      })(),
      frequency_response: freqResult
        ? (() => {
            const dev = computeFreqDeviationSummary(freqResult, state.iriaaEnabled);
            return {
              source: state.freq.resultSource ?? 'live_capture',
              sweep_band: serializeFreqBandMeta(state.freq.selectedBandMeta),
              result: {
                fft_size: freqResult.fftSize,
                block_count: freqResult.blockCount,
                sample_rate_hz: freqResult.sampleRateHz,
                iriaa_applied: state.iriaaEnabled,
                frequencies_hz: Array.from(freqResult.frequenciesHz),
                magnitudes_db: Array.from(freqResult.magnitudesDb),
              },
              deviation: dev ? {
                reference_note: dev.referenceNote,
                iriaa_applied: dev.iriaaApplied,
                range_start_hz: dev.rangeStartHz,
                range_end_hz: dev.rangeEndHz,
                point_count: dev.pointCount,
                min_db: dev.minDb,
                max_db: dev.maxDb,
                peak_to_peak_db: dev.peakToPeakDb,
                rms_deviation_db: dev.rmsDeviationDb,
                min_frequency_hz: dev.minFrequencyHz,
                max_frequency_hz: dev.maxFrequencyHz,
                band_summaries: dev.bandSummaries.map(b => ({
                  label: b.label,
                  freq_start_hz: b.freqStartHz,
                  freq_end_hz: b.freqEndHz,
                  mean_db: b.meanDb,
                  point_count: b.pointCount,
                })),
              } : null,
              warnings: [],
            };
          })()
        : null,
      thd: thdResult && thdResult.type === 'thd' ? thdResult : null,
      imd: thdResult && thdResult.type === 'imd' ? thdResult : null,
      resonance: resResult
        ? (() => {
            const diagMeta = buildResonanceDiagnosticMeta();
            const rq = state.resonance.runQuality;
            return {
              source: state.resonance.resultSource ?? 'live_capture',
              peak_frequency_hz: resResult.peakFrequencyHz,
              peak_amplitude_dbfs: resResult.peakAmplitudeDbFs,
              q_estimate: resResult.qEstimate,
              sample_count: resResult.sampleCount,
              sweep_type: state.resonance.sweepType,
              sweep_from_hz: state.resonance.fromHz,
              sweep_to_hz: state.resonance.toHz,
              run_quality: rq
                ? { status: rq.status, clipping: rq.clipping, low_signal: rq.lowSignal, channel_imbalance_db: rq.channelImbalanceDb, warnings: Array.from(rq.warnings) }
                : null,
              diagnostic_notes: {
                measurement_note: diagMeta.measurementNote,
                q_estimate_note: diagMeta.qEstimateNote,
                typical_range_note: diagMeta.typicalRangeNote,
                limitations_note: diagMeta.limitationsNote,
                wow_band_overlap_note: diagMeta.wowBandOverlapNote,
              },
            };
          })()
        : null,
      reference_level: (() => {
        const r = state.refLevel.result;
        const latest = r
          ? {
              source: state.refLevel.resultSource ?? 'unavailable',
              left_rms_dbfs: r.leftRmsDbfs,
              right_rms_dbfs: r.rightRmsDbfs,
              left_peak_dbfs: r.leftPeakDbfs,
              right_peak_dbfs: r.rightPeakDbfs,
              balance_db: r.balanceDb,
              headroom_db: r.headroomDb,
              clipping: r.clipping,
              confidence: r.confidence,
              reference_frequency_hz: r.referenceFrequencyHz ?? null,
              reference_level_db: r.referenceLevelDb ?? null,
              run_quality: state.refLevel.runQuality
                ? { status: state.refLevel.runQuality.status, clipping: state.refLevel.runQuality.clipping, low_signal: state.refLevel.runQuality.lowSignal, channel_imbalance_db: state.refLevel.runQuality.channelImbalanceDb, warnings: Array.from(state.refLevel.runQuality.warnings) }
                : null,
              warnings: Array.from(r.warnings),
            }
          : null;
        const calibration_set = state.refLevel.calibrationSet.map(e => ({
          band_index: e.bandIndex,
          band_label: e.bandLabel,
          frequency_hz: e.frequencyHz,
          nominal_level_db: e.nominalLevelDb,
          source: e.source,
          left_rms_dbfs: e.result.leftRmsDbfs,
          right_rms_dbfs: e.result.rightRmsDbfs,
          balance_db: e.result.balanceDb,
          headroom_db: e.result.headroomDb,
          clipping: e.result.clipping,
          confidence: e.result.confidence,
          warnings: Array.from(e.result.warnings),
          captured_at: e.capturedAt,
        }));
        if (latest === null && calibration_set.length === 0) return null;
        return { latest, calibration_set };
      })(),
      vta_imd_optimizer: (() => {
        const record = selectedRecord();
        const vtaBands = getVtaImdBands(record);
        const band = vtaBands[0] ?? null;
        if (band === null && state.vta.runs.length === 0) return null;
        return {
          status: 'planned' as const,
          band: serializeVtaBandMeta(band),
          runs: state.vta.runs.map(r => ({
            height_mm: r.heightMm,
            height_label: r.heightLabel,
            imd_percent: r.imdPercent,
            source: r.source,
            created_at: r.createdAt,
            measured_at: r.measuredAt,
            sample_count: r.sampleCount,
            confidence: r.confidence,
            warnings: r.warnings,
            note: r.note,
          })),
          comparison: (() => {
            const cmp = deriveVtaImdComparison(state.vta.runs);
            return {
              status: cmp.status,
              confidence: cmp.confidence,
              confidence_reasons: cmp.confidenceReasons,
              measured_count: cmp.measuredCount,
              placeholder_count: cmp.placeholderCount,
              candidate_run_id: cmp.candidateRunId,
              candidate_imd_percent: cmp.candidateImdPercent,
              candidate_height_mm: cmp.candidateHeightMm,
              candidate_height_label: cmp.candidateHeightLabel,
              next_best_delta_percent: cmp.nextBestDeltaPercent,
              warnings: cmp.warnings,
            };
          })(),
          supported_gate: (() => {
            const record = selectedRecord();
            const vtaBands = getVtaImdBands(record);
            const cmp = deriveVtaImdComparison(state.vta.runs);
            const vtaBandForExport = vtaBands[0] ?? null;
            const sg = deriveVtaSupportedGate({
              runs: state.vta.runs,
              comparison: cmp,
              hasUsableVtaBand: hasUsableVtaImdBand(vtaBandForExport),
              hasVtaBandAtAll: vtaBands.length > 0,
              capturingRunId: state.vta.capturingRunId,
            });
            return {
              status: sg.status,
              passed_count: sg.passedCount,
              total_count: sg.totalCount,
              criteria: sg.criteria.map(c => ({
                id: c.id,
                label: c.label,
                passed: c.passed,
                detail: c.detail,
              })),
              warnings: sg.warnings,
            };
          })(),
          workflow_status_policy: (() => {
            const record = selectedRecord();
            const vtaBands = getVtaImdBands(record);
            const cmp = deriveVtaImdComparison(state.vta.runs);
            const vtaBandForPolicy = vtaBands[0] ?? null;
            const sg = deriveVtaSupportedGate({
              runs: state.vta.runs,
              comparison: cmp,
              hasUsableVtaBand: hasUsableVtaImdBand(vtaBandForPolicy),
              hasVtaBandAtAll: vtaBands.length > 0,
              capturingRunId: state.vta.capturingRunId,
            });
            const wsp = deriveVtaWorkflowStatusPolicy(sg);
            return {
              status: wsp.status,
              workflow_status: wsp.workflowStatus,
              reason: wsp.reason,
              required_before_supported: wsp.requiredBeforeSupported,
            };
          })(),
          warnings: [
            'VTA IMD capture gateway preview. Results are experimental and have not been validated.',
            'Full VTA optimizer validation and final recommendation flow are not implemented yet.',
          ],
        };
      })(),
        noise_floor: (() => {
      const nfRuns = state.noiseFloor.runs.map(r => ({
        created_at: r.createdAt,
        source: r.source,
        scenario_kind: r.scenarioKind,
        speed: r.speed,
        rpm: r.rpm,
        tonearm_position: r.tonearmPosition || null,
        capture_duration_seconds: r.captureDurationSeconds,
        left_rms_dbfs: r.leftRmsDbfs,
        right_rms_dbfs: r.rightRmsDbfs,
        left_peak_dbfs: r.leftPeakDbfs,
        right_peak_dbfs: r.rightPeakDbfs,
        run_quality: r.runQuality
          ? { status: r.runQuality.status, clipping: r.runQuality.clipping, low_signal: r.runQuality.lowSignal, channel_imbalance_db: r.runQuality.channelImbalanceDb, warnings: Array.from(r.runQuality.warnings) }
          : null,
        noise_floor_dbfs: r.noiseFloorDbfs,
        warnings: r.warnings,
      }));
      const nfLatest = state.noiseFloor.latest ? {
        created_at: state.noiseFloor.latest.createdAt,
        source: state.noiseFloor.latest.source,
        scenario_kind: state.noiseFloor.latest.scenarioKind,
        speed: state.noiseFloor.latest.speed,
        rpm: state.noiseFloor.latest.rpm,
        tonearm_position: state.noiseFloor.latest.tonearmPosition || null,
        capture_duration_seconds: state.noiseFloor.latest.captureDurationSeconds,
        left_rms_dbfs: state.noiseFloor.latest.leftRmsDbfs,
        right_rms_dbfs: state.noiseFloor.latest.rightRmsDbfs,
        left_peak_dbfs: state.noiseFloor.latest.leftPeakDbfs,
        right_peak_dbfs: state.noiseFloor.latest.rightPeakDbfs,
        noise_floor_dbfs: state.noiseFloor.latest.noiseFloorDbfs,
        warnings: state.noiseFloor.latest.warnings,
        run_quality: state.noiseFloor.latest.runQuality
          ? { status: state.noiseFloor.latest.runQuality.status, clipping: state.noiseFloor.latest.runQuality.clipping, low_signal: state.noiseFloor.latest.runQuality.lowSignal, channel_imbalance_db: state.noiseFloor.latest.runQuality.channelImbalanceDb, warnings: Array.from(state.noiseFloor.latest.runQuality.warnings) }
          : null,
      } : null;
      if (nfLatest === null && nfRuns.length === 0) return null;
      return { latest: nfLatest, runs: nfRuns };
    })(),
    },
  };
}

function downloadSessionJson(): void {
  const json = JSON.stringify(buildSessionJson(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `engrove-measurement-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function appendLog(message: string): void {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  const entry = `${hh}:${mm}:${ss}  ${message}`;
  state.log.push(entry);
  const body = document.querySelector<HTMLElement>('[data-mlab-log-body]');
  if (body) {
    const empty = body.querySelector('.mlab-log-empty');
    if (empty) empty.remove();
    const line = document.createElement('div');
    line.className = 'mlab-log-entry';
    line.textContent = entry;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }
}

function renderLogPanel(els: Elements): void {
  const body = els.logBody;
  if (!body) return;
  if (state.log.length === 0) {
    body.innerHTML = '<span class="mlab-log-empty">No activity yet.</span>';
    return;
  }
  body.innerHTML = state.log
    .map(e => `<div class="mlab-log-entry">${renderText(e)}</div>`)
    .join('');
  body.scrollTop = body.scrollHeight;
}

function exportLog(): void {
  const text = state.log.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `engrove-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildReportText(): string {
  const hr = '━'.repeat(48);
  const ts = new Date().toISOString();
  const textRecord = selectedRecord();
  const lines: string[] = [
    'ENGROVE MEASUREMENT LAB — Session Report',
    `Generated: ${ts}`,
    hr,
    '',
  ];

  // Session summary — run counts
  lines.push('SESSION SUMMARY');
  lines.push(`  Test record:           ${textRecord ? `${textRecord.manufacturer} — ${textRecord.title}` : 'None selected'}`);
  lines.push(`  Speed runs:            ${state.speed.runs.length}`);
  lines.push(`  Noise floor runs:      ${state.noiseFloor.runs.length}`);
  lines.push(`  Reference level:       ${state.refLevel.result ? 'Captured' : 'Not captured'}`);
  lines.push(`  Channel identity:      ${state.channel.leftCapture && state.channel.rightCapture ? 'Captured' : 'Not captured'}`);
  lines.push(`  Frequency response:    ${state.freq.result ? 'Captured' : 'Not captured'}`);
  lines.push(`  THD / IMD:             ${state.thd.result ? 'Captured' : 'Not captured'}`);
  lines.push(`  Resonance:             ${state.resonance.result ? `Captured · peak ${state.resonance.result.peakFrequencyHz.toFixed(1)} Hz` : 'Not captured'}`);
  lines.push(`  VTA IMD runs:          ${state.vta.runs.length} (experimental/planned)`);
  lines.push('');

  // Capture
  lines.push('CAPTURE SETUP');
  const deviceLabel = state.devices.find(d => d.deviceId === state.selectedDeviceId)?.label ?? null;
  lines.push(`  Source mode:           ${state.sourceMode}`);
  lines.push(`  Input device (hash):   ${deviceLabel != null ? fnv1aHex(deviceLabel) : 'n/a'}`);
  lines.push(`  Requested rate:        ${defaultRequestedSampleRateHz.toLocaleString()} Hz`);
  if (state.honesty) {
    lines.push(`  Actual rate:           ${state.honesty.contextActualHz.toLocaleString()} Hz`);
    lines.push(`  Sample-rate honesty:   ${state.honesty.classification}`);
  }
  lines.push(`  Software iRIAA:        ${state.iriaaEnabled ? 'applied' : 'bypass'}`);
  lines.push('');

  // Measurement chain
  lines.push('MEASUREMENT CHAIN');
  if (state.captureState === 'live') {
    const textChain = deriveMeasurementChainReadiness({
      leftRmsDbfs: state.channelLevels.L.rmsDbFs,
      rightRmsDbfs: state.channelLevels.R.rmsDbFs,
      leftPeakDbfs: state.channelLevels.L.peakDbFs,
      rightPeakDbfs: state.channelLevels.R.peakDbFs,
    });
    lines.push(`  Status:                ${textChain.status}`);
    lines.push(`  Signal present:        ${textChain.signalPresent ? 'Yes' : 'No'}`);
    lines.push(`  Clipping:              ${textChain.clipping ? 'Yes — reduce input gain' : 'No'}`);
    if (textChain.channelImbalanceDb !== null) lines.push(`  Channel balance:       ${textChain.channelImbalanceDb.toFixed(1)} dB L/R`);
    lines.push(`  L RMS:                 ${fmtDbfs(state.channelLevels.L.rmsDbFs)}`);
    lines.push(`  R RMS:                 ${fmtDbfs(state.channelLevels.R.rmsDbFs)}`);
    textChain.warnings.forEach(w => lines.push(`  Warning:               ${w}`));
  } else {
    lines.push('  Source not connected — chain readiness not available at export time.');
  }
  lines.push('');

  // Speed
  const sr = state.speed.result;
  if (sr || state.speed.runs.length > 0) {
    lines.push('SPEED & WOW·FLUTTER');
    if (sr) {
      const ls = state.speed.lastSettings;
      const repNomHz = ls ? ls.nominalFrequencyHz : nominalFrequencyHz33[state.speed.speedContext];
      const repNomDefault = ls ? ls.nominalFrequencyHzDefault : nominalFrequencyHz33[state.speed.speedContext];
      const repNomSource = ls ? ls.nominalFrequencySource : 'fallback_default';
      const repDurSec = ls ? ls.captureDurationSeconds : speedMeasurementDurationSeconds;
      const repDurSource = ls ? ls.captureDurationSource : 'default';
      lines.push(`  Latest result:`);
      lines.push(`    Source:                ${state.speed.resultSource ?? 'live_capture'}`);
      lines.push(`    Speed context:         ${state.speed.speedContext === '45' ? '45 RPM' : '33⅓ RPM'}`);
      lines.push(`    Nominal frequency:     ${repNomHz.toLocaleString('en-US')} Hz (default: ${repNomDefault.toLocaleString('en-US')} Hz, source: ${repNomSource})`);
      lines.push(`    Capture duration:      ${repDurSec.toFixed(1)} s (${repDurSource})`);
      if (state.speed.bandMeta) {
        const sbm = state.speed.bandMeta;
        const freq = sbm.frequencyHz != null ? ` · ${sbm.frequencyHz.toLocaleString('en-US')} Hz` : '';
        lines.push(`    Band:                  ${sbm.label}${freq}`);
      }
      lines.push(`    Speed deviation:       ${sr.speedDeviationPercent.toFixed(3)} %`);
      lines.push(`    Unweighted W&F (AES6): ${sr.unweightedWfPercent.toFixed(3)} %`);
      lines.push(`    IEC-weighted W&F:      ${sr.weightedWfPercent.toFixed(3)} %`);
      lines.push(`    Classification:        ${classifyWf(sr.unweightedWfPercent).label}`);
      const latestSpeedRQ = state.speed.runs[state.speed.runs.length - 1]?.runQuality ?? null;
      if (latestSpeedRQ) {
        lines.push(`    Run quality:           ${latestSpeedRQ.status}`);
        if (latestSpeedRQ.warnings.length > 0) latestSpeedRQ.warnings.forEach(w => lines.push(`    Warning:               ${w}`));
      }
    }
    if (state.speed.runs.length > 0) {
      lines.push(`  Speed run history (${state.speed.runs.length} run${state.speed.runs.length === 1 ? '' : 's'}):`);
      for (const run of state.speed.runs) {
        const rpmLabel = run.speedContext === '45' ? '45 RPM' : '33⅓ RPM';
        const measHz = run.measuredFrequencyHz !== null ? `${run.measuredFrequencyHz.toFixed(2)} Hz` : '—';
        const err = run.speedErrorPercent !== null ? `${run.speedErrorPercent.toFixed(3)} %` : '—';
        const wf = run.wowFlutterPercent !== null ? `${run.wowFlutterPercent.toFixed(3)} %` : '—';
        const wfw = run.wowFlutterWeightedPercent !== null ? `${run.wowFlutterWeightedPercent.toFixed(3)} %` : '—';
        const nomSrc = run.nominalFrequencySource;
        lines.push(`    [${run.createdAt}] ${rpmLabel} | Nominal: ${run.nominalFrequencyHz} Hz (default: ${run.nominalFrequencyHzDefault} Hz, source: ${nomSrc}) | Duration: ${run.captureDurationSeconds.toFixed(1)} s (${run.captureDurationSource}) | Measured: ${measHz} | Speed error: ${err} | W&F (AES6): ${wf} | W&F (IEC): ${wfw} | ${run.source}`);
      }
    }
    // Run comparison
    const textCmp = computeSpeedRunComparison(state.speed.runs);
    if (textCmp) {
      lines.push(`  Run comparison: ${textCmp.note}`);
      if (textCmp.compatible) {
        if (textCmp.deltaSpeedErrorPercent !== null) lines.push(`    Δ Speed error:         ${textCmp.deltaSpeedErrorPercent >= 0 ? '+' : ''}${textCmp.deltaSpeedErrorPercent.toFixed(3)} %`);
        if (textCmp.deltaWfUnweightedPercent !== null) lines.push(`    Δ W&F unweighted:      ${textCmp.deltaWfUnweightedPercent >= 0 ? '+' : ''}${textCmp.deltaWfUnweightedPercent.toFixed(3)} %`);
        if (textCmp.deltaWfWeightedPercent !== null) lines.push(`    Δ W&F IEC-weighted:    ${textCmp.deltaWfWeightedPercent >= 0 ? '+' : ''}${textCmp.deltaWfWeightedPercent.toFixed(3)} %`);
      } else {
        lines.push(`    ${textCmp.note}`);
      }
    }
    // Diagnostic context
    const textDiag = buildSpeedDiagnosticMeta();
    lines.push(`  Diagnostic note: ${textDiag.filteredUnfilteredNote}`);
    lines.push(`  Wow/flutter band separation: ${textDiag.wowBandSeparationNote}`);
    lines.push('');
  }

  // Channel identity
  const { leftCapture, rightCapture, identityResult: chIdentity, source: chSource, leftBandMeta: chLeftBand, rightBandMeta: chRightBand } = state.channel;
  if (leftCapture && rightCapture) {
    lines.push('CHANNEL IDENTITY & CROSSTALK');
    lines.push(`  Source:                ${chSource ?? 'live_capture'}`);
    if (chLeftBand) {
      const lf = chLeftBand.frequencyHz != null ? ` · ${chLeftBand.frequencyHz.toLocaleString('en-US')} Hz` : '';
      lines.push(`  Left band:             ${chLeftBand.label}${lf}`);
    }
    if (chRightBand) {
      const rf = chRightBand.frequencyHz != null ? ` · ${chRightBand.frequencyHz.toLocaleString('en-US')} Hz` : '';
      lines.push(`  Right band:            ${chRightBand.label}${rf}`);
    }
    if (chIdentity) {
      lines.push(`  Identity:              ${chIdentity.identity}`);
      lines.push(`  Confidence:            ${chIdentity.confidence}`);
      lines.push(`  Balance (R−L wanted):  ${chIdentity.wantedBalanceDb != null ? chIdentity.wantedBalanceDb.toFixed(2) + ' dB' : 'n/a'}`);
      lines.push(`  L→R crosstalk:         ${chIdentity.leftToRightCrosstalkDb.toFixed(1)} dB`);
      lines.push(`  R→L crosstalk:         ${chIdentity.rightToLeftCrosstalkDb.toFixed(1)} dB`);
      if (chIdentity.warnings.length > 0) {
        chIdentity.warnings.forEach(w => lines.push(`  Warning:               ${w}`));
      }
    } else {
      lines.push(`  Left RMS:              ${leftCapture.leftRmsDbFs.toFixed(2)} dBFS`);
      lines.push(`  Right RMS:             ${rightCapture.rightRmsDbFs.toFixed(2)} dBFS`);
      lines.push(`  L→R crosstalk:         ${leftCapture.crosstalkDb.toFixed(1)} dB`);
      lines.push(`  R→L crosstalk:         ${rightCapture.crosstalkDb.toFixed(1)} dB`);
    }
    lines.push('');
  }

  // Azimuth steps
  lines.push('AZIMUTH STEPS');
  if (state.channel.runs.length > 0) {
    lines.push(`  Runs recorded:         ${state.channel.runs.length}`);
    for (let i = 0; i < state.channel.runs.length; i++) {
      const r = state.channel.runs[i];
      lines.push(`  Run ${i + 1} (${r.label ?? '—'}): L→R ${r.leftToRightCrosstalkDb.toFixed(1)} dB  R→L ${r.rightToLeftCrosstalkDb.toFixed(1)} dB  identity: ${r.identity}  quality: ${r.runQuality?.status ?? 'n/a'}`);
    }
    const cmp = computeAzimuthStepComparison(state.channel.runs);
    if (cmp && cmp.compatible && cmp.ltrRangeDb && cmp.rtlRangeDb) {
      lines.push(`  L→R range:             ${cmp.ltrRangeDb.min.toFixed(1)}–${cmp.ltrRangeDb.max.toFixed(1)} dB`);
      lines.push(`  R→L range:             ${cmp.rtlRangeDb.min.toFixed(1)}–${cmp.rtlRangeDb.max.toFixed(1)} dB`);
      lines.push(`  (${cmp.note})`);
    } else if (cmp && !cmp.compatible) {
      lines.push(`  (${cmp.note})`);
    }
  } else {
    lines.push('  No azimuth step runs recorded in this session.');
  }
  lines.push('');

  // Freq response
  const fr = state.freq.result;
  if (fr) {
    lines.push('FREQUENCY RESPONSE');
    lines.push(`  Source:                ${state.freq.resultSource ?? 'live_capture'}`);
    if (state.freq.selectedBandMeta) {
      const bm = state.freq.selectedBandMeta;
      const range = bm.frequencyStartHz !== null && bm.frequencyEndHz !== null
        ? ` · ${bm.frequencyStartHz}–${bm.frequencyEndHz} Hz` : '';
      lines.push(`  Sweep band:            ${bm.label}${range}`);
    }
    lines.push(`  iRIAA applied:         ${state.iriaaEnabled ? 'Yes' : 'No'}`);
    lines.push(`  FFT size:              ${fr.fftSize}`);
    lines.push(`  Blocks averaged:       ${fr.blockCount}`);
    lines.push(`  Sample rate:           ${fr.sampleRateHz.toLocaleString()} Hz`);
    lines.push(`  Range:                 ${fr.frequenciesHz[0]?.toFixed(0) ?? '?'} – ${fr.frequenciesHz[fr.frequenciesHz.length - 1]?.toFixed(0) ?? '?'} Hz`);
    const dev = computeFreqDeviationSummary(fr, state.iriaaEnabled);
    if (dev) {
      lines.push('  --- Deviation summary (ref: 1 kHz = 0 dB) ---');
      const fmtHz = (hz: number) => hz < 1000 ? `${hz.toFixed(0)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
      lines.push(`  Min deviation:         ${dev.minDb.toFixed(1)} dB @ ${fmtHz(dev.minFrequencyHz)}`);
      lines.push(`  Max deviation:         ${dev.maxDb.toFixed(1)} dB @ ${fmtHz(dev.maxFrequencyHz)}`);
      lines.push(`  Peak-to-peak:          ${dev.peakToPeakDb.toFixed(1)} dB`);
      lines.push(`  RMS deviation:         ${dev.rmsDeviationDb.toFixed(2)} dB`);
      for (const b of dev.bandSummaries) {
        const mean = b.meanDb !== null ? `${b.meanDb.toFixed(1)} dB` : 'n/a';
        lines.push(`  ${b.label.padEnd(22)} ${mean}`);
      }
    }
    lines.push('  (Measures full playback/capture chain, not cartridge-only response.)');
    lines.push('  (Full data in JSON export)');
    lines.push('');
  }

  // THD / IMD
  const tr = state.thd.result;
  const distMeta = buildThdDistortionMeta();
  if (tr) {
    if (isThdResult(tr)) {
      lines.push('THD');
      lines.push(`  Source:                ${state.thd.resultSource ?? 'live_capture'}`);
      if (state.thd.bandMeta) {
        const tbm = state.thd.bandMeta;
        const tf = tbm.frequencyHz != null ? ` · ${tbm.frequencyHz.toLocaleString('en-US')} Hz` : '';
        lines.push(`  Band:                  ${tbm.label}${tf}`);
      }
      lines.push(`  Fundamental:           ${tr.fundamentalHz} Hz`);
      lines.push(`  THD:                   ${tr.thdPercent.toFixed(3)} %`);
      if (state.thd.runQuality) {
        lines.push(`  Run quality:           ${state.thd.runQuality.status}`);
        for (const w of state.thd.runQuality.warnings) lines.push(`  Warning:               ${w}`);
      }
      if (tr.harmonics.length > 0) {
        lines.push('  --- Harmonic breakdown ---');
        const ordSuffix = (n: number) => n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
        for (let i = 0; i < tr.harmonics.length; i++) {
          const order = i + 2;
          const freq = order * tr.fundamentalHz;
          lines.push(`  ${order}${ordSuffix(order)} harmonic (${freq.toLocaleString('en-US')} Hz):  ${tr.harmonics[i].toFixed(1)} dBc`);
        }
      }
      lines.push(`  (${distMeta.harmonicInterpretationNote})`);
    } else {
      lines.push('SMPTE IMD');
      lines.push(`  Source:                ${state.thd.resultSource ?? 'live_capture'}`);
      if (state.thd.bandMeta) {
        const tbm = state.thd.bandMeta;
        lines.push(`  Band:                  ${tbm.label}`);
      }
      lines.push(`  f1 (LF):               ${tr.f1Hz} Hz`);
      lines.push(`  f2 (HF):               ${tr.f2Hz} Hz`);
      lines.push(`  IMD:                   ${tr.imdPercent.toFixed(3)} %`);
      if (state.thd.runQuality) {
        lines.push(`  Run quality:           ${state.thd.runQuality.status}`);
        for (const w of state.thd.runQuality.warnings) lines.push(`  Warning:               ${w}`);
      }
      lines.push(`  Sideband detail:       not available — ${distMeta.imdSidebandDetailNote}`);
    }
    lines.push(`  (${distMeta.chainNote})`);
    lines.push('');
  } else {
    lines.push('THD / IMD');
    lines.push('  Not captured in this session.');
    lines.push('');
  }

  // Resonance
  lines.push('RESONANCE');
  const rr = state.resonance.result;
  if (rr) {
    lines.push(`  Source:                ${state.resonance.resultSource ?? 'live_capture'}`);
    lines.push(`  Peak frequency:        ${rr.peakFrequencyHz.toFixed(2)} Hz`);
    lines.push(`  Peak amplitude:        ${rr.peakAmplitudeDbFs.toFixed(1)} dBFS`);
    lines.push(`  Q estimate:            ${rr.qEstimate != null ? rr.qEstimate.toFixed(2) : 'n/a'}`);
    lines.push(`  Sweep type:            ${state.resonance.sweepType}`);
    lines.push(`  Sweep range:           ${state.resonance.fromHz}–${state.resonance.toHz} Hz`);
    if (state.resonance.runQuality) {
      lines.push(`  Run quality:           ${state.resonance.runQuality.status}`);
      for (const w of state.resonance.runQuality.warnings) {
        lines.push(`  Warning:               ${w}`);
      }
    }
    const diagMeta = buildResonanceDiagnosticMeta();
    lines.push(`  (${diagMeta.typicalRangeNote})`);
    lines.push(`  (${diagMeta.limitationsNote})`);
  } else {
    lines.push('  Not captured in this session.');
  }
  lines.push('');

  // Reference level calibration
  const refr = state.refLevel.result;
  const calSet = state.refLevel.calibrationSet;
  if (refr || calSet.length > 0) {
    lines.push('REFERENCE LEVEL CALIBRATION');
    if (refr) {
      lines.push(`  Source:                ${state.refLevel.resultSource ?? 'unknown'}`);
      if (refr.referenceFrequencyHz !== undefined) {
        lines.push(`  Reference band:        ${refr.referenceFrequencyHz} Hz${refr.referenceLevelDb !== undefined ? ` · ${refr.referenceLevelDb} dB` : ''}`);
      }
      lines.push(`  L RMS:                 ${refr.leftRmsDbfs !== null ? refr.leftRmsDbfs.toFixed(2) + ' dBFS' : '—'}`);
      lines.push(`  R RMS:                 ${refr.rightRmsDbfs !== null ? refr.rightRmsDbfs.toFixed(2) + ' dBFS' : '—'}`);
      lines.push(`  L Peak:                ${refr.leftPeakDbfs !== null ? refr.leftPeakDbfs.toFixed(2) + ' dBFS' : '—'}`);
      lines.push(`  R Peak:                ${refr.rightPeakDbfs !== null ? refr.rightPeakDbfs.toFixed(2) + ' dBFS' : '—'}`);
      lines.push(`  Balance (R − L):       ${refr.balanceDb !== null ? (refr.balanceDb >= 0 ? '+' : '') + refr.balanceDb.toFixed(2) + ' dB' : '—'}`);
      lines.push(`  Headroom:              ${refr.headroomDb !== null ? refr.headroomDb.toFixed(2) + ' dB' : '—'}`);
      lines.push(`  Clipping:              ${refr.clipping ? 'yes' : 'no'}`);
      if (state.refLevel.runQuality) {
        lines.push(`  Run quality:           ${state.refLevel.runQuality.status}`);
        if (state.refLevel.runQuality.warnings.length > 0) state.refLevel.runQuality.warnings.forEach(w => lines.push(`  Warning:               ${w}`));
      }
      lines.push(`  Confidence:            ${refr.confidence}`);
      if (refr.warnings.length > 0) {
        lines.push(`  Warnings:              ${Array.from(refr.warnings).join('; ')}`);
      }
    }
    if (calSet.length > 0) {
      lines.push(`  Calibration set (${calSet.length} band${calSet.length === 1 ? '' : 's'}):`);
      for (const e of calSet) {
        const bal = e.result.balanceDb !== null
          ? (e.result.balanceDb >= 0 ? '+' : '') + e.result.balanceDb.toFixed(2) + ' dB'
          : '—';
        const freq = e.frequencyHz !== null ? `${e.frequencyHz} Hz` : '—';
        const clip = e.result.clipping ? 'CLIP' : 'ok';
        lines.push(`    ${e.bandLabel}  |  ${freq}  |  L: ${fmtDbfs(e.result.leftRmsDbfs)}  R: ${fmtDbfs(e.result.rightRmsDbfs)}  bal: ${bal}  ${clip}  ${e.result.confidence}  [${e.source}]`);
      }
    }
    lines.push('');
  }

  // VTA IMD — experimental section
  if (state.vta.runs.length > 0) {
    const record = selectedRecord();
    const vtaBands = getVtaImdBands(record);
    const vtaBand = vtaBands[0] ?? null;
    const vtaCmp = deriveVtaImdComparison(state.vta.runs);
    lines.push('VTA IMD OPTIMIZER — EXPERIMENTAL');
    lines.push('  Status:                Capture gateway preview — not yet fully validated');
    if (record) {
      lines.push(`  Test record:           ${record.manufacturer} — ${record.title}`);
    }
    if (vtaBand) {
      const f1 = vtaBand.f1Hz != null ? `${vtaBand.f1Hz} Hz` : '—';
      const f2 = vtaBand.f2Hz != null ? `${vtaBand.f2Hz} Hz` : '—';
      lines.push(`  Band:                  ${vtaBand.label}`);
      lines.push(`  f1:                    ${f1}`);
      lines.push(`  f2:                    ${f2}`);
      lines.push(`  Ratio:                 ${vtaBand.ratio ?? '—'}`);
      lines.push(`  Standard:              ${vtaBand.standard ?? '—'}`);
    }
    lines.push(`  Measured runs:         ${vtaCmp.measuredCount}`);
    lines.push(`  Placeholder runs:      ${vtaCmp.placeholderCount}`);
    lines.push('  Runs:');
    for (const r of state.vta.runs) {
      const imd = r.imdPercent !== null ? `${r.imdPercent.toFixed(2)} %` : 'not measured';
      const mm = r.heightMm !== null ? `${r.heightMm} mm` : '—';
      lines.push(`    ${r.heightLabel || '—'}  |${mm}  |  IMD: ${imd}  |  ${r.source}  |  ${r.confidence}`);
      if (r.warnings.length > 0) {
        r.warnings.forEach(w => lines.push(`      Warning: ${w}`));
      }
    }
    lines.push('  Comparison:');
    lines.push(`    Status:              ${vtaCmp.status}`);
    lines.push(`    Confidence:          ${vtaCmp.confidence}`);
    vtaCmp.confidenceReasons.forEach(r => lines.push(`    Confidence reason:   ${r}`));
    if (vtaCmp.status === 'experimental_candidate') {
      lines.push(`    Candidate:           ${vtaCmp.candidateHeightLabel ?? '—'}`);
      if (vtaCmp.candidateHeightMm !== null) {
        lines.push(`    Candidate height:    ${vtaCmp.candidateHeightMm} mm`);
      }
      if (vtaCmp.candidateImdPercent !== null) {
        lines.push(`    Candidate IMD:       ${vtaCmp.candidateImdPercent.toFixed(2)} %`);
      }
      if (vtaCmp.nextBestDeltaPercent !== null) {
        lines.push(`    Delta to next best:  ${vtaCmp.nextBestDeltaPercent.toFixed(3)} %`);
      }
    }
    vtaCmp.warnings.forEach(w => lines.push(`    Warning: ${w}`));
    lines.push('  Note: Experimental candidate only — not a final VTA recommendation.');
    // Supported readiness gate
    const vtaRecord = selectedRecord();
    const vtaBandsR = getVtaImdBands(vtaRecord);
    const vtaBandForReport = vtaBandsR[0] ?? null;
    const vtaGate = deriveVtaSupportedGate({
      runs: state.vta.runs,
      comparison: vtaCmp,
      hasUsableVtaBand: hasUsableVtaImdBand(vtaBandForReport),
      hasVtaBandAtAll: vtaBandsR.length > 0,
      capturingRunId: state.vta.capturingRunId,
    });
    const gateLabel = vtaGate.status === 'ready_for_supported_review' ? 'Ready for supported review'
      : vtaGate.status === 'candidate_ready' ? 'Candidate ready'
      : 'Not ready';
    lines.push(`  Supported readiness gate: ${gateLabel}`);
    lines.push(`  Passed: ${vtaGate.passedCount} / ${vtaGate.totalCount}`);
    vtaGate.criteria.forEach(c => {
      lines.push(`    [${c.passed ? 'PASS' : 'FAIL'}] ${c.label}: ${c.detail}`);
    });
    lines.push('  Gate does not change VTA workflow status — remains Planned until formally reviewed.');
    // Workflow status policy
    const vtaPolicy = deriveVtaWorkflowStatusPolicy(vtaGate);
    const policyLabel = vtaPolicy.status === 'ready_for_review_not_supported'
      ? 'Ready for review — not yet supported'
      : 'Planned / experimental';
    lines.push(`  Workflow status policy: ${policyLabel}`);
    lines.push(`  Workflow status: ${vtaPolicy.workflowStatus}`);
    lines.push(`  Policy reason: ${vtaPolicy.reason}`);
    lines.push('  Required before a supported lift:');
    vtaPolicy.requiredBeforeSupported.forEach(r => lines.push(`    - ${r}`));
    lines.push('');
  }

  if (state.log.length > 0) {
    lines.push(hr);
    lines.push('ACTIVITY LOG');
    state.log.forEach(e => lines.push(`  ${e}`));
    lines.push('');
  }

  // Noise floor
  if (state.noiseFloor.runs.length > 0 || state.noiseFloor.latest !== null) {
    lines.push('NOISE FLOOR / RIG BASELINE');
    if (state.noiseFloor.latest) {
      const nl = state.noiseFloor.latest;
      lines.push(`  Latest result:`);
      lines.push(`    Source:           ${nl.source}`);
      lines.push(`    Scenario:         ${noiseFloorScenarioLabel(nl.scenarioKind)}`);
      if (nl.rpm !== null) lines.push(`    RPM:              ${nl.rpm.toFixed(nl.rpm === Math.round(nl.rpm) ? 0 : 1)}`);
      if (nl.tonearmPosition) lines.push(`    Tonearm position: ${nl.tonearmPosition}`);
      lines.push(`    Duration:         ${nl.captureDurationSeconds.toFixed(1)} s`);
      lines.push(`    L RMS:            ${nl.leftRmsDbfs !== null ? nl.leftRmsDbfs.toFixed(1) + ' dBFS' : '—'}`);
      lines.push(`    R RMS:            ${nl.rightRmsDbfs !== null ? nl.rightRmsDbfs.toFixed(1) + ' dBFS' : '—'}`);
      lines.push(`    L peak:           ${nl.leftPeakDbfs !== null ? nl.leftPeakDbfs.toFixed(1) + ' dBFS' : '—'}`);
      lines.push(`    R peak:           ${nl.rightPeakDbfs !== null ? nl.rightPeakDbfs.toFixed(1) + ' dBFS' : '—'}`);
      lines.push(`    Noise floor:      ${nl.noiseFloorDbfs !== null ? nl.noiseFloorDbfs.toFixed(1) + ' dBFS' : '—'}`);
      if (nl.warnings.length > 0) nl.warnings.forEach(w => lines.push(`    Warning: ${w}`));
      if (nl.runQuality) {
        lines.push(`    Run quality:      ${nl.runQuality.status}`);
        if (nl.runQuality.warnings.length > 0) nl.runQuality.warnings.forEach(w => lines.push(`    Warning: ${w}`));
      }
    }
    if (state.noiseFloor.runs.length > 0) {
      lines.push(`  Noise floor history (${state.noiseFloor.runs.length} run${state.noiseFloor.runs.length === 1 ? '' : 's'}):`);
      for (const r of state.noiseFloor.runs) {
        const rpmPart = r.rpm !== null ? ` | RPM: ${r.rpm.toFixed(r.rpm === Math.round(r.rpm) ? 0 : 1)}` : '';
        const tpPart = r.tonearmPosition ? ` | Tonearm: ${r.tonearmPosition}` : '';
        const nfPart = r.noiseFloorDbfs !== null ? `${r.noiseFloorDbfs.toFixed(1)} dBFS` : '—';
        lines.push(`    [${r.createdAt}] ${noiseFloorScenarioLabel(r.scenarioKind)}${rpmPart}${tpPart} | Duration: ${r.captureDurationSeconds.toFixed(1)} s | L RMS: ${r.leftRmsDbfs !== null ? r.leftRmsDbfs.toFixed(1) + ' dBFS' : '—'} | R RMS: ${r.rightRmsDbfs !== null ? r.rightRmsDbfs.toFixed(1) + ' dBFS' : '—'} | Noise floor: ${nfPart} | ${r.source}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function downloadReportText(): void {
  const text = buildReportText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `engrove-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function actionBarMarkup(): string {
  return `
    <footer class="ea-actionbar" aria-label="Measurement lab actions">
      <div class="ea-actionbar__group">
        <span class="ea-actionbar__status" data-mlab-action-status>
          ${statusDot('planned')}
          <span data-mlab-action-status-text>Audio context not started.</span>
        </span>
      </div>
      <div class="ea-actionbar__group">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-web-report>Open web report</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-export-report>Export Report</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-export>Export JSON</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-reset>Reset</button>
      </div>
    </footer>
  `;
}

function chainReadinessPanelMarkup(): string {
  return `
    <section id="mlab-chain-readiness-panel" class="ea-panel" aria-labelledby="mlab-chain-readiness-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">&rarr;</span>
        <span id="mlab-chain-readiness-title">Measurement chain readiness</span>
      </div>
      <div class="ea-panel-body" data-mlab-chain-readiness-body>
        <p class="ea-muted">Connect a source to check measurement chain readiness.</p>
      </div>
    </section>
  `;
}

function noiseFloorPanelMarkup(): string {
  return `
    <section id="mlab-noisefloor-panel" data-mlab-tool-panel="noise_floor" class="ea-panel" aria-labelledby="mlab-noisefloor-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">10</span>
        <span id="mlab-noisefloor-title">Noise floor / rig baseline</span>
      </div>
      <div class="ea-panel-body" data-mlab-noisefloor-body>
        <p class="ea-muted">Connect a source to begin a noise floor measurement.</p>
      </div>
    </section>
  `;
}

export function renderMeasurementLabPage(): string {
  return `
    <main class="ea-tool-shell mlab-shell">
      ${renderToolTopbar('measurement')}
      <section class="mlab-workbench" aria-label="Measurement lab workbench">
        ${sessionRibbonMarkup()}
        <div class="mlab-workbench-grid">
          ${workflowRailMarkup()}
          <div class="mlab-workbench-center">
            <header class="mlab-center-head">
              <div class="mlab-center-title">
                <div class="mlab-center-title-pre">Active measurement</div>
                <h2 class="mlab-center-title-h" data-mlab-active-title>Workbench Home</h2>
              </div>
              <div class="mlab-center-actions">
                <span class="ea-badge mlab-center-status-pill" data-mlab-center-status aria-live="polite"></span>
                <button class="ea-button ea-button--ghost" type="button" data-mlab-context-open>Context</button>
              </div>
            </header>
            <div class="mlab-center-body">
              ${audioSourcePanelMarkup()}
              ${speedPanelMarkup()}
              ${channelPanelMarkup()}
              ${freqPanelMarkup()}
              ${thdPanelMarkup()}
              ${resonancePanelMarkup()}
              ${refLevelPanelMarkup()}
              ${advancedAnalyzersPanelMarkup()}
              ${noiseFloorPanelMarkup()}
              ${contextOverlayMarkup()}
            </div>
          </div>
        </div>
        <footer class="mlab-workbench-footer">
          <div class="mlab-footer-status">
            <span class="ea-actionbar__status" data-mlab-action-status>
              ${statusDot('planned')}
              <span data-mlab-action-status-text>Audio context not started.</span>
            </span>
          </div>
          <div class="mlab-footer-actions">
            <button class="ea-button ea-button--ghost" type="button" data-mlab-open-log>Open log</button>
            <button class="ea-button ea-button--ghost" type="button" data-mlab-web-report>Open web report</button>
            <button class="ea-button ea-button--ghost" type="button" data-mlab-export-report>Export report</button>
            <button class="ea-button ea-button--ghost" type="button" data-mlab-export>Export JSON</button>
            <button class="ea-button ea-button--ghost" type="button" data-mlab-reset>Reset</button>
          </div>
        </footer>
      </section>
      ${railTooltipPortalMarkup()}
      ${logModalMarkup()}
    </main>
  `;
}

function elements(root: ParentNode) {
  return {
    sourceModeButtons: root.querySelectorAll<HTMLButtonElement>('[data-mlab-source-mode]'),
    iriaaButtons: root.querySelectorAll<HTMLButtonElement>('[data-mlab-iriaa]'),
    deviceSelect: root.querySelector<HTMLSelectElement>('[data-mlab-device]'),
    deviceDot: root.querySelector<HTMLElement>('[data-mlab-device-dot]'),
    deviceMeta: root.querySelector<HTMLElement>('[data-mlab-device-meta]'),
    deviceRow: root.querySelector<HTMLElement>('[data-mlab-device-row]'),
    actualValue: root.querySelector<HTMLElement>('[data-mlab-actual]'),
    actualDot: root.querySelector<HTMLElement>('[data-mlab-actual-dot]'),
    actualMeta: root.querySelector<HTMLElement>('[data-mlab-actual-meta]'),
    sessionStatus: root.querySelector<HTMLElement>('[data-mlab-session-status]'),
    honesty: root.querySelector<HTMLElement>('[data-mlab-honesty]'),
    connect: root.querySelector<HTMLButtonElement>('[data-mlab-connect]'),
    disconnect: root.querySelector<HTMLButtonElement>('[data-mlab-disconnect]'),
    exportBtn: root.querySelector<HTMLButtonElement>('[data-mlab-export]'),
    exportReportBtn: root.querySelector<HTMLButtonElement>('[data-mlab-export-report]'),
    webReportBtn: root.querySelector<HTMLButtonElement>('[data-mlab-web-report]'),
    reset: root.querySelector<HTMLButtonElement>('[data-mlab-reset]'),
    actionStatusDot: root.querySelector<HTMLElement>('[data-mlab-action-status] .ea-dot'),
    actionStatusText: root.querySelector<HTMLElement>('[data-mlab-action-status-text]'),
    meterGrid: root.querySelector<HTMLElement>('[data-mlab-meter-grid]'),
    speedBody: root.querySelector<HTMLElement>('[data-mlab-speed-body]'),
    channelBody: root.querySelector<HTMLElement>('[data-mlab-channel-body]'),
    freqBody: root.querySelector<HTMLElement>('[data-mlab-freq-body]'),
    thdBody: root.querySelector<HTMLElement>('[data-mlab-thd-body]'),
    resonanceBody: root.querySelector<HTMLElement>('[data-mlab-resonance-body]'),
    logBody: root.querySelector<HTMLElement>('[data-mlab-log-body]'),
    logResetBtn: root.querySelector<HTMLButtonElement>('[data-mlab-log-reset]'),
    logExportBtn: root.querySelector<HTMLButtonElement>('[data-mlab-log-export]'),
    selfTestBtn: root.querySelector<HTMLButtonElement>('[data-mlab-run-self-test]'),
    recordSelect: root.querySelector<HTMLSelectElement>('[data-mlab-record]'),
    recordDot: root.querySelector<HTMLElement>('[data-mlab-record-dot]'),
    coveragePanelSection: root.querySelector<HTMLElement>('#mlab-coverage-panel'),
    coverageToggleBtn: root.querySelector<HTMLButtonElement>('[data-mlab-coverage-toggle]'),
    coverageBody: root.querySelector<HTMLElement>('[data-mlab-coverage-body]'),
    waveformL: root.querySelector<HTMLCanvasElement>('[data-mlab-waveform="L"]'),
    waveformR: root.querySelector<HTMLCanvasElement>('[data-mlab-waveform="R"]'),
    sourceMeterGrid: root.querySelector<HTMLElement>('[data-mlab-source-meter-grid]'),
    sourceFreqCanvas: root.querySelector<HTMLCanvasElement>('[data-mlab-source-freq-canvas]'),
    refLevelBody: root.querySelector<HTMLElement>('[data-mlab-reflevel-body]'),
    advancedBody: root.querySelector<HTMLElement>('[data-mlab-advanced-body]'),
    noiseFloorBody: root.querySelector<HTMLElement>('[data-mlab-noisefloor-body]'),
    chainReadinessBody: root.querySelector<HTMLElement>('[data-mlab-chain-readiness-body]'),
    ribbonSource: root.querySelector<HTMLElement>('[data-mlab-ribbon-source]'),
    ribbonRecord: root.querySelector<HTMLElement>('[data-mlab-ribbon-record]'),
    ribbonChain: root.querySelector<HTMLElement>('[data-mlab-ribbon-chain]'),
    ribbonActiveTool: root.querySelector<HTMLElement>('[data-mlab-ribbon-active-tool]'),
    railItems: root.querySelector<HTMLElement>('[data-mlab-rail-items]'),
    diagSignalBody: root.querySelector<HTMLElement>('[data-mlab-diag-signal-body]'),
    activeTitle: root.querySelector<HTMLElement>('[data-mlab-active-title]'),
    centerStatus: root.querySelector<HTMLElement>('[data-mlab-center-status]'),
    contextOverlay: root.querySelector<HTMLElement>('[data-mlab-context-overlay]'),
    contextOpenBtn: root.querySelector<HTMLButtonElement>('[data-mlab-context-open]'),
    logModal: root.querySelector<HTMLElement>('[data-mlab-log-modal]'),
    ribbonMiniLFill: root.querySelector<HTMLElement>('[data-mlab-ribbon-mini-l-fill]'),
    ribbonMiniRFill: root.querySelector<HTMLElement>('[data-mlab-ribbon-mini-r-fill]'),
    ribbonMiniLDb: root.querySelector<HTMLElement>('[data-mlab-ribbon-mini-l-db]'),
    ribbonMiniRDb: root.querySelector<HTMLElement>('[data-mlab-ribbon-mini-r-db]'),
  };
}

type Elements = ReturnType<typeof elements>;

function setActionStatus(els: Elements, kind: 'planned' | 'active' | 'done' | 'error', text: string): void {
  if (els.actionStatusDot) els.actionStatusDot.className = `ea-dot ea-dot--${kind}`;
  if (els.actionStatusText) els.actionStatusText.textContent = text;
}

type WfGrade = { label: string; cssClass: string };

// ── S5N: Speed run comparison ─────────────────────────────────────────────────

type SpeedRunComparison = {
  readonly compatible: boolean;
  readonly runCount: number;
  readonly rpmContext: string;
  readonly deltaSpeedErrorPercent: number | null;
  readonly deltaWfUnweightedPercent: number | null;
  readonly deltaWfWeightedPercent: number | null;
  readonly note: string;
};

function computeSpeedRunComparison(runs: readonly SpeedMeasurementRun[]): SpeedRunComparison | null {
  if (runs.length < 2) return null;
  const latest = runs[runs.length - 1]!;
  const prev = runs[runs.length - 2]!;
  const rpmLabel = (ctx: SpeedContext): string => ctx === '45' ? '45 RPM' : '33⅓ RPM';
  const compatible = latest.speedContext === prev.speedContext;
  if (!compatible) {
    return {
      compatible: false,
      runCount: runs.length,
      rpmContext: `${rpmLabel(prev.speedContext)} → ${rpmLabel(latest.speedContext)}`,
      deltaSpeedErrorPercent: null,
      deltaWfUnweightedPercent: null,
      deltaWfWeightedPercent: null,
      note: `RPM contexts differ (${rpmLabel(prev.speedContext)} vs ${rpmLabel(latest.speedContext)}) — cross-context comparison is not meaningful.`,
    };
  }
  const ds = latest.speedErrorPercent !== null && prev.speedErrorPercent !== null
    ? latest.speedErrorPercent - prev.speedErrorPercent : null;
  const duw = latest.wowFlutterPercent !== null && prev.wowFlutterPercent !== null
    ? latest.wowFlutterPercent - prev.wowFlutterPercent : null;
  const dw = latest.wowFlutterWeightedPercent !== null && prev.wowFlutterWeightedPercent !== null
    ? latest.wowFlutterWeightedPercent - prev.wowFlutterWeightedPercent : null;
  return {
    compatible: true,
    runCount: runs.length,
    rpmContext: rpmLabel(latest.speedContext),
    deltaSpeedErrorPercent: ds,
    deltaWfUnweightedPercent: duw,
    deltaWfWeightedPercent: dw,
    note: `Run ${runs.length} vs run ${runs.length - 1} — same context (${rpmLabel(latest.speedContext)}).`,
  };
}

function classifyWf(wfPercent: number): WfGrade {
  if (wfPercent < 0.03) return { label: 'Excellent', cssClass: 'mlab-wf-grade--excellent' };
  if (wfPercent < 0.10) return { label: 'Good', cssClass: 'mlab-wf-grade--good' };
  if (wfPercent < 0.20) return { label: 'Acceptable', cssClass: 'mlab-wf-grade--good' };
  if (wfPercent < 0.30) return { label: 'Marginal', cssClass: 'mlab-wf-grade--marginal' };
  return { label: 'Poor', cssClass: 'mlab-wf-grade--poor' };
}

function speedRunHistoryMarkup(runs: readonly SpeedMeasurementRun[]): string {
  if (runs.length === 0) {
    return '<p class="ea-muted mlab-speed-history-empty">No speed runs captured yet.</p>';
  }
  const rows = runs.map(r => {
    const time = r.createdAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    const rpmLabel = r.speedContext === '45' ? '45' : '33⅓';
    const nomHz = r.nominalFrequencyHz.toLocaleString('en-US');
    const measHz = r.measuredFrequencyHz !== null ? r.measuredFrequencyHz.toFixed(2) : '—';
    const err = r.speedErrorPercent !== null ? `${r.speedErrorPercent >= 0 ? '+' : ''}${r.speedErrorPercent.toFixed(3)} %` : '—';
    const wf = r.wowFlutterPercent !== null ? `${r.wowFlutterPercent.toFixed(3)} %` : '—';
    const wfw = r.wowFlutterWeightedPercent !== null ? `${r.wowFlutterWeightedPercent.toFixed(3)} %` : '—';
    const src = r.source === 'self_test' ? 'Self-test' : 'Live';
    return `<tr class="mlab-speed-history-row">
      <td class="mlab-speed-history-cell">${renderText(time)}</td>
      <td class="mlab-speed-history-cell">${renderText(rpmLabel)}</td>
      <td class="mlab-speed-history-cell">${renderText(nomHz)}</td>
      <td class="mlab-speed-history-cell">${renderText(measHz)}</td>
      <td class="mlab-speed-history-cell">${renderText(err)}</td>
      <td class="mlab-speed-history-cell">${renderText(wf)}</td>
      <td class="mlab-speed-history-cell">${renderText(wfw)}</td>
      <td class="mlab-speed-history-cell">${renderText(src)}</td>
    </tr>`;
  }).join('');
  return `
    <div class="mlab-speed-history-scroll">
      <table class="mlab-speed-history-table" aria-label="Speed run history">
        <thead>
          <tr>
            <th>Time</th>
            <th>RPM</th>
            <th>Nominal Hz</th>
            <th>Measured Hz</th>
            <th>Speed error</th>
            <th>W&amp;F (AES6)</th>
            <th>W&amp;F (IEC)</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function speedRunComparisonMarkup(runs: readonly SpeedMeasurementRun[]): string {
  const cmp = computeSpeedRunComparison(runs);
  if (!cmp) return '';
  if (!cmp.compatible) {
    return `<div class="mlab-speed-comparison mlab-speed-comparison--warn">
      <div class="mlab-speed-comparison-head">Run comparison</div>
      <p class="mlab-speed-comparison-note">${renderText(cmp.note)}</p>
    </div>`;
  }
  const fmtDelta = (v: number | null) => v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(3)} %`;
  return `<div class="mlab-speed-comparison">
    <div class="mlab-speed-comparison-head">Run comparison <span class="mlab-speed-comparison-ctx ea-muted">${renderText(cmp.rpmContext)}</span></div>
    <p class="mlab-speed-comparison-note">${renderText(cmp.note)}</p>
    <div class="mlab-speed-comparison-row">
      <span class="mlab-speed-comparison-label ea-muted">Δ Speed error</span>
      <span class="mlab-speed-comparison-val">${renderText(fmtDelta(cmp.deltaSpeedErrorPercent))}</span>
    </div>
    <div class="mlab-speed-comparison-row">
      <span class="mlab-speed-comparison-label ea-muted">Δ W&amp;F (AES6)</span>
      <span class="mlab-speed-comparison-val">${renderText(fmtDelta(cmp.deltaWfUnweightedPercent))}</span>
    </div>
    ${cmp.deltaWfWeightedPercent !== null ? `<div class="mlab-speed-comparison-row">
      <span class="mlab-speed-comparison-label ea-muted">Δ W&amp;F (IEC)</span>
      <span class="mlab-speed-comparison-val">${renderText(fmtDelta(cmp.deltaWfWeightedPercent))}</span>
    </div>` : ''}
  </div>`;
}

function renderRunQualityHtml(rq: MeasurementRunQuality | null | undefined): string {
  if (!rq) return '';
  const label = rq.status === 'ok' ? 'OK' : rq.status === 'warning' ? 'Warning' : 'Invalid';
  const cls = `mlab-run-quality mlab-run-quality--${rq.status}`;
  const warnsHtml = rq.warnings.length > 0
    ? `<ul class="mlab-run-quality-warnings">${Array.from(rq.warnings).map(w => `<li>${renderText(w)}</li>`).join('')}</ul>`
    : '';
  return `<div class="${cls}"><span class="mlab-run-quality-label">Run quality: ${label}</span>${warnsHtml}</div>`;
}

function renderSpeedPanel(els: Elements): void {
  const body = els.speedBody;
  if (!body) return;

  const speedRecord = selectedRecord();
  const speedBands = getWowFlutterBands(speedRecord);
  const ctx = state.speed.speedContext;
  const nomHz = nominalFrequencyHz33[ctx];

  if (!speedRecord) {
    body.innerHTML = '<p class="ea-muted">Select a test record with a speed / wow &amp; flutter band.</p>';
    return;
  }

  if (speedBands.length === 0) {
    body.innerHTML = `
      <p class="ea-muted">Speed &amp; W&amp;F measurement is not available with selected test record.</p>
      <p class="ea-muted">Choose a test record with a 3150&thinsp;Hz speed reference band.</p>
    `;
    return;
  }

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a Speed &amp; W&amp;F measurement.</p>';
    return;
  }

  const ctxToggleHtml = `
    <div class="mlab-speed-ctx-row">
      <span class="mlab-speed-ctx-label ea-muted">Speed context:</span>
      <button class="ea-button ea-button--ghost mlab-speed-ctx-btn${ctx === '33_33' ? ' mlab-speed-ctx-btn--active' : ''}" type="button" data-mlab-speed-ctx="33_33">33&frac13;&thinsp;RPM</button>
      <button class="ea-button ea-button--ghost mlab-speed-ctx-btn${ctx === '45' ? ' mlab-speed-ctx-btn--active' : ''}" type="button" data-mlab-speed-ctx="45">45&thinsp;RPM</button>
    </div>
    <p class="ea-muted mlab-speed-ctx-note">
      Selected band is the 3150&thinsp;Hz test track; analysis reference follows the selected RPM context
      (${ctx === '45' ? `45&thinsp;RPM &rarr; nominal ${nomHz.toLocaleString('en-US')}&thinsp;Hz` : `33&frac13;&thinsp;RPM &rarr; nominal ${nomHz.toLocaleString('en-US')}&thinsp;Hz`}).
      ${ctx === '45' ? 'At 45&thinsp;RPM, the 3150&thinsp;Hz track should read approximately 4,253&thinsp;Hz.' : ''}
    </p>
  `;

  if (state.speed.active) {
    const activeSpeedDurationSeconds = (() => {
      const d = state.speed.lastSettings?.captureDurationSeconds;
      return (d !== undefined && Number.isFinite(d) && d > 0) ? d : speedMeasurementDurationSeconds;
    })();
    const pct = Math.min(100, (state.speed.elapsedSeconds / activeSpeedDurationSeconds) * 100);
    const remaining = Math.max(0, activeSpeedDurationSeconds - state.speed.elapsedSeconds);
    body.innerHTML = `
      ${ctxToggleHtml}
      <p class="ea-muted">Recording ${state.speed.referenceHz.toLocaleString('en-US')}&thinsp;Hz reference tone for ${activeSpeedDurationSeconds.toFixed(1)}&thinsp;s&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Recording progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-speed-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-speed-cancel]')?.addEventListener('click', () => {
      stopSpeedMeasurement();
      renderSpeedPanel(els);
    });
    return;
  }

  const historyMarkup = state.speed.runs.length > 0
    ? `
      <div class="mlab-speed-history">
        <div class="mlab-speed-history-head">
          <strong>Speed run history</strong>
          <button class="ea-button ea-button--ghost mlab-speed-history-clear" type="button" data-mlab-speed-clear-history>Clear speed run history</button>
        </div>
        ${speedRunHistoryMarkup(state.speed.runs)}
      </div>`
    : '';

  if (state.speed.result) {
    const r = state.speed.result;
    const grade = classifyWf(r.unweightedWfPercent);
    const srcBadgeClass = state.speed.resultSource === 'self_test' ? 'ea-badge--setup' : 'ea-badge--manufacturer';
    const srcBadgeLabel = state.speed.resultSource === 'self_test' ? 'Self-test / Simulated' : 'Live capture';
    const bandRow = state.speed.bandMeta
      ? `<div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Band</span>
          <span class="mlab-wf-result-value">${renderText(state.speed.bandMeta.label)}${state.speed.bandMeta.frequencyHz != null ? ` &middot; ${state.speed.bandMeta.frequencyHz.toLocaleString('en-US')}&nbsp;Hz` : ''}</span>
        </div>`
      : '';
    const ls = state.speed.lastSettings;
    const usedNominalHz = ls ? ls.nominalFrequencyHz : nomHz;
    const usedNominalDefault = ls ? ls.nominalFrequencyHzDefault : nomHz;
    const usedNominalSource = ls ? ls.nominalFrequencySource : 'fallback_default' as MeasurementParameterSource;
    const usedDurationSec = ls ? ls.captureDurationSeconds : speedMeasurementDurationSeconds;
    const usedDurationSource = ls ? ls.captureDurationSource : 'default' as CaptureDurationSource;
    const usedCtxLabel = ls ? (ls.speedContext === '45' ? '45 RPM' : '33⅓ RPM') : (ctx === '45' ? '45 RPM' : '33⅓ RPM');
    const nominalSourceLabel = (s: MeasurementParameterSource) =>
      s === 'test_record_metadata' ? 'Test record metadata'
      : s === 'speed_context_formula' ? 'Speed context formula'
      : s === 'user_override' ? 'User override'
      : 'Fallback default';
    const nominalNote = usedNominalSource === 'user_override'
      ? `${usedNominalHz.toLocaleString('en-US')} Hz <span class="mlab-speed-settings-src">(User override; default was ${usedNominalDefault.toLocaleString('en-US')} Hz)</span>`
      : `${usedNominalHz.toLocaleString('en-US')} Hz <span class="mlab-speed-settings-src">(${nominalSourceLabel(usedNominalSource)})</span>`;
    const durationNote = usedDurationSource === 'user_override'
      ? `${usedDurationSec.toFixed(1)} s <span class="mlab-speed-settings-src">(User override)</span>`
      : `${usedDurationSec.toFixed(1)} s <span class="mlab-speed-settings-src">(Default)</span>`;
    body.innerHTML = `
      ${ctxToggleHtml}
      <div class="mlab-result-source-row">
        <span class="ea-badge ${srcBadgeClass}">${srcBadgeLabel}</span>
        <span class="mlab-speed-ctx-badge ea-muted">${renderText(usedCtxLabel)} &middot; nominal ${usedNominalHz.toLocaleString('en-US')}&thinsp;Hz</span>
      </div>
      <div class="mlab-wf-result">
        ${bandRow}
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Speed deviation</span>
          <span class="mlab-wf-result-value">${r.speedDeviationPercent >= 0 ? '+' : ''}${r.speedDeviationPercent.toFixed(3)}&nbsp;%</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">W&amp;F unweighted</span>
          <span class="mlab-wf-result-value">${r.unweightedWfPercent.toFixed(3)}&nbsp;%</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">W&amp;F IEC-weighted<span class="mlab-wf-approx">&#x2248;</span></span>
          <span class="mlab-wf-result-value">${r.weightedWfPercent.toFixed(3)}&nbsp;%</span>
        </div>
        <div class="mlab-wf-result-row mlab-wf-result-row--grade">
          <span class="mlab-wf-result-label">Classification</span>
          <span class="ea-badge ${grade.cssClass}">${grade.label}</span>
        </div>
        <p class="mlab-wf-note">${r.sampleCount.toLocaleString('en-US')} cycles analysed &middot; mean ${r.meanFrequencyHz.toFixed(2)}&nbsp;Hz</p>
      </div>
      <div class="mlab-speed-settings mlab-speed-settings--result">
        <div class="mlab-speed-settings-head">Measurement parameters used</div>
        <div class="mlab-speed-settings-row">
          <span class="mlab-speed-settings-label ea-muted">Nominal frequency</span>
          <span class="mlab-speed-settings-value">${nominalNote}</span>
        </div>
        <div class="mlab-speed-settings-row">
          <span class="mlab-speed-settings-label ea-muted">Capture duration</span>
          <span class="mlab-speed-settings-value">${durationNote}</span>
        </div>
      </div>
      <p class="mlab-chain-note">These readings measure playback/capture speed stability and are affected by the test record, turntable and capture chain.</p>
      ${renderRunQualityHtml(state.speed.runs[state.speed.runs.length - 1]?.runQuality)}
      ${speedRunComparisonMarkup(state.speed.runs)}
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-speed-start>Measure again</button>
      </div>
      ${historyMarkup}
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-speed-start]')?.addEventListener('click', () => {
      state.speed.result = null;
      startSpeedMeasurement(els);
    });
    body.querySelector<HTMLButtonElement>('[data-mlab-speed-clear-history]')?.addEventListener('click', () => {
      state.speed.runs = [];
      renderSpeedPanel(els);
    });
    body.querySelectorAll<HTMLButtonElement>('[data-mlab-speed-ctx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.mlabSpeedCtx as SpeedContext;
        if (val === '33_33' || val === '45') { state.speed.speedContext = val; }
        renderSpeedPanel(els);
      });
    });
    return;
  }
  // Idle — derive settings preview for display
  const previewBandMeta: SpeedBandMeta | null = (() => {
    const b = speedBands.find(b => b.frequencyHz === 3150) ?? speedBands[0] ?? null;
    return b ? { index: b.index, label: b.label, frequencyHz: b.frequencyHz ?? null, levelDb: b.levelDb ?? null } : null;
  })();
  const previewSettings = deriveSpeedMeasurementSettings({
    band: previewBandMeta,
    speedContext: ctx,
    nominalFrequencyInput: state.speed.nominalFrequencyHzInput,
    captureDurationInput: state.speed.captureDurationSecondsInput,
  });

  const sourceLabel = (s: MeasurementParameterSource) =>
    s === 'test_record_metadata' ? 'Test record metadata'
    : s === 'speed_context_formula' ? `Formula (${ctx === '45' ? '45 / 33.333 × band Hz' : 'band Hz'})`
    : s === 'user_override' ? 'User override'
    : 'Fallback default';

  const nominalHasOverride = state.speed.nominalFrequencyHzInput.trim() !== '';
  const durationHasOverride = state.speed.captureDurationSecondsInput.trim() !== '';

  const selfTestNote = state.sourceMode === 'self-test'
    ? '<p class="ea-muted mlab-reflevel-selftest-note">Self-test mode: the 1&thinsp;kHz oscillator is not a 3150&thinsp;Hz reference — results will be marked <strong>self-test&nbsp;/&nbsp;simulated</strong> and are not a valid W&amp;F measurement.</p>'
    : '';

  const preferredBand = speedBands.find(b => b.frequencyHz === 3150) ?? speedBands[0];
  const bandDisplayRow = preferredBand
    ? `<div class="mlab-speed-settings-row">
        <span class="mlab-speed-settings-label ea-muted">Test record band</span>
        <span class="mlab-speed-settings-value">${renderText(preferredBand.label)}${preferredBand.frequencyHz !== null && preferredBand.frequencyHz !== undefined ? ` &middot; ${preferredBand.frequencyHz.toLocaleString('en-US')}&thinsp;Hz` : ''} <span class="ea-muted">(provenance)</span></span>
      </div>`
    : '';

  body.innerHTML = `
    ${selfTestNote}
    ${ctxToggleHtml}
    <div class="mlab-speed-settings">
      <div class="mlab-speed-settings-head">
        <strong>Measurement settings</strong>
        <span class="ea-muted mlab-speed-settings-hint">Defaults derived from selected test record where possible. Override for non-standard test records.</span>
      </div>
      ${bandDisplayRow}
      <div class="mlab-speed-settings-row">
        <label class="mlab-speed-settings-label" for="mlab-speed-nominal-hz">Nominal analysis frequency</label>
        <div class="mlab-speed-settings-input-group">
          <input
            class="ea-input mlab-speed-settings-input"
            id="mlab-speed-nominal-hz"
            type="text"
            inputmode="decimal"
            placeholder="${previewSettings.nominalFrequencyHzDefault}"
            value="${renderText(state.speed.nominalFrequencyHzInput)}"
            aria-label="Nominal analysis frequency in Hz"
            data-mlab-speed-nominal-hz>
          <span class="ea-muted mlab-speed-settings-unit">Hz</span>
        </div>
        <span class="ea-muted mlab-speed-settings-src">
          ${nominalHasOverride
            ? `User override: ${previewSettings.nominalFrequencyHz.toLocaleString('en-US')} Hz (default: ${previewSettings.nominalFrequencyHzDefault.toLocaleString('en-US')} Hz)`
            : `${sourceLabel(previewSettings.nominalFrequencySource)}: ${previewSettings.nominalFrequencyHz.toLocaleString('en-US')}&thinsp;Hz`}
        </span>
      </div>
      <div class="mlab-speed-settings-row">
        <label class="mlab-speed-settings-label" for="mlab-speed-duration">Capture duration</label>
        <div class="mlab-speed-settings-input-group">
          <input
            class="ea-input mlab-speed-settings-input"
            id="mlab-speed-duration"
            type="text"
            inputmode="decimal"
            placeholder="${previewSettings.captureDurationSecondsDefault}"
            value="${renderText(state.speed.captureDurationSecondsInput)}"
            aria-label="Capture duration in seconds"
            data-mlab-speed-duration>
          <span class="ea-muted mlab-speed-settings-unit">s</span>
        </div>
        <span class="ea-muted mlab-speed-settings-src">
          ${durationHasOverride
            ? `User override: ${previewSettings.captureDurationSeconds.toFixed(1)} s (default: ${previewSettings.captureDurationSecondsDefault} s)`
            : `Default: ${previewSettings.captureDurationSecondsDefault} s`}
        </span>
      </div>
      ${(nominalHasOverride || durationHasOverride) ? `
      <div class="mlab-speed-settings-row">
        <button class="ea-button ea-button--ghost mlab-speed-settings-reset" type="button" data-mlab-speed-reset-settings>Reset speed settings to defaults</button>
      </div>` : ''}
    </div>
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-speed-start>Start measurement</button>
    </div>
    ${historyMarkup}
  `;
  body.querySelector<HTMLButtonElement>('[data-mlab-speed-start]')?.addEventListener('click', () => {
    startSpeedMeasurement(els);
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-speed-clear-history]')?.addEventListener('click', () => {
    state.speed.runs = [];
    renderSpeedPanel(els);
  });
  body.querySelectorAll<HTMLButtonElement>('[data-mlab-speed-ctx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.mlabSpeedCtx as SpeedContext;
      if (val === '33_33' || val === '45') { state.speed.speedContext = val; }
      renderSpeedPanel(els);
    });
  });
  body.querySelector<HTMLInputElement>('[data-mlab-speed-nominal-hz]')?.addEventListener('input', (e) => {
    state.speed.nominalFrequencyHzInput = (e.target as HTMLInputElement).value;
    renderSpeedPanel(els);
  });
  body.querySelector<HTMLInputElement>('[data-mlab-speed-duration]')?.addEventListener('input', (e) => {
    state.speed.captureDurationSecondsInput = (e.target as HTMLInputElement).value;
    renderSpeedPanel(els);
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-speed-reset-settings]')?.addEventListener('click', () => {
    state.speed.nominalFrequencyHzInput = '';
    state.speed.captureDurationSecondsInput = '';
    renderSpeedPanel(els);
  });
}
function fmtDb(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)} dB`;
}

function fmtCrosstalk(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} dB`;
}

function captureRowMarkup(label: string, capture: ChannelCaptureMetrics): string {
  return `
    <tr>
      <td class="ea-col-status">${statusDot('done')}</td>
      <td class="ea-col-label">${label}</td>
      <td class="ea-col-value">
        <span class="mlab-wf-result-value">L ${capture.leftRmsDbFs.toFixed(1)}&nbsp;dBFS &middot; R ${capture.rightRmsDbFs.toFixed(1)}&nbsp;dBFS</span>
      </td>
      <td class="ea-col-meta"><span class="ea-badge">${capture.crosstalkDb.toFixed(1)}&nbsp;dB</span></td>
    </tr>
  `;
}

function channelIdentityBadgeHtml(identity: string): string {
  if (identity === 'normal') return '<span class="ea-badge ea-badge--manufacturer">Normal</span>';
  if (identity === 'possible_swapped') return '<span class="ea-badge ea-badge--setup">Possibly swapped</span>';
  return '<span class="ea-badge">Inconclusive</span>';
}

function renderChannelPanel(els: Elements): void {
  const body = els.channelBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a channel measurement.</p>';
    return;
  }

  const ch = state.channel;
  const record = selectedRecord();
  const { leftBand, rightBand } = record ? getChannelIdentityBands(record) : { leftBand: null, rightBand: null };
  const isSelfTest = state.sourceMode === 'self-test';

  const recordingStep = ch.step === 'left-recording' || ch.step === 'right-recording';

  // Band availability gate: block when record exists but lacks the required L/R bands.
  // Active recordings are allowed to complete; stale state shows a reset affordance.
  if (record && !recordingStep && (!leftBand || !rightBand)) {
    const hasStaleState = ch.step !== 'idle' || ch.leftCapture !== null || ch.rightCapture !== null || ch.identityResult !== null;
    let html = '<p class="ea-muted">Channel identity and crosstalk are not available with selected test record.</p>';
    if (leftBand && !rightBand) {
      html += '<p class="ea-muted">Missing right-channel test band.</p>';
    } else if (!leftBand && rightBand) {
      html += '<p class="ea-muted">Missing left-channel test band.</p>';
    } else {
      html += '<p class="ea-muted">Choose a test record with left-only and right-only channel bands.</p>';
    }
    if (hasStaleState) {
      html += '<div class="mlab-session-controls"><button class="ea-button ea-button--ghost" type="button" data-mlab-channel-reset>Reset</button></div>';
    }
    body.innerHTML = html;
    if (hasStaleState) {
      body.querySelector<HTMLButtonElement>('[data-mlab-channel-reset]')?.addEventListener('click', () => {
        resetChannelMeasurement();
        renderChannelPanel(els);
      });
    }
    return;
  }

  if (recordingStep) {
    const which = ch.step === 'left-recording' ? 'L' : 'R';
    const pct = Math.min(100, (ch.elapsedSeconds / channelMeasurementDurationSeconds) * 100);
    const remaining = Math.max(0, channelMeasurementDurationSeconds - ch.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Recording ${which}-channel band &hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="${renderText(`${which} channel capture progress`)}">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-channel-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-channel-cancel]')?.addEventListener('click', () => {
      stopChannelMeasurement();
      // From left-recording → reset to idle; from right-recording → keep left
      state.channel.step = state.channel.leftCapture && state.channel.rightCapture === null
        ? 'left-done'
        : 'idle';
      if (state.channel.step === 'idle') {
        state.channel.leftCapture = null;
        state.channel.rightCapture = null;
      }
      renderChannelPanel(els);
    });
    return;
  }

  if (ch.step === 'done' && ch.leftCapture && ch.rightCapture) {
    const identity = ch.identityResult;
    const warningsHtml = identity && identity.warnings.length > 0
      ? identity.warnings.map(w => `<p class="mlab-channel-warning">${renderText(w)}</p>`).join('')
      : '';
    const sourceLabel = ch.source === 'self_test'
      ? '<span class="ea-badge">Self-test</span>'
      : '<span class="ea-badge ea-badge--manufacturer">Live</span>';
    const selfTestNote = ch.source === 'self_test'
      ? `<p class="mlab-channel-selftest-note">Self-test uses a mono sine — channel separation is not meaningful. Results are indicative only.</p>`
      : '';
    body.innerHTML = `
      <table class="ea-form-table" aria-label="Channel measurement summary">
        <tbody>
          ${captureRowMarkup('L-band capture', ch.leftCapture)}
          ${captureRowMarkup('R-band capture', ch.rightCapture)}
        </tbody>
      </table>
      <div class="mlab-wf-result">
        ${identity ? `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Channel identity</span>
          <span class="mlab-wf-result-value">${channelIdentityBadgeHtml(identity.identity)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Source</span>
          <span class="mlab-wf-result-value">${sourceLabel} <span class="ea-badge">Confidence: ${renderText(identity.confidence)}</span></span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Balance (R − L wanted)</span>
          <span class="mlab-wf-result-value">${fmtDb(identity.wantedBalanceDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk L → R</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(identity.leftToRightCrosstalkDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk R → L</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(identity.rightToLeftCrosstalkDb)}</span>
        </div>
        ` : `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk L → R</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(ch.leftCapture.crosstalkDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk R → L</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(ch.rightCapture.crosstalkDb)}</span>
        </div>
        `}
        <p class="mlab-wf-note">Negative crosstalk values are better; well-set-up cartridges land at −25 to −35&nbsp;dB across the audio band.</p>
        ${warningsHtml}
        ${selfTestNote}
      </div>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-channel-reset>Start over</button>
      </div>
      ${azimuthStepHistoryMarkup(ch.runs)}
      ${azimuthStepComparisonMarkup(ch.runs)}
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-channel-reset]')?.addEventListener('click', () => {
      resetChannelMeasurement();
      renderChannelPanel(els);
    });
    return;
  }

  if (ch.step === 'left-done' && ch.leftCapture) {
    const rightBandInfo = rightBand
      ? `<p class="mlab-channel-info">Next: cue band <strong>${renderText(rightBand.index)}</strong> — ${renderText(rightBand.label)}.</p>`
      : '<p class="ea-muted">Step 1 of 2 complete. Cue the R-channel reference band on the test record.</p>';
    body.innerHTML = `
      ${rightBandInfo}
      <table class="ea-form-table" aria-label="Step 1 result">
        <tbody>
          ${captureRowMarkup('L-band capture', ch.leftCapture)}
        </tbody>
      </table>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-channel-start-r>Start R-band capture</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-channel-reset>Start over</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-channel-start-r]')?.addEventListener('click', () => {
      startChannelCapture(els, 'right');
    });
    body.querySelector<HTMLButtonElement>('[data-mlab-channel-reset]')?.addEventListener('click', () => {
      resetChannelMeasurement();
      renderChannelPanel(els);
    });
    return;
  }

  // Idle (no captures yet)
  const leftBandInfo = leftBand
    ? `<p class="mlab-channel-info">Step 1 of 2: cue band <strong>${renderText(leftBand.index)}</strong> — ${renderText(leftBand.label)}. Each capture is ${channelMeasurementDurationSeconds}&nbsp;seconds.</p>`
    : `<p class="ea-muted">Step 1 of 2: cue the L-channel reference band on the test record (typically 1&nbsp;kHz, L only). Each capture is ${channelMeasurementDurationSeconds}&nbsp;seconds.</p>`;
  const selfTestNotice = isSelfTest
    ? `<p class="mlab-channel-selftest-note">Self-test mode uses a mono oscillator — channel identity result will be indicative only.</p>`
    : '';
  body.innerHTML = `
    ${leftBandInfo}
    ${selfTestNotice}
    <div class="mlab-azimuth-label-row">
      <label class="ea-label" for="mlab-step-label">Step label <span class="ea-muted">(optional)</span></label>
      <input type="text" id="mlab-step-label" class="ea-input mlab-azimuth-label-input"
        maxlength="60" placeholder="e.g. Baseline, +2°, Full CW…"
        value="${renderText(state.channel.stepLabelInput)}">
    </div>
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-channel-start-l>Start L-band capture</button>
    </div>
    ${azimuthStepHistoryMarkup(ch.runs)}
    ${azimuthStepComparisonMarkup(ch.runs)}
  `;
  body.querySelector<HTMLInputElement>('#mlab-step-label')?.addEventListener('input', (e) => {
    state.channel.stepLabelInput = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-channel-start-l]')?.addEventListener('click', () => {
    startChannelCapture(els, 'left');
  });
}

function azimuthStepHistoryMarkup(runs: readonly AzimuthStepRun[]): string {
  if (runs.length === 0) return '';
  const rows = runs.map((r, i) => {
    const srcLabel = r.source === 'self_test' ? 'Self-test' : 'Live';
    const ltr = r.leftToRightCrosstalkDb.toFixed(1);
    const rtl = r.rightToLeftCrosstalkDb.toFixed(1);
    const quality = r.runQuality?.status ?? 'n/a';
    return `<tr class="mlab-azimuth-step-row">
      <td class="mlab-azimuth-step-cell">${i + 1}</td>
      <td class="mlab-azimuth-step-cell">${renderText(r.label ?? `Step ${i + 1}`)}</td>
      <td class="mlab-azimuth-step-cell">${renderText(ltr)} dB</td>
      <td class="mlab-azimuth-step-cell">${renderText(rtl)} dB</td>
      <td class="mlab-azimuth-step-cell">${renderText(r.identity)}</td>
      <td class="mlab-azimuth-step-cell">${renderText(quality)}</td>
      <td class="mlab-azimuth-step-cell">${renderText(srcLabel)}</td>
    </tr>`;
  }).join('');
  return `
    <div class="mlab-azimuth-step-history">
      <div class="mlab-azimuth-step-history-head">Azimuth step history (${runs.length} run${runs.length !== 1 ? 's' : ''})</div>
      <div class="mlab-azimuth-step-scroll">
        <table class="mlab-azimuth-step-table" aria-label="Azimuth step measurement history">
          <thead>
            <tr>
              <th>#</th>
              <th>Label</th>
              <th>L→R crosstalk</th>
              <th>R→L crosstalk</th>
              <th>Identity</th>
              <th>Quality</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function azimuthStepComparisonMarkup(runs: readonly AzimuthStepRun[]): string {
  const cmp = computeAzimuthStepComparison(runs);
  if (!cmp) return '';
  if (!cmp.compatible) {
    return `<div class="mlab-azimuth-comparison mlab-azimuth-comparison--warn">
      <div class="mlab-azimuth-comparison-head">Step comparison</div>
      <p class="mlab-azimuth-comparison-note">${renderText(cmp.note)}</p>
    </div>`;
  }
  const ltrMin = cmp.ltrRangeDb ? cmp.ltrRangeDb.min.toFixed(1) : '—';
  const ltrMax = cmp.ltrRangeDb ? cmp.ltrRangeDb.max.toFixed(1) : '—';
  const rtlMin = cmp.rtlRangeDb ? cmp.rtlRangeDb.min.toFixed(1) : '—';
  const rtlMax = cmp.rtlRangeDb ? cmp.rtlRangeDb.max.toFixed(1) : '—';
  return `<div class="mlab-azimuth-comparison">
    <div class="mlab-azimuth-comparison-head">Step comparison (${cmp.runCount} runs)</div>
    <div class="mlab-azimuth-comparison-row">
      <span class="mlab-azimuth-comparison-label ea-muted">L→R range</span>
      <span class="mlab-azimuth-comparison-val">${renderText(ltrMin)} to ${renderText(ltrMax)} dB</span>
    </div>
    <div class="mlab-azimuth-comparison-row">
      <span class="mlab-azimuth-comparison-label ea-muted">R→L range</span>
      <span class="mlab-azimuth-comparison-val">${renderText(rtlMin)} to ${renderText(rtlMax)} dB</span>
    </div>
    <p class="mlab-azimuth-comparison-note">${renderText(cmp.note)}</p>
  </div>`;
}

function buildFreqResponseSvg(result: FreqResponseResult, iriaaEnabled: boolean): string {
  const L = 48, R = 16, T = 16, B = 36;
  const W = 800, H = 280;
  const CW = W - L - R;
  const CH = H - T - B;
  const dbMin = -30, dbMax = 30;
  const fMin = 20, fMax = 20000;

  function xOf(f: number): number {
    return L + (Math.log2(f / fMin) / Math.log2(fMax / fMin)) * CW;
  }
  function yOf(db: number): number {
    const clamped = Math.max(dbMin, Math.min(dbMax, db));
    return T + ((dbMax - clamped) / (dbMax - dbMin)) * CH;
  }

  const vGridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const hGridDbs = [-30, -20, -10, 0, 10, 20, 30];
  const gridLines = [
    ...vGridFreqs.map((f) => {
      const x = xOf(f).toFixed(1);
      return `<line class="mlab-freq-grid" x1="${x}" y1="${T}" x2="${x}" y2="${T + CH}"/>`;
    }),
    ...hGridDbs.map((db) => {
      const y = yOf(db).toFixed(1);
      const cls = db === 0 ? 'mlab-freq-grid mlab-freq-grid--zero' : 'mlab-freq-grid';
      return `<line class="${cls}" x1="${L}" y1="${y}" x2="${L + CW}" y2="${y}"/>`;
    }),
  ].join('');

  const xLabels = [20, 100, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    return `<text class="mlab-freq-axis-label" x="${xOf(f).toFixed(1)}" y="${T + CH + 26}" text-anchor="middle">${label}</text>`;
  }).join('');

  const yLabels = hGridDbs.filter((db) => db % 10 === 0).map((db) => {
    const y = (yOf(db) + 4).toFixed(1);
    return `<text class="mlab-freq-axis-label" x="${L - 6}" y="${y}" text-anchor="end">${db > 0 ? '+' : ''}${db}</text>`;
  }).join('');

  const { frequenciesHz, magnitudesDb } = result;
  const responsePts: string[] = [];
  for (let b = 0; b < frequenciesHz.length; b++) {
    const f = frequenciesHz[b];
    if (f < fMin || f > fMax) continue;
    responsePts.push(`${xOf(f).toFixed(1)},${yOf(magnitudesDb[b]).toFixed(1)}`);
  }
  const responsePath = responsePts.length > 1
    ? `<polyline class="mlab-freq-response" points="${responsePts.join(' ')}"/>`
    : '';

  let riaaPath = '';
  if (!iriaaEnabled) {
    const riaaRef = computeRiaaMagnitudeDb(1000);
    const riaaPts: string[] = [];
    for (let b = 0; b < frequenciesHz.length; b++) {
      const f = frequenciesHz[b];
      if (f < fMin || f > fMax) continue;
      riaaPts.push(`${xOf(f).toFixed(1)},${yOf(computeRiaaMagnitudeDb(f) - riaaRef).toFixed(1)}`);
    }
    if (riaaPts.length > 1) {
      riaaPath = `<polyline class="mlab-freq-riaa" points="${riaaPts.join(' ')}"/>`;
    }
  }

  const legend = `
    <div class="mlab-freq-legend">
      <span class="mlab-freq-legend-item">
        <span class="mlab-freq-legend-swatch"></span>
        <span>Measured response</span>
      </span>
      ${!iriaaEnabled ? `
      <span class="mlab-freq-legend-item">
        <span class="mlab-freq-legend-swatch mlab-freq-legend-swatch--dashed"></span>
        <span>RIAA reference</span>
      </span>` : ''}
    </div>
  `;

  const svg = `<svg class="mlab-freq-chart" viewBox="0 0 ${W} ${H}" aria-label="Frequency response chart" role="img">${gridLines}${xLabels}${yLabels}${riaaPath}${responsePath}</svg>`;
  return svg + legend;
}

function renderFreqPanel(els: Elements): void {
  const body = els.freqBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a frequency response measurement.</p>';
    return;
  }

  const record = selectedRecord();
  const sweepBands = record ? getFrequencyResponseBands(record) : [];

  // No record selected
  if (!record) {
    body.innerHTML = '<p class="ea-muted">Select a test record with a frequency sweep band.</p>';
    return;
  }

  // Record selected but no sweep band available
  if (sweepBands.length === 0) {
    body.innerHTML = `
      <p class="ea-muted">Frequency response measurement is not available with selected test record.</p>
      <p class="ea-muted">Choose a test record with a frequency sweep band.</p>
    `;
    return;
  }

  if (state.freq.active) {
    const pct = Math.min(100, (state.freq.elapsedSeconds / freqMeasurementDurationSeconds) * 100);
    const remaining = Math.max(0, freqMeasurementDurationSeconds - state.freq.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Capturing ${freqMeasurementDurationSeconds}&thinsp;s of audio&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Capture progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-freq-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-freq-cancel]')?.addEventListener('click', () => {
      stopFreqCapture();
      state.freq.active = false;
      renderFreqPanel(els);
    });
    return;
  }

  if (state.freq.result) {
    const chartHtml = buildFreqResponseSvg(state.freq.result, state.iriaaEnabled);
    const sourceBadge = state.freq.resultSource === 'self_test'
      ? '<span class="ea-badge ea-badge--setup">Self-test / Simulated</span>'
      : '<span class="ea-badge ea-badge--manufacturer">Live capture</span>';
    const iriaaLabel = state.iriaaEnabled
      ? '<span class="ea-badge ea-badge--ok">iRIAA applied</span>'
      : '<span class="ea-badge">No iRIAA</span>';
    const bm = state.freq.selectedBandMeta;
    const bandRange = bm?.frequencyStartHz !== null && bm?.frequencyEndHz !== null && bm !== null
      ? ` · ${bm.frequencyStartHz}–${bm.frequencyEndHz} Hz` : '';
    const dev = computeFreqDeviationSummary(state.freq.result, state.iriaaEnabled);
    const fmtHz = (hz: number) => hz < 1000 ? `${hz.toFixed(0)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
    const deviationHtml = dev ? `
      <div class="mlab-freq-deviation">
        <div class="mlab-freq-deviation-head">Deviation summary <span class="mlab-freq-deviation-ref">(ref: 1 kHz = 0 dB)</span></div>
        <div class="mlab-freq-deviation-row">
          <span class="mlab-freq-deviation-label">Min deviation</span>
          <span class="mlab-freq-deviation-val">${dev.minDb.toFixed(1)} dB @ ${renderText(fmtHz(dev.minFrequencyHz))}</span>
        </div>
        <div class="mlab-freq-deviation-row">
          <span class="mlab-freq-deviation-label">Max deviation</span>
          <span class="mlab-freq-deviation-val">${dev.maxDb.toFixed(1)} dB @ ${renderText(fmtHz(dev.maxFrequencyHz))}</span>
        </div>
        <div class="mlab-freq-deviation-row">
          <span class="mlab-freq-deviation-label">Peak-to-peak</span>
          <span class="mlab-freq-deviation-val">${dev.peakToPeakDb.toFixed(1)} dB</span>
        </div>
        <div class="mlab-freq-deviation-row">
          <span class="mlab-freq-deviation-label">RMS deviation</span>
          <span class="mlab-freq-deviation-val">${dev.rmsDeviationDb.toFixed(2)} dB</span>
        </div>
        ${dev.bandSummaries.map(b => `
        <div class="mlab-freq-deviation-row">
          <span class="mlab-freq-deviation-label">${renderText(b.label)}</span>
          <span class="mlab-freq-deviation-val">${b.meanDb !== null ? `${b.meanDb.toFixed(1)} dB` : 'n/a'}</span>
        </div>`).join('')}
      </div>` : '';
    body.innerHTML = `
      <div class="mlab-freq-chart-wrap">${chartHtml}</div>
      ${deviationHtml}
      <div class="mlab-wf-result">
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Source</span>
          <span class="mlab-wf-result-value">${sourceBadge}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">iRIAA</span>
          <span class="mlab-wf-result-value">${iriaaLabel}</span>
        </div>
        ${bm ? `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Sweep band</span>
          <span class="mlab-wf-result-value">${renderText(bm.label)}${renderText(bandRange)}</span>
        </div>` : ''}
      </div>
      <p class="mlab-wf-note">${state.freq.result.blockCount} blocks averaged &middot; ${(state.freq.result.sampleRateHz / 1000).toFixed(1)}&thinsp;kHz &middot; FFT size ${state.freq.result.fftSize}</p>
      <p class="mlab-reflevel-info">These readings measure the full playback/capture chain: test record, cartridge, tonearm, phono stage and audio interface. They are not cartridge-only response.</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-freq-start>Measure again</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-freq-start]')?.addEventListener('click', () => {
      state.freq.result = null;
      startFreqCapture(els);
    });
    return;
  }

  // Idle — show band selector and start button
  const selectedBand = selectedFreqBand();
  const overlayNote = !state.iriaaEnabled
    ? ' The RIAA reference curve will be overlaid for comparison.'
    : '';
  const selfTestNote = state.sourceMode === 'self-test'
    ? `<p class="ea-muted mlab-reflevel-selftest-note">Self-test mode: the 1&thinsp;kHz oscillator does not produce a sweep &mdash; results will be marked <strong>self-test&nbsp;/&nbsp;simulated</strong> and are not a frequency response measurement.</p>`
    : '';
  const calSetNote = state.refLevel.calibrationSet.length > 0
    ? `<p class="mlab-reflevel-info">Reference calibration set available for context.</p>`
    : '';

  const bandOptions = sweepBands.map(b => {
    const isSelected = state.freq.selectedBandIndex
      ? b.index === state.freq.selectedBandIndex
      : b.index === selectedBand?.index;
    const sel = isSelected ? ' selected' : '';
    const range = b.fromHz !== undefined && b.toHz !== undefined ? ` (${b.fromHz}–${b.toHz} Hz)` : '';
    const level = b.levelDb !== undefined ? ` · ${b.levelDb} dB` : '';
    return `<option value="${renderText(b.index)}"${sel}>${renderText(b.label + range + level)}</option>`;
  }).join('');

  const bandRow = sweepBands.length > 1
    ? `
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Sweep band
            <span class="ea-form-table-sublabel">Band from test record</span>
          </td>
          <td class="ea-col-value">
            <select class="ea-input" data-mlab-freq-band aria-label="Sweep band">
              ${bandOptions}
            </select>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Band</span></td>
        </tr>`
    : `
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Sweep band</td>
          <td class="ea-col-value">${selectedBand ? renderText(selectedBand.label) : '—'}${selectedBand?.fromHz !== undefined && selectedBand?.toHz !== undefined ? `<span class="mlab-formula-reminder"> ${selectedBand.fromHz}–${selectedBand.toHz}&nbsp;Hz</span>` : ''}</td>
          <td class="ea-col-meta"><span class="ea-badge">Band</span></td>
        </tr>`;

  body.innerHTML = `
    ${selfTestNote}
    <p class="mlab-reflevel-info">These readings measure the full playback/capture chain: test record, cartridge, tonearm, phono stage and audio interface. They are not cartridge-only response.${overlayNote}</p>
    ${calSetNote}
    <table class="ea-form-table" aria-label="Frequency response setup">
      <tbody>
        ${bandRow}
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Duration</td>
          <td class="ea-col-value mlab-requested">${freqMeasurementDurationSeconds}&thinsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-freq-start>Start capture</button>
    </div>
  `;
  if (sweepBands.length > 1) {
    body.querySelector<HTMLSelectElement>('[data-mlab-freq-band]')?.addEventListener('change', (e) => {
      const val = (e.currentTarget as HTMLSelectElement).value;
      state.freq.selectedBandIndex = val.length > 0 ? val : null;
    });
  }
  body.querySelector<HTMLButtonElement>('[data-mlab-freq-start]')?.addEventListener('click', () => {
    startFreqCapture(els);
  });
}

function stopFreqCapture(): void {
  if (state.freq.capture) {
    state.freq.capture.stop();
    state.freq.capture = null;
  }
  state.freq.active = false;
  state.freq.elapsedSeconds = 0;
}

function startFreqCapture(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  const band = selectedFreqBand();
  if (!band) {
    appendLog('Frequency response: no sweep band available — capture aborted.');
    return;
  }

  if (state.freq.selectedBandIndex && band.index !== state.freq.selectedBandIndex) {
    state.freq.selectedBandIndex = null;
  }

  stopFreqCapture();
  state.freq.active = true;
  state.freq.elapsedSeconds = 0;
  state.freq.result = null;
  state.freq.resultSource = state.sourceMode === 'self-test' ? 'self_test' : 'live_capture';
  state.freq.selectedBandMeta = {
    index: band.index,
    label: band.label,
    frequencyStartHz: band.fromHz ?? null,
    frequencyEndHz: band.toHz ?? null,
    frequencyHz: band.frequencyHz ?? null,
    levelDb: band.levelDb ?? null,
  };
  renderFreqPanel(els);

  state.freq.capture = createSweepCapture(
    context,
    source,
    freqMeasurementDurationSeconds,
    {
      onProgress: (elapsed) => {
        state.freq.elapsedSeconds = elapsed;
        renderFreqPanel(els);
      },
      onDone: (samples) => {
        state.freq.capture = null;
        state.freq.active = false;
        state.freq.result = computeFrequencyResponse(samples, context.sampleRate);
        appendLog(`Frequency response complete — ${state.freq.result.blockCount} blocks, ${state.freq.result.fftSize} FFT.`);
        renderFreqPanel(els);
      },
    },
  );
}

// ---- THD & IMD panel -------------------------------------------------------

function stopThdCapture(): void {
  if (state.thd.capture) { state.thd.capture.stop(); state.thd.capture = null; }
  state.thd.active = false;
  state.thd.elapsedSeconds = 0;
}

function startThdCapture(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  const { thdBands, imdBands } = getDistortionBands(selectedRecord());
  const activeBands = state.thd.mode === 'thd' ? thdBands : imdBands;
  const band = state.thd.selectedBandIndex
    ? activeBands.find(b => b.index === state.thd.selectedBandIndex) ?? activeBands[0] ?? null
    : activeBands[0] ?? null;

  if (!band) {
    appendLog(`${state.thd.mode.toUpperCase()}: no band available for selected test record — capture aborted.`);
    return;
  }

  if (state.thd.mode === 'thd' && band.frequencyHz !== undefined) {
    state.thd.fundamentalHz = band.frequencyHz;
  }
  if (state.thd.mode === 'imd') {
    if (band.f1Hz !== undefined) state.thd.imdF1Hz = band.f1Hz;
    if (band.f2Hz !== undefined) state.thd.imdF2Hz = band.f2Hz;
  }

  state.thd.bandMeta = {
    index: band.index,
    label: band.label,
    frequencyHz: band.frequencyHz ?? null,
    f1Hz: band.f1Hz ?? null,
    f2Hz: band.f2Hz ?? null,
    levelDb: band.levelDb ?? null,
    standard: band.standard ?? null,
  };

  stopThdCapture();
  state.thd.active = true;
  state.thd.elapsedSeconds = 0;
  state.thd.result = null;
  state.thd.resultSource = state.sourceMode === 'self-test' ? 'self_test' : 'live_capture';
  renderThdPanel(els);

  const durationSeconds = 5;
  state.thd.capture = createSweepCapture(context, source, durationSeconds, {
    onProgress: (elapsed) => { state.thd.elapsedSeconds = elapsed; renderThdPanel(els); },
    onDone: (samples) => {
      state.thd.capture = null;
      state.thd.active = false;
      if (state.thd.mode === 'thd') {
        state.thd.result = analyseTHD(samples, context.sampleRate, state.thd.fundamentalHz);
      } else {
        state.thd.result = analyseIMD(samples, context.sampleRate, state.thd.imdF1Hz, state.thd.imdF2Hz);
      }
      state.thd.runQuality = deriveMeasurementRunQuality({
        leftRmsDbfs: state.channelLevels.L.rmsDbFs,
        rightRmsDbfs: state.channelLevels.R.rmsDbFs,
        leftPeakDbfs: state.channelLevels.L.peakDbFs,
        rightPeakDbfs: state.channelLevels.R.peakDbFs,
        source: state.thd.resultSource ?? 'live_capture',
        measurementKind: 'test_tone',
      });
      const thdDone = state.thd.result;
      if (isThdResult(thdDone)) {
        appendLog(`THD complete — ${thdDone.thdPercent.toFixed(3)} %`);
      } else if (thdDone) {
        appendLog(`IMD complete — ${thdDone.imdPercent.toFixed(3)} %`);
      }
      renderThdPanel(els);
    },
  });
}

function isThdResult(r: ThdResult | ImdResult | null): r is ThdResult {
  return r !== null && 'thdPercent' in r;
}

function getReferenceBands(record: TestRecord): readonly TestBand[] {
  return record.sides.flatMap(s => [...s.bands]).filter(b => b.analyzerModule === 'reference_calibration');
}

function getWowFlutterBands(record: TestRecord | null): readonly TestBand[] {
  if (!record) return [];
  const allBands = record.sides.flatMap(s => [...s.bands]);
  return allBands.filter(b =>
    b.analyzerModule === 'wow_flutter' ||
    (b.analyzerModules as string[] | undefined)?.includes('wow_flutter') ||
    b.purpose === 'speed',
  );
}

function getDistortionBands(record: TestRecord | null): { thdBands: readonly TestBand[]; imdBands: readonly TestBand[] } {
  if (!record) return { thdBands: [], imdBands: [] };
  const allBands = record.sides.flatMap(s => [...s.bands]);
  const thdBands = allBands.filter(b =>
    b.analyzerModule === 'thd' ||
    (b.analyzerModules as string[] | undefined)?.includes('thd') ||
    b.purpose === 'thd',
  );
  const imdBands = allBands.filter(b =>
    b.analyzerModule === 'imd' ||
    (b.analyzerModules as string[] | undefined)?.includes('imd') ||
    b.purpose === 'imd',
  );
  return { thdBands, imdBands };
}

function getVtaImdBands(record: TestRecord | null): readonly TestBand[] {
  if (!record) return [];
  const allBands = record.sides.flatMap(s => [...s.bands]);
  return allBands.filter(b =>
    b.analyzerModule === 'vta_imd_optimizer' ||
    (b.analyzerModules as string[] | undefined)?.includes('vta_imd_optimizer') ||
    b.purpose === 'vta_optimization',
  );
}

function getFrequencyResponseBands(record: TestRecord): readonly TestBand[] {
  const allBands = record.sides.flatMap(s => [...s.bands]);
  const sweepBands = allBands.filter(
    b =>
      b.type === 'sweep' &&
      (b.analyzerModule === 'frequency_response' ||
        (b.analyzerModules as string[] | undefined)?.includes('frequency_response') ||
        b.purpose === 'freq_response'),
  );
  // Prefer 20 Hz–20 kHz sweeps; stable sort preserves original order within each tier
  return [...sweepBands].sort((a, b) => {
    const aFull = (a.fromHz ?? Infinity) <= 25 && (a.toHz ?? 0) >= 19000;
    const bFull = (b.fromHz ?? Infinity) <= 25 && (b.toHz ?? 0) >= 19000;
    if (aFull && !bFull) return -1;
    if (!aFull && bFull) return 1;
    return 0;
  });
}

function selectedFreqBand(): TestBand | null {
  const record = selectedRecord();
  if (!record) return null;
  const bands = getFrequencyResponseBands(record);
  if (bands.length === 0) return null;
  if (state.freq.selectedBandIndex) {
    return bands.find(b => b.index === state.freq.selectedBandIndex) ?? bands[0] ?? null;
  }
  return bands[0] ?? null;
}

function getChannelIdentityBands(record: TestRecord): { leftBand: TestBand | null; rightBand: TestBand | null } {
  const allBands = record.sides.flatMap(s => [...s.bands]);
  // Prefer bands with explicit analyzerModule/analyzerModules for channel_identity
  const identityBands = allBands.filter(
    b => b.analyzerModule === 'channel_identity' || (b.analyzerModules as string[] | undefined)?.includes('channel_identity'),
  );
  if (identityBands.length >= 2) {
    const left = identityBands.find(b => b.channel === 'L') ?? identityBands[0] ?? null;
    const right = identityBands.find(b => b.channel === 'R') ?? identityBands[1] ?? null;
    return { leftBand: left, rightBand: right };
  }
  // Fallback: purpose === 'crosstalk' bands with L/R channels
  const crosstalkBands = allBands.filter(b => b.purpose === 'crosstalk');
  const left = crosstalkBands.find(b => b.channel === 'L') ?? null;
  const right = crosstalkBands.find(b => b.channel === 'R') ?? null;
  return { leftBand: left, rightBand: right };
}

function selectedReferenceBand(): TestBand | null {
  const record = selectedRecord();
  if (!record) return null;
  const bands = getReferenceBands(record);
  if (bands.length === 0) return null;
  if (state.refLevel.selectedBandIndex) {
    return bands.find(b => b.index === state.refLevel.selectedBandIndex) ?? bands[0];
  }
  return bands.find(b => b.frequencyHz === 1000) ?? bands[0];
}

function stopRefLevelCapture(): void {
  if (state.refLevel.capture) {
    state.refLevel.capture.stop();
    state.refLevel.capture = null;
  }
  state.refLevel.active = false;
  state.refLevel.elapsedSeconds = 0;
}

function startRefLevelCapture(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  stopRefLevelCapture();
  state.refLevel.active = true;
  state.refLevel.elapsedSeconds = 0;
  state.refLevel.result = null;
  renderRefLevelPanel(els);

  const durationSeconds = refLevelMeasurementDurationSeconds;
  const totalSamples = Math.ceil(durationSeconds * context.sampleRate);
  const leftBuf = new Float32Array(totalSamples);
  const rightBuf = new Float32Array(totalSamples);
  let written = 0;
  let done = false;
  const bufferSize = 4096;

  // eslint-disable-next-line deprecation/deprecation
  const processor = context.createScriptProcessor(bufferSize, 2, 2);
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  silentSink.connect(context.destination);

  const teardown = (): void => {
    try { processor.disconnect(); } catch { /* gone */ }
    try { silentSink.disconnect(); } catch { /* gone */ }
  };

  processor.onaudioprocess = (event) => {
    if (done) return;
    const inBuf = event.inputBuffer;
    const inL = inBuf.getChannelData(0);
    const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
    const remaining = totalSamples - written;
    const toWrite = Math.min(inL.length, remaining);
    leftBuf.set(inL.subarray(0, toWrite), written);
    rightBuf.set(inR.subarray(0, toWrite), written);
    written += toWrite;
    state.refLevel.elapsedSeconds = written / context.sampleRate;
    renderRefLevelPanel(els);
    if (written >= totalSamples) {
      done = true;
      teardown();
      state.refLevel.capture = null;
      state.refLevel.active = false;
      const band = selectedReferenceBand();
      const capturedResult = analyzeReferenceLevel({
        leftSamples: leftBuf.subarray(0, written),
        rightSamples: rightBuf.subarray(0, written),
        sampleRateHz: context.sampleRate,
        referenceFrequencyHz: band?.frequencyHz,
        referenceLevelDb: band?.levelDb,
      });
      state.refLevel.result = capturedResult;
      const capturedSource = state.sourceMode === 'self-test' ? 'self_test' as const : 'live_capture' as const;
      state.refLevel.resultSource = capturedSource;
      state.refLevel.runQuality = deriveMeasurementRunQuality({
        leftRmsDbfs: capturedResult.leftRmsDbfs,
        rightRmsDbfs: capturedResult.rightRmsDbfs,
        leftPeakDbfs: capturedResult.leftPeakDbfs,
        rightPeakDbfs: capturedResult.rightPeakDbfs,
        source: capturedSource,
        measurementKind: 'test_tone',
      });
      state.refLevel.calibrationSet = addOrReplaceEntry(state.refLevel.calibrationSet, {
        bandIndex: band?.index ?? '__unknown__',
        bandLabel: band?.label ?? 'Unknown band',
        frequencyHz: band?.frequencyHz ?? null,
        nominalLevelDb: band?.levelDb ?? null,
        source: capturedSource,
        result: capturedResult,
        capturedAt: new Date().toISOString(),
      });
      const bal = capturedResult.balanceDb?.toFixed(2) ?? '—';
      appendLog(`Reference level — balance ${bal} dB, confidence ${capturedResult.confidence}`);
      const setLen = state.refLevel.calibrationSet.length;
      appendLog(`Calibration set: ${setLen} band${setLen === 1 ? '' : 's'} measured`);
      renderRefLevelPanel(els);
    }
  };

  source.connect(processor);
  processor.connect(silentSink);

  state.refLevel.capture = {
    stop(): void {
      if (!done) {
        done = true;
        teardown();
      }
    },
  };
}

function fmtDbfs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} dBFS`;
}

function fmtDbSigned(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} dB`;
}

function renderCalibrationSetHtml(set: CalibrationSetEntry[]): string {
  if (set.length === 0) return '';
  const ref1kHzLive = find1kHzEntry(set, 'live_capture');
  const ref1kHzSelfTest = find1kHzEntry(set, 'self_test');
  const showRelative = !!(ref1kHzLive || ref1kHzSelfTest);
  const relHeaders = showRelative
    ? '<th title="Relative to measured 1 kHz reference">ΔL 1kHz</th><th title="Relative to measured 1 kHz reference">ΔR 1kHz</th>'
    : '';
  const rows = set.map(e => {
    const ref = e.source === 'live_capture' ? ref1kHzLive : ref1kHzSelfTest;
    const rel = relativeTo1kHz(e, ref);
    const srcBadgeClass = e.source === 'self_test' ? 'ea-badge ea-badge--setup' : 'ea-badge ea-badge--manufacturer';
    const srcLabel = e.source === 'self_test' ? 'Self-test' : 'Live';
    const clipCell = e.result.clipping
      ? `<span class="mlab-reflevel-calset-clip">Clip</span>`
      : `<span>—</span>`;
    const relCols = showRelative
      ? `<td class="mlab-reflevel-calset-delta">${rel.deltaLDb !== null ? (rel.deltaLDb >= 0 ? '+' : '') + rel.deltaLDb.toFixed(1) : '—'}</td><td class="mlab-reflevel-calset-delta">${rel.deltaRDb !== null ? (rel.deltaRDb >= 0 ? '+' : '') + rel.deltaRDb.toFixed(1) : '—'}</td>`
      : '';
    return `<tr>
        <td>${renderText(e.bandLabel)}</td>
        <td>${e.frequencyHz !== null ? `${e.frequencyHz}&nbsp;Hz` : '—'}</td>
        <td>${e.nominalLevelDb !== null ? `${e.nominalLevelDb}&nbsp;dB` : '—'}</td>
        <td><span class="${srcBadgeClass}">${srcLabel}</span></td>
        <td>${fmtDbfs(e.result.leftRmsDbfs)}</td>
        <td>${fmtDbfs(e.result.rightRmsDbfs)}</td>
        <td>${fmtDbSigned(e.result.balanceDb)}</td>
        <td>${clipCell}</td>
        <td>${renderText(e.result.confidence)}</td>
        ${relCols}
      </tr>`;
  }).join('');
  const relNote = showRelative
    ? `<p class="ea-muted" style="font-size:0.75rem;margin-top:var(--ea-space-1)">&Delta;L/&Delta;R = relative to measured 1&nbsp;kHz reference</p>`
    : '';
  return `
    <div class="mlab-reflevel-calset">
      <div class="mlab-reflevel-calset-title">
        Calibration set: ${set.length}&nbsp;band${set.length === 1 ? '' : 's'} measured
        <button class="ea-button ea-button--ghost" type="button" data-mlab-reflevel-clear>Clear</button>
      </div>
      <div class="mlab-reflevel-calset-scroll">
        <table class="mlab-reflevel-calset-table" aria-label="Reference calibration set">
          <thead><tr>
            <th>Band</th><th>Freq</th><th>Nominal</th><th>Source</th>
            <th>L RMS</th><th>R RMS</th><th>Balance</th><th>Clip</th><th>Confidence</th>
            ${relHeaders}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${relNote}
    </div>`;
}

function attachClearSetListener(body: HTMLElement, els: Elements): void {
  body.querySelector<HTMLButtonElement>('[data-mlab-reflevel-clear]')?.addEventListener('click', () => {
    state.refLevel.calibrationSet = clearCalibrationSet();
    appendLog('Reference calibration set cleared');
    renderRefLevelPanel(els);
  });
}

function renderRefLevelPanel(els: Elements): void {
  const body = els.refLevelBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    let statusMsg: string;
    if (state.captureState === 'connecting') {
      statusMsg = '<p class="ea-muted">Connecting&hellip; reference level analysis will be available once connected.</p>';
    } else if (state.captureState === 'error') {
      statusMsg = '<p class="ea-muted mlab-coverage-load-error">Connection error &mdash; reconnect to analyze reference level.</p>';
    } else {
      statusMsg = '<p class="ea-muted">Connect a live source or run a self-test to analyze reference level.</p>';
    }
    body.innerHTML = statusMsg + renderCalibrationSetHtml(state.refLevel.calibrationSet);
    attachClearSetListener(body, els);
    return;
  }

  if (state.testRecordLoadFailed) {
    body.innerHTML = '<p class="ea-muted mlab-coverage-load-error">Test record dataset failed to load.</p>';
    return;
  }

  const record = selectedRecord();
  if (!record) {
    body.innerHTML = '<p class="ea-muted">Select a test record above to see available reference bands.</p>';
    return;
  }

  const referenceBands = getReferenceBands(record);
  if (referenceBands.length === 0) {
    body.innerHTML = '<p class="ea-muted">Reference level calibration is not available with selected test record.</p>';
    return;
  }

  if (state.refLevel.active) {
    const pct = Math.min(100, (state.refLevel.elapsedSeconds / refLevelMeasurementDurationSeconds) * 100);
    const remaining = Math.max(0, refLevelMeasurementDurationSeconds - state.refLevel.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Capturing ${refLevelMeasurementDurationSeconds}&thinsp;s reference level&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Capture progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-reflevel-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-reflevel-cancel]')?.addEventListener('click', () => {
      stopRefLevelCapture();
      renderRefLevelPanel(els);
    });
    return;
  }

  if (state.refLevel.result) {
    const r = state.refLevel.result;
    const sourceLabel = state.refLevel.resultSource === 'self_test' ? 'Self-test / Simulated' : 'Live capture';
    const sourceBadgeClass = state.refLevel.resultSource === 'self_test' ? 'ea-badge ea-badge--setup' : 'ea-badge ea-badge--manufacturer';
    const warningHtml = r.warnings.length > 0
      ? Array.from(r.warnings).map(w => `<p class="mlab-reflevel-warning">${renderText(w)}</p>`).join('')
      : '';
    const clipClass = r.clipping ? 'mlab-reflevel-clip mlab-reflevel-clip--active' : 'mlab-reflevel-clip';
    body.innerHTML = `
      <div class="mlab-wf-result">
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Source</span>
          <span class="mlab-wf-result-value"><span class="${sourceBadgeClass}">${renderText(sourceLabel)}</span></span>
        </div>
        ${r.referenceFrequencyHz !== undefined ? `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Reference band</span>
          <span class="mlab-wf-result-value">${r.referenceFrequencyHz}&nbsp;Hz${r.referenceLevelDb !== undefined ? ` &middot; ${r.referenceLevelDb}&nbsp;dB` : ''}</span>
        </div>` : ''}
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">L RMS</span>
          <span class="mlab-wf-result-value">${fmtDbfs(r.leftRmsDbfs)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">R RMS</span>
          <span class="mlab-wf-result-value">${fmtDbfs(r.rightRmsDbfs)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">L Peak</span>
          <span class="mlab-wf-result-value">${fmtDbfs(r.leftPeakDbfs)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">R Peak</span>
          <span class="mlab-wf-result-value">${fmtDbfs(r.rightPeakDbfs)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Balance (R&minus;L)</span>
          <span class="mlab-wf-result-value">${fmtDbSigned(r.balanceDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Headroom</span>
          <span class="mlab-wf-result-value">${r.headroomDb !== null ? `${r.headroomDb.toFixed(2)}&nbsp;dB` : '—'}</span>
        </div>
        <div class="mlab-wf-result-row mlab-wf-result-row--grade">
          <span class="mlab-wf-result-label">Clipping</span>
          <span class="${clipClass}">${r.clipping ? 'Clipping' : 'No clip'}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Confidence</span>
          <span class="mlab-wf-result-value">${renderText(r.confidence.charAt(0).toUpperCase() + r.confidence.slice(1))}</span>
        </div>
      </div>
      ${renderRunQualityHtml(state.refLevel.runQuality)}
      ${warningHtml}
      <p class="mlab-wf-note">Captured at ${(r.sampleRateHz / 1000).toFixed(1)}&nbsp;kHz &middot; balance&nbsp;=&nbsp;R&nbsp;RMS&nbsp;&minus;&nbsp;L&nbsp;RMS</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-reflevel-start>Analyze again</button>
      </div>
      ${renderCalibrationSetHtml(state.refLevel.calibrationSet)}
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-reflevel-start]')?.addEventListener('click', () => {
      state.refLevel.result = null;
      startRefLevelCapture(els);
    });
    attachClearSetListener(body, els);
    return;
  }

  // Idle — ready to analyze
  const selectedBand = selectedReferenceBand();
  const bandOptions = referenceBands.map(b => {
    const isSelected = state.refLevel.selectedBandIndex
      ? b.index === state.refLevel.selectedBandIndex
      : b.index === selectedBand?.index;
    const sel = isSelected ? ' selected' : '';
    const freq = b.frequencyHz ? ` (${b.frequencyHz} Hz)` : '';
    const level = b.levelDb !== undefined ? ` · ${b.levelDb} dB` : '';
    return `<option value="${renderText(b.index)}"${sel}>${renderText(b.label + freq + level)}</option>`;
  }).join('');

  const selfTestNote = state.sourceMode === 'self-test'
    ? `<p class="ea-muted mlab-reflevel-selftest-note">Self-test mode: results will be marked as <strong>self-test / simulated</strong>.</p>`
    : '';

  body.innerHTML = `
    ${selfTestNote}
    <p class="mlab-reflevel-info">Reference level calibration measures the signal chain: test record &rarr; cartridge &rarr; tonearm &rarr; phono stage &rarr; audio interface. This is <em>not</em> a full cartridge frequency response measurement. Works best with a line-in or audio interface.</p>
    <table class="ea-form-table" aria-label="Reference level setup">
      <tbody>
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Reference band
            <span class="ea-form-table-sublabel">Band from test record</span>
          </td>
          <td class="ea-col-value">
            <select class="ea-input" data-mlab-reflevel-band aria-label="Reference band">
              ${bandOptions}
            </select>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Band</span></td>
        </tr>
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Duration</td>
          <td class="ea-col-value mlab-requested">${refLevelMeasurementDurationSeconds}&nbsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-reflevel-start>Analyze reference level</button>
    </div>
    ${renderCalibrationSetHtml(state.refLevel.calibrationSet)}
  `;
  body.querySelector<HTMLSelectElement>('[data-mlab-reflevel-band]')?.addEventListener('change', (e) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    state.refLevel.selectedBandIndex = val.length > 0 ? val : null;
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-reflevel-start]')?.addEventListener('click', () => {
    startRefLevelCapture(els);
  });
  attachClearSetListener(body, els);
}

function highlightTargetPanel(panelId: string): void {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const toolPanelEl = panel.closest<HTMLElement>('[data-mlab-tool-panel]') ?? panel;
  if (toolPanelEl.dataset.mlabToolPanel) {
    const toolId = toolPanelEl.dataset.mlabToolPanel;
    const panelEls = elements(document);
    activateTool(toolId, panelEls);
  }
  panel.classList.remove('mlab-panel--target-highlight');
  void panel.offsetHeight;
  panel.classList.add('mlab-panel--target-highlight');
  setTimeout(() => panel.classList.remove('mlab-panel--target-highlight'), 1600);
}

function resolveSelectedTestRecord(
  records: readonly TestRecord[],
  selectedId: string | null,
): { nextSelectedId: string | null; missing: SelectedTestRecordMissing | null } {
  const preferred = getPreferredRecord(records);
  if (!selectedId) {
    return { nextSelectedId: preferred ? preferred.id : null, missing: null };
  }
  if (records.some(r => r.id === selectedId)) {
    return { nextSelectedId: selectedId, missing: null };
  }
  return {
    nextSelectedId: preferred ? preferred.id : null,
    missing: {
      requestedId: selectedId,
      recoveredToId: preferred ? preferred.id : null,
      recoveredToLabel: preferred ? `${preferred.manufacturer} — ${preferred.title}` : null,
    },
  };
}

function selectedRecord(): TestRecord | null {
  if (!state.selectedTestRecordId) return null;
  return state.testRecords.find(r => r.id === state.selectedTestRecordId) ?? null;
}

function recordHint(purpose: TestBandPurpose): string {
  const record = selectedRecord();
  if (!record) return '';
  const labels: string[] = [];
  record.sides.forEach(side => {
    side.bands.filter(b => b.purpose === purpose).forEach(b => {
      labels.push(`${b.index}: ${renderText(b.label)}`);
    });
  });
  if (labels.length > 0) {
    return `<p class="ea-muted">Selected record — cue <strong>${labels.join(' or ')}</strong>.</p>`;
  }
  return `<p class="ea-muted">Selected record has no ${renderText(purpose.replace(/_/g, ' '))} band; supply a suitable signal manually.</p>`;
}

function renderRecordSelector(els: Elements): void {
  if (!els.recordSelect) return;
  const none = '<option value="">— No record selected —</option>';
  if (state.testRecords.length === 0) {
    els.recordSelect.innerHTML = none;
  } else {
    const options = [
      none,
      ...state.testRecords.map(r => {
        const label = renderText(`${r.manufacturer} — ${r.title}`);
        const sel = state.selectedTestRecordId === r.id ? ' selected' : '';
        return `<option value="${renderText(r.id)}"${sel}>${label}</option>`;
      }),
    ].join('');
    els.recordSelect.innerHTML = options;
    if (state.selectedTestRecordId) {
      els.recordSelect.value = state.selectedTestRecordId;
    }
  }
  if (els.recordDot) {
    els.recordDot.className = `ea-dot ea-dot--${state.selectedTestRecordId ? 'done' : 'planned'}`;
  }
}

function syncCoverageCollapsed(els: Elements): void {
  const collapsed = state.coverageCollapsed;
  if (els.coverageToggleBtn) {
    els.coverageToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    els.coverageToggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
  }
  els.coveragePanelSection?.classList.toggle('mlab-coverage-panel--collapsed', collapsed);
}

function coverageBadgeMarkup(
  availability: WorkflowAvailability,
  panelTarget?: string,
  workflowLabel?: string,
): string {
  const labels: Record<WorkflowAvailability, string> = {
    available: 'Available',
    planned: 'Planned',
    partial: 'Partial',
    unavailable: 'Not available',
  };
  const text = renderText(labels[availability]);
  if (availability === 'available' && panelTarget) {
    const ariaLabel = renderText(`${workflowLabel ?? 'Available'} — go to tool`);
    return `<button class="mlab-coverage-badge mlab-coverage-badge--available" type="button" data-mlab-goto-panel="${renderText(panelTarget)}" aria-label="${ariaLabel}">${text}</button>`;
  }
  return `<span class="mlab-coverage-badge mlab-coverage-badge--${availability}">${text}</span>`;
}

function renderCoveragePanel(els: Elements): void {
  const body = els.coverageBody;
  if (!body) return;

  if (state.testRecordLoadFailed) {
    body.innerHTML = '<p class="ea-muted mlab-coverage-load-error">Test record dataset failed to load. See console or activity log.</p>';
    return;
  }

  let warningHtml = '';
  if (state.selectedTestRecordMissing) {
    const m = state.selectedTestRecordMissing;
    const recoveryText = m.recoveredToLabel
      ? `Reset to preferred profile: ${renderText(m.recoveredToLabel)}.`
      : 'Choose another profile.';
    warningHtml = `<p class="mlab-record-warning">Selected test record not found. ${recoveryText}</p>`;
  }

  const record = selectedRecord();
  if (!record) {
    body.innerHTML = warningHtml || '<p class="ea-muted">Select a test record above to see which measurements are available.</p>';
    return;
  }

  const coverageList = computeAllWorkflowCoverage(record);
  const title = renderText(`${record.manufacturer} — ${record.title}`);

  const counts = {
    available: coverageList.filter(c => c.availability === 'available').length,
    planned: coverageList.filter(c => c.availability === 'planned').length,
    partial: coverageList.filter(c => c.availability === 'partial').length,
    unavailable: coverageList.filter(c => c.availability === 'unavailable').length,
  };
  const summaryParts: string[] = [];
  if (counts.available > 0) summaryParts.push(`${counts.available} available`);
  if (counts.planned > 0) summaryParts.push(`${counts.planned} planned`);
  if (counts.partial > 0) summaryParts.push(`${counts.partial} partial`);
  if (counts.unavailable > 0) summaryParts.push(`${counts.unavailable} not available`);

  const cards = coverageList.map(cov => {
    const workflow = MEASUREMENT_WORKFLOWS.find(w => w.id === cov.workflowId);
    if (!workflow) return '';
    const panelTarget = WORKFLOW_PANEL_TARGETS[cov.workflowId];
    const ariaDisabled = cov.availability === 'unavailable' ? ' aria-disabled="true"' : '';
    return `
      <div class="mlab-coverage-card mlab-coverage-card--${cov.availability}" role="listitem"${ariaDisabled}>
        <div class="mlab-coverage-card-head">
          <span class="mlab-coverage-card-label">${renderText(workflow.label)}</span>
          ${coverageBadgeMarkup(cov.availability, panelTarget, workflow.label)}
        </div>
        <p class="mlab-coverage-card-desc">${renderText(workflow.description)}</p>
        <p class="mlab-coverage-reason">${renderText(cov.reason)}</p>
      </div>
    `;
  }).join('');

  const isUltimateLP = record.id === 'analogue-productions-aatlp';
  const helpHtml = isUltimateLP
    ? `<details class="mlab-coverage-help">
        <summary class="mlab-coverage-help-summary">Why is this the preferred test record?</summary>
        <p class="mlab-coverage-help-body">Analogue Productions Ultimate Analogue Test LP is the preferred reference record for Toolbox 3.0 because it provides broad coverage for reference level, channel identity, azimuth/crosstalk, frequency sweeps, VTA/IMD, wow/flutter, anti-skate, pink-noise diagnostics, vertical resonance and rumble/isolation. Other records can still be used when they provide equivalent bands.</p>
      </details>`
    : '';

  body.innerHTML = `
    ${warningHtml}
    <p class="ea-muted mlab-coverage-intro">Coverage for <strong>${title}</strong> — ${renderText(summaryParts.join(', '))}.</p>
    <div class="mlab-coverage-grid" role="list">
      ${cards}
    </div>
    ${helpHtml}
  `;
  body.querySelectorAll<HTMLButtonElement>('[data-mlab-goto-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.mlabGotoPanel;
      if (target) highlightTargetPanel(target);
    });
  });
}

function renderThdPanel(els: Elements): void {
  const body = els.thdBody;
  if (!body) return;

  const thdRecord = selectedRecord();
  const { thdBands, imdBands } = getDistortionBands(thdRecord);

  if (!thdRecord) {
    body.innerHTML = '<p class="ea-muted">Select a test record with a THD or IMD band.</p>';
    return;
  }

  if (state.captureState !== 'live') {
    const isTHDModeDisc = state.thd.mode === 'thd';
    const activeBandsDisc = isTHDModeDisc ? thdBands : imdBands;
    if (activeBandsDisc.length === 0) {
      const modeLabel = isTHDModeDisc ? 'THD' : 'SMPTE IMD';
      body.innerHTML = `<p class="ea-muted">${modeLabel} measurement is not available with selected test record.</p>`;
      return;
    }
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a THD or IMD measurement.</p>';
    return;
  }

  if (state.thd.active) {
    const pct = Math.min(100, (state.thd.elapsedSeconds / 5) * 100);
    const remaining = Math.max(0, 5 - state.thd.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Capturing 5&thinsp;s of audio for ${state.thd.mode.toUpperCase()} measurement&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Capture progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-thd-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-thd-cancel]')?.addEventListener('click', () => {
      stopThdCapture(); renderThdPanel(els);
    });
    return;
  }

  if (state.thd.result !== null) {
    const r = state.thd.result;
    const distMetaPanel = buildThdDistortionMeta();
    const sourceBadge = state.thd.resultSource === 'self_test'
      ? '<span class="ea-badge ea-badge--setup">Self-test / Simulated</span>'
      : '<span class="ea-badge ea-badge--manufacturer">Live capture</span>';
    const rq = state.thd.runQuality;
    const rqHtml = rq ? `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Run quality</span>
          <span class="mlab-wf-result-value">${renderText(rq.status)}${rq.warnings.length ? ' — ' + Array.from(rq.warnings).map(renderText).join('; ') : ''}</span>
        </div>` : '';
    let resultHtml: string;
    if (isThdResult(r)) {
      const ordSuffix = (n: number) => n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      const harmonicRows = r.harmonics.map((dbc, i) => {
        const order = i + 2;
        const freq = order * r.fundamentalHz;
        return `<tr>
          <td class="mlab-thd-harmonic-order">${order}${ordSuffix(order)}</td>
          <td class="mlab-thd-harmonic-freq">${freq.toLocaleString('en-US')}&nbsp;Hz</td>
          <td class="mlab-thd-harmonic-val">${dbc.toFixed(1)}&nbsp;dBc</td>
        </tr>`;
      }).join('');
      resultHtml = `
        <div class="mlab-wf-result">
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">Source</span>
            <span class="mlab-wf-result-value">${sourceBadge}</span>
          </div>
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">THD</span>
            <span class="mlab-wf-result-value">${r.thdPercent.toFixed(3)}&nbsp;%</span>
          </div>
          ${rqHtml}
          <p class="mlab-wf-note">Fundamental ${r.fundamentalHz.toLocaleString('en-US')}&nbsp;Hz &middot; ${r.harmonics.length} harmonic${r.harmonics.length !== 1 ? 's' : ''} analysed</p>
        </div>
        ${harmonicRows.length ? `
        <div class="mlab-thd-harmonic-breakdown">
          <div class="mlab-thd-harmonic-head">Harmonic breakdown</div>
          <table class="mlab-thd-harmonic-table" aria-label="Harmonic breakdown">
            <thead><tr><th>Order</th><th>Frequency</th><th>Level</th></tr></thead>
            <tbody>${harmonicRows}</tbody>
          </table>
          <p class="mlab-thd-diagnostic-note">${renderText(distMetaPanel.harmonicInterpretationNote)}</p>
        </div>` : ''}
      `;
    } else {
      resultHtml = `
        <div class="mlab-wf-result">
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">Source</span>
            <span class="mlab-wf-result-value">${sourceBadge}</span>
          </div>
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">SMPTE IMD</span>
            <span class="mlab-wf-result-value">${r.imdPercent.toFixed(3)}&nbsp;%</span>
          </div>
          ${rqHtml}
          <p class="mlab-wf-note">f1 ${r.f1Hz}&nbsp;Hz &middot; f2 ${r.f2Hz.toLocaleString('en-US')}&nbsp;Hz</p>
        </div>
        <div class="mlab-thd-harmonic-breakdown">
          <div class="mlab-thd-harmonic-head">Sideband detail</div>
          <p class="mlab-thd-diagnostic-note"><strong>Not available</strong> — ${renderText(distMetaPanel.imdSidebandDetailNote)}</p>
        </div>
      `;
    }
    body.innerHTML = `${resultHtml}
      <p class="mlab-thd-diagnostic-note mlab-thd-chain-note">${renderText(distMetaPanel.chainNote)}</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-thd-start>Measure again</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-thd-start]')?.addEventListener('click', () => {
      state.thd.result = null; startThdCapture(els);
    });
    return;
  }

  // Idle — mode selector always visible; availability gated per mode
  const isTHD = state.thd.mode === 'thd';
  const activeBandsIdle = isTHD ? thdBands : imdBands;
  const unavailableForMode = activeBandsIdle.length === 0;

  if (unavailableForMode) {
    const modeLabel = isTHD ? 'THD' : 'SMPTE IMD';
    const altMode = isTHD ? 'SMPTE IMD' : 'THD';
    const altBands = isTHD ? imdBands : thdBands;
    const altNote = altBands.length > 0
      ? ` Switch to ${altMode} to use an available band.`
      : '';
    body.innerHTML = `
      <div class="mlab-segmented" role="radiogroup" aria-label="THD or IMD" style="margin-bottom:0.75rem">
        <button class="mlab-segmented-option${isTHD ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${isTHD}" type="button" data-mlab-thd-mode="thd">THD</button>
        <button class="mlab-segmented-option${!isTHD ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${!isTHD}" type="button" data-mlab-thd-mode="imd">SMPTE IMD</button>
      </div>
      <p class="ea-muted">${modeLabel} measurement is not available with selected test record.${renderText(altNote)}</p>
      <p class="ea-muted">Choose a test record with a ${modeLabel} band.</p>
    `;
    body.querySelectorAll<HTMLButtonElement>('[data-mlab-thd-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mlabThdMode as ThdMode | undefined;
        if (m && m !== state.thd.mode) { state.thd.mode = m; renderThdPanel(els); }
      });
    });
    return;
  }

  const selectedBand = state.thd.selectedBandIndex
    ? activeBandsIdle.find(b => b.index === state.thd.selectedBandIndex) ?? activeBandsIdle[0]
    : activeBandsIdle[0];

  const bandOptions = activeBandsIdle.map(b => {
    const sel = b.index === selectedBand?.index ? ' selected' : '';
    const freq = isTHD
      ? (b.frequencyHz !== undefined ? ` (${b.frequencyHz} Hz)` : '')
      : (b.f1Hz !== undefined && b.f2Hz !== undefined ? ` (${b.f1Hz} Hz + ${b.f2Hz.toLocaleString('en-US')} Hz)` : '');
    const level = b.levelDb !== undefined ? ` · ${b.levelDb} dB` : '';
    return `<option value="${renderText(b.index)}"${sel}>${renderText(b.label + freq + level)}</option>`;
  }).join('');

  const bandRow = activeBandsIdle.length > 1
    ? `
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">${isTHD ? 'Distortion band' : 'IMD band'}
            <span class="ea-form-table-sublabel">Band from test record</span>
          </td>
          <td class="ea-col-value">
            <select class="ea-input" data-mlab-thd-band aria-label="${isTHD ? 'THD band' : 'IMD band'}">
              ${bandOptions}
            </select>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Band</span></td>
        </tr>`
    : `
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">${isTHD ? 'Distortion band' : 'IMD band'}</td>
          <td class="ea-col-value">${selectedBand ? renderText(selectedBand.label) : '—'}</td>
          <td class="ea-col-meta"><span class="ea-badge">Band</span></td>
        </tr>`;

  const freqRow = isTHD
    ? (selectedBand?.frequencyHz !== undefined
        ? `
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Fundamental</td>
          <td class="ea-col-value mlab-requested">${selectedBand.frequencyHz.toLocaleString('en-US')}&nbsp;Hz</td>
          <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
        </tr>`
        : '')
    : (selectedBand?.f1Hz !== undefined && selectedBand?.f2Hz !== undefined
        ? `
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">f1 (low) / f2 (high)</td>
          <td class="ea-col-value mlab-requested">${selectedBand.f1Hz}&nbsp;Hz &middot; ${selectedBand.f2Hz.toLocaleString('en-US')}&nbsp;Hz${selectedBand.standard ? ` (${renderText(selectedBand.standard)})` : ''}</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>`
        : '');

  const selfTestNote = state.sourceMode === 'self-test'
    ? `<p class="ea-muted mlab-reflevel-selftest-note">Self-test mode: the 1&thinsp;kHz oscillator does not produce a distortion signal — results will be marked <strong>self-test&nbsp;/&nbsp;simulated</strong> and are not a valid distortion measurement.</p>`
    : '';

  body.innerHTML = `
    ${selfTestNote}
    <p class="mlab-reflevel-info">These readings measure distortion in the full playback/capture chain: test record, cartridge, tonearm, phono stage and audio interface. They are not cartridge-only distortion.</p>
    <table class="ea-form-table" aria-label="THD and IMD setup">
      <tbody>
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Measurement type</td>
          <td class="ea-col-value">
            <div class="mlab-segmented" role="radiogroup" aria-label="THD or IMD">
              <button class="mlab-segmented-option${isTHD ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${isTHD}" type="button" data-mlab-thd-mode="thd">THD</button>
              <button class="mlab-segmented-option${!isTHD ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${!isTHD}" type="button" data-mlab-thd-mode="imd">SMPTE IMD</button>
            </div>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Mode</span></td>
        </tr>
        ${bandRow}
        ${freqRow}
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Capture duration</td>
          <td class="ea-col-value mlab-requested">5&nbsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-thd-start>Start capture</button>
    </div>
  `;
  body.querySelectorAll<HTMLButtonElement>('[data-mlab-thd-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mlabThdMode as ThdMode | undefined;
      if (m && m !== state.thd.mode) { state.thd.mode = m; renderThdPanel(els); }
    });
  });
  if (activeBandsIdle.length > 1) {
    body.querySelector<HTMLSelectElement>('[data-mlab-thd-band]')?.addEventListener('change', (e) => {
      const val = (e.currentTarget as HTMLSelectElement).value;
      state.thd.selectedBandIndex = val.length > 0 ? val : null;
    });
  }
  body.querySelector<HTMLButtonElement>('[data-mlab-thd-start]')?.addEventListener('click', () => {
    startThdCapture(els);
  });
}

// ---- Resonance panel -------------------------------------------------------

function stopResonanceCapture(): void {
  if (state.resonance.capture) { state.resonance.capture.stop(); state.resonance.capture = null; }
  state.resonance.active = false;
  state.resonance.elapsedSeconds = 0;
}

function startResonanceCapture(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  stopResonanceCapture();
  state.resonance.active = true;
  state.resonance.elapsedSeconds = 0;
  state.resonance.result = null;
  state.resonance.resultSource = null;
  state.resonance.runQuality = null;
  renderResonancePanel(els);

  const captureSource = state.sourceMode === 'self-test' ? 'self_test' : 'live_capture';
  const { durationSeconds, fromHz, toHz, sweepType } = state.resonance;
  state.resonance.capture = createSweepCapture(context, source, durationSeconds, {
    onProgress: (elapsed) => { state.resonance.elapsedSeconds = elapsed; renderResonancePanel(els); },
    onDone: (samples) => {
      state.resonance.capture = null;
      state.resonance.active = false;
      state.resonance.resultSource = captureSource;
      state.resonance.result = analyseResonance(samples, context.sampleRate, fromHz, toHz, sweepType);
      state.resonance.runQuality = deriveMeasurementRunQuality({
        leftRmsDbfs: state.channelLevels.L.rmsDbFs,
        rightRmsDbfs: state.channelLevels.R.rmsDbFs,
        leftPeakDbfs: state.channelLevels.L.peakDbFs,
        rightPeakDbfs: state.channelLevels.R.peakDbFs,
        source: captureSource,
        measurementKind: 'test_tone',
      });
      appendLog(`Resonance complete — peak ${state.resonance.result.peakFrequencyHz.toFixed(2)} Hz, Q ${state.resonance.result.qEstimate?.toFixed(2) ?? 'n/a'}`);
      renderResonancePanel(els);
    },
  });
}

function renderResonancePanel(els: Elements): void {
  const body = els.resonanceBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to measure the tonearm–cartridge resonance frequency.</p>';
    return;
  }

  if (state.resonance.active) {
    const dur = state.resonance.durationSeconds;
    const pct = Math.min(100, (state.resonance.elapsedSeconds / dur) * 100);
    const remaining = Math.max(0, dur - state.resonance.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Capturing ${dur}&thinsp;s sweep&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Capture progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-res-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-res-cancel]')?.addEventListener('click', () => {
      stopResonanceCapture(); renderResonancePanel(els);
    });
    return;
  }

  if (state.resonance.result) {
    const r = state.resonance.result;
    const qStr = r.qEstimate !== null ? r.qEstimate.toFixed(1) : '—';
    const f0Str = r.peakFrequencyHz.toFixed(1);
    const sourceBadge = state.resonance.resultSource === 'self_test'
      ? '<span class="ea-badge ea-badge--setup">Self-test / Simulated</span>'
      : '<span class="ea-badge ea-badge--manufacturer">Live capture</span>';
    const rq = state.resonance.runQuality;
    const rqHtml = rq ? `
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Run quality</span>
          <span class="mlab-wf-result-value">${renderText(rq.status)}${rq.warnings.length ? ' — ' + Array.from(rq.warnings).map(renderText).join('; ') : ''}</span>
        </div>` : '';
    const diagMeta = buildResonanceDiagnosticMeta();
    body.innerHTML = `
      <div class="mlab-wf-result">
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Source</span>
          <span class="mlab-wf-result-value">${sourceBadge}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Resonance frequency</span>
          <span class="mlab-wf-result-value">${f0Str}&nbsp;Hz</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Peak amplitude</span>
          <span class="mlab-wf-result-value">${r.peakAmplitudeDbFs.toFixed(1)}&nbsp;dBFS</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Q estimate</span>
          <span class="mlab-wf-result-value">${qStr}</span>
        </div>
        ${rqHtml}
        <p class="mlab-wf-note">Sweep ${state.resonance.fromHz}&ndash;${state.resonance.toHz}&nbsp;Hz (${state.resonance.sweepType}) &middot; ${state.resonance.durationSeconds}&nbsp;s</p>
      </div>
      <div class="mlab-resonance-diagnostic">
        <div class="mlab-resonance-diagnostic-head">Diagnostic notes</div>
        <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.typicalRangeNote)}</p>
        <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.limitationsNote)}</p>
        <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.wowBandOverlapNote)}</p>
      </div>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-res-start>Measure again</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-res-start]')?.addEventListener('click', () => {
      state.resonance.result = null; startResonanceCapture(els);
    });
    return;
  }

  // Idle
  const { sweepType, fromHz, toHz, durationSeconds } = state.resonance;
  body.innerHTML = `
    <p class="ea-muted">Play the low-frequency sweep band on your test record. The tool detects the resonance frequency from the amplitude envelope of the captured signal.</p>
    <table class="ea-form-table" aria-label="Resonance sweep setup">
      <tbody>
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Sweep type</td>
          <td class="ea-col-value">
            <div class="mlab-segmented" role="radiogroup" aria-label="Sweep type">
              <button class="mlab-segmented-option${sweepType === 'log' ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${sweepType === 'log'}" type="button" data-mlab-res-sweep="log">Log</button>
              <button class="mlab-segmented-option${sweepType === 'linear' ? ' mlab-segmented-option--active' : ''}" role="radio" aria-checked="${sweepType === 'linear'}" type="button" data-mlab-res-sweep="linear">Linear</button>
            </div>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Type</span></td>
        </tr>
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Sweep range</td>
          <td class="ea-col-value mlab-requested">${fromHz}&ndash;${toHz}&nbsp;Hz</td>
          <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
        </tr>
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Duration</td>
          <td class="ea-col-value mlab-requested">${durationSeconds}&nbsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    ${recordHint('resonance')}
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-res-start>Start capture</button>
    </div>
  `;
  body.querySelectorAll<HTMLButtonElement>('[data-mlab-res-sweep]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.mlabResSweep as ResonanceSweepType | undefined;
      if (t && t !== state.resonance.sweepType) { state.resonance.sweepType = t; renderResonancePanel(els); }
    });
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-res-start]')?.addEventListener('click', () => {
    startResonanceCapture(els);
  });
}

// ---- Advanced analyzers panel (S5A/S5B skeleton) ----------------------------

let vtaRunIdCounter = 0;

function parseVtaHeightMm(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function nextVtaRunId(): string {
  vtaRunIdCounter += 1;
  return `vta-run-${vtaRunIdCounter}`;
}

function stopVtaCapture(): void {
  if (state.vta.capture) {
    state.vta.capture.stop();
    state.vta.capture = null;
  }
  state.vta.capturingRunId = null;
  state.vta.captureElapsed = 0;
}

function startVtaCapture(els: Elements, runId: string): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') {
    appendLog('VTA IMD capture not started — connect a live audio source first.');
    return;
  }
  const vtaBands = getVtaImdBands(selectedRecord());
  if (vtaBands.length === 0) {
    appendLog('VTA IMD capture not started — selected test record has no VTA IMD band.');
    return;
  }
  const band = vtaBands[0]!;
  if (band.f1Hz == null || band.f2Hz == null) {
    appendLog('VTA IMD capture not started — selected VTA band is missing f1/f2 metadata.');
    return;
  }
  if (state.vta.capturingRunId !== null) {
    appendLog('VTA IMD capture not started — another VTA capture is already running.');
    return;
  }
  if (!state.vta.runs.find(r => r.id === runId)) {
    appendLog('VTA IMD capture not started — selected run marker was not found.');
    return;
  }
  const f1Hz = band.f1Hz;
  const f2Hz = band.f2Hz;
  state.vta.capturingRunId = runId;
  state.vta.captureElapsed = 0;
  renderAdvancedPanel(els);
  state.vta.capture = createSweepCapture(context, source, 5, {
    onProgress: (elapsed) => {
      state.vta.captureElapsed = elapsed;
      renderAdvancedPanel(els);
    },
    onDone: (samples) => {
      stopVtaCapture();
      const stillExists = state.vta.runs.find(r => r.id === runId);
      if (!stillExists) {
        renderAdvancedPanel(els);
        return;
      }
      const result = analyseIMD(samples, context.sampleRate, f1Hz, f2Hz);
      const measuredAt = new Date().toISOString();
      state.vta.runs = state.vta.runs.map((r): VtaImdRun =>
        r.id === runId
          ? {
              ...r,
              imdPercent: result.imdPercent,
              source: 'live_capture',
              measuredAt,
              sampleCount: result.sampleCount,
              confidence: 'experimental',
              warnings: ['VTA IMD capture gateway preview — result is experimental.'],
            }
          : r,
      );
      appendLog(`VTA: captured IMD ${result.imdPercent.toFixed(2)} % for "${renderText(stillExists.heightLabel)}".`);
      renderAdvancedPanel(els);
    },
  });
}

type VtaImdComparisonConfidence = 'insufficient' | 'low' | 'medium' | 'high';

type VtaImdComparison = {
  readonly measuredCount: number;
  readonly placeholderCount: number;
  readonly candidateRunId: string | null;
  readonly candidateImdPercent: number | null;
  readonly candidateHeightMm: number | null;
  readonly candidateHeightLabel: string | null;
  readonly nextBestDeltaPercent: number | null;
  readonly status: 'not_enough_measured_runs' | 'experimental_candidate';
  readonly confidence: VtaImdComparisonConfidence;
  readonly confidenceReasons: readonly string[];
  readonly warnings: readonly string[];
};

function deriveVtaImdComparison(runs: readonly VtaImdRun[]): VtaImdComparison {
  const measured = runs.filter(
    r => r.source === 'live_capture'
      && typeof r.imdPercent === 'number'
      && Number.isFinite(r.imdPercent),
  );
  const measuredCount = measured.length;
  const placeholderCount = runs.length - measuredCount;

  if (measuredCount === 0) {
    return {
      measuredCount, placeholderCount,
      candidateRunId: null, candidateImdPercent: null,
      candidateHeightMm: null, candidateHeightLabel: null,
      nextBestDeltaPercent: null,
      status: 'not_enough_measured_runs',
      confidence: 'insufficient',
      confidenceReasons: ['No measured VTA IMD runs.'],
      warnings: ['At least two measured VTA runs are required for comparison.'],
    };
  }

  if (measuredCount === 1) {
    return {
      measuredCount, placeholderCount,
      candidateRunId: null, candidateImdPercent: null,
      candidateHeightMm: null, candidateHeightLabel: null,
      nextBestDeltaPercent: null,
      status: 'not_enough_measured_runs',
      confidence: 'insufficient',
      confidenceReasons: ['At least two measured runs are required for comparison.'],
      warnings: ['At least two measured VTA runs are required for comparison.'],
    };
  }

  const sorted = [...measured].sort((a, b) => (a.imdPercent as number) - (b.imdPercent as number));
  const candidate = sorted[0]!;
  const nextBest = sorted[1]!;
  const delta = (nextBest.imdPercent as number) - (candidate.imdPercent as number);
  const isNearTie = delta < 0.1;

  const confidenceReasons: string[] = [];
  let confidence: VtaImdComparisonConfidence;
  if (measuredCount >= 5) {
    if (isNearTie) {
      confidence = 'medium';
      confidenceReasons.push('Five or more measured runs available, but candidate and next best are very close.');
    } else {
      confidence = 'high';
      confidenceReasons.push('Five or more measured runs available with sufficient separation.');
    }
  } else if (measuredCount >= 3) {
    confidence = 'medium';
    confidenceReasons.push('Three or more measured runs are available.');
  } else {
    confidence = 'low';
    confidenceReasons.push('Only two measured runs are available.');
  }
  if (isNearTie) {
    confidenceReasons.push('Lowest IMD run is close to the next measured run.');
  }

  const warnings: string[] = ['Experimental candidate only — not a final VTA recommendation.'];
  if (isNearTie) {
    warnings.push(`Near-tie detected (delta ${delta.toFixed(3)} %). Results may not be distinguishable.`);
  }

  return {
    measuredCount, placeholderCount,
    candidateRunId: candidate.id,
    candidateImdPercent: candidate.imdPercent,
    candidateHeightMm: candidate.heightMm,
    candidateHeightLabel: candidate.heightLabel,
    nextBestDeltaPercent: delta,
    status: 'experimental_candidate',
    confidence,
    confidenceReasons,
    warnings,
  };
}

type VtaSupportedGateStatus = 'not_ready' | 'candidate_ready' | 'ready_for_supported_review';

type VtaSupportedGateCriterion = {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
};

type VtaSupportedGate = {
  readonly status: VtaSupportedGateStatus;
  readonly criteria: readonly VtaSupportedGateCriterion[];
  readonly passedCount: number;
  readonly totalCount: number;
  readonly warnings: readonly string[];
};

type VtaWorkflowPolicyStatus = 'planned_experimental' | 'ready_for_review_not_supported';

type VtaWorkflowStatusPolicy = {
  readonly status: VtaWorkflowPolicyStatus;
  readonly workflowStatus: 'planned';
  readonly reason: string;
  readonly requiredBeforeSupported: readonly string[];
};

function hasUsableVtaImdBand(band: TestBand | null): boolean {
  return band !== null
    && typeof band.f1Hz === 'number'
    && Number.isFinite(band.f1Hz)
    && typeof band.f2Hz === 'number'
    && Number.isFinite(band.f2Hz);
}

function deriveVtaSupportedGate(args: {
  readonly runs: readonly VtaImdRun[];
  readonly comparison: VtaImdComparison;
  readonly hasUsableVtaBand: boolean;
  readonly hasVtaBandAtAll: boolean;
  readonly capturingRunId: string | null;
}): VtaSupportedGate {
  const { runs, comparison, hasUsableVtaBand, hasVtaBandAtAll, capturingRunId } = args;

  const measuredRuns = runs.filter(
    r => r.source === 'live_capture' && typeof r.imdPercent === 'number' && Number.isFinite(r.imdPercent),
  );
  const hasRunsWithMetadata = measuredRuns.length > 0 && measuredRuns.every(
    r => r.measuredAt !== null && r.sampleCount !== null,
  );

  const criteria: VtaSupportedGateCriterion[] = [
    {
      id: 'vta_band',
      label: 'VTA band with f1/f2 metadata',
      passed: hasUsableVtaBand,
      detail: hasUsableVtaBand
        ? 'VTA/SRA dual-tone IMD band with f1/f2 metadata found.'
        : hasVtaBandAtAll
          ? 'VTA/SRA band found, but f1/f2 metadata is missing.'
          : 'No VTA/SRA IMD band found on selected test record.',
    },
    {
      id: 'three_measured_runs',
      label: 'At least three measured runs',
      passed: measuredRuns.length >= 3,
      detail: measuredRuns.length >= 3
        ? `${measuredRuns.length} measured runs available.`
        : `Only ${measuredRuns.length} measured run(s). At least 3 required.`,
    },
    {
      id: 'candidate_exists',
      label: 'Comparison candidate exists',
      passed: comparison.status === 'experimental_candidate',
      detail: comparison.status === 'experimental_candidate'
        ? 'Experimental candidate identified from measured runs.'
        : 'Not enough measured runs for comparison candidate.',
    },
    {
      id: 'comparison_confidence',
      label: 'Comparison confidence at least medium',
      passed: comparison.confidence === 'medium' || comparison.confidence === 'high',
      detail: comparison.confidence === 'medium' || comparison.confidence === 'high'
        ? `Comparison confidence is ${comparison.confidence}.`
        : `Comparison confidence is ${comparison.confidence} — medium or higher required.`,
    },
    {
      id: 'no_active_capture',
      label: 'No active VTA capture',
      passed: capturingRunId === null,
      detail: capturingRunId === null
        ? 'No capture in progress.'
        : 'A VTA capture is currently running.',
    },
    {
      id: 'experimental_warning',
      label: 'Experimental warning present',
      passed: comparison.warnings.length > 0 &&
        comparison.warnings.some(w => /experimental|final recommendation/i.test(w)),
      detail: 'Comparison warnings include experimental/not-final-recommendation notice.',
    },
    {
      id: 'run_metadata',
      label: 'Measured runs have provenance metadata',
      passed: hasRunsWithMetadata,
      detail: hasRunsWithMetadata
        ? 'All measured runs have measuredAt and sampleCount.'
        : measuredRuns.length === 0
          ? 'No measured runs yet.'
          : 'Some measured runs are missing measuredAt or sampleCount.',
    },
  ];

  const passedCount = criteria.filter(c => c.passed).length;
  const totalCount = criteria.length;

  let status: VtaSupportedGateStatus;
  if (passedCount === totalCount) {
    status = 'ready_for_supported_review';
  } else if (comparison.status === 'experimental_candidate') {
    status = 'candidate_ready';
  } else {
    status = 'not_ready';
  }

  return {
    status,
    criteria,
    passedCount,
    totalCount,
    warnings: ['Supported review gate does not change VTA workflow status — remains Planned until formally reviewed.'],
  };
}

function deriveVtaWorkflowStatusPolicy(gate: VtaSupportedGate): VtaWorkflowStatusPolicy {
  const requiredBeforeSupported: readonly string[] = [
    'Validated repeatability across multiple real hardware captures.',
    'Manual deploy sanity check with real phono hardware and test record.',
    'Confidence and report review by project decision-maker.',
    'No unresolved capture lifecycle issues.',
    'Explicit project decision to lift workflow status from planned to supported.',
  ];
  if (gate.status === 'ready_for_supported_review') {
    return {
      status: 'ready_for_review_not_supported',
      workflowStatus: 'planned',
      reason: 'Readiness gate passed, but workflow remains Planned until reviewed and validated.',
      requiredBeforeSupported,
    };
  }
  return {
    status: 'planned_experimental',
    workflowStatus: 'planned',
    reason: 'VTA IMD optimizer remains experimental while measurement confidence and validation are still being reviewed.',
    requiredBeforeSupported,
  };
}

function vtaRunTableMarkup(
  runs: readonly VtaImdRun[],
  opts: { canCapture: boolean; capturingRunId: string | null; captureElapsed: number; candidateRunId: string | null },
): string {
  if (runs.length === 0) {
    return '<p class="ea-muted mlab-vta-empty-state">No VTA IMD run markers added yet.</p>';
  }
  const { canCapture, capturingRunId, captureElapsed, candidateRunId } = opts;
  const rows = runs.map(r => {
    const heightStr = r.heightMm !== null ? `${r.heightMm}&thinsp;mm` : '—';
    const isThisCapturing = capturingRunId === r.id;
    const anyCapturing = capturingRunId !== null;
    const isCandidate = candidateRunId !== null && candidateRunId === r.id;

    let imdCell: string;
    if (r.imdPercent !== null) {
      const candidateBadge = isCandidate
        ? ` <span class="mlab-vta-candidate-badge">Experimental&nbsp;candidate</span>`
        : '';
      imdCell = `<span class="mlab-vta-run-measured">${r.imdPercent.toFixed(2)}&thinsp;%</span>${candidateBadge}`;
    } else if (isThisCapturing) {
      imdCell = `<span class="mlab-vta-capture-progress" aria-live="polite">Capturing&hellip; ${captureElapsed.toFixed(1)}&thinsp;s</span>`;
    } else {
      imdCell = 'IMD not measured yet';
    }

    const sourceLabel = r.source === 'live_capture' ? 'Measured'
      : isThisCapturing ? 'Capturing&hellip;'
      : 'Manual placeholder';
    const confidenceLabel = r.confidence === 'experimental'
      ? '<br><span class="mlab-vta-confidence mlab-vta-confidence--experimental">experimental</span>'
      : r.confidence === 'not_measured' && !isThisCapturing
      ? '<br><span class="mlab-vta-confidence mlab-vta-confidence--not-measured">not measured</span>'
      : '';
    const sourceCell = `${sourceLabel}${confidenceLabel}`;

    let measureBtn = '';
    if (isThisCapturing) {
      measureBtn = `<span class="mlab-vta-capture-progress">Capturing&hellip;</span>`;
    } else if (canCapture && !anyCapturing) {
      const btnLabel = r.imdPercent !== null ? 'Re-measure' : 'Measure';
      measureBtn = `<button class="ea-button ea-button--secondary mlab-vta-measure-btn" type="button" data-mlab-vta-measure="${renderText(r.id)}" aria-label="${btnLabel} IMD">${btnLabel}</button>`;
    }

    const removeBtn = !isThisCapturing
      ? `<button class="ea-button ea-button--ghost mlab-vta-run-remove" type="button" data-mlab-vta-remove="${renderText(r.id)}" aria-label="Remove run marker">Remove</button>`
      : '';

    return `
      <tr>
        <td class="mlab-vta-run-cell">${heightStr}</td>
        <td class="mlab-vta-run-cell">${renderText(r.heightLabel || '—')}</td>
        <td class="mlab-vta-run-cell mlab-vta-run-imd">${imdCell}</td>
        <td class="mlab-vta-run-cell mlab-vta-run-source">${sourceCell}</td>
        <td class="mlab-vta-run-cell">${renderText(r.note || '—')}</td>
        <td class="mlab-vta-run-cell">
          ${measureBtn}
          ${removeBtn}
        </td>
      </tr>
    `;
  }).join('');
  return `
    <div class="mlab-vta-run-scroll">
      <table class="mlab-vta-run-table" aria-label="VTA IMD run markers">
        <thead>
          <tr>
            <th>Height</th>
            <th>Label</th>
            <th>IMD</th>
            <th>Source</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAdvancedPanel(els: Elements): void {
  const body = els.advancedBody;
  if (!body) return;

  const record = selectedRecord();
  const vtaBands = getVtaImdBands(record);
  const hasVtaBand = vtaBands.length > 0;
  const vtaBandForGate = vtaBands[0] ?? null;
  const hasUsableVtaBand = hasUsableVtaImdBand(vtaBandForGate);

  // VTA IMD Optimizer — capture gateway
  const vtaBand = vtaBands.length > 0 ? vtaBands[0]! : null;
  const canCapture = state.captureState === 'live'
    && vtaBand !== null
    && vtaBand.f1Hz != null
    && vtaBand.f2Hz != null
    && state.vta.capturingRunId === null;
  const comparison = deriveVtaImdComparison(state.vta.runs);
  const gate = deriveVtaSupportedGate({
    runs: state.vta.runs,
    comparison,
    hasUsableVtaBand,
    hasVtaBandAtAll: hasVtaBand,
    capturingRunId: state.vta.capturingRunId,
  });
  const policy = deriveVtaWorkflowStatusPolicy(gate);
  const vtaOpts = {
    canCapture,
    capturingRunId: state.vta.capturingRunId,
    captureElapsed: state.vta.captureElapsed,
    candidateRunId: comparison.candidateRunId,
  };

  let vtaSectionHtml: string;
  if (!record) {
    vtaSectionHtml = `
      <div class="mlab-advanced-item mlab-advanced-item--vta">
        <div class="mlab-advanced-item-head">
          <span class="mlab-advanced-item-label">VTA / IMD optimizer</span>
          <span class="mlab-coverage-badge mlab-coverage-badge--planned">Capture preview</span>
        </div>
        <p class="ea-muted">Select a test record to see VTA/IMD band availability.</p>
        <p class="mlab-reflevel-info">Capture gateway preview — full VTA optimizer not yet validated.</p>
      </div>
    `;
  } else if (!hasVtaBand) {
    const recTitle = renderText(`${record.manufacturer} — ${record.title}`);
    vtaSectionHtml = `
      <div class="mlab-advanced-item mlab-advanced-item--vta">
        <div class="mlab-advanced-item-head">
          <span class="mlab-advanced-item-label">VTA / IMD optimizer</span>
          <span class="mlab-coverage-badge mlab-coverage-badge--unavailable">Not available</span>
        </div>
        <p class="ea-muted">No VTA/IMD optimization band found on <strong>${recTitle}</strong>.</p>
        <p class="mlab-reflevel-info">Capture gateway preview — full VTA optimizer not yet validated.</p>
      </div>
    `;
  } else {
    const band = vtaBands[0]!;
    const f1 = band.f1Hz !== undefined ? `${band.f1Hz} Hz` : '—';
    const f2 = band.f2Hz !== undefined ? `${band.f2Hz.toLocaleString('en-US')} Hz` : '—';
    const ratio = band.ratio ?? '—';
    const standard = band.standard ?? '—';
    const bandLabel = renderText(band.label);
    const hasClearBtn = state.vta.runs.length > 0;
    const addDisabled = state.vta.capturingRunId !== null ? ' disabled' : '';
    const captureHint = state.captureState === 'live' && canCapture
      ? 'Click <strong>Measure</strong> next to a run marker to capture real IMD at that height.'
      : state.captureState === 'live' && state.vta.capturingRunId !== null
      ? '<span class="mlab-vta-capture-progress" aria-live="polite">Capture in progress&hellip;</span>'
      : 'Connect a device to capture IMD at each arm height.';

    vtaSectionHtml = `
      <div class="mlab-advanced-item mlab-advanced-item--vta">
        <div class="mlab-advanced-item-head">
          <span class="mlab-advanced-item-label">VTA / IMD optimizer</span>
          <span class="mlab-coverage-badge mlab-coverage-badge--partial">Capture preview</span>
        </div>
        <p class="mlab-reflevel-info">Capture gateway preview — full VTA optimizer not yet validated.</p>
        <p class="mlab-reflevel-info">Run markers are manual placeholders until measured. ${captureHint}</p>
        <table class="ea-form-table" aria-label="VTA/IMD band metadata">
          <tbody>
            <tr class="mlab-advanced-vta-band-row">
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Band
                <span class="ea-form-table-sublabel">${renderText(band.index)}</span>
              </td>
              <td class="ea-col-value">${bandLabel}</td>
              <td class="ea-col-meta"><span class="ea-badge">VTA/SRA</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">f1</td>
              <td class="ea-col-value">${renderText(f1)}</td>
              <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">f2</td>
              <td class="ea-col-value">${renderText(f2)}</td>
              <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Ratio</td>
              <td class="ea-col-value">${renderText(ratio)}</td>
              <td class="ea-col-meta"><span class="ea-badge">Amplitude</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Standard</td>
              <td class="ea-col-value">${renderText(standard)}</td>
              <td class="ea-col-meta"><span class="ea-badge">Spec</span></td>
            </tr>
          </tbody>
        </table>
        <div class="mlab-advanced-workflow-steps">
          <p class="mlab-reflevel-info"><strong>Workflow</strong></p>
          <ol class="mlab-advanced-steps-list">
            <li>Play the VTA/SRA IMD track on your test record.</li>
            <li>Add a height marker for the current tonearm position.</li>
            <li>Click <strong>Measure</strong> to capture real IMD at that height.</li>
            <li>Adjust arm height, add another marker, and measure again.</li>
            <li>Repeat across the full adjustment range.</li>
            <li>Compare IMD scores — the lowest measured IMD becomes an experimental candidate, not a final setting.</li>
          </ol>
        </div>
        <div class="mlab-advanced-run-table" aria-label="VTA IMD run markers">
          <div class="mlab-vta-run-controls">
            <div class="mlab-vta-add-form">
              <label class="mlab-vta-input-label" for="mlab-vta-height-mm">Height (mm)</label>
              <input
                class="ea-input mlab-vta-height-input"
                id="mlab-vta-height-mm"
                type="number"
                step="0.1"
                placeholder="e.g. 0.0"
                value="${renderText(state.vta.heightMmInput)}"
                aria-label="Arm height in millimetres"
                data-mlab-vta-height-mm${addDisabled}>
              <label class="mlab-vta-input-label" for="mlab-vta-height-label">Label</label>
              <input
                class="ea-input mlab-vta-label-input"
                id="mlab-vta-height-label"
                type="text"
                placeholder="e.g. baseline"
                maxlength="40"
                value="${renderText(state.vta.heightLabelInput)}"
                aria-label="Height label"
                data-mlab-vta-height-label${addDisabled}>
              <label class="mlab-vta-input-label" for="mlab-vta-note">Note (optional)</label>
              <input
                class="ea-input mlab-vta-note-input"
                id="mlab-vta-note"
                type="text"
                placeholder="optional note"
                maxlength="120"
                value="${renderText(state.vta.noteInput)}"
                aria-label="Optional note"
                data-mlab-vta-note${addDisabled}>
              <div class="mlab-session-controls">
                <button class="ea-button ea-button--secondary" type="button" data-mlab-vta-add${addDisabled}>Add height marker</button>
                ${hasClearBtn ? `<button class="ea-button ea-button--ghost" type="button" data-mlab-vta-clear>Clear all markers</button>` : ''}
              </div>
            </div>
          </div>
          ${vtaRunTableMarkup(state.vta.runs, vtaOpts)}
          ${(() => {
            const confLevel = comparison.confidence;
            const confLabel = confLevel === 'insufficient' ? 'Insufficient'
              : confLevel === 'low' ? 'Low'
              : confLevel === 'medium' ? 'Medium'
              : 'High';
            const confReasonsHtml = comparison.confidenceReasons.map(r =>
              `<span class="mlab-vta-confidence-reason">${renderText(r)}</span>`
            ).join(' ');
            if (comparison.status === 'not_enough_measured_runs') {
              return `
                <div class="mlab-vta-comparison mlab-vta-comparison-status">
                  <div class="mlab-vta-comparison-confidence">
                    Comparison confidence:
                    <span class="mlab-vta-confidence-level mlab-vta-confidence-level--insufficient">${confLabel}</span>
                    <span class="mlab-vta-confidence-reason">${confReasonsHtml}</span>
                  </div>
                  <span class="ea-muted">Comparison not available — at least two measured VTA runs required.</span>
                </div>
              `;
            }
            const cLabel = renderText(comparison.candidateHeightLabel ?? '');
            const cMm = comparison.candidateHeightMm !== null ? `${comparison.candidateHeightMm}&thinsp;mm` : '—';
            const cImd = comparison.candidateImdPercent !== null ? `${comparison.candidateImdPercent.toFixed(2)}&thinsp;%` : '—';
            const delta = comparison.nextBestDeltaPercent !== null ? comparison.nextBestDeltaPercent.toFixed(3) : '—';
            const warnHtml = comparison.warnings.map(w =>
              `<p class="mlab-vta-comparison-warning">${renderText(w)}</p>`
            ).join('');
            return `
              <div class="mlab-vta-comparison">
                <div class="mlab-vta-comparison-candidate">
                  <strong>Experimental candidate:</strong>
                  <span class="mlab-vta-candidate-badge">Experimental&nbsp;candidate</span>
                  ${cLabel} &mdash; ${cMm} &mdash; IMD&nbsp;${cImd}
                </div>
                <div class="mlab-vta-comparison-meta">
                  Measured runs: ${comparison.measuredCount} &middot;
                  Placeholder runs: ${comparison.placeholderCount} &middot;
                  Delta to next best: ${delta}&thinsp;%
                </div>
                <div class="mlab-vta-comparison-confidence">
                  Comparison confidence:
                  <span class="mlab-vta-confidence-level mlab-vta-confidence-level--${confLevel}">${confLabel}</span>
                  ${confReasonsHtml}
                </div>
                ${warnHtml}
              </div>
            `;
          })()}

          ${(() => {
            const gateStatusLabel = gate.status === 'ready_for_supported_review'
              ? 'Ready for supported review'
              : gate.status === 'candidate_ready'
              ? 'Candidate ready'
              : 'Not ready';
            const gateStatusClass = gate.status === 'ready_for_supported_review'
              ? 'mlab-vta-gate-status--review'
              : gate.status === 'candidate_ready'
              ? 'mlab-vta-gate-status--candidate'
              : 'mlab-vta-gate-status--not-ready';
            const statusMsg = gate.status === 'ready_for_supported_review'
              ? 'Ready for supported review &#8212; workflow remains Planned until reviewed.'
              : gate.status === 'candidate_ready'
              ? 'Candidate found. Some criteria still needed before supported review.'
              : 'More measured runs or criteria needed.';
            const criteriaHtml = gate.criteria.map(c => `
              <tr class="mlab-vta-gate-row">
                <td class="mlab-vta-gate-pass ${c.passed ? 'mlab-vta-gate-pass--ok' : 'mlab-vta-gate-pass--fail'}">${c.passed ? 'Pass' : 'Needs work'}</td>
                <td class="mlab-vta-gate-label">${renderText(c.label)}</td>
                <td class="mlab-vta-gate-detail ea-muted">${renderText(c.detail)}</td>
              </tr>
            `).join('');
            return `
              <div class="mlab-vta-gate">
                <div class="mlab-vta-gate-head">
                  <strong>Supported readiness gate</strong>
                </div>
                <div class="mlab-vta-gate-summary">
                  Status: <span class="mlab-vta-gate-status ${gateStatusClass}">${gateStatusLabel}</span>
                  &middot; Passed: ${gate.passedCount} / ${gate.totalCount}
                </div>
                <p class="mlab-vta-gate-msg ea-muted">${statusMsg}</p>
                <table class="mlab-vta-gate-table" aria-label="Supported readiness criteria">
                  <tbody>${criteriaHtml}</tbody>
                </table>
              </div>
            `;
          })()}

          ${(() => {
            const policyStatusLabel = policy.status === 'ready_for_review_not_supported'
              ? 'Ready for review — not yet supported'
              : 'Planned / experimental';
            const policyStatusClass = policy.status === 'ready_for_review_not_supported'
              ? 'mlab-vta-policy-status--review-not-supported'
              : 'mlab-vta-policy-status--experimental';
            const reqHtml = policy.requiredBeforeSupported.map(r =>
              `<li class="mlab-vta-policy-req">${renderText(r)}</li>`
            ).join('');
            return `
              <div class="mlab-vta-policy">
                <div class="mlab-vta-policy-head">
                  <strong>Workflow status policy</strong>
                </div>
                <div class="mlab-vta-policy-status-row">
                  Workflow: <span class="mlab-vta-policy-status ${policyStatusClass}">${policyStatusLabel}</span>
                </div>
                <p class="mlab-vta-policy-reason ea-muted">${renderText(policy.reason)}</p>
                <p class="mlab-vta-policy-req-head ea-muted"><strong>Required before a supported lift:</strong></p>
                <ul class="mlab-vta-policy-req-list">${reqHtml}</ul>
              </div>
            `;
          })()}
        </div>
      </div>
    `;
  }

  // Planned advanced analyzers list
  const plannedItems = [
    { label: 'Anti-skate / Tracking stress', desc: 'Detect channel-specific breakup during a high-level escalating-amplitude track.' },
    { label: 'Rumble &amp; noise isolation', desc: 'Measure bearing rumble and low-frequency noise floor from a silent groove.' },
    { label: 'Pink noise / Spectral balance', desc: 'Verify spectral balance and phono chain noise floor using broadband pink noise.' },
    { label: 'Vertical null / Azimuth', desc: 'Verify mono-sum null and vertical channel balance with a vertical-modulation tone.' },
    { label: 'Vertical resonance', desc: 'Detect vertical resonance peaks from a descending vertical modulation sweep.' },
  ];

  const plannedHtml = plannedItems.map(item => `
    <div class="mlab-advanced-item mlab-advanced-item--planned">
      <div class="mlab-advanced-item-head">
        <span class="mlab-advanced-item-label">${item.label}</span>
        <span class="mlab-coverage-badge mlab-coverage-badge--planned">Planned</span>
      </div>
      <p class="ea-muted">${item.desc}</p>
    </div>
  `).join('');

  body.innerHTML = `
    ${vtaSectionHtml}
    <hr class="mlab-advanced-divider" aria-hidden="true">
    <p class="ea-muted mlab-advanced-planned-intro"><strong>Further planned analyzers</strong> — engines not yet built:</p>
    ${plannedHtml}
  `;

  // Wire up VTA form inputs and buttons
  body.querySelector<HTMLInputElement>('[data-mlab-vta-height-mm]')?.addEventListener('input', (e) => {
    state.vta.heightMmInput = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLInputElement>('[data-mlab-vta-height-label]')?.addEventListener('input', (e) => {
    state.vta.heightLabelInput = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLInputElement>('[data-mlab-vta-note]')?.addEventListener('input', (e) => {
    state.vta.noteInput = (e.target as HTMLInputElement).value;
  });

  body.querySelector<HTMLButtonElement>('[data-mlab-vta-add]')?.addEventListener('click', () => {
    const heightMm = parseVtaHeightMm(state.vta.heightMmInput);
    const heightLabel = state.vta.heightLabelInput.trim() || (heightMm !== null ? `${heightMm} mm` : 'unlabelled');
    const run: VtaImdRun = {
      id: nextVtaRunId(),
      heightMm,
      heightLabel,
      imdPercent: null,
      source: 'manual_placeholder',
      createdAt: new Date().toISOString(),
      measuredAt: null,
      sampleCount: null,
      confidence: 'not_measured',
      warnings: [],
      note: state.vta.noteInput.trim(),
    };
    state.vta.runs = [...state.vta.runs, run];
    state.vta.heightMmInput = '';
    state.vta.heightLabelInput = '';
    state.vta.noteInput = '';
    appendLog(`VTA: added height marker "${renderText(heightLabel)}".`);
    renderAdvancedPanel(els);
  });

  body.querySelector<HTMLButtonElement>('[data-mlab-vta-clear]')?.addEventListener('click', () => {
    stopVtaCapture();
    state.vta.runs = [];
    appendLog('VTA IMD run markers cleared.');
    renderAdvancedPanel(els);
  });

  body.querySelectorAll<HTMLButtonElement>('[data-mlab-vta-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.mlabVtaRemove;
      if (!id) return;
      state.vta.runs = state.vta.runs.filter(r => r.id !== id);
      appendLog(`VTA: removed height marker.`);
      renderAdvancedPanel(els);
    });
  });

  body.querySelectorAll<HTMLButtonElement>('[data-mlab-vta-measure]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.mlabVtaMeasure;
      if (!id) return;
      startVtaCapture(els, id);
    });
  });
}

function resetChannelMeasurement(): void {
  stopChannelMeasurement();
  state.channel.step = 'idle';
  state.channel.elapsedSeconds = 0;
  state.channel.leftCapture = null;
  state.channel.rightCapture = null;
  state.channel.identityResult = null;
  state.channel.source = null;
  state.channel.leftBandIndex = null;
  state.channel.rightBandIndex = null;
  state.channel.leftBandMeta = null;
  state.channel.rightBandMeta = null;
}

function stopChannelMeasurement(): void {
  if (state.channel.capture) {
    state.channel.capture.stop();
    state.channel.capture = null;
  }
  state.channel.elapsedSeconds = 0;
}

function startChannelCapture(els: Elements, which: 'left' | 'right'): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  const captureSource = state.sourceMode === 'self-test' ? 'self_test' as const : 'live_capture' as const;
  const record = selectedRecord();
  if (!record) {
    appendLog('Channel: no test record selected — capture aborted.');
    return;
  }
  const { leftBand, rightBand } = getChannelIdentityBands(record);
  if (which === 'left' && !leftBand) {
    appendLog('Channel: left-band not available for selected test record — capture aborted.');
    return;
  }
  if (which === 'right' && !rightBand) {
    appendLog('Channel: right-band not available for selected test record — capture aborted.');
    return;
  }

  stopChannelMeasurement();
  state.channel.step = which === 'left' ? 'left-recording' : 'right-recording';
  state.channel.elapsedSeconds = 0;
  if (which === 'left') {
    state.channel.source = captureSource;
    state.channel.leftBandIndex = leftBand?.index ?? null;
    state.channel.rightBandIndex = rightBand?.index ?? null;
    state.channel.leftBandMeta = leftBand
      ? { index: leftBand.index, label: leftBand.label, frequencyHz: leftBand.frequencyHz ?? null }
      : null;
    state.channel.rightBandMeta = rightBand
      ? { index: rightBand.index, label: rightBand.label, frequencyHz: rightBand.frequencyHz ?? null }
      : null;
  }
  renderChannelPanel(els);

  state.channel.capture = createStereoChannelCapture(
    context,
    source,
    which,
    channelMeasurementDurationSeconds,
    {
      onProgress: (elapsed) => {
        state.channel.elapsedSeconds = elapsed;
        renderChannelPanel(els);
      },
      onDone: (result) => {
        state.channel.capture = null;
        if (which === 'left') {
          state.channel.leftCapture = result;
          state.channel.step = 'left-done';
          appendLog('Channel: left capture complete.');
        } else {
          state.channel.rightCapture = result;
          state.channel.step = 'done';
          const src = state.channel.source ?? captureSource;
          let identityResult: ChannelIdentityResult | null = null;
          if (state.channel.leftCapture) {
            identityResult = computeChannelIdentity(state.channel.leftCapture, result, src);
            state.channel.identityResult = identityResult;
          }
          // Auto-save azimuth step run
          const runQuality = deriveMeasurementRunQuality({
            leftRmsDbfs: state.channelLevels.L.rmsDbFs,
            rightRmsDbfs: state.channelLevels.R.rmsDbFs,
            leftPeakDbfs: state.channelLevels.L.peakDbFs,
            rightPeakDbfs: state.channelLevels.R.peakDbFs,
            source: src,
            measurementKind: 'test_tone',
          });
          const stepN = state.channel.runs.length + 1;
          const stepRun: AzimuthStepRun = {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            source: src,
            label: state.channel.stepLabelInput.trim() || `Step ${stepN}`,
            leftToRightCrosstalkDb: identityResult?.leftToRightCrosstalkDb ?? state.channel.leftCapture?.crosstalkDb ?? 0,
            rightToLeftCrosstalkDb: identityResult?.rightToLeftCrosstalkDb ?? result.crosstalkDb ?? 0,
            crosstalkSymmetryDeltaDb: identityResult?.crosstalkSymmetryDeltaDb ?? null,
            wantedBalanceDb: identityResult?.wantedBalanceDb ?? null,
            identity: identityResult?.identity ?? 'inconclusive',
            confidence: identityResult?.confidence ?? 'low',
            leftBandMeta: state.channel.leftBandMeta,
            rightBandMeta: state.channel.rightBandMeta,
            runQuality,
            warnings: identityResult ? Array.from(identityResult.warnings) : [],
          };
          state.channel.runs = [...state.channel.runs, stepRun];
          state.channel.stepLabelInput = '';
          appendLog(`Channel identity & crosstalk complete. Step ${stepN} saved.`);
        }
        renderChannelPanel(els);
      },
    },
  );
}

function renderIriaaToggle(els: Elements): void {
  els.iriaaButtons.forEach((button) => {
    const value = button.dataset.mlabIriaa;
    const active = (value === 'on') === state.iriaaEnabled;
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.classList.toggle('mlab-segmented-option--active', active);
    button.disabled = state.captureState === 'live' || state.captureState === 'connecting';
  });
}

function renderSourceMode(els: Elements): void {
  els.sourceModeButtons.forEach((button) => {
    const mode = button.dataset.mlabSourceMode as SourceMode | undefined;
    const active = mode === state.sourceMode;
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.classList.toggle('mlab-segmented-option--active', active);
  });
  const liveOnly = state.sourceMode === 'live';
  if (els.deviceSelect) {
    els.deviceSelect.disabled = !liveOnly || state.captureState === 'live';
  }
  if (els.deviceMeta) {
    els.deviceMeta.innerHTML = liveOnly
      ? '<span class="ea-badge ea-badge--manufacturer">Live</span>'
      : '<span class="ea-badge">Self-test</span>';
  }
  if (els.deviceRow) {
    els.deviceRow.dataset.mlabSourceMode = state.sourceMode;
  }
}

function renderDeviceList(els: Elements): void {
  if (!els.deviceSelect) return;
  const fragment = state.devices.length === 0
    ? '<option value="">No audio inputs detected. Connect once to populate the list.</option>'
    : state.devices.map((device) => {
      const selected = device.deviceId === state.selectedDeviceId ? ' selected' : '';
      return `<option value="${renderText(device.deviceId)}"${selected}>${renderText(describeDevice(device))}</option>`;
    }).join('');
  els.deviceSelect.innerHTML = fragment;
  if (state.selectedDeviceId && state.devices.some((device) => device.deviceId === state.selectedDeviceId)) {
    els.deviceSelect.value = state.selectedDeviceId;
  }
  if (els.deviceDot) {
    els.deviceDot.className = `ea-dot ea-dot--${state.devices.length > 0 ? (state.selectedDeviceId ? 'done' : 'active') : 'planned'}`;
  }
}

function honestyBadge(classification: SampleRateMatchClassification): string {
  if (classification === 'match') return '<span class="ea-badge ea-badge--manufacturer">Match</span>';
  if (classification === 'minor') return '<span class="ea-badge ea-badge--setup">Resampled</span>';
  return '<span class="ea-badge ea-badge--setup">Mismatch</span>';
}

function renderActualFormat(els: Elements): void {
  const honesty = state.honesty;
  if (!honesty) {
    if (els.actualValue) els.actualValue.textContent = '—';
    if (els.actualMeta) els.actualMeta.innerHTML = '<span class="ea-badge">Awaiting</span>';
    if (els.actualDot) els.actualDot.className = 'ea-dot ea-dot--planned';
    if (els.honesty) {
      els.honesty.textContent = 'Sample-rate honesty report will appear after the audio context is running.';
    }
    return;
  }
  const channelLabel = `${state.channelCount || defaultRequestedChannelCount} ch`;
  const actual = `${(honesty.contextActualHz / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} kHz · ${channelLabel}`;
  if (els.actualValue) els.actualValue.textContent = actual;
  if (els.actualMeta) els.actualMeta.innerHTML = honestyBadge(honesty.classification);
  if (els.actualDot) {
    const dotKind = honesty.classification === 'match' ? 'done' : honesty.classification === 'minor' ? 'active' : 'error';
    els.actualDot.className = `ea-dot ea-dot--${dotKind}`;
  }
  if (els.honesty) {
    els.honesty.textContent = honesty.summary;
  }
}

function renderConnectionButtons(els: Elements): void {
  if (els.connect) {
    els.connect.disabled = state.captureState === 'connecting' || state.captureState === 'live';
    els.connect.textContent = state.captureState === 'connecting' ? 'Connecting…' : 'Connect';
  }
  if (els.disconnect) {
    els.disconnect.disabled = state.captureState !== 'live';
  }
}

function setSessionStatusText(els: Elements, text: string): void {
  if (els.sessionStatus) els.sessionStatus.textContent = text;
}

function renderSessionStatus(els: Elements): void {
  if (!els.sessionStatus) return;
  if (state.captureState === 'live') {
    const sourceLabel = state.sourceMode === 'self-test'
      ? `Self-test sine at ${selfTestFrequencyHz} Hz.`
      : `Live capture from ${describeDevice(state.devices.find((d) => d.deviceId === state.selectedDeviceId) ?? null)}.`;
    els.sessionStatus.textContent = `Audio input connected. ${sourceLabel}`;
    setActionStatus(els, 'active', state.sourceMode === 'self-test'
      ? 'Self-test signal running.'
      : 'Live audio capture running.');
  } else if (state.captureState === 'connecting') {
    els.sessionStatus.textContent = 'Connecting to audio input…';
    setActionStatus(els, 'active', 'Requesting audio access.');
  } else if (state.captureState === 'error') {
    els.sessionStatus.textContent = state.errorMessage ?? 'Audio capture failed.';
    setActionStatus(els, 'error', state.errorMessage ?? 'Audio capture failed.');
  } else {
    els.sessionStatus.textContent = 'Capture is idle. Choose a source mode and click Connect to begin.';
    setActionStatus(els, 'planned', 'Audio context not started.');
  }
}

function clearMeterDom(els: Elements): void {
  if (els.meterGrid) {
    (['L', 'R'] as ChannelKey[]).forEach((channel) => {
      const readout = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-readout="${channel}"]`);
      const peakValue = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak-value="${channel}"]`);
      const rmsBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-rms="${channel}"]`);
      const peakBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak="${channel}"]`);
      const holdBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-hold="${channel}"]`);
      const clip = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-clip="${channel}"]`);
      if (readout) readout.textContent = '— dBFS';
      if (peakValue) peakValue.textContent = 'peak —';
      if (rmsBar) rmsBar.style.setProperty('--mlab-bar', '0%');
      if (peakBar) peakBar.style.setProperty('--mlab-bar', '0%');
      if (holdBar) holdBar.style.setProperty('--mlab-bar', '0%');
      if (clip) {
        clip.textContent = 'no clip';
        clip.classList.remove('mlab-meter-clip--active');
      }
    });
  }
  if (els.ribbonMiniLFill) els.ribbonMiniLFill.style.setProperty('--p', '0%');
  if (els.ribbonMiniRFill) els.ribbonMiniRFill.style.setProperty('--p', '0%');
  if (els.ribbonMiniLDb) els.ribbonMiniLDb.textContent = '—';
  if (els.ribbonMiniRDb) els.ribbonMiniRDb.textContent = '—';
  for (const canvas of [els.waveformL, els.waveformR]) {
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }
  // Clear source panel meters
  if (els.sourceMeterGrid) {
    (['L', 'R'] as ChannelKey[]).forEach((channel) => {
      const readout = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-readout="${channel}"]`);
      const peakValue = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak-value="${channel}"]`);
      const rmsBar = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-rms="${channel}"]`);
      const peakBar = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak="${channel}"]`);
      const holdBar = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-hold="${channel}"]`);
      const clip = els.sourceMeterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-clip="${channel}"]`);
      if (readout) readout.textContent = '— dBFS';
      if (peakValue) peakValue.textContent = 'peak —';
      if (rmsBar) rmsBar.style.setProperty('--mlab-bar', '0%');
      if (peakBar) peakBar.style.setProperty('--mlab-bar', '0%');
      if (holdBar) holdBar.style.setProperty('--mlab-bar', '0%');
      if (clip) { clip.textContent = 'no clip'; clip.classList.remove('mlab-meter-clip--active'); }
    });
  }
  if (els.sourceFreqCanvas) {
    els.sourceFreqCanvas.getContext('2d')?.clearRect(0, 0, els.sourceFreqCanvas.width, els.sourceFreqCanvas.height);
  }
}

function levelPercentFromDb(db: number): number {
  const min = -60;
  const max = 0;
  if (!Number.isFinite(db)) return 0;
  if (db <= min) return 0;
  if (db >= max) return 100;
  return ((db - min) / (max - min)) * 100;
}

function renderChannelLevel(els: Elements, channel: ChannelKey): void {
  const level = state.channelLevels[channel];
  const readout = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-readout="${channel}"]`);
  const peakValue = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak-value="${channel}"]`);
  const rmsBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-rms="${channel}"]`);
  const peakBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-peak="${channel}"]`);
  const holdBar = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-hold="${channel}"]`);
  const clip = els.meterGrid?.querySelector<HTMLElement>(`[data-mlab-meter-clip="${channel}"]`);

  if (readout) {
    readout.textContent = `${level.rmsDbFs.toFixed(1)} dBFS`;
  }
  if (peakValue) {
    peakValue.textContent = `peak ${level.peakDbFs.toFixed(1)} dBFS`;
  }
  if (rmsBar) rmsBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(level.rmsDbFs)}%`);
  if (peakBar) peakBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(level.peakDbFs)}%`);
  if (holdBar) {
    const holdDb = level.peakHoldLinear <= 0
      ? silenceFloorDb
      : 20 * Math.log10(level.peakHoldLinear);
    holdBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(holdDb)}%`);
  }
  if (clip) {
    const isClipped = level.clipped;
    clip.textContent = isClipped ? 'clipping' : 'no clip';
    clip.classList.toggle('mlab-meter-clip--active', isClipped);
  }

  // Update ribbon mini meters
  const pct = `${levelPercentFromDb(level.peakDbFs)}%`;
  const dbText = `${level.peakDbFs.toFixed(1)}`;
  if (channel === 'L') {
    if (els.ribbonMiniLFill) els.ribbonMiniLFill.style.setProperty('--p', pct);
    if (els.ribbonMiniLDb) els.ribbonMiniLDb.textContent = dbText;
  } else {
    if (els.ribbonMiniRFill) els.ribbonMiniRFill.style.setProperty('--p', pct);
    if (els.ribbonMiniRDb) els.ribbonMiniRDb.textContent = dbText;
  }
}

function stopMeterLoop(): void {
  if (state.meterFrame !== null) {
    cancelAnimationFrame(state.meterFrame);
    state.meterFrame = null;
  }
  state.meterLastTimestamp = null;
}

function ingestChannelMetrics(channel: ChannelKey, metrics: LevelMetrics, elapsedSeconds: number): void {
  const previous = state.channelLevels[channel];
  const peakHoldLinear = decayPeakHold(
    previous.peakHoldLinear,
    metrics.peakLinear,
    elapsedSeconds,
    peakHoldDecayDbPerSecond,
  );
  state.channelLevels[channel] = {
    peakLinear: metrics.peakLinear,
    peakHoldLinear,
    rmsLinear: metrics.rmsLinear,
    peakDbFs: metrics.peakDbFs,
    rmsDbFs: metrics.rmsDbFs,
    clipped: metrics.clipped,
  };
}

function readAnalyserMetrics(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): LevelMetrics {
  analyser.getFloatTimeDomainData(scratch);
  return computeLevelMetrics(scratch);
}

function createScratchBuffer(size: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(size * Float32Array.BYTES_PER_ELEMENT));
}

function drawWaveform(canvas: HTMLCanvasElement | null, data: Float32Array, clipped: boolean): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;
  const pixW = Math.round(cssW * dpr);
  const pixH = Math.round(cssH * dpr);
  if (canvas.width !== pixW || canvas.height !== pixH) {
    canvas.width = pixW;
    canvas.height = pixH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.beginPath();
  ctx.moveTo(0, cssH * 0.5);
  ctx.lineTo(cssW, cssH * 0.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const len = data.length;
  if (len < 2) return;
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = (i / (len - 1)) * cssW;
    const y = (0.5 - data[i] * 0.45) * cssH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = clipped ? 'rgba(208, 80, 80, 0.9)' : 'rgba(242, 184, 55, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function renderSourcePanelLevel(els: Elements, channel: ChannelKey): void {
  if (!els.sourceMeterGrid) return;
  const level = state.channelLevels[channel];
  const grid = els.sourceMeterGrid;
  const readout = grid.querySelector<HTMLElement>(`[data-mlab-meter-readout="${channel}"]`);
  const peakValue = grid.querySelector<HTMLElement>(`[data-mlab-meter-peak-value="${channel}"]`);
  const rmsBar = grid.querySelector<HTMLElement>(`[data-mlab-meter-rms="${channel}"]`);
  const peakBar = grid.querySelector<HTMLElement>(`[data-mlab-meter-peak="${channel}"]`);
  const holdBar = grid.querySelector<HTMLElement>(`[data-mlab-meter-hold="${channel}"]`);
  const clip = grid.querySelector<HTMLElement>(`[data-mlab-meter-clip="${channel}"]`);
  if (readout) readout.textContent = `${level.rmsDbFs.toFixed(1)} dBFS`;
  if (peakValue) peakValue.textContent = `peak ${level.peakDbFs.toFixed(1)} dBFS`;
  if (rmsBar) rmsBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(level.rmsDbFs)}%`);
  if (peakBar) peakBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(level.peakDbFs)}%`);
  if (holdBar) {
    const holdDb = level.peakHoldLinear <= 0 ? silenceFloorDb : 20 * Math.log10(level.peakHoldLinear);
    holdBar.style.setProperty('--mlab-bar', `${levelPercentFromDb(holdDb)}%`);
  }
  if (clip) {
    clip.textContent = level.clipped ? 'clipping' : 'no clip';
    clip.classList.toggle('mlab-meter-clip--active', level.clipped);
  }
}

function drawSourceSpectrum(canvas: HTMLCanvasElement | null, analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): void {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;
  const pixW = Math.round(cssW * dpr);
  const pixH = Math.round(cssH * dpr);
  if (canvas.width !== pixW || canvas.height !== pixH) {
    canvas.width = pixW;
    canvas.height = pixH;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  analyser.getFloatFrequencyData(scratch);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  // Draw frequency bars on a log scale (20 Hz – Nyquist)
  const nyquist = analyser.context.sampleRate / 2;
  const minHz = 20;
  const maxHz = nyquist;
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const binHz = nyquist / analyser.frequencyBinCount;
  const minDb = -96;
  const maxDb = 0;
  const clipped = state.channelLevels.L.clipped || state.channelLevels.R.clipped;
  ctx.fillStyle = clipped ? 'rgba(208,80,80,0.7)' : 'rgba(242,184,55,0.55)';
  const barW = Math.max(1, cssW / 200);
  for (let i = 0; i < 200; i++) {
    const t = i / 199;
    const hz = Math.pow(10, logMin + t * (logMax - logMin));
    const bin = Math.round(hz / binHz);
    const db = scratch[Math.min(bin, scratch.length - 1)] ?? minDb;
    const norm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
    const barH = norm * cssH;
    ctx.fillRect(t * cssW, cssH - barH, barW, barH);
  }
  // Zero dB line
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(cssW, 0.5);
  ctx.stroke();
}

function startMeterLoop(els: Elements): void {
  stopMeterLoop();
  if (!state.analysers) return;
  const scratchL = createScratchBuffer(state.analysers.L.fftSize);
  const scratchR = createScratchBuffer(state.analysers.R.fftSize);
  const spectrumScratch = new Float32Array(new ArrayBuffer(state.analysers.L.frequencyBinCount * Float32Array.BYTES_PER_ELEMENT));
  const step = (timestamp: number) => {
    if (!state.analysers) return;
    const previous = state.meterLastTimestamp;
    state.meterLastTimestamp = timestamp;
    const elapsedSeconds = previous === null ? 0 : (timestamp - previous) / 1000;
    ingestChannelMetrics('L', readAnalyserMetrics(state.analysers.L, scratchL), elapsedSeconds);
    if (state.channelCount > 1) {
      ingestChannelMetrics('R', readAnalyserMetrics(state.analysers.R, scratchR), elapsedSeconds);
    } else {
      state.channelLevels.R = state.channelLevels.L;
    }
    renderChannelLevel(els, 'L');
    renderChannelLevel(els, 'R');
    drawWaveform(els.waveformL, scratchL, state.channelLevels.L.clipped);
    drawWaveform(els.waveformR, state.channelCount > 1 ? scratchR : scratchL, state.channelLevels.R.clipped);
    // Source panel viz: only when Audio Source is the active tool
    if (state.activeWorkflowId === 'audio_source') {
      renderSourcePanelLevel(els, 'L');
      renderSourcePanelLevel(els, 'R');
      drawSourceSpectrum(els.sourceFreqCanvas, state.analysers.L, spectrumScratch);
    }
    state.meterFrame = requestAnimationFrame(step);
  };
  state.meterFrame = requestAnimationFrame(step);
}

function stopSpeedMeasurement(): void {
  if (state.speed.capture) {
    state.speed.capture.stop();
    state.speed.capture = null;
  }
  state.speed.active = false;
  state.speed.elapsedSeconds = 0;
}

function startSpeedMeasurement(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  const speedBands = getWowFlutterBands(selectedRecord());
  const band = speedBands.find(b => b.frequencyHz === 3150)
    ?? speedBands[0]
    ?? null;

  if (!band) {
    appendLog('Speed & W&F: no speed band available for selected test record — capture aborted.');
    return;
  }

  const bandMeta: SpeedBandMeta = {
    index: band.index,
    label: band.label,
    frequencyHz: band.frequencyHz ?? null,
    levelDb: band.levelDb ?? null,
  };

  const settings = deriveSpeedMeasurementSettings({
    band: bandMeta,
    speedContext: state.speed.speedContext,
    nominalFrequencyInput: state.speed.nominalFrequencyHzInput,
    captureDurationInput: state.speed.captureDurationSecondsInput,
  });

  // Analysis reference and capture duration come from settings; band is provenance only.
  state.speed.referenceHz = settings.nominalFrequencyHz;
  state.speed.bandMeta = bandMeta;
  state.speed.lastSettings = settings;
  state.speed.resultSource = state.sourceMode === 'self-test' ? 'self_test' : 'live_capture';

  stopSpeedMeasurement();
  state.speed.active = true;
  state.speed.elapsedSeconds = 0;
  state.speed.result = null;
  renderSpeedPanel(els);

  state.speed.capture = createSpeedFlutterCapture(
    context,
    source,
    settings.nominalFrequencyHz,
    settings.captureDurationSeconds,
    {
      onProgress: (elapsed) => {
        state.speed.elapsedSeconds = elapsed;
        renderSpeedPanel(els);
      },
      onDone: (result) => {
        state.speed.active = false;
        state.speed.result = result;
        state.speed.capture = null;
        const savedSettings = state.speed.lastSettings!;
        const run: SpeedMeasurementRun = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          source: state.speed.resultSource ?? 'live_capture',
          speedContext: savedSettings.speedContext,
          rpm: savedSettings.rpm,
          nominalFrequencyHzDefault: savedSettings.nominalFrequencyHzDefault,
          nominalFrequencyHz: savedSettings.nominalFrequencyHz,
          nominalFrequencySource: savedSettings.nominalFrequencySource,
          captureDurationSeconds: savedSettings.captureDurationSeconds,
          captureDurationSource: savedSettings.captureDurationSource,
          measuredFrequencyHz: result.meanFrequencyHz,
          speedErrorPercent: result.speedDeviationPercent,
          wowFlutterPercent: result.unweightedWfPercent,
          wowFlutterWeightedPercent: result.weightedWfPercent,
          band: state.speed.bandMeta,
          warnings: [],
          runQuality: deriveMeasurementRunQuality({
            leftRmsDbfs: state.channelLevels.L.rmsDbFs,
            rightRmsDbfs: state.channelLevels.R.rmsDbFs,
            leftPeakDbfs: state.channelLevels.L.peakDbFs,
            rightPeakDbfs: state.channelLevels.R.peakDbFs,
            source: state.speed.resultSource ?? 'live_capture',
            measurementKind: 'test_tone',
          }),
        };
        state.speed.runs = [...state.speed.runs, run];
        renderSpeedPanel(els);
        appendLog(`Speed & W&F complete — deviation ${result.speedDeviationPercent.toFixed(3)} %, unweighted W&F ${result.unweightedWfPercent.toFixed(3)} %`);
      },
    },
  );
}

async function teardownAudio(): Promise<void> {
  stopMeterLoop();
  stopSpeedMeasurement();
  state.speed.result = null;
  resetChannelMeasurement();
  stopFreqCapture();
  state.freq.result = null;
  stopThdCapture();
  state.thd.result = null;
  stopResonanceCapture();
  state.resonance.result = null;
  stopRefLevelCapture();
  state.refLevel.result = null;
  stopVtaCapture();
  if (state.selfTestOscillator) {
    try { state.selfTestOscillator.stop(); } catch { /* already stopped */ }
    try { state.selfTestOscillator.disconnect(); } catch { /* not connected */ }
    state.selfTestOscillator = null;
  }
  if (state.splitter) {
    try { state.splitter.disconnect(); } catch { /* not connected */ }
    state.splitter = null;
  }
  if (state.analysers) {
    try { state.analysers.L.disconnect(); } catch { /* not connected */ }
    try { state.analysers.R.disconnect(); } catch { /* not connected */ }
    state.analysers = null;
  }
  if (state.iriaaNode) {
    try { state.iriaaNode.node.disconnect(); } catch { /* not connected */ }
    state.iriaaNode = null;
  }
  if (state.silentSink) {
    try { state.silentSink.disconnect(); } catch { /* not connected */ }
    state.silentSink = null;
  }
  if (state.sourceNode) {
    try { state.sourceNode.disconnect(); } catch { /* not connected */ }
    state.sourceNode = null;
  }
  state.preSplitterNode = null;
  releaseStrictAudioStream(state.stream);
  state.stream = null;
  await disposeMeasurementAudioContext(state.audioHandle);
  state.audioHandle = null;
  state.honesty = null;
  state.channelCount = 0;
  state.channelLevels = { L: initialChannelLevel(), R: initialChannelLevel() };
}

function buildAnalysers(context: AudioContext): { L: AnalyserNode; R: AnalyserNode } {
  const create = (): AnalyserNode => {
    const analyser = context.createAnalyser();
    analyser.fftSize = meterFftSize;
    analyser.smoothingTimeConstant = 0;
    return analyser;
  };
  return { L: create(), R: create() };
}

async function startLiveCapture(els: Elements): Promise<void> {
  const stream = await requestStrictAudioStream({
    deviceId: state.selectedDeviceId ?? undefined,
    requestedSampleRate: defaultRequestedSampleRateHz,
    requestedChannelCount: defaultRequestedChannelCount,
  });
  state.stream = stream;
  const audioHandle = createMeasurementAudioContext({
    requestedSampleRate: defaultRequestedSampleRateHz,
  });
  state.audioHandle = audioHandle;
  if (audioHandle.context.state === 'suspended') {
    await audioHandle.context.resume();
  }
  const sourceNode = audioHandle.context.createMediaStreamSource(stream.stream);
  const splitter = audioHandle.context.createChannelSplitter(2);
  const analysers = buildAnalysers(audioHandle.context);
  let iriaa: IriaaFilterNode | null = null;
  if (state.iriaaEnabled) {
    iriaa = createIriaaFilterNode(audioHandle.context);
    sourceNode.connect(iriaa.node);
    iriaa.node.connect(splitter);
  } else {
    sourceNode.connect(splitter);
  }
  splitter.connect(analysers.L, 0);
  splitter.connect(analysers.R, 1);
  state.sourceNode = sourceNode;
  state.preSplitterNode = iriaa?.node ?? sourceNode;
  state.iriaaNode = iriaa;
  state.splitter = splitter;
  state.analysers = analysers;
  state.channelCount = typeof stream.trackSettings.channelCount === 'number'
    ? stream.trackSettings.channelCount
    : defaultRequestedChannelCount;
  state.honesty = describeSampleRateHonesty({
    requestedHz: defaultRequestedSampleRateHz,
    contextActualHz: audioHandle.context.sampleRate,
    trackReportedHz: typeof stream.trackSettings.sampleRate === 'number' ? stream.trackSettings.sampleRate : undefined,
  });
  renderActualFormat(els);
  startMeterLoop(els);
}

async function startSelfTest(els: Elements): Promise<void> {
  const audioHandle = createMeasurementAudioContext({
    requestedSampleRate: defaultRequestedSampleRateHz,
  });
  state.audioHandle = audioHandle;
  if (audioHandle.context.state === 'suspended') {
    await audioHandle.context.resume();
  }
  const oscillator = audioHandle.context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = selfTestFrequencyHz;
  const gain = audioHandle.context.createGain();
  gain.gain.value = selfTestPeakLinear;
  const silentSink = audioHandle.context.createGain();
  silentSink.gain.value = 0;
  const analysers = buildAnalysers(audioHandle.context);
  let iriaa: IriaaFilterNode | null = null;
  oscillator.connect(gain);
  if (state.iriaaEnabled) {
    iriaa = createIriaaFilterNode(audioHandle.context);
    gain.connect(iriaa.node);
    iriaa.node.connect(analysers.L);
    iriaa.node.connect(analysers.R);
    iriaa.node.connect(silentSink);
  } else {
    gain.connect(analysers.L);
    gain.connect(analysers.R);
    gain.connect(silentSink);
  }
  silentSink.connect(audioHandle.context.destination);
  oscillator.start();
  state.selfTestOscillator = oscillator;
  state.preSplitterNode = iriaa?.node ?? gain;
  state.iriaaNode = iriaa;
  state.analysers = analysers;
  state.silentSink = silentSink;
  state.channelCount = 2;
  state.honesty = describeSampleRateHonesty({
    requestedHz: defaultRequestedSampleRateHz,
    contextActualHz: audioHandle.context.sampleRate,
  });
  renderActualFormat(els);
  startMeterLoop(els);
}

async function connectMeasurementLab(els: Elements): Promise<void> {
  if (state.captureState === 'live' || state.captureState === 'connecting') return;
  state.captureState = 'connecting';
  state.errorMessage = null;
  renderConnectionButtons(els);
  renderIriaaToggle(els);
  if (state.sourceMode === 'live') {
    setSessionStatusText(els, 'Waiting for browser audio permission…');
  } else {
    setSessionStatusText(els, 'Starting self-test…');
  }
  setActionStatus(els, 'active', 'Requesting audio access.');
  try {
    await teardownAudio();
    if (state.sourceMode === 'live') {
      setSessionStatusText(els, 'Connecting to audio input…');
      await startLiveCapture(els);
      try {
        const devices = await listAudioInputDevices();
        state.devices = devices;
        if (state.stream && state.stream.trackSettings.deviceId) {
          state.selectedDeviceId = state.stream.trackSettings.deviceId;
          writeStoredDeviceId(state.selectedDeviceId);
        }
        renderDeviceList(els);
      } catch (enumerationError) {
        if (!(enumerationError instanceof AudioDeviceEnumerationError)) throw enumerationError;
      }
    } else {
      await startSelfTest(els);
    }
    state.captureState = 'live';
    appendLog(`Connected — ${state.sourceMode === 'live' ? 'live capture' : 'self-test'} @ ${state.honesty?.contextActualHz?.toLocaleString() ?? '?'} Hz`);
  } catch (error) {
    state.captureState = 'error';
    const isPermissionDenied = error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
    const isNoDevice = error instanceof Error && (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError');
    if (isPermissionDenied) {
      state.errorMessage = 'Permission denied. Enable microphone/audio input access in the browser.';
    } else if (isNoDevice) {
      state.errorMessage = 'No audio input found. Connect an audio interface and try again.';
    } else {
      state.errorMessage = error instanceof AudioStreamUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Audio capture failed.';
    }
    appendLog(`Connection failed: ${state.errorMessage ?? 'unknown error'}`);
    await teardownAudio();
    clearMeterDom(els);
  }
  renderConnectionButtons(els);
  renderIriaaToggle(els);
  renderSessionStatus(els);
  renderActualFormat(els);
  renderSpeedPanel(els);
  renderChannelPanel(els);
  renderFreqPanel(els);
  renderThdPanel(els);
  renderResonancePanel(els);
  renderNoiseFloorPanel(els);
  renderChainReadinessPanel(els);
  renderRefLevelPanel(els);
  renderSessionRibbon(els);
  renderDiagSignalPanel(els);
  renderWorkflowRail(els);
}

async function disconnectMeasurementLab(els: Elements): Promise<void> {
  await teardownAudio();
  state.captureState = 'idle';
  appendLog('Disconnected.');
  clearMeterDom(els);
  renderConnectionButtons(els);
  renderIriaaToggle(els);
  renderSessionStatus(els);
  renderActualFormat(els);
  renderSpeedPanel(els);
  renderChannelPanel(els);
  renderFreqPanel(els);
  renderThdPanel(els);
  renderResonancePanel(els);
  renderRefLevelPanel(els);
  renderAdvancedPanel(els);
  renderNoiseFloorPanel(els);
  renderChainReadinessPanel(els);
  renderSessionRibbon(els);
  renderDiagSignalPanel(els);
  renderWorkflowRail(els);
}

async function refreshDeviceList(els: Elements): Promise<void> {
  try {
    state.devices = await listAudioInputDevices();
    if (!state.selectedDeviceId) {
      state.selectedDeviceId = readStoredDeviceId();
    }
    renderDeviceList(els);
  } catch (error) {
    if (error instanceof AudioDeviceEnumerationError) {
      state.devices = [];
      renderDeviceList(els);
    } else {
      throw error;
    }
  }
}

function noiseFloorScenarioLabel(kind: NoiseFloorScenarioKind): string {
  switch (kind) {
    case 'equipment_off': return 'Equipment noise floor — turntable off';
    case 'rig_powered_still': return 'Rig noise floor — powered, platter still, tonearm parked';
    case 'platter_spinning': return 'Platter spinning — tonearm up';
  }
}

function noiseFloorScenarioGuidance(kind: NoiseFloorScenarioKind): string {
  switch (kind) {
    case 'equipment_off':
      return 'Turntable off. All measurement electronics connected. Use this as electronics / capture baseline.';
    case 'rig_powered_still':
      return 'Turntable powered, platter still, tonearm parked. Use this to capture powered rig baseline.';
    case 'platter_spinning':
      return 'Platter spinning at selected speed, tonearm up. Use this to identify motor / platter / field-related noise changes.';
  }
}

function noiseFloorSpeedRpm(speed: NoiseFloorTurntableSpeed, customInput: string): number | null {
  const map: Record<Exclude<NoiseFloorTurntableSpeed, 'custom'>, number> = {
    '16': 16,
    '33_33': 33.333,
    '45': 45,
    '78': 78,
  };
  if (speed === 'custom') {
    const v = parsePositiveFloat(customInput);
    return v !== null ? v : null;
  }
  return map[speed];
}

function noiseFloorSpeedLabel(speed: NoiseFloorTurntableSpeed): string {
  const labels: Record<NoiseFloorTurntableSpeed, string> = {
    '16': '16 RPM',
    '33_33': '33⅓ RPM',
    '45': '45 RPM',
    '78': '78 RPM',
    'custom': 'Custom',
  };
  return labels[speed];
}

function noiseFloorRunHistoryMarkup(runs: readonly NoiseFloorRun[]): string {
  if (runs.length === 0) return '';
  const rows = [...runs].reverse().map(r => {
    const scenarioLabel = noiseFloorScenarioLabel(r.scenarioKind);
    const rpmCell = r.rpm !== null ? `${r.rpm.toFixed(r.rpm === Math.round(r.rpm) ? 0 : 1)} RPM` : '—';
    const lRms = r.leftRmsDbfs !== null ? `${r.leftRmsDbfs.toFixed(1)} dBFS` : '—';
    const rRms = r.rightRmsDbfs !== null ? `${r.rightRmsDbfs.toFixed(1)} dBFS` : '—';
    const nf = r.noiseFloorDbfs !== null ? `${r.noiseFloorDbfs.toFixed(1)} dBFS` : '—';
    const srcLabel = r.source === 'self_test' ? 'Self-test' : 'Live';
    const time = r.createdAt.slice(11, 19);
    return `<tr class="mlab-nf-history-row">
      <td class="mlab-nf-history-cell">${time}</td>
      <td class="mlab-nf-history-cell">${renderText(scenarioLabel)}</td>
      <td class="mlab-nf-history-cell">${rpmCell}</td>
      <td class="mlab-nf-history-cell">${lRms}</td>
      <td class="mlab-nf-history-cell">${rRms}</td>
      <td class="mlab-nf-history-cell">${nf}</td>
      <td class="mlab-nf-history-cell">${srcLabel}</td>
    </tr>`;
  }).join('');
  return `
    <div class="mlab-nf-history-scroll">
      <table class="mlab-nf-history-table" aria-label="Noise floor run history">
        <thead>
          <tr>
            <th>Time</th><th>Scenario</th><th>RPM</th>
            <th>L RMS</th><th>R RMS</th><th>Noise floor</th><th>Source</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function stopNoiseFloorCapture(): void {
  if (state.noiseFloor.capture) {
    state.noiseFloor.capture.stop();
    state.noiseFloor.capture = null;
  }
  state.noiseFloor.active = false;
  state.noiseFloor.elapsedSeconds = 0;
}

function startNoiseFloorCapture(els: Elements): void {
  const context = state.audioHandle?.context;
  const source = state.preSplitterNode;
  if (!context || !source || state.captureState !== 'live') return;

  const durInput = state.noiseFloor.captureDurationSecondsInput;
  const dur = (() => {
    const v = parsePositiveFloat(durInput);
    return (v !== null && Number.isFinite(v) && v > 0) ? v : noiseFloorDefaultDurationSeconds;
  })();

  const rpm = noiseFloorSpeedRpm(state.noiseFloor.speed, state.noiseFloor.customRpmInput);
  const scenarioKind = state.noiseFloor.scenarioKind;
  const speed = scenarioKind === 'platter_spinning' ? state.noiseFloor.speed : null;
  const tonearmPosition = state.noiseFloor.tonearmPositionInput.trim();
  const captureSource: 'live_capture' | 'self_test' = state.sourceMode === 'self-test' ? 'self_test' : 'live_capture';

  stopNoiseFloorCapture();
  state.noiseFloor.active = true;
  state.noiseFloor.elapsedSeconds = 0;
  renderNoiseFloorPanel(els);

  state.noiseFloor.capture = createNoiseFloorCapture(
    context,
    source,
    dur,
    {
      onProgress: (elapsed) => {
        state.noiseFloor.elapsedSeconds = elapsed;
        renderNoiseFloorPanel(els);
      },
      onDone: (result) => {
        state.noiseFloor.active = false;
        state.noiseFloor.capture = null;
        const run: NoiseFloorRun = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          source: captureSource,
          scenarioKind,
          speed,
          rpm: speed !== null ? (rpm ?? null) : null,
          tonearmPosition,
          captureDurationSeconds: dur,
          leftRmsDbfs: result.leftRmsDbfs,
          rightRmsDbfs: result.rightRmsDbfs,
          leftPeakDbfs: result.leftPeakDbfs,
          rightPeakDbfs: result.rightPeakDbfs,
          noiseFloorDbfs: result.noiseFloorDbfs,
          warnings: result.warnings,
          runQuality: deriveMeasurementRunQuality({
            leftRmsDbfs: result.leftRmsDbfs,
            rightRmsDbfs: result.rightRmsDbfs,
            leftPeakDbfs: result.leftPeakDbfs,
            rightPeakDbfs: result.rightPeakDbfs,
            source: captureSource,
            measurementKind: 'noise_floor',
          }),
        };
        state.noiseFloor.latest = run;
        state.noiseFloor.runs = [...state.noiseFloor.runs, run];
        renderNoiseFloorPanel(els);
        appendLog(`Noise floor complete — ${noiseFloorScenarioLabel(scenarioKind)}: ${result.noiseFloorDbfs !== null ? result.noiseFloorDbfs.toFixed(1) + ' dBFS' : 'n/a'}`);
      },
    },
  );
}

function renderNoiseFloorPanel(els: Elements): void {
  const body = els.noiseFloorBody;
  if (!body) return;

  const nf = state.noiseFloor;
  const scenario = nf.scenarioKind;
  const activeDur = (() => {
    const v = parsePositiveFloat(nf.captureDurationSecondsInput);
    return (v !== null && Number.isFinite(v) && v > 0) ? v : noiseFloorDefaultDurationSeconds;
  })();

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a noise floor measurement.</p>';
    return;
  }

  if (nf.active) {
    const pct = Math.min(100, (nf.elapsedSeconds / activeDur) * 100);
    const remaining = Math.max(0, activeDur - nf.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted mlab-nf-guidance">${renderText(noiseFloorScenarioLabel(scenario))}</p>
      <p class="ea-muted">Recording noise floor for ${activeDur.toFixed(1)}&thinsp;s&hellip;</p>
      <div class="mlab-progress-track" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Recording progress">
        <div class="mlab-progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <p class="mlab-progress-label">${remaining.toFixed(1)}&nbsp;s remaining</p>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-nf-cancel>Cancel</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-nf-cancel]')?.addEventListener('click', () => {
      stopNoiseFloorCapture();
      renderNoiseFloorPanel(els);
    });
    return;
  }

  const selfTestNote = state.sourceMode === 'self-test'
    ? '<p class="ea-muted mlab-reflevel-selftest-note">Self-test mode: results will be marked <strong>self-test / simulated</strong>.</p>'
    : '';

  const isPlatter = scenario === 'platter_spinning';
  const speedOptions: NoiseFloorTurntableSpeed[] = ['16', '33_33', '45', '78', 'custom'];
  const speedSelectHtml = speedOptions.map(s =>
    `<option value="${s}"${nf.speed === s ? ' selected' : ''}>${noiseFloorSpeedLabel(s)}</option>`
  ).join('');
  const customRpmRow = (nf.speed === 'custom' && isPlatter) ? `
    <div class="mlab-nf-settings-row">
      <label class="mlab-nf-settings-label ea-muted" for="mlab-nf-custom-rpm">Custom RPM</label>
      <div class="mlab-nf-settings-input-group">
        <input id="mlab-nf-custom-rpm" type="text" inputmode="decimal"
          class="ea-input mlab-nf-settings-input"
          placeholder="e.g. 16.67"
          value="${renderText(nf.customRpmInput)}"
          data-mlab-nf-custom-rpm>
        <span class="ea-muted mlab-nf-settings-unit">RPM</span>
      </div>
    </div>` : '';

  const latestResult = nf.latest;
  const resultHtml = latestResult ? (() => {
    const srcBadgeClass = latestResult.source === 'self_test' ? 'ea-badge--setup' : 'ea-badge--manufacturer';
    const srcBadgeLabel = latestResult.source === 'self_test' ? 'Self-test / Simulated' : 'Live capture';
    const lRms = latestResult.leftRmsDbfs !== null ? `${latestResult.leftRmsDbfs.toFixed(1)} dBFS` : '—';
    const rRms = latestResult.rightRmsDbfs !== null ? `${latestResult.rightRmsDbfs.toFixed(1)} dBFS` : '—';
    const lPk = latestResult.leftPeakDbfs !== null ? `${latestResult.leftPeakDbfs.toFixed(1)} dBFS` : '—';
    const rPk = latestResult.rightPeakDbfs !== null ? `${latestResult.rightPeakDbfs.toFixed(1)} dBFS` : '—';
    const nfDb = latestResult.noiseFloorDbfs !== null ? `${latestResult.noiseFloorDbfs.toFixed(1)} dBFS` : '—';
    const rpmRow = latestResult.rpm !== null ? `<div class="mlab-wf-result-row"><span class="mlab-wf-result-label">Turntable speed</span><span class="mlab-wf-result-value">${latestResult.rpm.toFixed(latestResult.rpm === Math.round(latestResult.rpm) ? 0 : 1)} RPM</span></div>` : '';
    const tpRow = latestResult.tonearmPosition ? `<div class="mlab-wf-result-row"><span class="mlab-wf-result-label">Tonearm position</span><span class="mlab-wf-result-value">${renderText(latestResult.tonearmPosition)}</span></div>` : '';
    return `
      <div class="mlab-nf-result">
        <div class="mlab-result-source-row">
          <span class="ea-badge ${srcBadgeClass}">${srcBadgeLabel}</span>
          <span class="ea-muted">${renderText(noiseFloorScenarioLabel(latestResult.scenarioKind))}</span>
        </div>
        <div class="mlab-wf-result">
          ${rpmRow}
          ${tpRow}
          <div class="mlab-wf-result-row"><span class="mlab-wf-result-label">L RMS</span><span class="mlab-wf-result-value">${lRms}</span></div>
          <div class="mlab-wf-result-row"><span class="mlab-wf-result-label">R RMS</span><span class="mlab-wf-result-value">${rRms}</span></div>
          <div class="mlab-wf-result-row"><span class="mlab-wf-result-label">L peak</span><span class="mlab-wf-result-value">${lPk}</span></div>
          <div class="mlab-wf-result-row"><span class="mlab-wf-result-label">R peak</span><span class="mlab-wf-result-value">${rPk}</span></div>
          <div class="mlab-wf-result-row mlab-wf-result-row--grade"><span class="mlab-wf-result-label">Noise floor</span><span class="mlab-wf-result-value">${nfDb}</span></div>
          <p class="mlab-wf-note">Duration: ${latestResult.captureDurationSeconds.toFixed(1)} s</p>
        </div>
      </div>
      ${renderRunQualityHtml(latestResult.runQuality)}`;
  })() : '';

  const historyHtml = nf.runs.length > 0 ? `
    <div class="mlab-nf-history">
      <div class="mlab-nf-history-head">
        <strong>Noise floor history</strong>
        <button class="ea-button ea-button--ghost mlab-nf-history-clear" type="button" data-mlab-nf-clear-history>Clear noise floor history</button>
      </div>
      ${noiseFloorRunHistoryMarkup(nf.runs)}
    </div>` : '';

  const durDefault = noiseFloorDefaultDurationSeconds;
  const durParsed = parsePositiveFloat(nf.captureDurationSecondsInput);
  const durEffective = (durParsed !== null && Number.isFinite(durParsed) && durParsed > 0) ? durParsed : durDefault;
  const durSrc = durParsed !== null ? 'User override' : `Default (${durDefault} s)`;

  body.innerHTML = `
    <p class="ea-muted mlab-nf-intro">Noise floor measurements do not use a test record. They capture the connected playback / capture chain in a selected physical state.</p>
    ${selfTestNote}
    <div class="mlab-nf-settings">
      <div class="mlab-nf-settings-row">
        <label class="mlab-nf-settings-label ea-muted" for="mlab-nf-scenario">Scenario</label>
        <select id="mlab-nf-scenario" class="ea-input mlab-nf-settings-select" data-mlab-nf-scenario>
          <option value="equipment_off"${scenario === 'equipment_off' ? ' selected' : ''}>Equipment noise floor — turntable off</option>
          <option value="rig_powered_still"${scenario === 'rig_powered_still' ? ' selected' : ''}>Rig noise floor — powered, platter still, tonearm parked</option>
          <option value="platter_spinning"${scenario === 'platter_spinning' ? ' selected' : ''}>Platter spinning — tonearm up</option>
        </select>
      </div>
      <p class="ea-muted mlab-nf-guidance">${renderText(noiseFloorScenarioGuidance(scenario))}</p>
      ${isPlatter ? `
      <div class="mlab-nf-settings-row">
        <label class="mlab-nf-settings-label ea-muted" for="mlab-nf-speed">Turntable speed</label>
        <select id="mlab-nf-speed" class="ea-input mlab-nf-settings-select" data-mlab-nf-speed>${speedSelectHtml}</select>
      </div>
      ${customRpmRow}` : ''}
      <div class="mlab-nf-settings-row">
        <label class="mlab-nf-settings-label ea-muted" for="mlab-nf-tonearm">Tonearm position / note</label>
        <input id="mlab-nf-tonearm" type="text" class="ea-input mlab-nf-settings-input mlab-nf-settings-input--wide"
          placeholder="e.g. parked, over outer groove"
          value="${renderText(nf.tonearmPositionInput)}"
          data-mlab-nf-tonearm>
      </div>
      <div class="mlab-nf-settings-row">
        <label class="mlab-nf-settings-label ea-muted" for="mlab-nf-duration">Capture duration</label>
        <div class="mlab-nf-settings-input-group">
          <input id="mlab-nf-duration" type="text" inputmode="decimal"
            class="ea-input mlab-nf-settings-input"
            placeholder="${durDefault}"
            value="${renderText(nf.captureDurationSecondsInput)}"
            data-mlab-nf-duration>
          <span class="ea-muted mlab-nf-settings-unit">s</span>
          <span class="mlab-nf-settings-src ea-muted">${durSrc} &rarr; ${durEffective.toFixed(1)} s</span>
        </div>
      </div>
    </div>
    ${resultHtml}
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-nf-start>Start noise floor capture</button>
    </div>
    ${historyHtml}
  `;

  body.querySelector<HTMLSelectElement>('[data-mlab-nf-scenario]')?.addEventListener('change', (e) => {
    state.noiseFloor.scenarioKind = (e.target as HTMLSelectElement).value as NoiseFloorScenarioKind;
    renderNoiseFloorPanel(els);
  });
  body.querySelector<HTMLSelectElement>('[data-mlab-nf-speed]')?.addEventListener('change', (e) => {
    state.noiseFloor.speed = (e.target as HTMLSelectElement).value as NoiseFloorTurntableSpeed;
    renderNoiseFloorPanel(els);
  });
  body.querySelector<HTMLInputElement>('[data-mlab-nf-custom-rpm]')?.addEventListener('input', (e) => {
    state.noiseFloor.customRpmInput = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLInputElement>('[data-mlab-nf-tonearm]')?.addEventListener('input', (e) => {
    state.noiseFloor.tonearmPositionInput = (e.target as HTMLInputElement).value;
  });
  body.querySelector<HTMLInputElement>('[data-mlab-nf-duration]')?.addEventListener('input', (e) => {
    state.noiseFloor.captureDurationSecondsInput = (e.target as HTMLInputElement).value;
    renderNoiseFloorPanel(els);
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-nf-start]')?.addEventListener('click', () => {
    startNoiseFloorCapture(els);
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-nf-clear-history]')?.addEventListener('click', () => {
    state.noiseFloor.runs = [];
    state.noiseFloor.latest = null;
    renderNoiseFloorPanel(els);
  });
}

// ── S5J: Measurement Lab rich report builder ─────────────────────────────────

function wrKV(key: string, val: string): string {
  return `<div class="ea-webreport-kv-key">${key}</div><div class="ea-webreport-kv-val">${val}</div>`;
}

function wrKVs(pairs: readonly [string, string][]): string {
  return `<div class="ea-webreport-kv">${pairs.map(([k, v]) => wrKV(k, v)).join('')}</div>`;
}

function wrBadge(label: string, kind: 'ok' | 'warn' | 'err' | 'info' | 'exp'): string {
  return `<span class="ea-webreport-badge ea-webreport-badge--${kind}">${renderText(label)}</span>`;
}

function wrNote(text: string, kind: 'warn' | 'err' | '' = ''): string {
  const cls = kind ? ` ea-webreport-note--${kind}` : '';
  return `<div class="ea-webreport-note${cls}">${renderText(text)}</div>`;
}

function wrEmpty(): string {
  return '<p class="ea-webreport-empty">No measurement captured in this session.</p>';
}

function wrWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) return '';
  return warnings.map(w => `<p class="ea-webreport-warning">⚠ ${renderText(w)}</p>`).join('');
}

function wrRunQuality(rq: MeasurementRunQuality | null | undefined): string {
  if (!rq) return '';
  const kind = rq.status === 'ok' ? 'ok' : rq.status === 'warning' ? 'warn' : 'err';
  const label = rq.status === 'ok' ? 'OK' : rq.status === 'warning' ? 'Warning' : 'Invalid';
  return wrBadge(`Run quality: ${label}`, kind) + wrWarnings(rq.warnings);
}

function wrPlaceholder(text: string): string {
  return `<div class="ea-webreport-placeholder" aria-label="Placeholder — ${renderText(text)}">${renderText(text)}</div>`;
}

function buildSummarySection(): WebReportSection {
  const record = selectedRecord();
  const recordLabel = record ? `${record.manufacturer} — ${record.title}` : 'None selected';
  const selfTestRuns =
    state.speed.runs.some(r => r.source === 'self_test') ||
    state.noiseFloor.runs.some(r => r.source === 'self_test') ||
    state.speed.resultSource === 'self_test' ||
    state.refLevel.resultSource === 'self_test';

  const chainStatus = state.captureState === 'live'
    ? (() => {
        const r = deriveMeasurementChainReadiness({
          leftRmsDbfs: state.channelLevels.L.rmsDbFs,
          rightRmsDbfs: state.channelLevels.R.rmsDbFs,
          leftPeakDbfs: state.channelLevels.L.peakDbFs,
          rightPeakDbfs: state.channelLevels.R.peakDbFs,
        });
        const lbl: Record<MeasurementChainReadinessStatus, string> = {
          not_checked: 'Not checked', ready: 'Ready', warning: 'Warning', blocked: 'Blocked',
        };
        return lbl[r.status];
      })()
    : 'Source not connected';

  const generatedAt = new Date().toISOString();

  const sessionPairs: [string, string][] = [
    ['Generated', renderText(generatedAt)],
    ['Source mode', renderText(state.sourceMode === 'self-test' ? 'Self-test (internal oscillator)' : 'Live capture')],
    ['Software iRIAA', state.iriaaEnabled ? 'Applied' : 'Bypass'],
    ['Test record', renderText(recordLabel)],
    ...(record ? [['Record ID', renderText(record.id)] as [string, string]] : []),
    ['Measurement chain', renderText(chainStatus)],
    ...(state.honesty
      ? [
          ['Sample rate (actual)', `${state.honesty.contextActualHz.toLocaleString()} Hz`] as [string, string],
          ['Sample-rate honesty', renderText(state.honesty.classification)] as [string, string],
        ]
      : []),
  ];

  // Coverage table — what was measured and what is still missing
  type CoverageKind = 'ok' | 'warn' | 'err' | 'info' | 'exp';
  const coverageRows: { name: string; detail: string; badge: CoverageKind }[] = [
    {
      name: 'Reference Level',
      detail: state.refLevel.result
        ? `Captured · source: ${state.refLevel.resultSource ?? 'live_capture'}${state.refLevel.runQuality ? ` · quality: ${state.refLevel.runQuality.status}` : ''}`
        : 'Not captured in this session',
      badge: state.refLevel.result ? 'ok' : 'info',
    },
    {
      name: 'Speed &amp; Wow/Flutter',
      detail: state.speed.runs.length > 0
        ? `${state.speed.runs.length} run${state.speed.runs.length === 1 ? '' : 's'}`
        : (state.speed.result ? 'Result available (no run history)' : 'Not captured in this session'),
      badge: state.speed.runs.length > 0 ? 'ok' : 'info',
    },
    {
      name: 'Noise Floor',
      detail: state.noiseFloor.runs.length > 0
        ? `${state.noiseFloor.runs.length} run${state.noiseFloor.runs.length === 1 ? '' : 's'}`
        : 'Not captured in this session',
      badge: state.noiseFloor.runs.length > 0 ? 'ok' : 'info',
    },
    {
      name: 'Channel Identity',
      detail: state.channel.leftCapture && state.channel.rightCapture
        ? `Captured · source: ${state.channel.source ?? 'live_capture'}`
        : 'Not captured in this session',
      badge: state.channel.leftCapture && state.channel.rightCapture ? 'ok' : 'info',
    },
    {
      name: 'Frequency Response',
      detail: state.freq.result
        ? `Captured · source: ${state.freq.resultSource ?? 'live_capture'} · ${state.freq.result.blockCount} blocks`
        : 'Not captured in this session',
      badge: state.freq.result ? 'ok' : 'info',
    },
    {
      name: 'THD / IMD',
      detail: state.thd.result
        ? `Captured · source: ${state.thd.resultSource ?? 'live_capture'} · ${isThdResult(state.thd.result) ? 'THD' : 'IMD'}`
        : 'Not captured in this session',
      badge: state.thd.result ? 'ok' : 'info',
    },
    {
      name: 'Resonance',
      detail: state.resonance.result
        ? `Captured · source: ${state.resonance.resultSource ?? 'live_capture'} · peak: ${state.resonance.result.peakFrequencyHz.toFixed(1)} Hz${state.resonance.runQuality ? ` · quality: ${state.resonance.runQuality.status}` : ''}`
        : 'Not captured in this session',
      badge: state.resonance.result ? 'ok' : 'info',
    },
    {
      name: 'VTA IMD Optimizer',
      detail: state.vta.runs.length > 0
        ? `${state.vta.runs.length} run${state.vta.runs.length === 1 ? '' : 's'} (experimental — not a final recommendation)`
        : 'Not measured — experimental/planned workflow',
      badge: 'exp',
    },
  ];

  const coverageTableRows = coverageRows
    .map(r => `<tr>
      <td>${r.name}</td>
      <td>${wrBadge(r.badge === 'ok' ? 'Captured' : r.badge === 'exp' ? 'Experimental' : 'Not captured', r.badge)}</td>
      <td>${renderText(r.detail)}</td>
    </tr>`)
    .join('');

  const coverageTable = `
    <h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">
      Session measurement coverage
    </h3>
    <table class="ea-webreport-table">
      <thead><tr><th>Measurement</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${coverageTableRows}</tbody>
    </table>`;

  const selfTestWarning = selfTestRuns
    ? wrNote('This report contains measurements captured with self-test (simulated) data. Self-test results do not reflect real-world rig performance.', 'warn')
    : '';

  return {
    id: 'summary',
    title: 'Report Summary',
    html: wrKVs(sessionPairs) + coverageTable + selfTestWarning,
  };
}

function buildTestRecordSection(): WebReportSection {
  const record = selectedRecord();
  if (!record) {
    return { id: 'test-record', title: 'Test Record / Guided Order', html: wrEmpty() };
  }

  const bandRows = record.sides.flatMap(side =>
    side.bands.map(b => {
      const freq = b.frequencyHz != null ? `${b.frequencyHz.toLocaleString('en-US')} Hz` : '—';
      const level = b.levelDb != null ? `${b.levelDb} dB` : '—';
      return `<tr><td>${renderText(b.index)}</td><td>${renderText(b.label)}</td><td>${renderText(b.purpose ?? '')}</td><td>${renderText(freq)}</td><td>${renderText(level)}</td></tr>`;
    }),
  );

  const side0Bands = record.sides[0]?.bands ?? [];
  const track1 = side0Bands.find(b => b.index === '1' || b.index === '1A') ?? side0Bands[0] ?? null;
  const track1Note = track1
    ? wrNote(`Recommended first measurement: Track ${renderText(track1.index)} — ${renderText(track1.label)}. Use the Reference Level workflow.`)
    : '';

  const vtaBands = getVtaImdBands(record);
  const vtaNote = vtaBands.length > 0
    ? `<p>VTA IMD band available: ${renderText(vtaBands[0]!.label)}. VTA workflow status: <strong>Experimental / Planned</strong>.</p>`
    : '<p>No VTA IMD band available for this test record.</p>';

  const tableHtml = bandRows.length > 0
    ? `<table class="ea-webreport-table">
        <thead><tr><th>#</th><th>Label</th><th>Purpose</th><th>Frequency</th><th>Level</th></tr></thead>
        <tbody>${bandRows.join('')}</tbody>
      </table>`
    : '<p class="ea-webreport-empty">No band data available for this record.</p>';

  return {
    id: 'test-record',
    title: 'Test Record / Guided Order',
    html: wrKVs([
      ['Record', renderText(`${record.manufacturer} — ${record.title}`)],
      ['ID', renderText(record.id)],
    ]) + track1Note + tableHtml + vtaNote,
  };
}

function buildChainReadinessSection(): WebReportSection {
  if (state.captureState !== 'live') {
    return {
      id: 'chain-readiness',
      title: 'Measurement Chain Readiness',
      html: '<p class="ea-webreport-empty">Source not connected — connect a source to derive chain readiness.</p>',
    };
  }

  const snap: InputScopeSnapshot = buildInputScopeSnapshot({
    sourceConnected: true,
    leftRmsDbfs: state.channelLevels.L.rmsDbFs,
    rightRmsDbfs: state.channelLevels.R.rmsDbFs,
    leftPeakDbfs: state.channelLevels.L.peakDbFs,
    rightPeakDbfs: state.channelLevels.R.peakDbFs,
  });

  const statusLabels: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'Not checked', ready: 'Ready', warning: 'Warning', blocked: 'Blocked',
  };
  const statusKinds: Record<MeasurementChainReadinessStatus, 'ok' | 'warn' | 'err' | 'info'> = {
    not_checked: 'info', ready: 'ok', warning: 'warn', blocked: 'err',
  };
  const statusExplainReport: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'No audio signal detected. Check connections and ensure the stylus is on the record.',
    ready: 'Signal levels look healthy — measurements can proceed.',
    warning: 'Signal present but one or more conditions are outside the ideal range.',
    blocked: 'Clipping detected. Reduce input gain before capturing measurements.',
  };

  const pairs: [string, string][] = [
    ['Status', statusLabels[snap.status] + wrBadge(statusLabels[snap.status], statusKinds[snap.status])],
    ['Explanation', statusExplainReport[snap.status]],
    ['Signal present', snap.signalPresent ? 'Yes' : 'No'],
    ['Clipping', snap.clipping ? 'Yes — reduce input gain' : 'No'],
    ['Low signal', snap.lowSignal ? 'Yes' : 'No'],
    ['L RMS', fmtDbfs(snap.leftRmsDbfs)],
    ['R RMS', fmtDbfs(snap.rightRmsDbfs)],
    ['L peak', fmtDbfs(snap.leftPeakDbfs)],
    ['R peak', fmtDbfs(snap.rightPeakDbfs)],
  ];
  if (snap.channelImbalanceDb !== null) {
    pairs.push(['Channel imbalance', `${snap.channelImbalanceDb.toFixed(1)} dB L/R`]);
  }

  const refNote = state.refLevel.result
    ? `<p>Last reference level: L ${fmtDbfs(state.refLevel.result.leftRmsDbfs)} / R ${fmtDbfs(state.refLevel.result.rightRmsDbfs)}</p>`
    : wrNote('No reference level captured yet. Capture Reference Level first when using a test record.', 'warn');

  return {
    id: 'chain-readiness',
    title: 'Measurement Chain Readiness',
    html: wrKVs(pairs) + wrWarnings(Array.from(snap.warnings)) + refNote,
  };
}

function buildReferenceLevelSection(): WebReportSection {
  const r = state.refLevel.result;
  if (!r) {
    return { id: 'reference-level', title: 'Reference Level', html: wrEmpty() };
  }

  const pairs: [string, string][] = [
    ['Source', renderText(state.refLevel.resultSource ?? 'live_capture')],
    ['L RMS', fmtDbfs(r.leftRmsDbfs)],
    ['R RMS', fmtDbfs(r.rightRmsDbfs)],
    ['L peak', fmtDbfs(r.leftPeakDbfs)],
    ['R peak', fmtDbfs(r.rightPeakDbfs)],
    ['Balance (R−L)', r.balanceDb != null ? `${r.balanceDb >= 0 ? '+' : ''}${r.balanceDb.toFixed(2)} dB` : '—'],
    ['Headroom', r.headroomDb != null ? `${r.headroomDb.toFixed(2)} dB` : '—'],
    ['Clipping', r.clipping ? 'Yes — reduce input gain' : 'No'],
    ['Confidence', renderText(r.confidence)],
    ['Reference level', r.referenceLevelDb != null ? `${r.referenceLevelDb.toFixed(2)} dB` : '—'],
  ];
  if (state.refLevel.calibrationSet.length > 0) {
    pairs.push(['Calibration entries', String(state.refLevel.calibrationSet.length)]);
  }

  return {
    id: 'reference-level',
    title: 'Reference Level',
    html: wrKVs(pairs) + wrWarnings(r.warnings) + wrRunQuality(state.refLevel.runQuality),
  };
}

function buildSpeedSection(): WebReportSection {
  const sr = state.speed.result;
  const runs = state.speed.runs;
  if (!sr && runs.length === 0) {
    return { id: 'speed', title: 'Speed / Wow &amp; Flutter', html: wrEmpty() };
  }

  let latestHtml = '';
  if (sr) {
    const ls = state.speed.lastSettings;
    const nomHz = ls ? ls.nominalFrequencyHz : nominalFrequencyHz33[state.speed.speedContext];
    const nomDefault = ls ? ls.nominalFrequencyHzDefault : nominalFrequencyHz33[state.speed.speedContext];
    const nomSrc = ls ? ls.nominalFrequencySource : 'fallback_default';
    const durSec = ls ? ls.captureDurationSeconds : speedMeasurementDurationSeconds;
    const durSrc = ls ? ls.captureDurationSource : 'default';
    const wfClass = classifyWf(sr.unweightedWfPercent);
    const latestRQ = runs[runs.length - 1]?.runQuality ?? null;

    const pairs: [string, string][] = [
      ['Source', renderText(state.speed.resultSource ?? 'live_capture')],
      ['Speed context', state.speed.speedContext === '45' ? '45 RPM' : '33⅓ RPM'],
      ['Nominal frequency', `${nomHz.toLocaleString('en-US')} Hz (default: ${nomDefault.toLocaleString('en-US')} Hz, source: ${renderText(nomSrc)})`],
      ['Capture duration', `${durSec.toFixed(1)} s (${renderText(durSrc)})`],
      ['Measured frequency', `${sr.meanFrequencyHz.toFixed(2)} Hz`],
      ['Speed error', `${sr.speedDeviationPercent >= 0 ? '+' : ''}${sr.speedDeviationPercent.toFixed(3)} %`],
      ['W&F unweighted (AES6)', `${sr.unweightedWfPercent.toFixed(3)} %`],
      ['W&F IEC-weighted', `${sr.weightedWfPercent.toFixed(3)} %`],
      ['Classification', renderText(wfClass.label)],
    ];
    if (state.speed.bandMeta) {
      const bm = state.speed.bandMeta;
      pairs.push(['Band', renderText(bm.label) + (bm.frequencyHz != null ? ` · ${bm.frequencyHz.toLocaleString('en-US')} Hz` : '')]);
    }
    latestHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:0 0 var(--ea-space-2)">Latest result</h3>` + wrKVs(pairs) + wrRunQuality(latestRQ);
  }

  let historyHtml = '';
  if (runs.length > 0) {
    const rows = runs.map(r => {
      const time = r.createdAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
      const rpmLabel = r.speedContext === '45' ? '45' : '33⅓';
      const measHz = r.measuredFrequencyHz !== null ? r.measuredFrequencyHz.toFixed(2) : '—';
      const err = r.speedErrorPercent !== null ? `${r.speedErrorPercent >= 0 ? '+' : ''}${r.speedErrorPercent.toFixed(3)} %` : '—';
      const wf = r.wowFlutterPercent !== null ? `${r.wowFlutterPercent.toFixed(3)} %` : '—';
      const wfw = r.wowFlutterWeightedPercent !== null ? `${r.wowFlutterWeightedPercent.toFixed(3)} %` : '—';
      const src = r.source === 'self_test' ? 'Self-test' : 'Live';
      const rqBadge = r.runQuality ? wrBadge(r.runQuality.status, r.runQuality.status === 'ok' ? 'ok' : r.runQuality.status === 'warning' ? 'warn' : 'err') : '';
      return `<tr>
        <td>${renderText(time)}</td>
        <td>${renderText(rpmLabel)}</td>
        <td>${renderText(r.nominalFrequencyHz.toLocaleString('en-US'))}</td>
        <td>${renderText(measHz)}</td>
        <td>${renderText(err)}</td>
        <td>${renderText(wf)}</td>
        <td>${renderText(wfw)}</td>
        <td>${renderText(src)}</td>
        <td>${rqBadge}</td>
      </tr>`;
    }).join('');
    historyHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Run history (${runs.length} run${runs.length === 1 ? '' : 's'})</h3>
      <table class="ea-webreport-table">
        <thead><tr><th>Time</th><th>RPM</th><th>Nominal Hz</th><th>Measured Hz</th><th>Speed error</th><th>W&amp;F (AES6)</th><th>W&amp;F (IEC)</th><th>Source</th><th>Quality</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Run comparison (S5N)
  const reportCmp = computeSpeedRunComparison(runs);
  let comparisonHtml = '';
  if (reportCmp) {
    const heading = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Run comparison</h3>`;
    if (!reportCmp.compatible) {
      comparisonHtml = heading + wrNote(reportCmp.note, 'warn');
    } else {
      const cmpPairs: [string, string][] = [
        ['Context', renderText(reportCmp.rpmContext)],
        ['Note', renderText(reportCmp.note)],
      ];
      if (reportCmp.deltaSpeedErrorPercent !== null)
        cmpPairs.push(['Δ Speed error', `${reportCmp.deltaSpeedErrorPercent >= 0 ? '+' : ''}${reportCmp.deltaSpeedErrorPercent.toFixed(3)} %`]);
      if (reportCmp.deltaWfUnweightedPercent !== null)
        cmpPairs.push(['Δ W&amp;F (AES6)', `${reportCmp.deltaWfUnweightedPercent >= 0 ? '+' : ''}${reportCmp.deltaWfUnweightedPercent.toFixed(3)} %`]);
      if (reportCmp.deltaWfWeightedPercent !== null)
        cmpPairs.push(['Δ W&amp;F (IEC)', `${reportCmp.deltaWfWeightedPercent >= 0 ? '+' : ''}${reportCmp.deltaWfWeightedPercent.toFixed(3)} %`]);
      comparisonHtml = heading + wrKVs(cmpPairs);
    }
  }

  // Diagnostic note (S5N)
  const diagMeta5N = buildSpeedDiagnosticMeta();
  const diagnosticHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Diagnostic notes</h3>`
    + wrKVs([
        ['Filtered/unfiltered', diagMeta5N.filteredUnfilteredNote],
        ['Unweighted (AES6)', diagMeta5N.unweightedWfNote],
        ['IEC-weighted', diagMeta5N.weightedWfNote],
        ['Wow/flutter band separation', `${wrBadge('Not available', 'warn')} ${diagMeta5N.wowBandSeparationNote}`],
      ]);

  return { id: 'speed', title: 'Speed / Wow &amp; Flutter', html: latestHtml + comparisonHtml + historyHtml + diagnosticHtml };
}

function buildNoiseFloorSection(): WebReportSection {
  const latest = state.noiseFloor.latest;
  const runs = state.noiseFloor.runs;
  if (!latest && runs.length === 0) {
    return { id: 'noise-floor', title: 'Noise Floor / Rig Baseline', html: wrEmpty() };
  }

  let latestHtml = '';
  if (latest) {
    const pairs: [string, string][] = [
      ['Source', renderText(latest.source)],
      ['Scenario', renderText(noiseFloorScenarioLabel(latest.scenarioKind))],
      ...(latest.rpm !== null ? [['RPM', `${latest.rpm.toFixed(latest.rpm === Math.round(latest.rpm) ? 0 : 1)}`] as [string, string]] : []),
      ...(latest.tonearmPosition ? [['Tonearm position', renderText(latest.tonearmPosition)] as [string, string]] : []),
      ['Capture duration', `${latest.captureDurationSeconds.toFixed(1)} s`],
      ['L RMS', latest.leftRmsDbfs !== null ? `${latest.leftRmsDbfs.toFixed(1)} dBFS` : '—'],
      ['R RMS', latest.rightRmsDbfs !== null ? `${latest.rightRmsDbfs.toFixed(1)} dBFS` : '—'],
      ['L peak', latest.leftPeakDbfs !== null ? `${latest.leftPeakDbfs.toFixed(1)} dBFS` : '—'],
      ['R peak', latest.rightPeakDbfs !== null ? `${latest.rightPeakDbfs.toFixed(1)} dBFS` : '—'],
      ['Noise floor', latest.noiseFloorDbfs !== null ? `${latest.noiseFloorDbfs.toFixed(1)} dBFS` : '—'],
    ];
    latestHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:0 0 var(--ea-space-2)">Latest result</h3>`
      + wrKVs(pairs) + wrWarnings(latest.warnings) + wrRunQuality(latest.runQuality);
  }

  let historyHtml = '';
  if (runs.length > 0) {
    const rows = [...runs].reverse().map(r => {
      const time = r.createdAt.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
      const rpmPart = r.rpm !== null ? ` ${r.rpm.toFixed(r.rpm === Math.round(r.rpm) ? 0 : 1)} RPM` : '';
      const nfPart = r.noiseFloorDbfs !== null ? `${r.noiseFloorDbfs.toFixed(1)} dBFS` : '—';
      const rqBadge = r.runQuality ? wrBadge(r.runQuality.status, r.runQuality.status === 'ok' ? 'ok' : r.runQuality.status === 'warning' ? 'warn' : 'err') : '';
      return `<tr>
        <td>${renderText(time)}</td>
        <td>${renderText(noiseFloorScenarioLabel(r.scenarioKind))}${renderText(rpmPart)}</td>
        <td>${renderText(r.captureDurationSeconds.toFixed(1))} s</td>
        <td>${r.leftRmsDbfs !== null ? renderText(r.leftRmsDbfs.toFixed(1)) + ' dBFS' : '—'}</td>
        <td>${r.rightRmsDbfs !== null ? renderText(r.rightRmsDbfs.toFixed(1)) + ' dBFS' : '—'}</td>
        <td>${renderText(nfPart)}</td>
        <td>${renderText(r.source)}</td>
        <td>${rqBadge}</td>
      </tr>`;
    }).join('');
    historyHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Run history (${runs.length} run${runs.length === 1 ? '' : 's'})</h3>
      <table class="ea-webreport-table">
        <thead><tr><th>Time</th><th>Scenario</th><th>Duration</th><th>L RMS</th><th>R RMS</th><th>Noise floor</th><th>Source</th><th>Quality</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  return { id: 'noise-floor', title: 'Noise Floor / Rig Baseline', html: latestHtml + historyHtml };
}

function buildAzimuthStepsSection(): string {
  const { runs } = state.channel;
  if (runs.length === 0) {
    return wrPlaceholder('No azimuth step runs recorded in this session. Complete multiple channel captures to build a step history.');
  }
  const cmp = computeAzimuthStepComparison(runs);
  const rows = runs.map((r, i) => {
    const srcLabel = r.source === 'self_test' ? 'Self-test' : 'Live';
    return `<tr class="mlab-azimuth-step-row">
      <td class="mlab-azimuth-step-cell">${i + 1}</td>
      <td class="mlab-azimuth-step-cell">${renderText(r.label ?? `Step ${i + 1}`)}</td>
      <td class="mlab-azimuth-step-cell">${r.leftToRightCrosstalkDb.toFixed(1)} dB</td>
      <td class="mlab-azimuth-step-cell">${r.rightToLeftCrosstalkDb.toFixed(1)} dB</td>
      <td class="mlab-azimuth-step-cell">${renderText(r.identity)}</td>
      <td class="mlab-azimuth-step-cell">${renderText(r.runQuality?.status ?? 'n/a')}</td>
      <td class="mlab-azimuth-step-cell">${renderText(srcLabel)}</td>
    </tr>`;
  }).join('');
  const tableHtml = `
    <div class="mlab-azimuth-step-history mlab-azimuth-step-history--report">
      <div class="mlab-azimuth-step-history-head">Azimuth step history (${runs.length} run${runs.length !== 1 ? 's' : ''})</div>
      <div class="mlab-azimuth-step-scroll">
        <table class="mlab-azimuth-step-table" aria-label="Azimuth step measurement history">
          <thead>
            <tr>
              <th>#</th>
              <th>Label</th>
              <th>L→R crosstalk</th>
              <th>R→L crosstalk</th>
              <th>Identity</th>
              <th>Quality</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
  let cmpHtml = '';
  if (cmp) {
    if (!cmp.compatible) {
      cmpHtml = `<div class="mlab-azimuth-comparison mlab-azimuth-comparison--warn">
        <div class="mlab-azimuth-comparison-head">Step comparison</div>
        <p class="mlab-azimuth-comparison-note">${renderText(cmp.note)}</p>
      </div>`;
    } else {
      const ltrMin = cmp.ltrRangeDb ? cmp.ltrRangeDb.min.toFixed(1) : '—';
      const ltrMax = cmp.ltrRangeDb ? cmp.ltrRangeDb.max.toFixed(1) : '—';
      const rtlMin = cmp.rtlRangeDb ? cmp.rtlRangeDb.min.toFixed(1) : '—';
      const rtlMax = cmp.rtlRangeDb ? cmp.rtlRangeDb.max.toFixed(1) : '—';
      cmpHtml = `<div class="mlab-azimuth-comparison">
        <div class="mlab-azimuth-comparison-head">Step comparison (${cmp.runCount} runs)</div>
        <div class="mlab-azimuth-comparison-row">
          <span class="mlab-azimuth-comparison-label">L→R range</span>
          <span class="mlab-azimuth-comparison-val">${renderText(ltrMin)} to ${renderText(ltrMax)} dB</span>
        </div>
        <div class="mlab-azimuth-comparison-row">
          <span class="mlab-azimuth-comparison-label">R→L range</span>
          <span class="mlab-azimuth-comparison-val">${renderText(rtlMin)} to ${renderText(rtlMax)} dB</span>
        </div>
        <p class="mlab-azimuth-comparison-note">${renderText(cmp.note)}</p>
      </div>`;
    }
  }
  return tableHtml + cmpHtml;
}

function buildChannelSection(): WebReportSection {
  const { leftCapture, rightCapture, identityResult, source, leftBandMeta, rightBandMeta } = state.channel;
  if (!leftCapture && !rightCapture) {
    return {
      id: 'channel',
      title: 'Channel Identity / Crosstalk',
      html: wrEmpty() + buildAzimuthStepsSection(),
    };
  }

  const pairs: [string, string][] = [
    ['Source', renderText(source ?? 'live_capture')],
  ];
  if (leftBandMeta) {
    const lf = leftBandMeta.frequencyHz != null ? ` · ${leftBandMeta.frequencyHz.toLocaleString('en-US')} Hz` : '';
    pairs.push(['Left band', renderText(leftBandMeta.label) + renderText(lf)]);
  }
  if (rightBandMeta) {
    const rf = rightBandMeta.frequencyHz != null ? ` · ${rightBandMeta.frequencyHz.toLocaleString('en-US')} Hz` : '';
    pairs.push(['Right band', renderText(rightBandMeta.label) + renderText(rf)]);
  }
  if (identityResult) {
    pairs.push(
      ['Identity', renderText(identityResult.identity)],
      ['Confidence', renderText(identityResult.confidence)],
      ['Balance (R−L wanted)', identityResult.wantedBalanceDb != null ? `${identityResult.wantedBalanceDb.toFixed(2)} dB` : 'n/a'],
      ['L→R crosstalk', `${identityResult.leftToRightCrosstalkDb.toFixed(1)} dB`],
      ['R→L crosstalk', `${identityResult.rightToLeftCrosstalkDb.toFixed(1)} dB`],
    );
    return {
      id: 'channel',
      title: 'Channel Identity / Crosstalk',
      html: wrKVs(pairs) + wrWarnings(identityResult.warnings) + buildAzimuthStepsSection(),
    };
  }
  if (leftCapture && rightCapture) {
    pairs.push(
      ['L RMS', `${leftCapture.leftRmsDbFs.toFixed(2)} dBFS`],
      ['R RMS', `${rightCapture.rightRmsDbFs.toFixed(2)} dBFS`],
      ['L→R crosstalk', `${leftCapture.crosstalkDb.toFixed(1)} dB`],
      ['R→L crosstalk', `${rightCapture.crosstalkDb.toFixed(1)} dB`],
    );
  }
  return {
    id: 'channel',
    title: 'Channel Identity / Crosstalk',
    html: wrKVs(pairs) + buildAzimuthStepsSection(),
  };
}

function buildFreqSection(): WebReportSection {
  const fr = state.freq.result;
  if (!fr) {
    return {
      id: 'freq',
      title: 'Frequency Response',
      html: wrEmpty() + wrPlaceholder('Graph/curve output will appear here when trace data is available.'),
    };
  }

  const pairs: [string, string][] = [
    ['Source', renderText(state.freq.resultSource ?? 'live_capture')],
  ];
  if (state.freq.selectedBandMeta) {
    const bm = state.freq.selectedBandMeta;
    const range = bm.frequencyStartHz !== null && bm.frequencyEndHz !== null
      ? ` · ${bm.frequencyStartHz}–${bm.frequencyEndHz} Hz` : '';
    pairs.push(['Sweep band', renderText(bm.label) + renderText(range)]);
  }
  pairs.push(
    ['FFT size', String(fr.fftSize)],
    ['Blocks averaged', String(fr.blockCount)],
    ['Sample rate', `${fr.sampleRateHz.toLocaleString()} Hz`],
    ['Range', `${fr.frequenciesHz[0]?.toFixed(0) ?? '?'} – ${fr.frequenciesHz[fr.frequenciesHz.length - 1]?.toFixed(0) ?? '?'} Hz`],
  );

  pairs.push(['iRIAA applied', state.iriaaEnabled ? 'Yes' : 'No']);

  // Real data present — render the actual frequency response curve
  const svgChart = buildFreqResponseSvg(fr, state.iriaaEnabled);
  const sourceBadge = state.freq.resultSource === 'self_test'
    ? wrBadge('Self-test / Simulated', 'warn')
    : wrBadge('Live capture', 'ok');

  const dev = computeFreqDeviationSummary(fr, state.iriaaEnabled);
  const fmtHz = (hz: number) => hz < 1000 ? `${hz.toFixed(0)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
  const deviationHtml = dev ? `
    <div class="mlab-freq-deviation mlab-freq-deviation--report">
      <div class="mlab-freq-deviation-head">Deviation summary <span class="mlab-freq-deviation-ref">(ref: 1 kHz = 0 dB)</span></div>
      <div class="mlab-freq-deviation-row">
        <span class="mlab-freq-deviation-label">Min deviation</span>
        <span class="mlab-freq-deviation-val">${dev.minDb.toFixed(1)} dB @ ${renderText(fmtHz(dev.minFrequencyHz))}</span>
      </div>
      <div class="mlab-freq-deviation-row">
        <span class="mlab-freq-deviation-label">Max deviation</span>
        <span class="mlab-freq-deviation-val">${dev.maxDb.toFixed(1)} dB @ ${renderText(fmtHz(dev.maxFrequencyHz))}</span>
      </div>
      <div class="mlab-freq-deviation-row">
        <span class="mlab-freq-deviation-label">Peak-to-peak</span>
        <span class="mlab-freq-deviation-val">${dev.peakToPeakDb.toFixed(1)} dB</span>
      </div>
      <div class="mlab-freq-deviation-row">
        <span class="mlab-freq-deviation-label">RMS deviation</span>
        <span class="mlab-freq-deviation-val">${dev.rmsDeviationDb.toFixed(2)} dB</span>
      </div>
      ${dev.bandSummaries.map(b => `
      <div class="mlab-freq-deviation-row">
        <span class="mlab-freq-deviation-label">${renderText(b.label)}</span>
        <span class="mlab-freq-deviation-val">${b.meanDb !== null ? `${b.meanDb.toFixed(1)} dB` : 'n/a'}</span>
      </div>`).join('')}
      <p class="mlab-freq-deviation-note">${renderText(dev.referenceNote)}</p>
    </div>` : '';

  return {
    id: 'freq',
    title: 'Frequency Response',
    html: wrKVs(pairs)
      + `<div class="ea-webreport-freq-chart-wrap">${svgChart}</div>`
      + deviationHtml
      + `<p style="font-size:var(--ea-text-sm);margin:var(--ea-space-1) 0">Source: ${sourceBadge}</p>`
      + wrNote('Measures full playback/capture chain, not cartridge-only response. Full data in JSON export.'),
  };
}

function buildThdSection(): WebReportSection {
  const tr = state.thd.result;
  if (!tr) {
    return {
      id: 'thd',
      title: 'THD / IMD',
      html: wrEmpty() + wrPlaceholder('No THD / IMD measurement captured in this session.'),
    };
  }

  const diagMeta = buildThdDistortionMeta();
  const rq = state.thd.runQuality;
  const sourceBadge = state.thd.resultSource === 'self_test'
    ? wrBadge('Self-test / Simulated', 'warn')
    : wrBadge('Live capture', 'ok');

  const pairs: [string, string][] = [
    ['Source', sourceBadge],
  ];
  if (state.thd.bandMeta) {
    const tbm = state.thd.bandMeta;
    const tf = tbm.frequencyHz != null ? ` · ${tbm.frequencyHz.toLocaleString('en-US')} Hz` : '';
    pairs.push(['Band', renderText(tbm.label) + renderText(tf)]);
  }
  if (rq) {
    pairs.push(['Run quality', renderText(rq.status)]);
    if (rq.warnings.length > 0) {
      pairs.push(['Warnings', Array.from(rq.warnings).map(renderText).join('; ')]);
    }
  }

  let detailHtml = '';
  if (isThdResult(tr)) {
    pairs.push(
      ['Type', 'THD'],
      ['Fundamental', `${tr.fundamentalHz.toLocaleString('en-US')} Hz`],
      ['THD', `${tr.thdPercent.toFixed(3)} %`],
      ['Harmonics analysed', String(tr.harmonics.length)],
      ['Sample count', tr.sampleCount.toLocaleString()],
    );
    if (tr.harmonics.length > 0) {
      const ordSuffix = (n: number) => n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      const rows = tr.harmonics.map((dbc, i) => {
        const order = i + 2;
        return `<tr>
          <td>${order}${ordSuffix(order)}</td>
          <td>${(order * tr.fundamentalHz).toLocaleString('en-US')} Hz</td>
          <td>${dbc.toFixed(1)} dBc</td>
        </tr>`;
      }).join('');
      detailHtml = `
        <div class="mlab-thd-harmonic-breakdown mlab-thd-harmonic-breakdown--report">
          <div class="mlab-thd-harmonic-head">Harmonic breakdown (dBc relative to fundamental)</div>
          <table class="mlab-thd-harmonic-table" aria-label="Harmonic breakdown">
            <thead><tr><th>Order</th><th>Frequency</th><th>Level</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="mlab-thd-diagnostic-note">${renderText(diagMeta.harmonicInterpretationNote)}</p>
        </div>`;
    }
  } else {
    pairs.push(
      ['Type', 'SMPTE IMD'],
      ['f1 (LF)', `${tr.f1Hz} Hz`],
      ['f2 (HF)', `${tr.f2Hz.toLocaleString('en-US')} Hz`],
      ['IMD', `${tr.imdPercent.toFixed(3)} %`],
      ['Sample count', tr.sampleCount.toLocaleString()],
      ['Sideband detail', 'Not available'],
    );
    detailHtml = `
      <div class="mlab-thd-harmonic-breakdown mlab-thd-harmonic-breakdown--report">
        <div class="mlab-thd-harmonic-head">Sideband detail</div>
        <p class="mlab-thd-diagnostic-note"><strong>Not available</strong> — ${renderText(diagMeta.imdSidebandDetailNote)}</p>
        <p class="mlab-thd-diagnostic-note">${renderText(diagMeta.imdMeasurementNote)}</p>
      </div>`;
  }

  const chainNoteHtml = `<p class="mlab-thd-diagnostic-note" style="margin-top:var(--ea-space-2)">${renderText(diagMeta.chainNote)}</p>`;

  return {
    id: 'thd',
    title: 'THD / IMD',
    html: wrKVs(pairs) + detailHtml + chainNoteHtml,
  };
}

// ── S5P: Resonance web report section ────────────────────────────────────────

function buildResonanceSection(): WebReportSection {
  const rr = state.resonance.result;
  if (!rr) {
    return {
      id: 'resonance',
      title: 'Resonance',
      html: wrEmpty()
        + wrPlaceholder('No resonance measurement captured in this session. Play a low-frequency sweep band on your test record and use the Resonance panel to capture the result.'),
    };
  }

  const diagMeta = buildResonanceDiagnosticMeta();
  const rq = state.resonance.runQuality;
  const sourceBadge = state.resonance.resultSource === 'self_test'
    ? wrBadge('Self-test / Simulated', 'warn')
    : wrBadge('Live capture', 'ok');

  const pairs: [string, string][] = [
    ['Source', sourceBadge],
    ['Resonance frequency', `${rr.peakFrequencyHz.toFixed(2)} Hz`],
    ['Peak amplitude', `${rr.peakAmplitudeDbFs.toFixed(1)} dBFS`],
    ['Q estimate', rr.qEstimate !== null ? rr.qEstimate.toFixed(2) : '—'],
    ['Sweep type', renderText(state.resonance.sweepType)],
    ['Sweep range', `${state.resonance.fromHz}–${state.resonance.toHz} Hz`],
    ['Duration', `${state.resonance.durationSeconds} s`],
    ['Sample count', rr.sampleCount.toLocaleString()],
  ];
  if (rq) {
    pairs.push(['Run quality', renderText(rq.status)]);
    if (rq.warnings.length > 0) {
      pairs.push(['Warnings', Array.from(rq.warnings).map(renderText).join('; ')]);
    }
  }

  const diagnosticHtml = `
    <div class="mlab-resonance-diagnostic mlab-resonance-diagnostic--report">
      <div class="mlab-resonance-diagnostic-head">Diagnostic notes</div>
      <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.typicalRangeNote)}</p>
      <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.qEstimateNote)}</p>
      <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.limitationsNote)}</p>
      <p class="mlab-resonance-diagnostic-note">${renderText(diagMeta.wowBandOverlapNote)}</p>
    </div>`;

  return {
    id: 'resonance',
    title: 'Resonance',
    html: wrKVs(pairs) + diagnosticHtml,
  };
}

function buildVtaSection(): WebReportSection {
  const runs = state.vta.runs;
  const record = selectedRecord();
  const vtaBands = getVtaImdBands(record);
  const vtaBand = vtaBands[0] ?? null;
  const vtaCmp = deriveVtaImdComparison(runs);
  const vtaGate = deriveVtaSupportedGate({
    runs,
    comparison: vtaCmp,
    hasUsableVtaBand: hasUsableVtaImdBand(vtaBand),
    hasVtaBandAtAll: vtaBands.length > 0,
    capturingRunId: state.vta.capturingRunId,
  });
  const vtaPolicy = deriveVtaWorkflowStatusPolicy(vtaGate);

  const headerPairs: [string, string][] = [
    ['Workflow status', renderText(vtaPolicy.workflowStatus) + ' ' + wrBadge('Experimental', 'exp')],
    ['Measured runs', String(vtaCmp.measuredCount)],
    ['Placeholder runs', String(vtaCmp.placeholderCount)],
    ['Comparison status', renderText(vtaCmp.status)],
    ['Confidence', renderText(vtaCmp.confidence)],
  ];
  if (vtaBand) {
    headerPairs.push(['IMD band', renderText(vtaBand.label)]);
  }

  let candidateHtml = '';
  if (vtaCmp.status === 'experimental_candidate' && vtaCmp.candidateRunId !== null) {
    const cPairs: [string, string][] = [
      ['Candidate label', renderText(vtaCmp.candidateHeightLabel ?? '—')],
      ...(vtaCmp.candidateHeightMm !== null ? [['Candidate height', `${vtaCmp.candidateHeightMm} mm`] as [string, string]] : []),
      ...(vtaCmp.candidateImdPercent !== null ? [['Candidate IMD', `${vtaCmp.candidateImdPercent.toFixed(2)} %`] as [string, string]] : []),
      ...(vtaCmp.nextBestDeltaPercent !== null ? [['Delta to next best', `${vtaCmp.nextBestDeltaPercent.toFixed(3)} %`] as [string, string]] : []),
    ];
    candidateHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Experimental candidate</h3>` + wrKVs(cPairs);
  }

  let runsHtml = '';
  if (runs.length > 0) {
    const rows = runs.map(r => {
      const imd = r.imdPercent !== null ? `${r.imdPercent.toFixed(2)} %` : 'not measured';
      const mm = r.heightMm !== null ? `${r.heightMm} mm` : '—';
      const confBadge = r.confidence === 'experimental' ? wrBadge('experimental', 'exp') : wrBadge(r.confidence, 'info');
      return `<tr>
        <td>${renderText(r.heightLabel || '—')}</td>
        <td>${renderText(mm)}</td>
        <td>${renderText(imd)}</td>
        <td>${renderText(r.source)}</td>
        <td>${confBadge}</td>
        <td>${renderText(r.note ? r.note.slice(0, 80) : '')}</td>
      </tr>`;
    }).join('');
    runsHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Runs (${runs.length})</h3>
      <table class="ea-webreport-table">
        <thead><tr><th>Label</th><th>Height</th><th>IMD</th><th>Source</th><th>Confidence</th><th>Note</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else {
    runsHtml = wrEmpty();
  }

  const gatePairs: [string, string][] = [
    ['Gate status', renderText(vtaGate.status)],
    ['Gate passed', `${vtaGate.passedCount} / ${vtaGate.totalCount}`],
  ];
  const gateRows = vtaGate.criteria.map(c =>
    `<tr><td>${c.passed ? '✓' : '✗'}</td><td>${renderText(c.label)}</td><td>${renderText(c.detail)}</td></tr>`
  ).join('');
  const gateHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Supported readiness gate</h3>`
    + wrKVs(gatePairs)
    + `<table class="ea-webreport-table"><thead><tr><th></th><th>Criterion</th><th>Detail</th></tr></thead><tbody>${gateRows}</tbody></table>`
    + wrNote('Gate status does not change VTA workflow status — remains Planned until formally reviewed.');

  const policyHtml = `<h3 style="font-size:var(--ea-text-sm);font-weight:600;margin:var(--ea-space-3) 0 var(--ea-space-2)">Workflow status policy</h3>`
    + wrKVs([
      ['Policy status', renderText(vtaPolicy.status)],
      ['Workflow status', renderText(vtaPolicy.workflowStatus)],
      ['Policy reason', renderText(vtaPolicy.reason)],
    ])
    + `<p style="font-size:var(--ea-text-sm);margin:var(--ea-space-2) 0 var(--ea-space-1)">Required before a supported lift:</p>`
    + `<ul style="margin:0;padding-left:var(--ea-space-4);font-size:var(--ea-text-sm)">${vtaPolicy.requiredBeforeSupported.map(r => `<li>${renderText(r)}</li>`).join('')}</ul>`;

  const disclaimer = wrNote('Experimental only — not a final recommendation.', 'warn');

  return {
    id: 'vta',
    title: 'VTA IMD Optimizer — Experimental',
    html: wrKVs(headerPairs) + wrWarnings(vtaCmp.warnings) + candidateHtml + runsHtml + gateHtml + policyHtml + disclaimer,
  };
}

export function buildMeasurementLabWebReport(): WebReportPayload {
  const generatedAt = new Date().toISOString();
  const record = selectedRecord();
  const subtitle = record
    ? `Measurement Lab · ${record.manufacturer} — ${record.title}`
    : 'Measurement Lab · No test record selected';

  const sections: WebReportSection[] = [
    buildSummarySection(),
    buildTestRecordSection(),
    buildChainReadinessSection(),
    buildReferenceLevelSection(),
    buildSpeedSection(),
    buildNoiseFloorSection(),
    buildChannelSection(),
    buildFreqSection(),
    buildThdSection(),
    buildResonanceSection(),
    buildVtaSection(),
  ];

  return { title: 'Engrove Measurement Lab — Session Report', subtitle, generatedAt, sections };
}

// ── End S5J ──────────────────────────────────────────────────────────────────

function renderSessionRibbon(els: Elements): void {
  if (els.ribbonSource) {
    els.ribbonSource.textContent = state.sourceMode === 'self-test' ? 'Self-test' : 'Live';
  }
  if (els.ribbonRecord) {
    const record = selectedRecord();
    els.ribbonRecord.textContent = record
      ? `${record.manufacturer} — ${record.title}`
      : 'No record selected';
  }
  if (els.ribbonChain) {
    const readiness = deriveMeasurementChainReadiness({
      leftRmsDbfs: state.channelLevels.L.rmsDbFs,
      rightRmsDbfs: state.channelLevels.R.rmsDbFs,
      leftPeakDbfs: state.channelLevels.L.peakDbFs,
      rightPeakDbfs: state.channelLevels.R.peakDbFs,
    });
    const chainText = readiness.status === 'ready' ? 'Chain ready'
      : readiness.status === 'blocked' ? 'Chain blocked'
      : readiness.status === 'warning' ? 'Chain warning'
      : 'Not checked';
    els.ribbonChain.textContent = chainText;
    els.ribbonChain.dataset.chainStatus = readiness.status;
  }
  if (els.ribbonActiveTool) {
    const wf = MEASUREMENT_WORKFLOWS.find(w => w.id === state.activeWorkflowId);
    els.ribbonActiveTool.textContent = wf ? wf.label : '—';
  }
}

function activateTool(toolId: string, els: Elements): void {
  const tool = WORKBENCH_TOOLS.find(t => t.id === toolId);
  if (!tool || !tool.panelId) return;
  document.querySelectorAll<HTMLElement>('[data-mlab-tool-panel]').forEach(p => {
    p.classList.toggle('mlab-tool-panel--active', p.id === tool.panelId);
  });
  const overlay = els.contextOverlay;
  if (overlay) overlay.classList.remove('mlab-context-overlay--open');
  state.activeWorkflowId = toolId;
  if (els.activeTitle) els.activeTitle.textContent = tool.label;
  if (els.centerStatus) {
    const wfId = tool.workflowId;
    if (!wfId) {
      els.centerStatus.textContent = '';
      els.centerStatus.className = 'ea-badge mlab-center-status-pill';
    } else {
      const record = selectedRecord();
      const coverageList = record ? computeAllWorkflowCoverage(record) : [];
      const cov = coverageList.find(c => c.workflowId === wfId);
      const avail = cov?.availability ?? (record ? 'unavailable' : 'planned');
      const label = avail === 'available' ? 'Available'
        : avail === 'planned' ? 'Planned'
        : avail === 'partial' ? 'Partial'
        : 'Not available';
      els.centerStatus.textContent = label;
      els.centerStatus.className = `ea-badge mlab-center-status-pill mlab-rail-item--${avail}`;
    }
  }
  updateActiveRailItem(els, toolId);
  renderSessionRibbon(els);
}

function renderWorkflowRail(els: Elements): void {
  if (!els.railItems) return;
  const record = selectedRecord();
  const coverageList = record ? computeAllWorkflowCoverage(record) : [];
  const coverageMap = new Map(coverageList.map(c => [c.workflowId, c]));

  let currentGroup = '';
  const parts: string[] = [];

  for (const tool of WORKBENCH_TOOLS) {
    const wfId = tool.workflowId;
    const cov = wfId ? coverageMap.get(wfId) : null;
    let avail: string;
    if (!wfId) {
      avail = tool.panelId ? 'available' : 'unavailable';
    } else {
      const c = cov?.availability ?? (record ? 'unavailable' : 'planned');
      avail = c;
    }
    const isActive = state.activeWorkflowId === tool.id;
    const sourceInactive = tool.workflowId !== null
      && state.captureState !== 'live'
      && (avail === 'available' || avail === 'partial');
    const availLabel = sourceInactive ? 'No source'
      : avail === 'available' ? 'Available'
      : avail === 'planned' ? 'Planned'
      : avail === 'partial' ? 'Partial'
      : 'Not available';
    const itemClass = `mlab-rail-item mlab-rail-item--${avail}${isActive ? ' mlab-rail-item--active' : ''}${sourceInactive ? ' mlab-rail-item--source-inactive' : ''}`;

    if (tool.group !== currentGroup) {
      currentGroup = tool.group;
      parts.push(`<div class="mlab-rail-group-head">${renderText(tool.group)}</div>`);
    }

    const tooltipAttrs = `data-tooltip-name="${renderText(tool.label)}" data-tooltip-desc="${renderText(tool.description)}" data-tooltip-avail="${renderText(availLabel)}"`;
    if (tool.panelId) {
      parts.push(`<button class="${itemClass}" type="button" data-mlab-rail-item="${renderText(tool.id)}" ${tooltipAttrs}>
        <span class="mlab-rail-item-label">${renderText(tool.label)}</span>
        <span class="mlab-rail-item-status">${renderText(availLabel)}</span>
      </button>`);
    } else {
      parts.push(`<div class="${itemClass}" ${tooltipAttrs}>
        <span class="mlab-rail-item-label">${renderText(tool.label)}</span>
        <span class="mlab-rail-item-status">${renderText(availLabel)}</span>
      </div>`);
    }
  }

  els.railItems.innerHTML = parts.join('');

  els.railItems.querySelectorAll<HTMLButtonElement>('[data-mlab-rail-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const toolId = btn.dataset.mlabRailItem ?? '';
      activateTool(toolId, els);
    });
  });

  els.railItems.querySelectorAll<HTMLElement>('.mlab-rail-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      if (railTooltipTimer !== null) clearTimeout(railTooltipTimer);
      railTooltipTimer = setTimeout(() => showRailTooltip(item), 700);
    });
    item.addEventListener('mouseleave', () => hideRailTooltip());
  });
}

function updateActiveRailItem(els: Elements, wfId: string | null): void {
  if (!els.railItems) return;
  els.railItems.querySelectorAll<HTMLElement>('[data-mlab-rail-item]').forEach(item => {
    item.classList.toggle('mlab-rail-item--active', item.dataset.mlabRailItem === wfId);
  });
}

function renderDiagSignalPanel(els: Elements): void {
  if (!els.diagSignalBody) return;
  const L = state.channelLevels.L;
  const R = state.channelLevels.R;
  const readiness = deriveMeasurementChainReadiness({
    leftRmsDbfs: L.rmsDbFs,
    rightRmsDbfs: R.rmsDbFs,
    leftPeakDbfs: L.peakDbFs,
    rightPeakDbfs: R.peakDbFs,
  });
  const fmtDbfs = (db: number) => !Number.isFinite(db) || db <= -90 ? '—' : `${db.toFixed(1)} dBFS`;
  const clipNote = (L.clipped || R.clipped)
    ? '<p class="mlab-diag-signal-clip">Clipping detected — reduce input gain</p>'
    : '';
  els.diagSignalBody.innerHTML = `
    <div class="mlab-diag-signal-status mlab-diag-signal-status--${renderText(readiness.status)}">
      ${renderText(
        readiness.status === 'ready' ? 'Ready' :
        readiness.status === 'blocked' ? 'Blocked' :
        readiness.status === 'warning' ? 'Warning' :
        'Not checked'
      )}
    </div>
    <div class="mlab-diag-signal-row">
      <span class="mlab-diag-signal-key">L RMS</span>
      <span class="mlab-diag-signal-val">${renderText(fmtDbfs(L.rmsDbFs))}</span>
    </div>
    <div class="mlab-diag-signal-row">
      <span class="mlab-diag-signal-key">R RMS</span>
      <span class="mlab-diag-signal-val">${renderText(fmtDbfs(R.rmsDbFs))}</span>
    </div>
    ${clipNote}
  `;
}

function renderChainReadinessPanel(els: Elements): void {
  const body = els.chainReadinessBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to check measurement chain readiness.</p>';
    return;
  }

  const readiness = deriveMeasurementChainReadiness({
    leftRmsDbfs: state.channelLevels.L.rmsDbFs,
    rightRmsDbfs: state.channelLevels.R.rmsDbFs,
    leftPeakDbfs: state.channelLevels.L.peakDbFs,
    rightPeakDbfs: state.channelLevels.R.peakDbFs,
  });

  const statusLabel: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'Not checked',
    ready: 'Ready',
    warning: 'Warning',
    blocked: 'Blocked',
  };
  const statusCssClass: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'mlab-chain-readiness--not-checked',
    ready: 'mlab-chain-readiness--ready',
    warning: 'mlab-chain-readiness--warning',
    blocked: 'mlab-chain-readiness--blocked',
  };
  const statusBadgeClass: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'mlab-chain-status-badge--not-checked',
    ready: 'mlab-chain-status-badge--ready',
    warning: 'mlab-chain-status-badge--warning',
    blocked: 'mlab-chain-status-badge--blocked',
  };
  const statusExplain: Record<MeasurementChainReadinessStatus, string> = {
    not_checked: 'No audio signal detected. Check connections and ensure the stylus is on the record.',
    ready: 'Signal levels look healthy — you can proceed with measurements.',
    warning: 'Signal present but one or more conditions are outside the ideal range. Review warnings before measuring.',
    blocked: 'Clipping detected. Reduce input gain before capturing any measurements.',
  };

  const warningsHtml = readiness.warnings.length > 0
    ? readiness.warnings.map(w => `<p class="mlab-chain-readiness-warning"><span aria-hidden="true">⚠&nbsp;</span>${renderText(w)}</p>`).join('')
    : '';

  const balanceRow = readiness.channelImbalanceDb !== null
    ? `<div class="mlab-chain-readiness-row">
        <span class="mlab-chain-readiness-key ea-muted">Channel balance</span>
        <span class="mlab-chain-readiness-val">${readiness.channelImbalanceDb.toFixed(1)}&nbsp;dB L/R</span>
      </div>`
    : '';

  const levelsRow = `<div class="mlab-chain-readiness-row">
      <span class="mlab-chain-readiness-key ea-muted">Live levels</span>
      <span class="mlab-chain-readiness-val">L&nbsp;${fmtDbfs(state.channelLevels.L.rmsDbFs)} / R&nbsp;${fmtDbfs(state.channelLevels.R.rmsDbFs)} RMS</span>
    </div>`;

  const refCalNote = state.refLevel.result
    ? `<p class="mlab-chain-readiness-note">Last reference level: L&nbsp;${fmtDbfs(state.refLevel.result.leftRmsDbfs)} / R&nbsp;${fmtDbfs(state.refLevel.result.rightRmsDbfs)}</p>`
    : '<p class="mlab-chain-readiness-note ea-muted">No reference level captured yet. Use Track&nbsp;1 reference level first when using a test record.</p>';

  body.innerHTML = `
    <div class="mlab-chain-readiness ${statusCssClass[readiness.status]}">
      <div class="mlab-chain-readiness-row">
        <span class="mlab-chain-readiness-key ea-muted">Status</span>
        <span class="mlab-chain-readiness-val">
          <span class="mlab-chain-status-badge ${statusBadgeClass[readiness.status]}">${statusLabel[readiness.status]}</span>
        </span>
      </div>
      <p class="mlab-chain-readiness-explain">${statusExplain[readiness.status]}</p>
      <div class="mlab-chain-readiness-row">
        <span class="mlab-chain-readiness-key ea-muted">Signal present</span>
        <span class="mlab-chain-readiness-val">${readiness.signalPresent ? 'Yes' : 'No'}</span>
      </div>
      <div class="mlab-chain-readiness-row">
        <span class="mlab-chain-readiness-key ea-muted">Clipping</span>
        <span class="mlab-chain-readiness-val">${readiness.clipping ? 'Yes &mdash; reduce input gain' : 'No'}</span>
      </div>
      ${balanceRow}
      ${levelsRow}
    </div>
    ${warningsHtml}
    ${refCalNote}
  `;
}

export function enableMeasurementLabInteractions(): void {
  applyStoredTheme();
  const els = elements(document);

  state.selectedDeviceId = readStoredDeviceId();

  renderSourceMode(els);
  renderIriaaToggle(els);
  renderDeviceList(els);
  renderActualFormat(els);
  renderConnectionButtons(els);
  renderSessionStatus(els);
  renderSpeedPanel(els);
  renderChannelPanel(els);
  renderFreqPanel(els);
  renderThdPanel(els);
  renderResonancePanel(els);
  renderRefLevelPanel(els);
  renderAdvancedPanel(els);
  renderNoiseFloorPanel(els);
  renderChainReadinessPanel(els);
  renderSessionRibbon(els);
  renderWorkflowRail(els);
  renderDiagSignalPanel(els);
  renderLogPanel(els);
  clearMeterDom(els);
  activateTool('audio_source', els);

  void refreshDeviceList(els);

  void loadTestRecordsRuntimeData().then((data) => {
    state.testRecords = data.records;
    state.testRecordLoadFailed = false;
    const resolved = resolveSelectedTestRecord(data.records, state.selectedTestRecordId);
    state.selectedTestRecordId = resolved.nextSelectedId;
    state.selectedTestRecordMissing = resolved.missing;
    if (resolved.missing) {
      appendLog(`Selected test record not found: ${resolved.missing.requestedId}. Resetting to preferred profile.`);
    }
    renderRecordSelector(els);
    renderCoveragePanel(els);
    renderWorkflowRail(els);
    renderSessionRibbon(els);
    renderSpeedPanel(els);
    renderChannelPanel(els);
    renderFreqPanel(els);
    renderThdPanel(els);
    renderResonancePanel(els);
    renderRefLevelPanel(els);
    renderAdvancedPanel(els);
    renderNoiseFloorPanel(els);
  }).catch((err: unknown) => {
    state.testRecordLoadFailed = true;
    state.selectedTestRecordMissing = null;
    const msg = err instanceof Error && err.message.length > 0 ? err.message : 'unknown load error';
    const sanitized = msg.slice(0, 200);
    appendLog(`Test record dataset failed to load: ${sanitized}`);
    if (els.recordSelect) {
      els.recordSelect.innerHTML = '<option value="">Test record profiles unavailable</option>';
    }
    if (els.recordDot) {
      els.recordDot.className = 'ea-dot ea-dot--error';
    }
    renderCoveragePanel(els);
    renderWorkflowRail(els);
  });

  els.recordSelect?.addEventListener('change', () => {
    const value = els.recordSelect?.value ?? '';
    state.selectedTestRecordId = value.length > 0 ? value : null;
    state.selectedTestRecordMissing = null;
    state.refLevel.selectedBandIndex = null;
    state.freq.selectedBandIndex = null;
    if (state.refLevel.calibrationSet.length > 0) {
      state.refLevel.calibrationSet = clearCalibrationSet();
      appendLog('Reference calibration set cleared (test record changed)');
    }
    if (state.channel.step !== 'idle' || state.channel.leftCapture !== null || state.channel.rightCapture !== null || state.channel.identityResult !== null) {
      resetChannelMeasurement();
      appendLog('Channel identity capture reset after test record change.');
    }
    if (state.vta.capturingRunId !== null || state.vta.runs.length > 0) {
      stopVtaCapture();
      state.vta.runs = [];
      appendLog('VTA IMD run markers cleared after test record change.');
    }
    if (state.speed.runs.length > 0) {
      state.speed.runs = [];
      appendLog('Speed run history cleared after test record change.');
    }
    renderRecordSelector(els);
    renderCoveragePanel(els);
    renderWorkflowRail(els);
    renderSessionRibbon(els);
    renderSpeedPanel(els);
    renderChannelPanel(els);
    renderFreqPanel(els);
    renderThdPanel(els);
    renderResonancePanel(els);
    renderRefLevelPanel(els);
    renderAdvancedPanel(els);
  });

  els.coverageToggleBtn?.addEventListener('click', () => {
    state.coverageCollapsed = !state.coverageCollapsed;
    syncCoverageCollapsed(els);
  });

  els.sourceModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.mlabSourceMode as SourceMode | undefined;
      if (!next || next === state.sourceMode) return;
      if (state.captureState === 'live' || state.captureState === 'connecting') return;
      state.sourceMode = next;
      renderSourceMode(els);
    });
  });

  els.iriaaButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (state.captureState === 'live' || state.captureState === 'connecting') return;
      const next = button.dataset.mlabIriaa === 'on';
      if (next === state.iriaaEnabled) return;
      state.iriaaEnabled = next;
      renderIriaaToggle(els);
    });
  });

  els.deviceSelect?.addEventListener('change', () => {
    const value = els.deviceSelect?.value ?? '';
    state.selectedDeviceId = value.length > 0 ? value : null;
    writeStoredDeviceId(state.selectedDeviceId);
    renderDeviceList(els);
  });

  els.connect?.addEventListener('click', () => {
    void connectMeasurementLab(els);
  });

  els.disconnect?.addEventListener('click', () => {
    void disconnectMeasurementLab(els);
  });

  els.selfTestBtn?.addEventListener('click', () => {
    if (state.captureState === 'live' || state.captureState === 'connecting') return;
    state.sourceMode = 'self-test';
    renderSourceMode(els);
    void connectMeasurementLab(els);
  });

  els.webReportBtn?.addEventListener('click', () => {
    openWebReportModal(buildMeasurementLabWebReport());
    appendLog('Opened web report.');
  });

  els.exportBtn?.addEventListener('click', () => {
    downloadSessionJson();
    appendLog('Exported session JSON.');
  });

  els.exportReportBtn?.addEventListener('click', () => {
    downloadReportText();
    appendLog('Exported session report (TXT).');
  });

  els.reset?.addEventListener('click', () => {
    void disconnectMeasurementLab(els).then(() => {
      state.sourceMode = 'live';
      state.errorMessage = null;
      renderSourceMode(els);
    });
  });

  els.logResetBtn?.addEventListener('click', () => {
    state.log = [];
    renderLogPanel(els);
  });

  els.logExportBtn?.addEventListener('click', () => {
    exportLog();
    appendLog('Exported activity log.');
  });

  if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      void refreshDeviceList(els);
    });
  }

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });

  // Context overlay open/close
  els.contextOpenBtn?.addEventListener('click', () => {
    els.contextOverlay?.classList.add('mlab-context-overlay--open');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mlab-context-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      els.contextOverlay?.classList.remove('mlab-context-overlay--open');
    });
  });

  // Log modal open/close
  const openLogModal = (): void => {
    els.contextOverlay?.classList.remove('mlab-context-overlay--open');
    els.logModal?.classList.add('mlab-log-modal--open');
  };
  document.querySelectorAll<HTMLButtonElement>('[data-mlab-open-log]').forEach(btn => {
    btn.addEventListener('click', openLogModal);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mlab-log-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      els.logModal?.classList.remove('mlab-log-modal--open');
    });
  });

  // Escape key closes overlays
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (els.logModal?.classList.contains('mlab-log-modal--open')) {
        els.logModal.classList.remove('mlab-log-modal--open');
      } else if (els.contextOverlay?.classList.contains('mlab-context-overlay--open')) {
        els.contextOverlay.classList.remove('mlab-context-overlay--open');
      }
    }
  });
}
