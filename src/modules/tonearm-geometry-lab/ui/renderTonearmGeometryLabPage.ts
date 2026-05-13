import {
  computeReferenceGeometry,
  computeSimulatedGeometry,
  computeTrackingErrorCurve,
  type AlignmentMethod,
  type AlignmentStandard,
  type CurvePoint,
  type NullPointPair,
  type ReferenceGeometry,
  type SimulatedGeometry,
  type StandardRadii,
} from '../engine/geometry';
import {
  loadNullPointsRuntimeData,
  type NullPointsRuntimeData,
} from '../data/loadNullPoints';
import { renderText } from '../../../shared/ui/renderSafe';
import { renderToolTopbar } from '../../../shared/ui/renderToolTopbar';
import {
  readNumberFromInput,
  type ParseNumberResult,
} from '../../../shared/util/parseNumberInput';
import {
  loadTonearmsWithEffectiveLength,
  type TonearmRuntimeRecord,
} from '../../tonearm-match-lab/data/loadTonearmRuntimeData';
import {
  openRuntimePickerModal,
  type RuntimePickerItem,
} from '../../../shared/ui/runtimePickerModal';

type GeometryTab = 'graph' | 'prot-ideal' | 'prot-sim';
type PivotSource = 'manual' | 'dataset-derived' | 'default';

type SelectedTonearm = {
  id: string;
  displayName: string;
  effectiveLengthMm: number;
  effectiveMassG?: number;
};

type GeometryState = {
  standard: AlignmentStandard;
  method: AlignmentMethod;
  pivotToSpindleMm: number;
  pivotSource: PivotSource;
  selectedTonearm: SelectedTonearm | null;
  simulatedPivotMm: number;
  simulatedOverhangMm: number;
  simulatedOffsetAngleDeg: number;
  tab: GeometryTab;
  nullPoints: NullPointsRuntimeData | null;
  loadError: string | null;
  reference: ReferenceGeometry | null;
  simulated: SimulatedGeometry | null;
};

const defaultState = (): GeometryState => ({
  standard: 'IEC',
  method: 'Baerwald',
  pivotToSpindleMm: 222,
  pivotSource: 'default',
  selectedTonearm: null,
  simulatedPivotMm: 222,
  simulatedOverhangMm: 17.3,
  simulatedOffsetAngleDeg: 22.99,
  tab: 'graph',
  nullPoints: null,
  loadError: null,
  reference: null,
  simulated: null,
});

const state: GeometryState = defaultState();

let tonearmPickerItemsPromise: Promise<RuntimePickerItem[]> | null = null;

function tonearmRecordToPickerItem(record: TonearmRuntimeRecord): RuntimePickerItem {
  return {
    id: record.id,
    kind: 'tonearm',
    displayName: record.display_name,
    effectiveMassG: record.effective_mass_g,
    effectiveLengthMm: record.effective_length_mm,
  };
}

function loadTonearmPickerItems(): Promise<RuntimePickerItem[]> {
  if (!tonearmPickerItemsPromise) {
    tonearmPickerItemsPromise = loadTonearmsWithEffectiveLength()
      .then((records) => records.map(tonearmRecordToPickerItem))
      .catch((error: unknown) => {
        tonearmPickerItemsPromise = null;
        throw error;
      });
  }
  return tonearmPickerItemsPromise;
}

function derivePivotFromEffectiveLength(
  effectiveLengthMm: number,
  nullPoints: NullPointPair,
): number | null {
  const squared = effectiveLengthMm * effectiveLengthMm - nullPoints.n1Mm * nullPoints.n2Mm;
  if (!Number.isFinite(squared) || squared <= 0) {
    return null;
  }
  return Math.sqrt(squared);
}

function nullPointsFor(
  data: NullPointsRuntimeData,
  standard: AlignmentStandard,
  method: AlignmentMethod,
): NullPointPair {
  return data.table[standard][method];
}

