import {
  computeInverseVtaSra,
  computeVtaSra,
  type VtaSraInput,
  type VtaSraResult,
} from '../engine/vtaSra';
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

type LengthSource = 'dataset' | 'manual' | 'default';

type SelectedTonearm = {
  id: string;
  displayName: string;
  effectiveLengthMm: number;
  effectiveMassG?: number;
};

type VtaState = {
  effectiveLengthMm: number;
  lengthSource: LengthSource;
  selectedTonearm: SelectedTonearm | null;
  referenceSraDeg: number;
  pillarDeltaMm: number;
  matDeltaMm: number;
  targetSraDeltaDeg: number;
  result: VtaSraResult | null;
  requiredPillarDeltaMm: number | null;
  loadError: string | null;
};

const defaultState = (): VtaState => ({
  effectiveLengthMm: 237,
  lengthSource: 'default',
  selectedTonearm: null,
  referenceSraDeg: 92,
  pillarDeltaMm: 0,
  matDeltaMm: 0,
  targetSraDeltaDeg: 1,
  result: null,
  requiredPillarDeltaMm: null,
  loadError: null,
});

const state: VtaState = defaultState();

const pivotX = 210;
const pivotY = 420;
const visualSpan = 535;
const pillarNominalY = 445;
const pillarNominalHeight = 73;
const minPillarHeight = 5;

