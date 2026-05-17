import { renderText } from '../../../shared/ui/renderSafe';
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
import { createStereoChannelCapture, type StereoCapture, type ChannelCaptureMetrics } from '../dsp/stereoCaptureNode';
import { createSweepCapture, type SweepCapture } from '../dsp/sweepCaptureNode';
import { summariseChannelBalance } from '../engine/crosstalk';
import { computeFrequencyResponse, type FreqResponseResult } from '../engine/freqResponse';
import { computeRiaaMagnitudeDb } from '../engine/iriaaFilter';
import { analyseTHD, analyseIMD, type ThdResult, type ImdResult } from '../engine/thd';
import { analyseResonance, type ResonanceResult, type ResonanceSweepType } from '../engine/resonance';
import { analyzeReferenceLevel, type ReferenceLevelResult } from '../engine/referenceLevel';
import {
  addOrReplaceEntry,
  clearCalibrationSet,
  find1kHzEntry,
  relativeTo1kHz,
  type CalibrationSetEntry,
} from '../engine/referenceCalibrationSet';
import { loadTestRecordsRuntimeData, getPreferredRecord, type TestRecord, type TestBand, type TestBandPurpose } from '../data/loadTestRecords';
import { computeAllWorkflowCoverage, MEASUREMENT_WORKFLOWS, type WorkflowAvailability } from '../data/measurementWorkflows';

const WORKFLOW_PANEL_TARGETS: Readonly<Record<string, string>> = {
  wow_flutter: 'mlab-speed-panel',
  channel_identity: 'mlab-channel-panel',
  azimuth_crosstalk: 'mlab-channel-panel',
  frequency_response: 'mlab-freq-panel',
  reference_level: 'mlab-reflevel-panel',
  vta_imd_optimizer: 'mlab-thd-panel',
  vertical_resonance: 'mlab-resonance-panel',
};

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

type SpeedState = {
  referenceHz: number;
  active: boolean;
  elapsedSeconds: number;
  result: SpeedFlutterResult | null;
  capture: SpeedFlutterCapture | null;
};

type ChannelStep = 'idle' | 'left-recording' | 'left-done' | 'right-recording' | 'done';
type ChannelStateBag = {
  step: ChannelStep;
  elapsedSeconds: number;
  leftCapture: ChannelCaptureMetrics | null;
  rightCapture: ChannelCaptureMetrics | null;
  capture: StereoCapture | null;
};

type FreqState = {
  active: boolean;
  elapsedSeconds: number;
  result: FreqResponseResult | null;
  capture: SweepCapture | null;
};

type ThdMode = 'thd' | 'imd';
type ThdStateBag = {
  mode: ThdMode;
  fundamentalHz: number;
  imdF1Hz: number;
  imdF2Hz: number;
  active: boolean;
  elapsedSeconds: number;
  result: ThdResult | ImdResult | null;
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
  capture: SweepCapture | null;
};

type SelectedTestRecordMissing = {
  readonly requestedId: string;
  readonly recoveredToId: string | null;
  readonly recoveredToLabel: string | null;
};

type RefLevelCapture = {
  readonly stop: () => void;
};

type RefLevelStateBag = {
  active: boolean;
  elapsedSeconds: number;
  result: ReferenceLevelResult | null;
  resultSource: 'live_capture' | 'self_test' | null;
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
  refLevel: RefLevelStateBag;
};

/*
 * The token/layout drift checker scans source text for class names.
 * Classes that are only ever toggled at runtime via classList.toggle
 * are invisible to it and surface as "styled but not emitted" noise.
 * Keep this static inventory in sync with every classList.toggle call
 * site below; it has no runtime effect.
 */
const tokenLayoutGeneratedClassNames =
  'mlab-segmented-option--active mlab-meter-clip--active mlab-wf-grade--excellent mlab-wf-grade--good mlab-wf-grade--marginal mlab-wf-grade--poor mlab-coverage-card--available mlab-coverage-card--planned mlab-coverage-card--partial mlab-coverage-card--unavailable mlab-coverage-badge--available mlab-coverage-badge--planned mlab-coverage-badge--partial mlab-coverage-badge--unavailable mlab-coverage-panel--collapsed ea-dot--error mlab-panel--target-highlight mlab-reflevel-clip--active';
