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
};

/*
 * The token/layout drift checker scans source text for class names.
 * Classes that are only ever toggled at runtime via classList.toggle
 * are invisible to it and surface as "styled but not emitted" noise.
 * Keep this static inventory in sync with every classList.toggle call
 * site below; it has no runtime effect.
 */
const tokenLayoutGeneratedClassNames =
  'mlab-segmented-option--active mlab-meter-clip--active mlab-wf-grade--excellent mlab-wf-grade--good mlab-wf-grade--marginal mlab-wf-grade--poor';
void tokenLayoutGeneratedClassNames;

const speedMeasurementDurationSeconds = 30;
const defaultSpeedReferenceHz = 3150;

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
    </section>
  `;
}

function sessionPanelMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="mlab-session-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">02</span>
        <span id="mlab-session-title">Capture session</span>
      </div>
      <div class="ea-panel-body">
        <p class="ea-muted" data-mlab-session-status>Capture is idle. Choose a source mode and click Connect to begin.</p>
        <div class="mlab-session-controls">
          <button class="ea-button ea-button--primary" type="button" data-mlab-connect>Connect</button>
          <button class="ea-button ea-button--ghost" type="button" data-mlab-disconnect disabled>Disconnect</button>
        </div>
        <p class="ea-muted mlab-honesty" data-mlab-honesty>Sample-rate honesty report will appear after the audio context is running.</p>
      </div>
    </section>
  `;
}

function speedPanelMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="mlab-speed-title">
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

function meterChannelMarkup(channel: ChannelKey, label: string): string {
  return `
    <div class="mlab-meter-channel" data-mlab-meter-channel="${channel}">
      <div class="mlab-meter-channel-head">
        <span class="mlab-meter-channel-label">${renderText(label)}</span>
        <span class="mlab-meter-channel-readout" data-mlab-meter-readout="${channel}">— dBFS</span>
      </div>
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
    <aside class="ea-panel mlab-viz-panel" aria-labelledby="mlab-viz-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">04</span>
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
  `;
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
        <span class="mlab-formula-reminder" aria-hidden="true">Foundation · S30A</span>
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
            ${sessionPanelMarkup()}
            ${speedPanelMarkup()}
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
    reset: root.querySelector<HTMLButtonElement>('[data-mlab-reset]'),
    actionStatusDot: root.querySelector<HTMLElement>('[data-mlab-action-status] .ea-dot'),
    actionStatusText: root.querySelector<HTMLElement>('[data-mlab-action-status-text]'),
    meterGrid: root.querySelector<HTMLElement>('[data-mlab-meter-grid]'),
    speedBody: root.querySelector<HTMLElement>('[data-mlab-speed-body]'),
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

function renderSessionStatus(els: Elements): void {
  if (!els.sessionStatus) return;
  if (state.captureState === 'live') {
    const sourceLabel = state.sourceMode === 'self-test'
      ? `Self-test sine at ${selfTestFrequencyHz} Hz.`
      : `Live capture from ${describeDevice(state.devices.find((d) => d.deviceId === state.selectedDeviceId) ?? null)}.`;
    els.sessionStatus.textContent = `Capture active. ${sourceLabel}`;
    setActionStatus(els, 'active', state.sourceMode === 'self-test'
      ? 'Self-test signal running.'
      : 'Live audio capture running.');
  } else if (state.captureState === 'connecting') {
    els.sessionStatus.textContent = 'Requesting audio access…';
    setActionStatus(els, 'active', 'Requesting microphone permission.');
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
      },
    },
  );
}

async function teardownAudio(): Promise<void> {
  stopMeterLoop();
  stopSpeedMeasurement();
  state.speed.result = null;
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
  renderSessionStatus(els);
  try {
    await teardownAudio();
    if (state.sourceMode === 'live') {
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
  } catch (error) {
    state.captureState = 'error';
    state.errorMessage = error instanceof AudioStreamUnavailableError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Audio capture failed.';
    await teardownAudio();
    clearMeterDom(els);
  }
  renderConnectionButtons(els);
  renderIriaaToggle(els);
  renderSessionStatus(els);
  renderActualFormat(els);
  renderSpeedPanel(els);
}

async function disconnectMeasurementLab(els: Elements): Promise<void> {
  await teardownAudio();
  state.captureState = 'idle';
  clearMeterDom(els);
  renderConnectionButtons(els);
  renderIriaaToggle(els);
  renderSessionStatus(els);
  renderActualFormat(els);
  renderSpeedPanel(els);
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
  clearMeterDom(els);

  void refreshDeviceList(els);

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

  els.reset?.addEventListener('click', () => {
    void disconnectMeasurementLab(els).then(() => {
      state.sourceMode = 'live';
      state.errorMessage = null;
      renderSourceMode(els);
    });
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