function statusDot(kind: 'planned' | 'active' | 'done' | 'error'): string {
  return `<span class="ea-dot ea-dot--${kind}" aria-hidden="true"></span>`;
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function signedNumber(value: number, fractionDigits: number): string {
  const text = formatNumber(Math.abs(value), fractionDigits);
  return value >= 0 ? `+${text}` : `-${text}`;
}

function renderContextBar(): string {
  return `
    <section class="ea-contextbar" aria-label="Route context">
      <div class="ea-contextbar__path">
        <span class="ea-contextbar__crumbs">
          <span>Tools</span>
          <span aria-hidden="true">/</span>
          <span class="ea-contextbar__current">VTA &amp; SRA Lab</span>
        </span>
        <span class="ea-contextbar__divider" aria-hidden="true"></span>
        <span class="ea-contextbar__description">Compute SRA change from pillar and mat adjustments. Solve the inverse for target SRA.</span>
      </div>
    </section>
  `;
}

function physicalConstantsMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="vta-constants-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">01</span>
        <span id="vta-constants-title">Physical constants</span>
      </div>
      <div class="ea-panel-body--flush">
        <table class="ea-form-table" aria-label="Physical constants">
          <tbody>
            <tr data-vta-tonearm-row>
              <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-vta-tonearm-dot aria-hidden="true"></span></td>
              <td class="ea-col-label">Tonearm
                <span class="ea-form-table-sublabel">Pick from dataset</span>
              </td>
              <td class="ea-col-value">
                <div class="vta-picker-row">
                  <span class="vta-picker-summary" data-vta-tonearm-summary>No tonearm selected.</span>
                  <button class="ea-button ea-button--primary vta-picker-button" type="button" data-vta-tonearm-pick aria-label="Pick tonearm from dataset">Pick</button>
                </div>
              </td>
              <td class="ea-col-meta" data-vta-tonearm-meta><span class="ea-badge">Optional</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Effective length (L)
                <span class="ea-form-table-sublabel">Pivot to stylus tip</span>
              </td>
              <td class="ea-col-value">
                <input class="ea-input vta-input" type="number" inputmode="decimal" step="0.1" value="237.0" data-vta-l aria-label="Effective length in millimetres" />
              </td>
              <td class="ea-col-meta" data-vta-l-meta><span class="ea-badge">mm</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Reference SRA
                <span class="ea-form-table-sublabel">Cartridge baseline (default 92.0)</span>
              </td>
              <td class="ea-col-value">
                <input class="ea-input vta-input" type="number" inputmode="decimal" step="0.1" value="92.0" data-vta-ref-sra aria-label="Reference stylus rake angle in degrees" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge ea-badge--manufacturer">Convention</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function alignmentSimulationMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="vta-sim-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">02</span>
        <span id="vta-sim-title">Alignment simulation</span>
        <span class="ea-panel-header-spacer"></span>
        <button class="ea-button ea-button--ghost vta-reset-sim" type="button" data-vta-reset-sim>Reset sim</button>
      </div>
      <div class="ea-panel-body--flush">
        <table class="ea-form-table ea-form-table--two-column" aria-label="Reference and simulated VTA values">
          <thead>
            <tr>
              <th class="ea-col-status"></th>
              <th class="ea-col-label"></th>
              <th class="ea-table-header ea-col-value">Reference</th>
              <th class="ea-table-header ea-table-header--strong ea-col-whatif">Simulated</th>
              <th class="ea-col-meta"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Pillar height &Delta;
                <span class="ea-form-table-sublabel">Pivot adjustment</span>
              </td>
              <td class="ea-col-value">0.00</td>
              <td class="ea-col-whatif">
                <input class="ea-input vta-input" type="number" inputmode="decimal" step="0.1" value="0.00" data-vta-sim-ph aria-label="Simulated pillar height delta" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Mat thickness &Delta;
                <span class="ea-form-table-sublabel">Surface delta</span>
              </td>
              <td class="ea-col-value">0.00</td>
              <td class="ea-col-whatif">
                <input class="ea-input vta-input" type="number" inputmode="decimal" step="0.1" value="0.00" data-vta-sim-mt aria-label="Simulated mat thickness delta" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">SRA &Delta;
                <span class="ea-form-table-sublabel">arcsin((&Delta;h &minus; &Delta;m) / L)</span>
              </td>
              <td class="ea-col-value" data-vta-ref-delta>+0.000</td>
              <td class="ea-col-whatif">
                <input class="ea-input ea-input--readonly" type="text" data-vta-sim-delta value="+0.000" readonly aria-label="Computed SRA delta" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">deg</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('planned')}</td>
              <td class="ea-col-label">SRA actual
                <span class="ea-form-table-sublabel">Reference SRA + &Delta;</span>
              </td>
              <td class="ea-col-value" data-vta-ref-actual>92.00</td>
              <td class="ea-col-whatif">
                <input class="ea-input ea-input--readonly" type="text" data-vta-sim-actual value="92.00" readonly aria-label="Computed actual SRA" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">deg</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function inverseSolveMarkup(): string {
  return `
    <section class="ea-panel" aria-labelledby="vta-inverse-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">03</span>
        <span id="vta-inverse-title">Inverse solve</span>
      </div>
      <div class="ea-panel-body">
        <div class="ea-assumption-pin" role="note">
          <span class="ea-assumption-pin-label">Working assumption</span>
          <span class="ea-assumption-pin-text">Stylus is perpendicular (SRA = Reference SRA) when tonearm is parallel to the record surface. Reference SRA is configurable in panel 01.</span>
        </div>
        <table class="ea-form-table vta-inverse-table" aria-label="Inverse solve">
          <tbody>
            <tr>
              <td class="ea-col-status">${statusDot('active')}</td>
              <td class="ea-col-label">Target SRA &Delta;
                <span class="ea-form-table-sublabel">Desired change</span>
              </td>
              <td class="ea-col-value">
                <input class="ea-input vta-input" type="number" inputmode="decimal" step="0.1" value="1.00" data-vta-target-delta aria-label="Target SRA delta in degrees" />
              </td>
              <td class="ea-col-meta"><span class="ea-badge">deg</span></td>
            </tr>
            <tr>
              <td class="ea-col-status">${statusDot('done')}</td>
              <td class="ea-col-label">Required &Delta; pillar
                <span class="ea-form-table-sublabel">L &middot; sin(target_rad)</span>
              </td>
              <td class="ea-col-value vta-required-value" data-vta-required>—</td>
              <td class="ea-col-meta"><span class="ea-badge">mm</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function profileSvgMarkup(): string {
  return `
    <svg class="vta-svg-profile" viewBox="0 0 840 700" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Tonearm side profile">
      <title>Tonearm side profile</title>
      <desc>Schematic side view of the tonearm pivot, pillar, plinth, platter, record and stylus tip used to visualise pillar height and mat thickness adjustments.</desc>
      <g>
        <text x="50" y="60" font-family="JetBrains Mono" font-size="18" fill="currentColor" stroke="none" data-vta-svg-l>L: 237.0 mm</text>
        <text x="50" y="92" font-family="JetBrains Mono" font-size="18" fill="currentColor" stroke="none" data-vta-svg-sra>SRA: 92.00 deg</text>
        <text x="50" y="124" font-family="JetBrains Mono" font-size="18" fill="currentColor" stroke="none" data-vta-svg-delta>&Delta; pillar: 0.00 mm &middot; &Delta; mat: 0.00 mm</text>
        <g transform="translate(640 80)">
          <line x1="0" y1="0" x2="100" y2="0" stroke-width="1"></line>
          <line x1="0" y1="-9" x2="0" y2="9" stroke-width="0.8"></line>
          <line x1="100" y1="-9" x2="100" y2="9" stroke-width="0.8"></line>
          <text x="50" y="-16" font-family="JetBrains Mono" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">100.0 MM SCALE</text>
        </g>
      </g>
      <g>
        <rect x="50" y="560" width="740" height="100" fill="var(--ea-bg-panel-alt)"></rect>
        <line x1="50" y1="560" x2="790" y2="560" stroke-width="1"></line>
        <line x1="50" y1="660" x2="790" y2="660" stroke-width="0.8"></line>
        <line x1="50" y1="560" x2="50" y2="660" stroke-width="0.8"></line>
        <line x1="790" y1="560" x2="790" y2="660" stroke-width="0.8"></line>
        <text x="420" y="618" font-family="Inter" font-style="italic" font-size="14" text-anchor="middle" fill="currentColor" stroke="none" opacity="0.55">PLINTH &middot; PLATTER REFERENCE PLANE TOP</text>
      </g>
      <g>
        <rect x="320" y="500" width="470" height="60" fill="var(--ea-bg-panel)"></rect>
        <line x1="320" y1="500" x2="790" y2="500" stroke-width="0.6"></line>
        <line x1="320" y1="500" x2="320" y2="560" stroke-width="0.6"></line>
        <text x="555" y="535" font-family="JetBrains Mono" font-size="12" text-anchor="middle" fill="currentColor" stroke="none" opacity="0.5">PLATTER</text>
      </g>
      <rect data-vta-svg-mat x="380" y="500" width="410" height="0" fill="var(--ea-bg-panel-alt)" stroke="currentColor" stroke-width="0.4" opacity="0.92"></rect>
      <g data-vta-svg-record>
        <rect x="380" y="485" width="410" height="15" fill="currentColor" opacity="0.78"></rect>
        <line x1="380" y1="485" x2="790" y2="485" stroke-width="0.8"></line>
        <line x1="790" y1="485" x2="790" y2="500" stroke-width="0.8"></line>
        <line x1="743" y1="485" x2="743" y2="478" stroke-width="0.7"></line>
        <line x1="747" y1="485" x2="747" y2="478" stroke-width="0.7"></line>
        <text x="700" y="475" font-family="JetBrains Mono" font-size="12" text-anchor="end" fill="currentColor" stroke="none" opacity="0.7">GROOVE</text>
        <line x1="703" y1="471" x2="743" y2="481" stroke-width="0.4" opacity="0.5"></line>
      </g>
      <text data-vta-svg-clamp x="50" y="156" font-family="JetBrains Mono" font-size="13" fill="var(--ea-status-error)" stroke="none" opacity="0" pointer-events="none">VIEW CLAMPED</text>
      <g>
        <path d="M 184 560 L 184 538 L 198 518 L 222 518 L 236 538 L 236 560 Z" fill="var(--ea-bg-panel)"></path>
        <line x1="184" y1="560" x2="236" y2="560" stroke-width="0.5"></line>
        <circle cx="232" cy="534" r="2" fill="currentColor" stroke="none"></circle>
      </g>
      <g>
        <rect data-vta-svg-pillar x="204" y="445" width="14" height="73" fill="var(--ea-bg-panel)"></rect>
        <line x1="200" y1="498" x2="222" y2="498" stroke-width="0.7"></line>
        <line x1="200" y1="502" x2="222" y2="502" stroke-width="0.7"></line>
        <line x1="200" y1="506" x2="222" y2="506" stroke-width="0.7"></line>
        <line x1="200" y1="510" x2="222" y2="510" stroke-width="0.7"></line>
      </g>
      <g data-vta-svg-arm-vertical>
        <g data-vta-svg-bearing-housing>
          <rect x="184" y="395" width="52" height="50" rx="3" fill="var(--ea-bg-panel)"></rect>
          <circle cx="210" cy="420" r="14" fill="none" stroke-width="0.5"></circle>
          <line x1="184" y1="438" x2="156" y2="438" stroke-width="1.2"></line>
          <line x1="156" y1="438" x2="156" y2="460" stroke-width="0.6" stroke-dasharray="2 1.5"></line>
          <circle cx="156" cy="466" r="6" fill="var(--ea-bg-panel)"></circle>
        </g>
        <g data-vta-svg-arm-rotate>
          <line x1="184" y1="420" x2="112" y2="420" stroke-width="3"></line>
          <line x1="176" y1="415" x2="176" y2="425" stroke-width="0.8"></line>
          <line x1="167" y1="415" x2="167" y2="425" stroke-width="0.8"></line>
          <line x1="158" y1="415" x2="158" y2="425" stroke-width="0.8"></line>
          <line x1="149" y1="415" x2="149" y2="425" stroke-width="0.8"></line>
          <line x1="140" y1="415" x2="140" y2="425" stroke-width="0.8"></line>
          <line x1="131" y1="415" x2="131" y2="425" stroke-width="0.8"></line>
          <line x1="122" y1="415" x2="122" y2="425" stroke-width="0.8"></line>
          <rect x="56" y="390" width="56" height="60" rx="6" fill="var(--ea-bg-panel)"></rect>
          <line x1="112" y1="392" x2="112" y2="448" stroke-width="2"></line>
          <line x1="109" y1="392" x2="109" y2="448" stroke-width="0.5"></line>
          <line x1="56" y1="420" x2="112" y2="420" stroke-width="0.4" stroke-dasharray="3 2" opacity="0.5"></line>
          <rect x="46" y="410" width="10" height="20" fill="var(--ea-bg-panel)"></rect>
          <path d="M 236 414 L 700 417.5 L 700 422.5 L 236 426 Z" fill="var(--ea-bg-panel)"></path>
          <line x1="236" y1="420" x2="700" y2="420" stroke-width="0.3" opacity="0.5"></line>
          <rect x="700" y="410" width="18" height="20" rx="2" fill="var(--ea-bg-panel)"></rect>
          <path d="M 718 410 L 770 410 L 778 420 L 770 430 L 718 430 Z" fill="var(--ea-bg-panel)"></path>
          <path d="M 770 410 L 798 394 L 798 402 L 778 420 Z" fill="var(--ea-bg-panel)"></path>
          <rect x="722" y="430" width="42" height="36" rx="2" fill="var(--ea-bg-panel)"></rect>
          <circle cx="729" cy="439" r="1.6" fill="currentColor" stroke="none"></circle>
          <circle cx="757" cy="439" r="1.6" fill="currentColor" stroke="none"></circle>
          <line x1="722" y1="450" x2="764" y2="450" stroke-width="0.3" opacity="0.4"></line>
          <line x1="740" y1="464" x2="745" y2="483" stroke-width="1.6"></line>
          <circle cx="745" cy="485" r="4" fill="var(--ea-interactive-accent)" stroke="none"></circle>
        </g>
        <circle cx="210" cy="420" r="3.5" fill="currentColor" stroke="none"></circle>
      </g>
      <line x1="745" y1="500" x2="745" y2="555" stroke="currentColor" stroke-dasharray="3 3" opacity="0.5" stroke-width="0.8"></line>
      <text x="751" y="535" font-family="JetBrains Mono" font-size="11" fill="currentColor" stroke="none" opacity="0.7">VERT REF</text>
    </svg>
  `;
}

function visualizationMarkup(): string {
  return `
    <aside class="ea-panel vta-viz-panel" aria-labelledby="vta-viz-title">
      <div class="ea-panel-header">
        <span class="ea-panel-header-id">04</span>
        <span id="vta-viz-title">Side profile &middot; live simulation</span>
      </div>
      <div class="ea-panel-body vta-viz-body">
        <div class="vta-viz-container">
          ${profileSvgMarkup()}
        </div>
      </div>
    </aside>
  `;
}

function actionBarMarkup(): string {
  return `
    <footer class="ea-actionbar" aria-label="VTA lab actions">
      <div class="ea-actionbar__group">
        <span class="ea-actionbar__status" data-vta-action-status>
          ${statusDot('active')}
          <span data-vta-action-status-text>Live simulation active.</span>
        </span>
      </div>
      <div class="ea-actionbar__group">
        <span class="vta-formula-reminder" aria-hidden="true">&Delta;SRA = arcsin((&Delta;h &minus; &Delta;m) / L)</span>
        <button class="ea-button ea-button--ghost" type="button" data-vta-reset>Reset</button>
        <button class="ea-button ea-button--secondary" type="button" data-vta-export-json>Export JSON</button>
        <button class="ea-button ea-button--primary" type="button" data-vta-print>Print profile</button>
      </div>
    </footer>
  `;
}

export function renderVtaSraLabPage(): string {
  return `
    <main class="ea-tool-shell vta-shell">
      ${renderToolTopbar('vta')}
      ${renderContextBar()}
      <section class="ea-workbench vta-workbench" aria-label="VTA lab workbench">
        <div class="vta-workbench-grid">
          <div class="vta-workbench-main">
            ${physicalConstantsMarkup()}
            ${alignmentSimulationMarkup()}
            ${inverseSolveMarkup()}
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
    inputL: root.querySelector<HTMLInputElement>('[data-vta-l]'),
    inputLMeta: root.querySelector<HTMLElement>('[data-vta-l-meta]'),
    tonearmPick: root.querySelector<HTMLButtonElement>('[data-vta-tonearm-pick]'),
    tonearmSummary: root.querySelector<HTMLElement>('[data-vta-tonearm-summary]'),
    tonearmMeta: root.querySelector<HTMLElement>('[data-vta-tonearm-meta]'),
    tonearmDot: root.querySelector<HTMLElement>('[data-vta-tonearm-dot]'),
    inputRefSra: root.querySelector<HTMLInputElement>('[data-vta-ref-sra]'),
    inputSimPh: root.querySelector<HTMLInputElement>('[data-vta-sim-ph]'),
    inputSimMt: root.querySelector<HTMLInputElement>('[data-vta-sim-mt]'),
    inputTarget: root.querySelector<HTMLInputElement>('[data-vta-target-delta]'),
    refDelta: root.querySelector<HTMLElement>('[data-vta-ref-delta]'),
    refActual: root.querySelector<HTMLElement>('[data-vta-ref-actual]'),
    simDelta: root.querySelector<HTMLInputElement>('[data-vta-sim-delta]'),
    simActual: root.querySelector<HTMLInputElement>('[data-vta-sim-actual]'),
    required: root.querySelector<HTMLElement>('[data-vta-required]'),
    svgL: root.querySelector<SVGTextElement>('[data-vta-svg-l]'),
    svgSra: root.querySelector<SVGTextElement>('[data-vta-svg-sra]'),
    svgDelta: root.querySelector<SVGTextElement>('[data-vta-svg-delta]'),
    svgRecord: root.querySelector<SVGGElement>('[data-vta-svg-record]'),
    svgMat: root.querySelector<SVGRectElement>('[data-vta-svg-mat]'),
    svgClamp: root.querySelector<SVGTextElement>('[data-vta-svg-clamp]'),
    svgArmVertical: root.querySelector<SVGGElement>('[data-vta-svg-arm-vertical]'),
    svgArmRotate: root.querySelector<SVGGElement>('[data-vta-svg-arm-rotate]'),
    svgPillar: root.querySelector<SVGRectElement>('[data-vta-svg-pillar]'),
    statusDot: root.querySelector<HTMLElement>('[data-vta-action-status] .ea-dot'),
    statusText: root.querySelector<HTMLElement>('[data-vta-action-status-text]'),
    resetSim: root.querySelector<HTMLButtonElement>('[data-vta-reset-sim]'),
    reset: root.querySelector<HTMLButtonElement>('[data-vta-reset]'),
    exportJson: root.querySelector<HTMLButtonElement>('[data-vta-export-json]'),
    print: root.querySelector<HTMLButtonElement>('[data-vta-print]'),
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
  if (els.inputLMeta) {
    if (state.lengthSource === 'dataset') {
      els.inputLMeta.innerHTML = '<span class="ea-badge ea-badge--manufacturer">Dataset</span>';
    } else if (state.lengthSource === 'manual') {
      els.inputLMeta.innerHTML = '<span class="ea-badge ea-badge--setup">Manual</span>';
    } else {
      els.inputLMeta.innerHTML = '<span class="ea-badge">mm</span>';
    }
  }
}