function radiiFor(data: NullPointsRuntimeData, standard: AlignmentStandard): StandardRadii {
  return data.radii[standard];
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function statusDot(kind: 'planned' | 'active' | 'done' | 'error'): string {
  return `<span class="ea-dot ea-dot--${kind}" aria-hidden="true"></span>`;
}

function renderContextBar(): string {
  return `
    <section class="ea-contextbar" aria-label="Route context">
      <div class="ea-contextbar__path">
        <span class="ea-contextbar__crumbs">
          <span>Tools</span>
          <span aria-hidden="true">/</span>
          <span class="ea-contextbar__current">Tonearm Geometry Lab</span>
        </span>
        <span class="ea-contextbar__divider" aria-hidden="true"></span>
        <span class="ea-contextbar__description">Compute ideal alignment geometry. Simulate mounting errors against the math.</span>
      </div>
    </section>
  `;
}

function setupTableMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="geo-mech-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">01</span>
        <span id="geo-mech-title">Mechanical setup</span>
      </div>
      <div class="ea-panel-body--flush">
        <table class="ea-form-table" aria-label="Mechanical setup inputs">
          <tbody>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Standard
                <span class="geo-standard-context" data-geo-standard-context>Inner-groove radius convention</span>
              </td>
              <td class="ea-col-value">
                <select class="ea-input" data-geo-standard aria-label="Alignment standard">
                  <option value="IEC">IEC</option>
                  <option value="DIN">DIN</option>
                </select>
              </td>
              <td class="ea-col-meta"><span class="ea-badge ea-badge--manufacturer">Spec</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Method
                <span class="ea-form-table-sublabel">Null-point selection</span>
              </td>
              <td class="ea-col-value">
                <select class="ea-input" data-geo-method aria-label="Alignment method">
                  <option value="Baerwald">Baerwald</option>
                  <option value="LofgrenA">Löfgren A</option>
                  <option value="LofgrenB">Löfgren B</option>
                  <option value="Stevenson">Stevenson</option>
                </select>
              </td>
              <td class="ea-col-meta"><span class="ea-badge ea-badge--manufacturer">Method</span></td>
            </tr>
            <tr data-geo-tonearm-row>
              <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-geo-tonearm-dot aria-hidden="true"></span></td>
              <td class="ea-col-label">Tonearm
                <span class="ea-form-table-sublabel">Pick from dataset</span>
              </td>
              <td class="ea-col-value">
                <div class="geo-picker-row">
                  <span class="geo-picker-summary" data-geo-tonearm-summary>No tonearm selected.</span>
                  <button class="ea-button ea-button--primary geo-picker-button" type="button" data-geo-tonearm-pick aria-label="Pick tonearm from dataset">Pick</button>
                </div>
              </td>
              <td class="ea-col-meta" data-geo-tonearm-meta><span class="ea-badge">Optional</span></td>
            </tr>
            <tr data-geo-pivot-row>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Pivot-to-Spindle (P)
                <span class="ea-form-table-sublabel">Mounting distance</span>
              </td>
              <td class="ea-col-value">
                <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.5" value="222.0" data-geo-pivot aria-label="Pivot-to-spindle distance in millimetres" />
              </td>
              <td class="ea-col-meta" data-geo-pivot-meta><span class="ea-badge">mm</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function simulationTableMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="geo-sim-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">02</span>
        <span id="geo-sim-title">Alignment data &amp; simulation</span>
        <span class="ea-panel-header-spacer"></span>
        <button class="ea-button ea-button--ghost geo-reset-sim" type="button" data-geo-reset-sim>Reset sim</button>
      </div>
      <div class="ea-panel-body--flush">
        <table class="ea-form-table ea-form-table--two-column geo-sim-table" aria-label="Reference and simulated alignment values">
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th class="ea-table-header">Reference (math)</th>
              <th class="ea-table-header ea-table-header--strong">Simulated (what if)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr data-geo-row="p">
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Pivot-to-Spindle (P)
                <span class="ea-form-table-sublabel">Mounting distance</span>
              </td>
              <td class="ea-col-value ea-col-value--strong" data-geo-ref-p>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.5" data-geo-sim-p aria-label="Simulated pivot-to-spindle" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr data-geo-row="oh">
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Overhang (OH)
                <span class="ea-form-table-sublabel">L &minus; P</span>
              </td>
              <td class="ea-col-value ea-col-value--strong" data-geo-ref-oh>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.1" data-geo-sim-oh aria-label="Simulated overhang" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr data-geo-row="oa">
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Offset Angle (OA)
                <span class="ea-form-table-sublabel">Headshell rotation</span>
              </td>
              <td class="ea-col-value ea-col-value--strong" data-geo-ref-oa>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input geo-input" type="number" inputmode="decimal" step="0.1" data-geo-sim-oa aria-label="Simulated offset angle" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">deg</span></td>
            </tr>
            <tr data-geo-row="l">
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">Effective Length (L)
                <span class="ea-form-table-sublabel">Derived: P + OH</span>
              </td>
              <td class="ea-col-value" data-geo-ref-l>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input ea-input--readonly" type="text" data-geo-sim-l readonly aria-label="Simulated effective length" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr data-geo-row="n1">
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">Inner Null (N1)
                <span class="ea-form-table-sublabel">Derived from sim P, L, OA</span>
              </td>
              <td class="ea-col-value" data-geo-ref-n1>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input ea-input--readonly" type="text" data-geo-sim-n1 readonly aria-label="Simulated inner null" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr data-geo-row="n2">
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">Outer Null (N2)
                <span class="ea-form-table-sublabel">Derived from sim P, L, OA</span>
              </td>
              <td class="ea-col-value" data-geo-ref-n2>—</td>
              <td class="ea-col-whatif">
                <input class="ea-input ea-input--readonly" type="text" data-geo-sim-n2 readonly aria-label="Simulated outer null" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function visualizationMarkup(): string {
  return `
    <aside class="ea-panel geo-viz-panel" aria-labelledby="geo-viz-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">03</span>
        <span id="geo-viz-title">Visualization</span>
        <span class="ea-panel-header-spacer"></span>
        <div class="ea-tabs" role="tablist" aria-label="Visualization tabs" data-geo-tabs>
          <button class="ea-tab" role="tab" type="button" data-geo-tab="graph" aria-selected="true" tabindex="0">Tracking error</button>
          <button class="ea-tab" role="tab" type="button" data-geo-tab="prot-ideal" aria-selected="false" tabindex="-1">Ideal protractor</button>
          <button class="ea-tab" role="tab" type="button" data-geo-tab="prot-sim" aria-selected="false" tabindex="-1">Simulated protractor</button>
        </div>
      </div>
      <div class="ea-panel-body geo-viz-body">
        <div class="geo-viz-container" data-geo-view="graph">
          <canvas data-geo-canvas="graph" role="img" aria-label="Tracking error and estimated weighted distortion vs groove radius"></canvas>
        </div>
        <div class="geo-viz-container geo-viz-container--print" data-geo-view="prot" hidden>
          <canvas data-geo-canvas="prot" role="img" aria-label="Arc protractor preview"></canvas>
        </div>
        <p class="geo-viz-status ea-muted" data-geo-viz-status></p>
      </div>
    </aside>
  `;
}

function actionBarMarkup(): string {
  return `
    <footer class="ea-actionbar" aria-label="Geometry lab actions">
      <div class="ea-actionbar__group">
        <span class="ea-actionbar__status" data-geo-action-status>
          ${statusDot('active')}
          <span data-geo-action-status-text>Live simulation active.</span>
        </span>
      </div>
      <div class="ea-actionbar__group">
        <span class="geo-formula-reminder" aria-hidden="true">L = sqrt(P&sup2; + N1&middot;N2)</span>
        <button class="ea-button ea-button--ghost" type="button" data-geo-reset>Reset</button>
        <button class="ea-button ea-button--secondary" type="button" data-geo-export-json>Export JSON</button>
        <button class="ea-button ea-button--primary" type="button" data-geo-print>Print protractor</button>
      </div>
    </footer>
  `;
}

export function renderTonearmGeometryLabPage(): string {
  return `
    <main class="ea-tool-shell geo-shell">
      ${renderToolTopbar('geometry')}
      ${renderContextBar()}
      <section class="ea-workbench geo-workbench" aria-label="Geometry lab workbench">
        <div class="geo-workbench-grid">
          <div class="geo-workbench-main">
            ${setupTableMarkup()}
            ${simulationTableMarkup()}
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
    standard: root.querySelector<HTMLSelectElement>('[data-geo-standard]'),
    standardContext: root.querySelector<HTMLElement>('[data-geo-standard-context]'),
    method: root.querySelector<HTMLSelectElement>('[data-geo-method]'),
    tonearmPick: root.querySelector<HTMLButtonElement>('[data-geo-tonearm-pick]'),
    tonearmSummary: root.querySelector<HTMLElement>('[data-geo-tonearm-summary]'),
    tonearmMeta: root.querySelector<HTMLElement>('[data-geo-tonearm-meta]'),
    tonearmDot: root.querySelector<HTMLElement>('[data-geo-tonearm-dot]'),
    pivot: root.querySelector<HTMLInputElement>('[data-geo-pivot]'),
    pivotRow: root.querySelector<HTMLElement>('[data-geo-pivot-row]'),
    pivotMeta: root.querySelector<HTMLElement>('[data-geo-pivot-meta]'),
    simP: root.querySelector<HTMLInputElement>('[data-geo-sim-p]'),
    simOh: root.querySelector<HTMLInputElement>('[data-geo-sim-oh]'),
    simOa: root.querySelector<HTMLInputElement>('[data-geo-sim-oa]'),
    simL: root.querySelector<HTMLInputElement>('[data-geo-sim-l]'),
    simN1: root.querySelector<HTMLInputElement>('[data-geo-sim-n1]'),
    simN2: root.querySelector<HTMLInputElement>('[data-geo-sim-n2]'),
    refP: root.querySelector<HTMLElement>('[data-geo-ref-p]'),
    refOh: root.querySelector<HTMLElement>('[data-geo-ref-oh]'),
    refOa: root.querySelector<HTMLElement>('[data-geo-ref-oa]'),
    refL: root.querySelector<HTMLElement>('[data-geo-ref-l]'),
    refN1: root.querySelector<HTMLElement>('[data-geo-ref-n1]'),
    refN2: root.querySelector<HTMLElement>('[data-geo-ref-n2]'),
    rowN1: root.querySelector<HTMLElement>('[data-geo-row="n1"]'),
    rowN2: root.querySelector<HTMLElement>('[data-geo-row="n2"]'),
    statusText: root.querySelector<HTMLElement>('[data-geo-action-status-text]'),
    statusDot: root.querySelector<HTMLElement>('[data-geo-action-status] .ea-dot'),
    tabs: root.querySelectorAll<HTMLButtonElement>('[data-geo-tabs] [data-geo-tab]'),
    canvasGraph: root.querySelector<HTMLCanvasElement>('[data-geo-canvas="graph"]'),
    canvasProt: root.querySelector<HTMLCanvasElement>('[data-geo-canvas="prot"]'),
    viewGraph: root.querySelector<HTMLElement>('[data-geo-view="graph"]'),
    viewProt: root.querySelector<HTMLElement>('[data-geo-view="prot"]'),
    vizStatus: root.querySelector<HTMLElement>('[data-geo-viz-status]'),
    resetSim: root.querySelector<HTMLButtonElement>('[data-geo-reset-sim]'),
    reset: root.querySelector<HTMLButtonElement>('[data-geo-reset]'),
    exportJson: root.querySelector<HTMLButtonElement>('[data-geo-export-json]'),
    print: root.querySelector<HTMLButtonElement>('[data-geo-print]'),
  };
}

type Elements = ReturnType<typeof elements>;

function renderTonearmSelectionState(els: Elements): void {
  const tonearm = state.selectedTonearm;
  if (els.tonearmSummary) {
    if (!tonearm) {
      els.tonearmSummary.textContent = 'No tonearm selected.';
    } else {
      const detail = [
        `${formatNumber(tonearm.effectiveLengthMm, 1)} mm effective length`,
        typeof tonearm.effectiveMassG === 'number' ? `${formatNumber(tonearm.effectiveMassG, 1)} g effective mass` : null,
      ].filter(Boolean).join(' · ');
      els.tonearmSummary.innerHTML = `
        <strong>${renderText(tonearm.displayName)}</strong>
        <span>${renderText(detail || 'No match values copied.')}</span>
      `;
    }
  }
  if (els.tonearmPick) {
    els.tonearmPick.textContent = tonearm ? 'Change' : 'Pick';
    els.tonearmPick.setAttribute('aria-label', tonearm ? 'Change selected tonearm' : 'Pick tonearm from dataset');
    els.tonearmPick.classList.toggle('ea-button--primary', !tonearm);
    els.tonearmPick.classList.toggle('ea-button--secondary', Boolean(tonearm));
  }
  if (els.tonearmDot) {
    els.tonearmDot.className = `ea-dot ea-dot--${tonearm ? 'done' : 'planned'}`;
  }
  if (els.tonearmMeta) {
    els.tonearmMeta.innerHTML = tonearm
      ? '<span class="ea-badge ea-badge--manufacturer">Dataset</span>'
      : '<span class="ea-badge">Optional</span>';
  }
  if (els.pivotMeta) {
    if (state.pivotSource === 'dataset-derived') {
      els.pivotMeta.innerHTML = '<span class="ea-badge ea-badge--manufacturer">Derived</span>';
    } else if (state.pivotSource === 'manual') {
      els.pivotMeta.innerHTML = '<span class="ea-badge ea-badge--setup">Manual</span>';
    } else {
      els.pivotMeta.innerHTML = '<span class="ea-badge">mm</span>';
    }
  }
}

function applySelectedTonearm(els: Elements): void {
  if (!state.selectedTonearm || !state.nullPoints) {
    renderTonearmSelectionState(els);
    return;
  }
  const np = nullPointsFor(state.nullPoints, state.standard, state.method);
  const derived = derivePivotFromEffectiveLength(state.selectedTonearm.effectiveLengthMm, np);
  if (derived !== null) {
    state.pivotToSpindleMm = derived;
    state.pivotSource = 'dataset-derived';
    if (els.pivot) {
      els.pivot.value = derived.toFixed(1);
      els.pivot.removeAttribute('aria-invalid');
    }
  }
  renderTonearmSelectionState(els);
}

function describeParseProblem(label: string, result: ParseNumberResult): string | null {
  if (result.kind === 'ok') return null;
  if (result.kind === 'blank') return `${label} is required.`;
  if (result.reason === 'not-a-number') return `${label} must be a valid number.`;
  if (result.reason === 'negative') return `${label} must not be negative.`;
  return `${label} must be greater than zero.`;
}

function renderStandardContext(els: Elements): void {
  if (!els.standardContext) return;
  if (!state.nullPoints) {
    els.standardContext.textContent = 'Inner-groove radius convention';
    return;
  }
  const standardLabelText = state.standard === 'IEC' ? 'IEC 98:1958' : 'DIN';
  const radii = radiiFor(state.nullPoints, state.standard);
  els.standardContext.textContent =
    `${standardLabelText} · inner ${formatNumber(radii.innerMm, 3)} mm · outer ${formatNumber(radii.outerMm, 3)} mm`;
}

function recompute(els: Elements): void {
  renderStandardContext(els);
  if (!state.nullPoints) {
    return;
  }

  const pivotParse = readNumberFromInput(els.pivot);
  if (pivotParse.kind !== 'ok') {
    const message = describeParseProblem('Pivot-to-spindle', pivotParse) ?? 'Pivot-to-spindle is required.';
    setActionStatus(els, pivotParse.kind === 'blank' ? 'planned' : 'error', message);
    state.reference = null;
    if (els.refP) els.refP.textContent = '—';
    if (els.refL) els.refL.textContent = '—';
    if (els.refOh) els.refOh.textContent = '—';
    if (els.refOa) els.refOa.textContent = '—';
    if (els.refN1) els.refN1.textContent = '—';
    if (els.refN2) els.refN2.textContent = '—';
    recomputeSimulation(els);
    return;
  }

  state.pivotToSpindleMm = pivotParse.value;

  const np = nullPointsFor(state.nullPoints, state.standard, state.method);
  const reference = computeReferenceGeometry(pivotParse.value, np);
  state.reference = reference;

  if (els.refP) els.refP.textContent = formatNumber(reference.pivotToSpindleMm, 1);
  if (els.refL) els.refL.textContent = formatNumber(reference.effectiveLengthMm, 2);
  if (els.refOh) els.refOh.textContent = formatNumber(reference.overhangMm, 2);
  if (els.refOa) els.refOa.textContent = formatNumber(reference.offsetAngleDeg, 2);
  if (els.refN1) els.refN1.textContent = formatNumber(reference.innerNullMm, 3);
  if (els.refN2) els.refN2.textContent = formatNumber(reference.outerNullMm, 3);

  recomputeSimulation(els);
}

function refreshSimulationFromReference(els: Elements): void {
  if (!state.reference) return;
  state.simulatedPivotMm = state.reference.pivotToSpindleMm;
  state.simulatedOverhangMm = state.reference.overhangMm;
  state.simulatedOffsetAngleDeg = state.reference.offsetAngleDeg;
  if (els.simP) els.simP.value = state.simulatedPivotMm.toFixed(1);
  if (els.simOh) els.simOh.value = state.simulatedOverhangMm.toFixed(2);
  if (els.simOa) els.simOa.value = state.simulatedOffsetAngleDeg.toFixed(2);
}

function recomputeSimulation(els: Elements): void {
  const pParse = readNumberFromInput(els.simP);
  const ohParse = readNumberFromInput(els.simOh, { allowNegative: true, allowZero: true });
  const oaParse = readNumberFromInput(els.simOa, { allowNegative: true, allowZero: true });
  const problems = [
    describeParseProblem('Simulated pivot-to-spindle', pParse),
    describeParseProblem('Simulated overhang', ohParse),
    describeParseProblem('Simulated offset angle', oaParse),
  ].filter((value): value is string => value !== null);
  const anyBlank = [pParse, ohParse, oaParse].some((parse) => parse.kind === 'blank');

  if (problems.length > 0) {
    state.simulated = null;
    if (els.simL) els.simL.value = '—';
    if (els.simN1) els.simN1.value = '—';
    if (els.simN2) els.simN2.value = '—';
    els.rowN1?.removeAttribute('data-row-error');
    els.rowN2?.removeAttribute('data-row-error');
    setActionStatus(els, anyBlank ? 'planned' : 'error', problems[0]);
    draw(els);
    return;
  }

  const p = pParse.kind === 'ok' ? pParse.value : 0;
  const oh = ohParse.kind === 'ok' ? ohParse.value : 0;
  const oa = oaParse.kind === 'ok' ? oaParse.value : 0;
  state.simulatedPivotMm = p;
  state.simulatedOverhangMm = oh;
  state.simulatedOffsetAngleDeg = oa;
  const sim = computeSimulatedGeometry(p, oh, oa);
  state.simulated = sim;

  if (els.simL) els.simL.value = formatNumber(sim.effectiveLengthMm, 2);

  if (sim.valid) {
    if (els.simN1) els.simN1.value = formatNumber(sim.innerNullMm, 3);
    if (els.simN2) els.simN2.value = formatNumber(sim.outerNullMm, 3);
    els.rowN1?.removeAttribute('data-row-error');
    els.rowN2?.removeAttribute('data-row-error');
    setActionStatus(els, 'active', 'Live simulation active.');
  } else {
    if (els.simN1) els.simN1.value = 'Invalid';
    if (els.simN2) els.simN2.value = 'Invalid';
    els.rowN1?.setAttribute('data-row-error', 'true');
    els.rowN2?.setAttribute('data-row-error', 'true');
    setActionStatus(els, 'error', 'Invalid geometry: chosen offset cannot reach the record.');
  }

  draw(els);
}

function setActionStatus(els: Elements, kind: 'planned' | 'active' | 'done' | 'error', text: string): void {
  if (els.statusDot) {
    els.statusDot.className = `ea-dot ea-dot--${kind}`;
  }
  if (els.statusText) {
    els.statusText.textContent = text;
  }
}

function setupCanvas(canvas: HTMLCanvasElement | null): { ctx: CanvasRenderingContext2D; widthPx: number; heightPx: number } | null {
  if (!canvas || !canvas.parentElement) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const widthPx = Math.max(1, canvas.parentElement.clientWidth);
  const heightPx = Math.max(1, canvas.parentElement.clientHeight);
  canvas.width = Math.round(widthPx * dpr);
  canvas.height = Math.round(heightPx * dpr);
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, widthPx, heightPx };
}

function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme !== 'light';
}

function draw(els: Elements): void {
  if (!state.nullPoints || !state.reference || !state.simulated) {
    return;
  }
  if (state.tab === 'graph') {
    drawGraph(els);
  } else {
    drawProtractor(els, state.tab === 'prot-sim');
  }
  if (els.vizStatus) {
    if (state.simulated.valid) {
      els.vizStatus.textContent = '';
    } else {
      els.vizStatus.textContent = 'Simulated geometry is invalid; protractor and curves reflect reference only.';
    }
  }
}

function drawGraph(els: Elements): void {
  const setup = setupCanvas(els.canvasGraph);
  if (!setup || !state.reference || !state.nullPoints) return;
  const { ctx, widthPx, heightPx } = setup;
  const dark = isDarkTheme();
  const colorGrid = dark ? '#2a2f37' : '#e6e8ec';
  const colorText = dark ? '#9098a3' : '#5a606b';
  const colorErr = '#f2b837';
  const colorDist = '#5a98e0';
  const colorZero = '#4ab86a';

  const radii = radiiFor(state.nullPoints, state.standard);
  const padX = 60;
  const padY = 50;
  const graphW = Math.max(0, widthPx - padX * 2);
  const graphH = Math.max(0, heightPx - padY * 2);

  const refCurve = computeTrackingErrorCurve(
    state.reference.pivotToSpindleMm,
    state.reference.effectiveLengthMm,
    state.reference.offsetAngleDeg,
  );
  const simCurve = state.simulated && state.simulated.valid !== false
    ? computeTrackingErrorCurve(
        state.simulated.pivotToSpindleMm,
        state.simulated.effectiveLengthMm,
        state.simulated.offsetAngleDeg,
      )
    : computeTrackingErrorCurve(
        state.simulatedPivotMm,
        state.simulatedPivotMm + state.simulatedOverhangMm,
        state.simulatedOffsetAngleDeg,
      );

  const inWindow = (point: CurvePoint): boolean =>
    point.radiusMm >= radii.innerMm && point.radiusMm <= radii.outerMm;

  const maxAbs = (curve: CurvePoint[], pick: (p: CurvePoint) => number): number =>
    curve.filter(inWindow).reduce((acc, p) => Math.max(acc, Math.abs(pick(p))), 0);

  const errLimit = Math.max(2, Math.ceil(Math.max(maxAbs(refCurve, (p) => p.trackingErrorDeg), maxAbs(simCurve, (p) => p.trackingErrorDeg), 0.5) * 1.2 * 2) / 2);
  const distLimit = Math.max(0.6, Math.ceil(Math.max(maxAbs(refCurve, (p) => p.estimatedWtdPct), maxAbs(simCurve, (p) => p.estimatedWtdPct), 0.3) * 1.5 * 10) / 10);

  const mapX = (r: number) => padX + ((r - 50) / 100) * graphW;
  const mapYErr = (e: number) => padY + graphH / 2 - (e / errLimit) * (graphH / 2);
  const mapYDist = (d: number) => padY + graphH - (d / distLimit) * graphH;

  ctx.clearRect(0, 0, widthPx, heightPx);

  ctx.strokeStyle = colorGrid;
  ctx.lineWidth = 1;
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = colorText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let r = 50; r <= 150; r += 20) {
    const x = mapX(r);
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, heightPx - padY);
    ctx.stroke();
    ctx.fillText(`${r} mm`, x, heightPx - padY + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = -4; i <= 4; i += 1) {
    const e = (errLimit / 4) * i;
    const y = mapYErr(e);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(widthPx - padX, y);
    ctx.stroke();
    ctx.fillStyle = colorErr;
    ctx.fillText(`${e.toFixed(1)}deg`, padX - 8, y);
  }
  ctx.textAlign = 'left';
  for (let i = 0; i <= 4; i += 1) {
    const d = (distLimit / 4) * i;
    const y = mapYDist(d);
    ctx.fillStyle = colorDist;
    ctx.fillText(`${d.toFixed(2)}%`, widthPx - padX + 8, y);
  }

  ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  ctx.fillRect(mapX(radii.innerMm), padY, mapX(radii.outerMm) - mapX(radii.innerMm), graphH);

  const zeroY = mapYErr(0);
  ctx.strokeStyle = colorZero;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, zeroY);
  ctx.lineTo(widthPx - padX, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  const drawCurve = (pts: CurvePoint[], yPick: (p: CurvePoint) => number, color: string, width: number, dashed: boolean) => {
    if (!pts.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    pts.forEach((point, index) => {
      const x = mapX(point.radiusMm);
      const y = yPick(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawCurve(refCurve, (p) => mapYErr(p.trackingErrorDeg), colorErr, 2.4, false);
  drawCurve(refCurve, (p) => mapYDist(p.estimatedWtdPct), colorDist, 2.4, false);
  drawCurve(simCurve, (p) => mapYErr(p.trackingErrorDeg), `${colorErr}99`, 1.6, true);
  drawCurve(simCurve, (p) => mapYDist(p.estimatedWtdPct), `${colorDist}99`, 1.6, true);

  for (const n of [state.reference.innerNullMm, state.reference.outerNullMm]) {
    const x = mapX(n);
    ctx.fillStyle = dark ? '#fff' : '#14161a';
    ctx.beginPath();
    ctx.arc(x, zeroY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colorText;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`N(${n.toFixed(1)})`, x + 7, zeroY - 8);
  }

  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = colorErr;
  ctx.fillText('Reference tracking error (deg)', padX + 10, padY + 18);
  ctx.fillStyle = colorDist;
  ctx.fillText('Reference estimated WTD (%)', padX + 10, padY + 35);
  ctx.fillStyle = colorText;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText('Dashed = simulated what-if deviation', padX + 10, padY + 52);
}

function drawProtractor(els: Elements, isSim: boolean): void {
  const setup = setupCanvas(els.canvasProt);
  if (!setup) return;
  const { ctx, widthPx, heightPx } = setup;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const cLine = '#000000';
  const cWarn = '#b32a2a';
  const reference = state.reference;
  const simulated = state.simulated;
  if (!reference) return;

  const data = isSim && simulated && simulated.valid
    ? {
        p: simulated.pivotToSpindleMm,
        l: simulated.effectiveLengthMm,
        oh: simulated.overhangMm,
        oa: simulated.offsetAngleDeg,
        n1: simulated.innerNullMm,
        n2: simulated.outerNullMm,
        valid: true,
      }
    : isSim && simulated && !simulated.valid
      ? {
          p: simulated.pivotToSpindleMm,
          l: simulated.effectiveLengthMm,
          oh: simulated.overhangMm,
          oa: simulated.offsetAngleDeg,
          n1: 0,
          n2: 0,
          valid: false,
        }
      : {
          p: reference.pivotToSpindleMm,
          l: reference.effectiveLengthMm,
          oh: reference.overhangMm,
          oa: reference.offsetAngleDeg,
          n1: reference.innerNullMm,
          n2: reference.outerNullMm,
          valid: true,
        };

  const titleMode = isSim ? 'SIMULATED (WHAT IF) GEOMETRY' : 'IDEAL GEOMETRY';

  ctx.fillStyle = cLine;
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PRECISION ARC PROTRACTOR', 20, 28);
  ctx.font = 'bold 11px JetBrains Mono, monospace';
  ctx.fillText(`MODE: ${titleMode}`, 20, 48);
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.fillText(`STANDARD: ${state.standard}    METHOD: ${state.method}`, 20, 64);
  ctx.fillText(`P:  ${data.p.toFixed(1)} mm`, 20, 84);
  ctx.fillText(`L:  ${data.l.toFixed(2)} mm`, 20, 100);
  ctx.fillText(`OH: ${data.oh.toFixed(2)} mm`, 20, 116);
  ctx.fillText(`OA: ${data.oa.toFixed(2)} deg`, 20, 132);

  // Protractor geometry is rendered in millimetre-domain coordinates and then
  // scaled into the preview canvas here. The reference ruler below intentionally
  // uses the same mm-to-canvas mapping as the arc/null-grid geometry; it is a
  // print verification aid, not a guarantee of printer behavior.
  const scale = Math.min(widthPx / 220, heightPx / 160);
  const cx = widthPx * 0.2;
  const cy = heightPx * 0.65;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  drawReferenceScale(ctx, cLine);

  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(15, 0);
  ctx.moveTo(0, 15);
  ctx.lineTo(0, -15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
  ctx.fill();

  if (!data.valid || data.l <= 0 || data.n1 <= 0 || data.n2 <= 0) {
    ctx.restore();
    ctx.fillStyle = cWarn;
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('INVALID GEOMETRY: ARC DOES NOT REACH RECORD', widthPx / 2, heightPx * 0.45);
    return;
  }

  ctx.strokeStyle = cLine;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  let started = false;
  for (let r = 50; r <= 150; r += 0.5) {
    const y = (data.l * data.l - data.p * data.p - r * r) / (2 * data.p);
    const xSquared = r * r - y * y;
    if (xSquared >= 0) {
      const x = Math.sqrt(xSquared);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();

  for (const n of [data.n1, data.n2]) {
    const yN = (data.l * data.l - data.p * data.p - n * n) / (2 * data.p);
    const xSqN = n * n - yN * yN;
    if (xSqN < 0) continue;
    const xN = Math.sqrt(xSqN);
    ctx.save();
    ctx.translate(xN, yN);
    const tangentAngle = Math.atan2(yN, xN) + Math.PI / 2;
    ctx.rotate(tangentAngle);
    ctx.strokeStyle = cLine;
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    for (let i = -14; i <= 14; i += 2) {
      ctx.moveTo(i, -20);
      ctx.lineTo(i, 20);
      ctx.moveTo(-20, i);
      ctx.lineTo(20, i);
    }
    ctx.stroke();
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 25);
    ctx.moveTo(-25, 0);
    ctx.lineTo(25, 0);
    ctx.stroke();
    ctx.fillStyle = cLine;
    ctx.beginPath();
    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-tangentAngle);
    ctx.font = 'bold 6px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`NULL R=${n.toFixed(1)}`, 0, -32);
    ctx.restore();
  }

  ctx.restore();
}


function drawReferenceScale(ctx: CanvasRenderingContext2D, color: string): void {
  const startX = 60;
  const startY = -85;
  const lengthMm = 100;
  const majorTickHeight = 6;
  const minorTickHeight = 2.4;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'butt';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + lengthMm, startY);
  ctx.stroke();

  ctx.lineWidth = 0.18;
  ctx.beginPath();
  for (let mm = 0; mm <= lengthMm; mm += 1) {
    const x = startX + mm;
    const isMajor = mm % 10 === 0;
    const tickHeight = isMajor ? majorTickHeight : minorTickHeight;
    ctx.moveTo(x, startY);
    ctx.lineTo(x, startY + tickHeight);
  }
  ctx.stroke();

  ctx.font = 'bold 4.2px JetBrains Mono, monospace';
  ctx.fillText('100.0 MM REFERENCE', startX + lengthMm / 2, startY - 8);
  ctx.font = '3.2px JetBrains Mono, monospace';
  ctx.fillText('PRINT AT 100%. VERIFY THIS SCALE MEASURES 100.0 MM.', startX + lengthMm / 2, startY - 3);
  ctx.textBaseline = 'top';
  ctx.fillText('0', startX, startY + majorTickHeight + 1.5);
  ctx.fillText('100 mm', startX + lengthMm, startY + majorTickHeight + 1.5);

  ctx.restore();
}

function setActiveTab(els: Elements, tab: GeometryTab): void {
  state.tab = tab;
  els.tabs.forEach((button) => {
    const matches = button.dataset.geoTab === tab;
    button.setAttribute('aria-selected', matches ? 'true' : 'false');
    button.tabIndex = matches ? 0 : -1;
  });
  if (els.viewGraph) els.viewGraph.hidden = tab !== 'graph';
  if (els.viewProt) els.viewProt.hidden = tab === 'graph';
  draw(els);
}

function downloadJsonExport(): void {
  if (!state.reference) return;
  const session = {
    schema: 'engrove-toolbox.session/v1',
    tool: 'geometry-lab',
    timestamp: new Date().toISOString(),
    dataset_version: state.nullPoints?.version ?? null,
    inputs: {
      standard: state.standard,
      method: state.method,
      tonearm: state.selectedTonearm
        ? {
            id: state.selectedTonearm.id,
            display_name: state.selectedTonearm.displayName,
            effective_length_mm: state.selectedTonearm.effectiveLengthMm,
            effective_mass_g: state.selectedTonearm.effectiveMassG ?? null,
          }
        : null,
      pivot_to_spindle_mm: state.pivotToSpindleMm,
      pivot_source: state.pivotSource,
    },
    reference: {
      L_mm: state.reference.effectiveLengthMm,
      OH_mm: state.reference.overhangMm,
      OA_deg: state.reference.offsetAngleDeg,
      N1_mm: state.reference.innerNullMm,
      N2_mm: state.reference.outerNullMm,
    },
    simulated: state.simulated && state.simulated.valid
      ? {
          P_mm: state.simulated.pivotToSpindleMm,
          OH_mm: state.simulated.overhangMm,
          OA_deg: state.simulated.offsetAngleDeg,
          L_mm: state.simulated.effectiveLengthMm,
          N1_mm: state.simulated.innerNullMm,
          N2_mm: state.simulated.outerNullMm,
          valid: true,
        }
      : {
          P_mm: state.simulatedPivotMm,
          OH_mm: state.simulatedOverhangMm,
          OA_deg: state.simulatedOffsetAngleDeg,
          L_mm: state.simulatedPivotMm + state.simulatedOverhangMm,
          N1_mm: null,
          N2_mm: null,
          valid: false,
        },
  };

  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `engrove-geometry-lab-session-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindTabsKeyboard(els: Elements): void {
  const tabs = Array.from(els.tabs);
  if (tabs.length === 0) return;
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setActiveTab(els, (tab.dataset.geoTab as GeometryTab) ?? 'prot-ideal'));
    tab.addEventListener('keydown', (event) => {
      const idx = tabs.indexOf(tab);
      let next = idx;
      if (event.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        tab.click();
        return;
      } else {
        return;
      }
      event.preventDefault();
      const target = tabs[next];
      target.focus();
      target.click();
    });
  });
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