void tokenLayoutGeneratedClassNames;

const speedMeasurementDurationSeconds = 30;
const defaultSpeedReferenceHz = 3150;
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
    active: false,
    elapsedSeconds: 0,
    result: null,
    capture: null,
  },
  channel: {
    step: 'idle',
    elapsedSeconds: 0,
    leftCapture: null,
    rightCapture: null,
    capture: null,
  },
  freq: {
    active: false,
    elapsedSeconds: 0,
    result: null,
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
    capture: null,
  },
  log: [],
  selectedTestRecordId: null,
  testRecords: [],
  testRecordLoadFailed: false,
  selectedTestRecordMissing: null,
  coverageCollapsed: false,
  refLevel: {
    active: false,
    elapsedSeconds: 0,
    result: null,
    resultSource: null,
    selectedBandIndex: null,
    capture: null,
    calibrationSet: [],
  },
};

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
        <span class="ea-contextbar__description">Capture audio from a test record via your ADC. Foundation slice: device selection, strict constraints and live level metering.</span>
      </div>
    </section>
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
    <section class="ea-panel" aria-labelledby="mlab-source-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">01</span>
        <span id="mlab-source-title">Audio source</span>
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
        <p class="ea-muted" data-mlab-session-status>Capture is idle. Choose a source mode and click Connect to begin.</p>
        <div class="mlab-session-controls">
          <button class="ea-button ea-button--primary" type="button" data-mlab-connect>Connect</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-disconnect disabled>Disconnect</button>
        </div>
        <div class="mlab-self-test-callout" aria-label="Self-test option">
          <p>No interface connected? Run a simulated test record to see how the lab works.</p>
          <button class="ea-button ea-button--secondary" type="button" data-mlab-run-self-test>Run self-test</button>
        </div>
        <p class="ea-muted mlab-honesty" data-mlab-honesty>Sample-rate honesty report will appear after the audio context is running.</p>
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
    <section id="mlab-thd-panel" data-mlab-tool-panel="vta_imd_optimizer" class="ea-panel" aria-labelledby="mlab-thd-title">
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