function describeParseProblem(label: string, result: ParseNumberResult): string | null {
  if (result.kind === 'ok') return null;
  if (result.kind === 'blank') return `${label} is required.`;
  if (result.reason === 'not-a-number') return `${label} must be a valid number.`;
  if (result.reason === 'negative') return `${label} must not be negative.`;
  return `${label} must be greater than zero.`;
}

function setActionStatus(els: Elements, kind: 'planned' | 'active' | 'done' | 'error', text: string): void {
  if (els.statusDot) els.statusDot.className = `ea-dot ea-dot--${kind}`;
  if (els.statusText) els.statusText.textContent = text;
}

function updateView(els: Elements): void {
  const lParse = readNumberFromInput(els.inputL);
  const refParse = readNumberFromInput(els.inputRefSra, { allowNegative: true, allowZero: true });
  const phParse = readNumberFromInput(els.inputSimPh, { allowNegative: true, allowZero: true });
  const mtParse = readNumberFromInput(els.inputSimMt, { allowNegative: true, allowZero: true });
  const targetParse = readNumberFromInput(els.inputTarget, { allowNegative: true, allowZero: true });

  const problems = [
    describeParseProblem('Effective length', lParse),
    describeParseProblem('Reference SRA', refParse),
    describeParseProblem('Pillar height delta', phParse),
    describeParseProblem('Mat thickness delta', mtParse),
  ].filter((value): value is string => value !== null);
  const inverseProblems = [
    describeParseProblem('Effective length', lParse),
    describeParseProblem('Target SRA delta', targetParse),
  ].filter((value): value is string => value !== null);

  let result: VtaSraResult | null = null;
  let required: number | null = null;

  if (problems.length === 0 && lParse.kind === 'ok' && refParse.kind === 'ok' && phParse.kind === 'ok' && mtParse.kind === 'ok') {
    state.effectiveLengthMm = lParse.value;
    state.referenceSraDeg = refParse.value;
    state.pillarDeltaMm = phParse.value;
    state.matDeltaMm = mtParse.value;
    try {
      const input: VtaSraInput = {
        effectiveLengthMm: state.effectiveLengthMm,
        referenceSraDeg: state.referenceSraDeg,
        pillarDeltaMm: state.pillarDeltaMm,
        matDeltaMm: state.matDeltaMm,
      };
      result = computeVtaSra(input);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'Invalid VTA input.');
    }
  }

  if (inverseProblems.length === 0 && lParse.kind === 'ok' && targetParse.kind === 'ok') {
    state.targetSraDeltaDeg = targetParse.value;
    try {
      required = computeInverseVtaSra({
        effectiveLengthMm: lParse.value,
        targetSraDeltaDeg: targetParse.value,
      });
    } catch (error) {
      inverseProblems.push(error instanceof Error ? error.message : 'Invalid inverse target.');
    }
  }

  state.result = result;
  state.requiredPillarDeltaMm = required;

  if (els.refActual) els.refActual.textContent = refParse.kind === 'ok' ? formatNumber(refParse.value, 2) : '—';
  if (els.refDelta) els.refDelta.textContent = signedNumber(0, 3);

  if (result) {
    if (els.simDelta) els.simDelta.value = signedNumber(result.sraDeltaDeg, 3);
    if (els.simActual) els.simActual.value = formatNumber(result.sraActualDeg, 2);
  } else {
    if (els.simDelta) els.simDelta.value = '—';
    if (els.simActual) els.simActual.value = '—';
  }

  if (required !== null && els.required) {
    els.required.textContent = `${signedNumber(required, 3)} mm`;
  } else if (els.required) {
    els.required.textContent = '—';
  }

  const renderResult = result ?? null;
  updateSvg(els, renderResult);
  const allProblems = [...problems, ...inverseProblems];
  const validationMessage = allProblems.length > 0 ? allProblems[0] : null;
  const anyBlank = [lParse, refParse, phParse, mtParse, targetParse].some((parse) => parse.kind === 'blank');

  if (validationMessage) {
    setActionStatus(els, anyBlank ? 'planned' : 'error', validationMessage);
  } else if (result && required !== null) {
    setActionStatus(
      els,
      'active',
      `Δ SRA = ${signedNumber(result.sraDeltaDeg, 3)} deg · required Δ pillar = ${signedNumber(required, 2)} mm.`,
    );
  } else {
    setActionStatus(els, 'planned', 'Awaiting input.');
  }
}