function bindResize(els: Elements): void {
  let timer: number | undefined;
  const handler = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => draw(els), 100);
  };
  window.addEventListener('resize', handler);
}

export function enableTonearmGeometryLabInteractions(): void {
  applyStoredTheme();
  const root = document;
  const els = elements(root);

  renderTonearmSelectionState(els);
  loadNullPointsRuntimeData()
    .then((data) => {
      state.nullPoints = data;
      state.loadError = null;
      recompute(els);
      refreshSimulationFromReference(els);
      recomputeSimulation(els);
      setActiveTab(els, state.tab);
    })
    .catch((error: unknown) => {
      state.loadError = error instanceof Error ? error.message : 'Unable to load null-point dataset.';
      setActionStatus(els, 'error', state.loadError);
    });

  els.standard?.addEventListener('change', () => {
    if (els.standard) state.standard = els.standard.value as AlignmentStandard;
    applySelectedTonearm(els);
    recompute(els);
    refreshSimulationFromReference(els);
    recomputeSimulation(els);
  });

  els.method?.addEventListener('change', () => {
    if (els.method) state.method = els.method.value as AlignmentMethod;
    applySelectedTonearm(els);
    recompute(els);
    refreshSimulationFromReference(els);
    recomputeSimulation(els);
  });

  els.tonearmPick?.addEventListener('click', () => {
    const button = els.tonearmPick;
    if (button) {
      button.disabled = true;
      const originalLabel = button.textContent ?? 'Pick';
      button.textContent = 'Loading';
      const restore = () => {
        button.disabled = false;
        button.textContent = state.selectedTonearm ? 'Change' : originalLabel;
      };
      loadTonearmPickerItems()
        .then((items) => {
          restore();
          openRuntimePickerModal({
            kind: 'tonearm',
            title: 'Select tonearm reference',
            items,
            appliedItemId: state.selectedTonearm?.id ?? null,
            onApply: (item) => {
              if (typeof item.effectiveLengthMm !== 'number' || !Number.isFinite(item.effectiveLengthMm)) {
                return;
              }
              state.selectedTonearm = {
                id: item.id,
                displayName: item.displayName,
                effectiveLengthMm: item.effectiveLengthMm,
                effectiveMassG: item.effectiveMassG,
              };
              applySelectedTonearm(els);
              recompute(els);
              refreshSimulationFromReference(els);
              recomputeSimulation(els);
            },
          });
        })
        .catch((error: unknown) => {
          restore();
          setActionStatus(els, 'error', error instanceof Error ? error.message : 'Unable to load tonearm dataset.');
        });
    }
  });

  els.pivot?.addEventListener('input', () => {
    state.pivotSource = 'manual';
    recompute(els);
    refreshSimulationFromReference(els);
    recomputeSimulation(els);
    renderTonearmSelectionState(els);
  });

  [els.simP, els.simOh, els.simOa].forEach((input) => {
    input?.addEventListener('input', () => recomputeSimulation(els));
  });

  els.resetSim?.addEventListener('click', () => {
    refreshSimulationFromReference(els);
    recomputeSimulation(els);
  });

  els.reset?.addEventListener('click', () => {
    Object.assign(state, defaultState());
    if (els.standard) els.standard.value = state.standard;
    if (els.method) els.method.value = state.method;
    if (els.pivot) els.pivot.value = state.pivotToSpindleMm.toFixed(1);
    renderTonearmSelectionState(els);
    setActiveTab(els, state.tab);
    if (state.nullPoints !== null) {
      recompute(els);
      refreshSimulationFromReference(els);
      recomputeSimulation(els);
    } else {
      loadNullPointsRuntimeData().then((data) => {
        state.nullPoints = data;
        recompute(els);
        refreshSimulationFromReference(els);
        recomputeSimulation(els);
      }).catch(() => undefined);
    }
  });

  els.exportJson?.addEventListener('click', downloadJsonExport);
  els.print?.addEventListener('click', () => {
    setActiveTab(els, state.tab === 'graph' ? 'prot-ideal' : state.tab);
    window.print();
  });

  bindTabsKeyboard(els);
  bindResize(els);

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
    if (state.tab === 'graph') {
      requestAnimationFrame(() => draw(els));
    }
  });
}