function visualizationMarkup(): string {
  return `
    <div class="mlab-viz-col">
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
    </div>
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
  capture: {
    device_label_hash: string | null;
    requested_sample_rate_hz: number;
    actual_sample_rate_hz: number | null;
    honesty_classification: string | null;
    iriaa_applied: boolean;
    source_mode: string;
  };
  selection: { cartridge: null; tonearm: null; test_record: string | null };
  measurements: {
    speed: object | null;
    channel_balance: object | null;
    frequency_response: object | null;
    thd: object | null;
    imd: object | null;
    resonance: object | null;
    reference_level: object | null;
  };
};

function buildSessionJson(): SessionJson {
  const deviceLabel = state.devices.find(d => d.deviceId === state.selectedDeviceId)?.label ?? null;

  const speedResult = state.speed.result;
  const channelResult = (() => {
    const { leftCapture, rightCapture } = state.channel;
    if (!leftCapture || !rightCapture) return null;
    const bal = summariseChannelBalance(leftCapture, rightCapture);
    return {
      left_rms_dbfs: leftCapture.leftRmsDbFs,
      right_rms_dbfs: rightCapture.rightRmsDbFs,
      balance_db: bal.balanceDb,
      left_to_right_crosstalk_db: bal.leftToRightCrosstalkDb,
      right_to_left_crosstalk_db: bal.rightToLeftCrosstalkDb,
    };
  })();

  const freqResult = state.freq.result;
  const thdResult = (() => {
    const r = state.thd.result;
    if (!r) return null;
    if (isThdResult(r)) {
      return { type: 'thd', fundamental_hz: r.fundamentalHz, thd_percent: r.thdPercent, harmonics_dbc: r.harmonics };
    }
    return { type: 'imd', f1_hz: r.f1Hz, f2_hz: r.f2Hz, imd_percent: r.imdPercent };
  })();

  const resResult = state.resonance.result;

  return {
    schema: 'engrove-toolbox.session/v1',
    tool: 'measurement-lab',
    timestamp: new Date().toISOString(),
    capture: {
      device_label_hash: deviceLabel != null ? fnv1aHex(deviceLabel) : null,
      requested_sample_rate_hz: defaultRequestedSampleRateHz,
      actual_sample_rate_hz: state.honesty?.contextActualHz ?? null,
      honesty_classification: state.honesty?.classification ?? null,
      iriaa_applied: state.iriaaEnabled,
      source_mode: state.sourceMode,
    },
    selection: { cartridge: null, tonearm: null, test_record: state.selectedTestRecordId },
    measurements: {
      speed: speedResult
        ? {
            speed_deviation_percent: speedResult.speedDeviationPercent,
            unweighted_wf_percent: speedResult.unweightedWfPercent,
            weighted_wf_percent: speedResult.weightedWfPercent,
            classification: classifyWf(speedResult.unweightedWfPercent).label,
          }
        : null,
      channel_balance: channelResult,
      frequency_response: freqResult
        ? {
            fft_size: freqResult.fftSize,
            block_count: freqResult.blockCount,
            frequencies_hz: Array.from(freqResult.frequenciesHz),
            magnitudes_db: Array.from(freqResult.magnitudesDb),
          }
        : null,
      thd: thdResult && thdResult.type === 'thd' ? thdResult : null,
      imd: thdResult && thdResult.type === 'imd' ? thdResult : null,
      resonance: resResult
        ? {
            peak_frequency_hz: resResult.peakFrequencyHz,
            peak_amplitude_dbfs: resResult.peakAmplitudeDbFs,
            q_estimate: resResult.qEstimate,
            sweep_type: state.resonance.sweepType,
            sweep_from_hz: state.resonance.fromHz,
            sweep_to_hz: state.resonance.toHz,
          }
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
  const lines: string[] = [
    'ENGROVE MEASUREMENT LAB — Session Report',
    `Generated: ${ts}`,
    hr,
    '',
  ];

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

  // Speed
  const sr = state.speed.result;
  if (sr) {
    lines.push('SPEED & WOW·FLUTTER');
    lines.push(`  Speed deviation:       ${sr.speedDeviationPercent.toFixed(3)} %`);
    lines.push(`  Unweighted W&F (AES6): ${sr.unweightedWfPercent.toFixed(3)} %`);
    lines.push(`  IEC-weighted W&F:      ${sr.weightedWfPercent.toFixed(3)} %`);
    lines.push(`  Classification:        ${classifyWf(sr.unweightedWfPercent).label}`);
    lines.push('');
  }

  // Channel
  const { leftCapture, rightCapture } = state.channel;
  if (leftCapture && rightCapture) {
    const bal = summariseChannelBalance(leftCapture, rightCapture);
    lines.push('CHANNEL BALANCE & CROSSTALK');
    lines.push(`  Left RMS:              ${leftCapture.leftRmsDbFs.toFixed(2)} dBFS`);
    lines.push(`  Right RMS:             ${rightCapture.rightRmsDbFs.toFixed(2)} dBFS`);
    lines.push(`  Channel balance:       ${(bal.balanceDb ?? 0).toFixed(2)} dB`);
    lines.push(`  L→R crosstalk:         ${(bal.leftToRightCrosstalkDb ?? 0).toFixed(1)} dB`);
    lines.push(`  R→L crosstalk:         ${(bal.rightToLeftCrosstalkDb ?? 0).toFixed(1)} dB`);
    lines.push('');
  }

  // Freq response
  const fr = state.freq.result;
  if (fr) {
    lines.push('FREQUENCY RESPONSE');
    lines.push(`  FFT size:              ${fr.fftSize}`);
    lines.push(`  Blocks averaged:       ${fr.blockCount}`);
    lines.push(`  Sample rate:           ${fr.sampleRateHz.toLocaleString()} Hz`);
    lines.push(`  Range:                 ${fr.frequenciesHz[0]?.toFixed(0) ?? '?'} – ${fr.frequenciesHz[fr.frequenciesHz.length - 1]?.toFixed(0) ?? '?'} Hz`);
    lines.push('  (Full data in JSON export)');
    lines.push('');
  }

  // THD / IMD
  const tr = state.thd.result;
  if (tr) {
    if (isThdResult(tr)) {
      lines.push('THD');
      lines.push(`  Fundamental:           ${tr.fundamentalHz} Hz`);
      lines.push(`  THD:                   ${tr.thdPercent.toFixed(3)} %`);
      const hdbs = tr.harmonics.map((h, i) => `${i + 2}nd: ${h.toFixed(1)} dBc`).join(', ');
      if (hdbs) lines.push(`  Harmonics:             ${hdbs}`);
    } else {
      lines.push('SMPTE IMD');
      lines.push(`  f1 (LF):               ${tr.f1Hz} Hz`);
      lines.push(`  f2 (HF):               ${tr.f2Hz} Hz`);
      lines.push(`  IMD:                   ${tr.imdPercent.toFixed(3)} %`);
    }
    lines.push('');
  }

  // Resonance
  const rr = state.resonance.result;
  if (rr) {
    lines.push('RESONANCE');
    lines.push(`  Peak frequency:        ${rr.peakFrequencyHz.toFixed(2)} Hz`);
    lines.push(`  Peak amplitude:        ${rr.peakAmplitudeDbFs.toFixed(1)} dBFS`);
    lines.push(`  Q estimate:            ${rr.qEstimate != null ? rr.qEstimate.toFixed(2) : 'n/a'}`);
    lines.push(`  Sweep type:            ${state.resonance.sweepType}`);
    lines.push(`  Sweep range:           ${state.resonance.fromHz}–${state.resonance.toHz} Hz`);
    lines.push('');
  }

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

  if (state.log.length > 0) {
    lines.push(hr);
    lines.push('ACTIVITY LOG');
    state.log.forEach(e => lines.push(`  ${e}`));
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
        <button class="ea-button ea-button--ghost" type="button" data-mlab-export-report>Export Report</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-export>Export JSON</button>
        <button class="ea-button ea-button--ghost" type="button" data-mlab-reset>Reset</button>
      </div>
    </footer>
  `;
}