/*
 * Side-profile anchoring constants. Plinth top = y=560, platter top = y=500,
 * record nominal top = y=485, arm pivot = (210, 420), bearing block bottom =
 * pillar top = y=445, base puck top = y=518. The mat band is drawn between
 * platter top and record bottom; its bottom edge is fixed.
 */
const platterTopY = 500;
const matMaxLiftPx = 200;
const matMaxSinkPx = 12;
const pillarUpMaxPx = 245;
const pillarDownMaxPx = pillarNominalHeight - minPillarHeight;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function updateSvg(els: Elements, result: VtaSraResult | null): void {
  const l = state.effectiveLengthMm > 0 ? state.effectiveLengthMm : 237;
  const visualScale = visualSpan / l;
  // Up is positive in these helpers; SVG y decreases upward.
  const rawMatUpPx = state.matDeltaMm * visualScale;
  const rawPillarUpPx = state.pillarDeltaMm * visualScale;
  const matVisualUpPx = clamp(rawMatUpPx, -matMaxSinkPx, matMaxLiftPx);
  const pillarVisualUpPx = clamp(rawPillarUpPx, -pillarDownMaxPx, pillarUpMaxPx);
  const clamped = rawMatUpPx !== matVisualUpPx || rawPillarUpPx !== pillarVisualUpPx;

  if (els.svgL) els.svgL.textContent = `L: ${formatNumber(l, 1)} mm`;
  if (els.svgSra) {
    if (result) {
      els.svgSra.textContent = `SRA: ${formatNumber(result.sraActualDeg, 2)} deg (ref ${formatNumber(state.referenceSraDeg, 1)}, delta ${signedNumber(result.sraDeltaDeg, 2)})`;
    } else {
      els.svgSra.textContent = 'SRA: —';
    }
  }
  if (els.svgDelta) {
    els.svgDelta.textContent = `Pillar delta: ${formatNumber(state.pillarDeltaMm, 2)} mm · Mat delta: ${formatNumber(state.matDeltaMm, 2)} mm`;
  }

  /*
   * Mat band: bottom anchored at platter top y=500; height grows upward as
   * mat thickness increases. Negative mat deltas clamp the band to zero so
   * the record never visually sinks into the platter.
   */
  if (els.svgMat) {
    const matBandHeight = Math.max(0, matVisualUpPx);
    els.svgMat.setAttribute('y', String(platterTopY - matBandHeight));
    els.svgMat.setAttribute('height', String(matBandHeight));
  }

  /*
   * Record group rises above the mat. The record bottom always sits exactly
   * at the mat top, which is the platter-top reference minus the mat band
   * height. SVG y axis is inverted so we translate by the negative.
   */
  if (els.svgRecord) {
    const recordLiftPx = Math.max(0, matVisualUpPx);
    els.svgRecord.setAttribute('transform', `translate(0 ${-recordLiftPx})`);
  }

  /*
   * Arm vertical group translates with pillar height; arm-rotate inside it
   * rotates around the pivot in the translated frame so the rotation axis
   * tracks the pivot exactly.
   */
  if (els.svgArmVertical) {
    els.svgArmVertical.setAttribute('transform', `translate(0 ${-pillarVisualUpPx})`);
  }

  /*
   * Pillar rect: bottom anchored at the base puck top (y = 518). Top moves
   * up with pillar height delta; height grows or shrinks accordingly down
   * to the minimum stub height so the column stays connected to the base.
   */
  if (els.svgPillar) {
    els.svgPillar.setAttribute('y', String(pillarNominalY - pillarVisualUpPx));
    els.svgPillar.setAttribute('height', String(Math.max(minPillarHeight, pillarNominalHeight + pillarVisualUpPx)));
  }

  if (els.svgArmRotate && result) {
    els.svgArmRotate.setAttribute('transform', `rotate(${result.sraDeltaDeg} ${pivotX} ${pivotY})`);
  } else if (els.svgArmRotate) {
    els.svgArmRotate.setAttribute('transform', `rotate(0 ${pivotX} ${pivotY})`);
  }

  if (els.svgClamp) {
    els.svgClamp.setAttribute('opacity', clamped ? '1' : '0');
  }
}