export function renderMeasurementLabPage(): string {
  return `
    <main class="ea-tool-shell mlab-shell">
      ${renderToolTopbar('measurement')}
      ${renderContextBar()}
      <section class="ea-workbench mlab-workbench" aria-label="Measurement lab workbench">
        <div class="mlab-workbench-grid">
          <div class="mlab-workbench-main">
            ${audioSourcePanelMarkup()}
            ${coveragePanelMarkup()}
            ${speedPanelMarkup()}
            ${channelPanelMarkup()}
            ${freqPanelMarkup()}
            ${thdPanelMarkup()}
            ${resonancePanelMarkup()}
            ${refLevelPanelMarkup()}
          </div>
          ${visualizationMarkup()}
        </div>
      </section>
      ${actionBarMarkup()}
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
    refLevelBody: root.querySelector<HTMLElement>('[data-mlab-reflevel-body]'),
  };
}

type Elements = ReturnType<typeof elements>;

function setActionStatus(els: Elements, kind: 'planned' | 'active' | 'done' | 'error', text: string): void {
  if (els.actionStatusDot) els.actionStatusDot.className = `ea-dot ea-dot--${kind}`;
  if (els.actionStatusText) els.actionStatusText.textContent = text;
}

type WfGrade = { label: string; cssClass: string };

function classifyWf(wfPercent: number): WfGrade {
  if (wfPercent < 0.03) return { label: 'Excellent', cssClass: 'mlab-wf-grade--excellent' };
  if (wfPercent < 0.10) return { label: 'Good', cssClass: 'mlab-wf-grade--good' };
  if (wfPercent < 0.20) return { label: 'Acceptable', cssClass: 'mlab-wf-grade--good' };
  if (wfPercent < 0.30) return { label: 'Marginal', cssClass: 'mlab-wf-grade--marginal' };
  return { label: 'Poor', cssClass: 'mlab-wf-grade--poor' };
}

function renderSpeedPanel(els: Elements): void {
  const body = els.speedBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a Speed &amp; W&amp;F measurement.</p>';
    return;
  }

  if (state.speed.active) {
    const pct = Math.min(100, (state.speed.elapsedSeconds / speedMeasurementDurationSeconds) * 100);
    const remaining = Math.max(0, speedMeasurementDurationSeconds - state.speed.elapsedSeconds);
    body.innerHTML = `
      <p class="ea-muted">Recording ${state.speed.referenceHz} Hz reference tone&hellip;</p>
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

  if (state.speed.result) {
    const r = state.speed.result;
    const grade = classifyWf(r.unweightedWfPercent);
    body.innerHTML = `
      <div class="mlab-wf-result">
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
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-speed-start>Measure again</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-speed-start]')?.addEventListener('click', () => {
      state.speed.result = null;
      startSpeedMeasurement(els);
    });
    return;
  }

  // Idle — ready to measure
  body.innerHTML = `
    <table class="ea-form-table" aria-label="Speed and W&F setup">
      <tbody>
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Reference frequency
            <span class="ea-form-table-sublabel">From speed band on test record</span>
          </td>
          <td class="ea-col-value">
            <select class="ea-input" data-mlab-speed-refhz aria-label="Reference frequency">
              <option value="3150" ${state.speed.referenceHz === 3150 ? 'selected' : ''}>3150 Hz (DIN 45&thinsp;545, common)</option>
              <option value="3000" ${state.speed.referenceHz === 3000 ? 'selected' : ''}>3000 Hz (AES alternative)</option>
            </select>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
        </tr>
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Duration</td>
          <td class="ea-col-value mlab-requested">${speedMeasurementDurationSeconds}&nbsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    ${recordHint('speed')}
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-speed-start>Start measurement</button>
    </div>
  `;
  body.querySelector<HTMLSelectElement>('[data-mlab-speed-refhz]')?.addEventListener('change', (event) => {
    const val = parseInt((event.currentTarget as HTMLSelectElement).value, 10);
    if (val === 3150 || val === 3000) state.speed.referenceHz = val;
  });
  body.querySelector<HTMLButtonElement>('[data-mlab-speed-start]')?.addEventListener('click', () => {
    startSpeedMeasurement(els);
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

function renderChannelPanel(els: Elements): void {
  const body = els.channelBody;
  if (!body) return;

  if (state.captureState !== 'live') {
    body.innerHTML = '<p class="ea-muted">Connect a source to begin a channel measurement.</p>';
    return;
  }

  const ch = state.channel;

  const recordingStep = ch.step === 'left-recording' || ch.step === 'right-recording';
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
    const summary = summariseChannelBalance(ch.leftCapture, ch.rightCapture);
    body.innerHTML = `
      <table class="ea-form-table" aria-label="Channel measurement summary">
        <tbody>
          ${captureRowMarkup('L-band capture', ch.leftCapture)}
          ${captureRowMarkup('R-band capture', ch.rightCapture)}
        </tbody>
      </table>
      <div class="mlab-wf-result">
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Channel balance (R − L)</span>
          <span class="mlab-wf-result-value">${fmtDb(summary.balanceDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk L → R</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(summary.leftToRightCrosstalkDb)}</span>
        </div>
        <div class="mlab-wf-result-row">
          <span class="mlab-wf-result-label">Crosstalk R → L</span>
          <span class="mlab-wf-result-value">${fmtCrosstalk(summary.rightToLeftCrosstalkDb)}</span>
        </div>
        <p class="mlab-wf-note">Negative crosstalk values are better; well-set-up cartridges land at -25 to -35 dB across the audio band.</p>
      </div>
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--ghost" type="button" data-mlab-channel-reset>Start over</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-channel-reset]')?.addEventListener('click', () => {
      resetChannelMeasurement();
      renderChannelPanel(els);
    });
    return;
  }

  if (ch.step === 'left-done' && ch.leftCapture) {
    body.innerHTML = `
      <p class="ea-muted">Step 1 of 2 complete. Cue the R-channel reference band on the test record.</p>
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
  body.innerHTML = `
    <p class="ea-muted">Step 1 of 2: cue the L-channel reference band on the test record (typically 1&nbsp;kHz, L only). Each capture is ${channelMeasurementDurationSeconds}&nbsp;seconds.</p>
    ${recordHint('crosstalk')}
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-channel-start-l>Start L-band capture</button>
    </div>
  `;
  body.querySelector<HTMLButtonElement>('[data-mlab-channel-start-l]')?.addEventListener('click', () => {
    startChannelCapture(els, 'left');
  });
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
    body.innerHTML = `
      <div class="mlab-freq-chart-wrap">${chartHtml}</div>
      <p class="mlab-wf-note">${state.freq.result.blockCount} blocks averaged &middot; ${(state.freq.result.sampleRateHz / 1000).toFixed(1)}&thinsp;kHz &middot; FFT size ${state.freq.result.fftSize}</p>
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

  const overlayNote = !state.iriaaEnabled
    ? ' The RIAA reference curve will be overlaid for comparison.'
    : '';
  body.innerHTML = `
    <p class="ea-muted">Capture ${freqMeasurementDurationSeconds}&thinsp;s of audio and compute the frequency response (20&thinsp;Hz&thinsp;–&thinsp;20&thinsp;kHz).${overlayNote}</p>
    ${recordHint('freq_response')}
    <div class="mlab-session-controls">
      <button class="ea-button ea-button--primary" type="button" data-mlab-freq-start>Start capture</button>
    </div>
  `;
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

  stopFreqCapture();
  state.freq.active = true;
  state.freq.elapsedSeconds = 0;
  state.freq.result = null;
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

  stopThdCapture();
  state.thd.active = true;
  state.thd.elapsedSeconds = 0;
  state.thd.result = null;
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
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel.classList.remove('mlab-panel--target-highlight');
  void panel.offsetHeight; // restart animation if same panel targeted twice
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

  if (state.captureState !== 'live') {
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
    let resultHtml: string;
    if (isThdResult(r)) {
      const h2 = r.harmonics[0] !== undefined ? r.harmonics[0].toFixed(1) : '—';
      const h3 = r.harmonics[1] !== undefined ? r.harmonics[1].toFixed(1) : '—';
      resultHtml = `
        <div class="mlab-wf-result">
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">THD</span>
            <span class="mlab-wf-result-value">${r.thdPercent.toFixed(3)}&nbsp;%</span>
          </div>
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">2nd harmonic</span>
            <span class="mlab-wf-result-value">${h2}&nbsp;dBc</span>
          </div>
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">3rd harmonic</span>
            <span class="mlab-wf-result-value">${h3}&nbsp;dBc</span>
          </div>
          <p class="mlab-wf-note">Fundamental ${r.fundamentalHz.toLocaleString('en-US')}&nbsp;Hz &middot; ${r.harmonics.length} harmonics analysed</p>
        </div>
      `;
    } else {
      resultHtml = `
        <div class="mlab-wf-result">
          <div class="mlab-wf-result-row">
            <span class="mlab-wf-result-label">SMPTE IMD</span>
            <span class="mlab-wf-result-value">${r.imdPercent.toFixed(3)}&nbsp;%</span>
          </div>
          <p class="mlab-wf-note">f1 ${r.f1Hz}&nbsp;Hz &middot; f2 ${r.f2Hz.toLocaleString('en-US')}&nbsp;Hz</p>
        </div>
      `;
    }
    body.innerHTML = `${resultHtml}
      <div class="mlab-session-controls">
        <button class="ea-button ea-button--primary" type="button" data-mlab-thd-start>Measure again</button>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('[data-mlab-thd-start]')?.addEventListener('click', () => {
      state.thd.result = null; startThdCapture(els);
    });
    return;
  }

  // Idle
  const isTHD = state.thd.mode === 'thd';
  body.innerHTML = `
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
        ${isTHD ? `
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">Fundamental
            <span class="ea-form-table-sublabel">Tone frequency on test record</span>
          </td>
          <td class="ea-col-value">
            <select class="ea-input" data-mlab-thd-fund aria-label="Fundamental frequency">
              <option value="1000" ${state.thd.fundamentalHz === 1000 ? 'selected' : ''}>1000 Hz</option>
              <option value="315"  ${state.thd.fundamentalHz === 315  ? 'selected' : ''}>315 Hz</option>
              <option value="10000" ${state.thd.fundamentalHz === 10000 ? 'selected' : ''}>10 kHz</option>
            </select>
          </td>
          <td class="ea-col-meta"><span class="ea-badge">Hz</span></td>
        </tr>` : `
        <tr>
          <td class="ea-col-status">${statusDot('planned')}</td>
          <td class="ea-col-label">f1 (low) / f2 (high)</td>
          <td class="ea-col-value mlab-requested">60&nbsp;Hz &middot; 7&nbsp;kHz (SMPTE)</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>`}
        <tr>
          <td class="ea-col-status">${statusDot('done')}</td>
          <td class="ea-col-label">Capture duration</td>
          <td class="ea-col-value mlab-requested">5&nbsp;s</td>
          <td class="ea-col-meta"><span class="ea-badge">Fixed</span></td>
        </tr>
      </tbody>
    </table>
    ${isTHD ? recordHint('thd') : recordHint('imd')}
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
  body.querySelector<HTMLSelectElement>('[data-mlab-thd-fund]')?.addEventListener('change', (e) => {
    const v = parseInt((e.currentTarget as HTMLSelectElement).value, 10);
    if (Number.isFinite(v) && v > 0) state.thd.fundamentalHz = v;
  });
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
  renderResonancePanel(els);

  const { durationSeconds, fromHz, toHz, sweepType } = state.resonance;
  state.resonance.capture = createSweepCapture(context, source, durationSeconds, {
    onProgress: (elapsed) => { state.resonance.elapsedSeconds = elapsed; renderResonancePanel(els); },
    onDone: (samples) => {
      state.resonance.capture = null;
      state.resonance.active = false;
      state.resonance.result = analyseResonance(samples, context.sampleRate, fromHz, toHz, sweepType);
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
    body.innerHTML = `
      <div class="mlab-wf-result">
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
        <p class="mlab-wf-note">Sweep ${state.resonance.fromHz}&ndash;${state.resonance.toHz}&nbsp;Hz (${state.resonance.sweepType}) &middot; ${state.resonance.durationSeconds}&nbsp;s</p>
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

function resetChannelMeasurement(): void {
  stopChannelMeasurement();
  state.channel.step = 'idle';
  state.channel.elapsedSeconds = 0;
  state.channel.leftCapture = null;
  state.channel.rightCapture = null;
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

  stopChannelMeasurement();
  state.channel.step = which === 'left' ? 'left-recording' : 'right-recording';
  state.channel.elapsedSeconds = 0;
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
          appendLog('Channel balance & crosstalk complete.');
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
  if (!els.meterGrid) return;
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
  for (const canvas of [els.waveformL, els.waveformR]) {
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
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

function startMeterLoop(els: Elements): void {
  stopMeterLoop();
  if (!state.analysers) return;
  const scratchL = createScratchBuffer(state.analysers.L.fftSize);
  const scratchR = createScratchBuffer(state.analysers.R.fftSize);
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

  stopSpeedMeasurement();
  state.speed.active = true;
  state.speed.elapsedSeconds = 0;
  state.speed.result = null;
  renderSpeedPanel(els);

  state.speed.capture = createSpeedFlutterCapture(
    context,
    source,
    state.speed.referenceHz,
    speedMeasurementDurationSeconds,
    {
      onProgress: (elapsed) => {
        state.speed.elapsedSeconds = elapsed;
        renderSpeedPanel(els);
      },
      onDone: (result) => {
        state.speed.active = false;
        state.speed.result = result;
        state.speed.capture = null;
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
  renderRefLevelPanel(els);
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
  renderLogPanel(els);
  clearMeterDom(els);

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
    renderSpeedPanel(els);
    renderChannelPanel(els);
    renderFreqPanel(els);
    renderThdPanel(els);
    renderResonancePanel(els);
    renderRefLevelPanel(els);
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
  });

  els.recordSelect?.addEventListener('change', () => {
    const value = els.recordSelect?.value ?? '';
    state.selectedTestRecordId = value.length > 0 ? value : null;
    state.selectedTestRecordMissing = null;
    state.refLevel.selectedBandIndex = null;
    if (state.refLevel.calibrationSet.length > 0) {
      state.refLevel.calibrationSet = clearCalibrationSet();
      appendLog('Reference calibration set cleared (test record changed)');
    }
    renderRecordSelector(els);
    renderCoveragePanel(els);
    renderSpeedPanel(els);
    renderChannelPanel(els);
    renderFreqPanel(els);
    renderThdPanel(els);
    renderResonancePanel(els);
    renderRefLevelPanel(els);
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
}