function downloadJsonExport(): void {
  if (!state.result || state.requiredPillarDeltaMm === null) return;

  const session = {
    schema: 'engrove-toolbox.session/v1',
    tool: 'vta-sra-lab',
    timestamp: new Date().toISOString(),
    inputs: {
      tonearm: state.selectedTonearm
        ? {
            id: state.selectedTonearm.id,
            display_name: state.selectedTonearm.displayName,
            effective_length_mm: state.selectedTonearm.effectiveLengthMm,
            effective_mass_g: state.selectedTonearm.effectiveMassG ?? null,
          }
        : null,
      effective_length_mm: state.effectiveLengthMm,
      effective_length_source: state.lengthSource,
      reference_sra_deg: state.referenceSraDeg,
      pillar_delta_mm: state.pillarDeltaMm,
      mat_delta_mm: state.matDeltaMm,
      target_sra_delta_deg: state.targetSraDeltaDeg,
    },
    result: {
      sra_delta_deg: state.result.sraDeltaDeg,
      sra_actual_deg: state.result.sraActualDeg,
      required_pillar_delta_mm: state.requiredPillarDeltaMm,
    },
  };

  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `engrove-vta-sra-lab-session-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export function enableVtaSraLabInteractions(): void {
  applyStoredTheme();
  const els = elements(document);

  renderTonearmSelectionState(els);

  const otherInputs = [els.inputRefSra, els.inputSimPh, els.inputSimMt, els.inputTarget];
  for (const input of otherInputs) {
    input?.addEventListener('input', () => updateView(els));
  }

  els.inputL?.addEventListener('input', () => {
    state.lengthSource = 'manual';
    state.selectedTonearm = null;
    renderTonearmSelectionState(els);
    updateView(els);
  });

  els.tonearmPick?.addEventListener('click', () => {
    const button = els.tonearmPick;
    if (!button) return;
    const originalLabel = button.textContent ?? 'Pick';
    button.disabled = true;
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
            state.effectiveLengthMm = item.effectiveLengthMm;
            state.lengthSource = 'dataset';
            if (els.inputL) {
              els.inputL.value = item.effectiveLengthMm.toFixed(1);
              els.inputL.removeAttribute('aria-invalid');
            }
            renderTonearmSelectionState(els);
            updateView(els);
          },
        });
      })
      .catch((error: unknown) => {
        restore();
        setActionStatus(els, 'error', error instanceof Error ? error.message : 'Unable to load tonearm dataset.');
      });
  });

  els.resetSim?.addEventListener('click', () => {
    state.pillarDeltaMm = 0;
    state.matDeltaMm = 0;
    if (els.inputSimPh) els.inputSimPh.value = '0.00';
    if (els.inputSimMt) els.inputSimMt.value = '0.00';
    updateView(els);
  });

  els.reset?.addEventListener('click', () => {
    Object.assign(state, defaultState());
    if (els.inputL) els.inputL.value = state.effectiveLengthMm.toFixed(1);
    if (els.inputRefSra) els.inputRefSra.value = state.referenceSraDeg.toFixed(1);
    if (els.inputSimPh) els.inputSimPh.value = state.pillarDeltaMm.toFixed(2);
    if (els.inputSimMt) els.inputSimMt.value = state.matDeltaMm.toFixed(2);
    if (els.inputTarget) els.inputTarget.value = state.targetSraDeltaDeg.toFixed(2);
    renderTonearmSelectionState(els);
    updateView(els);
  });

  els.exportJson?.addEventListener('click', downloadJsonExport);
  els.print?.addEventListener('click', () => window.print());

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });

  updateView(els);
}

let vtaTonearmPickerItemsPromise: Promise<RuntimePickerItem[]> | null = null;

function vtaTonearmRecordToPickerItem(record: TonearmRuntimeRecord): RuntimePickerItem {
  return {
    id: record.id,
    kind: 'tonearm',
    displayName: record.display_name,
    effectiveMassG: record.effective_mass_g,
    effectiveLengthMm: record.effective_length_mm,
  };
}

function loadTonearmPickerItems(): Promise<RuntimePickerItem[]> {
  if (!vtaTonearmPickerItemsPromise) {
    vtaTonearmPickerItemsPromise = loadTonearmsWithEffectiveLength()
      .then((records) => records.map(vtaTonearmRecordToPickerItem))
      .catch((error: unknown) => {
        vtaTonearmPickerItemsPromise = null;
        throw error;
      });
  }
  return vtaTonearmPickerItemsPromise;
}
