import {
  calculateResonanceResult,
  type ResonanceInput,
  type ResonanceResult,
} from '../engine/resonance';
import { diagnoseResonance, type ResonanceDiagnosis } from '../engine/diagnosis';
import {
  loadTonearmRuntimeData,
  type CartridgeRuntimeRecord,
  type TonearmRuntimeRecord,
} from '../data/loadTonearmRuntimeData';
import {
  openRuntimePickerModal,
  runtimePickerFieldUpdates,
  type RuntimePickerItem,
} from '../../../shared/ui/runtimePickerModal';
import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';

type QuickMatchFieldName = keyof ResonanceInput;

type QuickMatchField = {
  name: QuickMatchFieldName;
  label: string;
  helper: string;
  step: string;
};

type ResonanceBandKey =
  | 'poor_low'
  | 'marginal_low'
  | 'acceptable_low'
  | 'good'
  | 'ideal'
  | 'acceptable_high'
  | 'marginal_high'
  | 'poor_high';

type ResonanceBandGroup = 'poor' | 'marginal' | 'acceptable' | 'good' | 'ideal';

type ResonanceClassification = {
  key: ResonanceBandKey;
  group: ResonanceBandGroup;
  label: string;
  icon: string;
  title: string;
  explanation: string;
  suggestions: string[];
};

const gaugeMinHz = 5;
const gaugeMaxHz = 16;

const defaultInput: ResonanceInput = {
  tonearmEffectiveMassG: 12,
  cartridgeMassG: 6.5,
  fastenerMassG: 1,
  trackingForceG: 1.8,
  compliance10HzCu: 18,
};

const quickMatchFields: readonly QuickMatchField[] = [
  {
    name: 'tonearmEffectiveMassG',
    label: 'Tonearm effective mass, g',
    helper: 'Arm effective mass as specified by the manufacturer.',
    step: '0.1',
  },
  {
    name: 'cartridgeMassG',
    label: 'Cartridge mass, g',
    helper: 'Cartridge body mass without mounting hardware.',
    step: '0.1',
  },
  {
    name: 'fastenerMassG',
    label: 'Mounting screws/fasteners, g',
    helper: 'Mounting hardware mass only. Include headshell mass only when the arm spec excludes it.',
    step: '0.1',
  },
  {
    name: 'compliance10HzCu',
    label: 'Compliance @10 Hz, µm/mN',
    helper: 'Use a 10 Hz value. Legacy cu is equivalent to µm/mN.',
    step: '0.1',
  },
];

function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function gaugePositionPercent(hz: number): number {
  return ((clamp(hz, gaugeMinHz, gaugeMaxHz) - gaugeMinHz) / (gaugeMaxHz - gaugeMinHz)) * 100;
}

function estimateUncertaintyHz(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) {
    return 1;
  }

  return Math.max(0.8, Math.min(2, Math.round(hz) / 10));
}

function classifyResonance(hz: number): ResonanceClassification {
  if (hz < 6) {
    return {
      key: 'poor_low',
      group: 'poor',
      label: 'Poor',
      icon: '✗',
      title: 'Poor — warp territory',
      explanation: 'Resonance is inside the dominant record-warp and footfall region.',
      suggestions: [
        'Reduce moving mass if the tonearm setup allows it.',
        'Use a lower-compliance cartridge.',
        'Recheck that compliance is a 10 Hz value.',
      ],
    };
  }

  if (hz < 7) {
    return {
      key: 'marginal_low',
      group: 'marginal',
      label: 'Marginal',
      icon: '⚠',
      title: 'Marginal — vulnerable to warps',
      explanation: 'Resonance is above the lowest warp region but still below the common target zone.',
      suggestions: [
        'Try a slightly lower-compliance cartridge.',
        'Reduce fastener or headshell mass where practical.',
      ],
    };
  }

  if (hz < 8) {
    return {
      key: 'acceptable_low',
      group: 'acceptable',
      label: 'Acceptable but not optimal',
      icon: '⚠',
      title: 'Acceptable but not optimal',
      explanation: 'Resonance is close to the target zone, but low-frequency warp margin is limited.',
      suggestions: [
        'Use measured resonance checks if this setup is critical.',
        'Recheck compliance if it was converted from a 100 Hz spec.',
      ],
    };
  }

  if (hz < 9) {
    return {
      key: 'good',
      group: 'good',
      label: 'Good',
      icon: '✓',
      title: 'Good',
      explanation: 'Resonance is inside the common 8–12 Hz target zone.',
      suggestions: [
        'Confirm final setup with a test record or measurement if needed.',
        'Keep tracking force inside the cartridge manufacturer range.',
      ],
    };
  }

  if (hz <= 11) {
    return {
      key: 'ideal',
      group: 'ideal',
      label: 'Ideal',
      icon: '★',
      title: 'Ideal',
      explanation: 'Resonance is in the 9–11 Hz center of the common 8–12 Hz target zone.',
      suggestions: [
        'This is the preferred screening result, subject to compliance and mass tolerance.',
        'Confirm with measurement if the setup is critical.',
      ],
    };
  }

  if (hz <= 12) {
    return {
      key: 'good',
      group: 'good',
      label: 'Good',
      icon: '✓',
      title: 'Good',
      explanation: 'Resonance is inside the common 8–12 Hz target zone.',
      suggestions: [
        'Confirm final setup with a test record or measurement if needed.',
        'Keep tracking force inside the cartridge manufacturer range.',
      ],
    };
  }

  if (hz <= 13) {
    return {
      key: 'acceptable_high',
      group: 'acceptable',
      label: 'Acceptable but not optimal',
      icon: '⚠',
      title: 'Acceptable but not optimal',
      explanation: 'Resonance is just above the common target zone and may still be usable.',
      suggestions: [
        'Try a higher-compliance cartridge if bass or tracking margin is limited.',
        'Increase moving mass only if safe for the arm and cartridge.',
      ],
    };
  }

  if (hz <= 14) {
    return {
      key: 'marginal_high',
      group: 'marginal',
      label: 'Marginal',
      icon: '⚠',
      title: 'Marginal — bass coloration risk',
      explanation: 'Resonance is high enough that bass coloration and tracking margin should be checked.',
      suggestions: [
        'Use a higher-compliance cartridge.',
        'Increase moving mass slightly only if the tonearm setup allows it.',
      ],
    };
  }

  return {
    key: 'poor_high',
    group: 'poor',
    label: 'Poor',
    icon: '✗',
    title: 'Poor — audible coloration',
    explanation: 'Resonance is above the recommended range and may color the lowest octaves.',
    suggestions: [
      'Use a higher-compliance cartridge.',
      'Check that a 100 Hz compliance figure was not entered directly as a 10 Hz value.',
      'Increase moving mass only when the arm and cartridge manufacturer guidance allow it.',
    ],
  };
}

function fieldMarkup(field: QuickMatchField): string {
  const fieldName = escapeAttribute(field.name);

  return `
    <label class="tm-lab-field" for="tm-${fieldName}">
      <span class="tm-lab-field__label">${renderText(field.label)}</span>
      <input
        id="tm-${fieldName}"
        class="tm-lab-field__input"
        name="${fieldName}"
        type="number"
        min="0"
        step="${escapeAttribute(field.step)}"
        value="${escapeAttribute(defaultInput[field.name])}"
        inputmode="decimal"
      />
      <span class="tm-lab-field__helper">${renderText(field.helper)}</span>
    </label>
  `;
}

function trackingForceSetupMarkup(): string {
  const fieldName = escapeAttribute('trackingForceG');

  return `
    <section class="tm-lab-setup-context" aria-labelledby="tm-lab-setup-context-title">
      <div class="tm-lab-setup-context__header">
        <h3 id="tm-lab-setup-context-title">Setup context</h3>
        <p>Kept separate from the resonance mass inputs.</p>
      </div>
      <label class="tm-lab-field tm-lab-field--setup" for="tm-${fieldName}">
        <span class="tm-lab-field__label">Tracking force, g</span>
        <input
          id="tm-${fieldName}"
          class="tm-lab-field__input"
          name="${fieldName}"
          type="number"
          min="0"
          step="0.1"
          value="${escapeAttribute(defaultInput.trackingForceG)}"
          inputmode="decimal"
        />
        <span class="tm-lab-field__helper">Tracking force is set during turntable setup. It does not affect the resonance calculation.</span>
      </label>
    </section>
  `;
}

function resonanceGaugeMarkup(result: ResonanceResult, classification: ResonanceClassification): string {
  const hz = result.resonanceHz;
  const uncertaintyHz = estimateUncertaintyHz(hz);
  const markerPosition = gaugePositionPercent(hz);
  const bandStart = gaugePositionPercent(hz - uncertaintyHz);
  const bandEnd = gaugePositionPercent(hz + uncertaintyHz);
  const outsideScale = hz < gaugeMinHz || hz > gaugeMaxHz;
  const statusText = `Resonance ${formatNumber(hz)} Hz, status ${classification.label}, confidence ±${formatNumber(uncertaintyHz)} Hz`;
  const scaleText = outsideScale
    ? `${formatNumber(hz)} Hz is outside the displayed 5–16 Hz gauge range.`
    : `Gauge range 5–16 Hz. Target zone 8–12 Hz, with 9–11 Hz ideal.`;

  return `
    <figure
      class="tm-lab-gauge"
      role="img"
      aria-label="${escapeAttribute(statusText)}"
      style="--tm-marker-position: ${escapeAttribute(markerPosition.toFixed(2))}%; --tm-confidence-start: ${escapeAttribute(bandStart.toFixed(2))}%; --tm-confidence-width: ${escapeAttribute(Math.max(0, bandEnd - bandStart).toFixed(2))}%;"
    >
      <div class="tm-lab-gauge__track" aria-hidden="true">
        <span class="tm-lab-gauge__ideal-zone"></span>
        <span class="tm-lab-gauge__confidence"></span>
        <span class="tm-lab-gauge__marker" data-outside-scale="${escapeAttribute(outsideScale ? 'true' : 'false')}">
          <span class="tm-lab-gauge__marker-label">${renderText(formatNumber(hz))} Hz</span>
        </span>
      </div>
      <div class="tm-lab-gauge__scale" aria-hidden="true">
        <span>5</span>
        <span>8</span>
        <span>9</span>
        <span>11</span>
        <span>12</span>
        <span>16 Hz</span>
      </div>
      <figcaption class="tm-lab-gauge__caption">
        ${renderText(scaleText)}
        <span>${renderText(`Confidence band ±${formatNumber(uncertaintyHz)} Hz reflects normal mass and compliance tolerance.`)}</span>
      </figcaption>
    </figure>
  `;
}

export function resultMarkup(result: ResonanceResult, diagnosis: ResonanceDiagnosis): string {
  const classification = classifyResonance(result.resonanceHz);
  const suggestionItems = [
    ...classification.suggestions,
    ...diagnosis.suggestions,
  ]
    .slice(0, 5)
    .map((suggestion) => `<li>${renderText(suggestion)}</li>`)
    .join('');

  return `
    <section
      class="tm-lab-result tm-lab-result--${escapeAttribute(classification.group)} tm-lab-result--${escapeAttribute(classification.key)}"
      aria-live="polite"
    >
      <div class="tm-lab-result__summary">
        <p class="tm-lab-result__label">Estimated resonance</p>
        <p class="tm-lab-result__frequency">${renderText(formatNumber(result.resonanceHz))} Hz</p>
        <span class="tm-lab-result__badge" data-result-band="${escapeAttribute(classification.group)}">
          <span aria-hidden="true">${renderText(classification.icon)}</span>
          ${renderText(classification.label)}
        </span>
      </div>
      ${resonanceGaugeMarkup(result, classification)}
      <div class="tm-lab-result__details">
        <p class="tm-lab-result__label">Target zone: 8–12 Hz · Ideal: 9–11 Hz</p>
        <h3>${renderText(classification.title)}</h3>
        <p>${renderText(classification.explanation)}</p>
        <p class="tm-lab-result__diagnosis-note">${renderText(diagnosis.title)} ${renderText(diagnosis.explanation)}</p>
        <dl>
          <div>
            <dt>Total moving mass</dt>
            <dd>${renderText(formatNumber(result.totalMovingMassG))} g</dd>
          </div>
          <div>
            <dt>Tracking force</dt>
            <dd>Setup only, not included in moving mass</dd>
          </div>
        </dl>
        <ul class="tm-lab-result__suggestions">${suggestionItems}</ul>
      </div>
    </section>
  `;
}

export function errorMarkup(message: unknown): string {
  return `
    <section class="tm-lab-error" role="alert">
      <strong>Input needed</strong>
      <span>${renderText(message)}</span>
      <small>Use finite, non-negative masses and compliance greater than zero.</small>
    </section>
  `;
}

function runtimePickerControlsMarkup(): string {
  return `
    <section class="tm-runtime-picker-controls" data-tonearm-runtime-pickers aria-labelledby="tm-runtime-pickers-title">
      <div class="tm-runtime-picker-controls__intro">
        <h3 id="tm-runtime-pickers-title">Dataset pickers</h3>
        <p>Use match-ready public runtime data when known values should populate Quick Match.</p>
      </div>
      <div class="tm-runtime-picker-controls__grid">
        <div class="tm-runtime-picker-control" data-runtime-picker-control="cartridge">
          <button class="tm-runtime-picker-control__button" type="button" data-runtime-picker-open="cartridge" disabled>
            Select cartridge from dataset
          </button>
          <p class="tm-runtime-picker-control__summary" data-runtime-picker-summary="cartridge">No cartridge selected from dataset.</p>
        </div>
        <div class="tm-runtime-picker-control" data-runtime-picker-control="tonearm">
          <button class="tm-runtime-picker-control__button" type="button" data-runtime-picker-open="tonearm" disabled>
            Select tonearm from dataset
          </button>
          <p class="tm-runtime-picker-control__summary" data-runtime-picker-summary="tonearm">No tonearm selected from dataset.</p>
        </div>
      </div>
      <p class="tm-runtime-picker-controls__status" data-runtime-picker-status>Loading public runtime data…</p>
    </section>
  `;
}

function readNumber(form: HTMLFormElement, name: QuickMatchFieldName): number {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`);
  }
  return Number(element.value);
}

function readFormInput(form: HTMLFormElement): ResonanceInput {
  return {
    tonearmEffectiveMassG: readNumber(form, 'tonearmEffectiveMassG'),
    cartridgeMassG: readNumber(form, 'cartridgeMassG'),
    fastenerMassG: readNumber(form, 'fastenerMassG'),
    trackingForceG: readNumber(form, 'trackingForceG'),
    compliance10HzCu: readNumber(form, 'compliance10HzCu'),
  };
}

type FocusedNumberInputSnapshot = {
  element: HTMLInputElement;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: 'backward' | 'forward' | 'none' | null;
};

function captureFocusedNumberInput(form: HTMLFormElement): FocusedNumberInputSnapshot | null {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement)) {
    return null;
  }

  if (activeElement.form !== form || activeElement.type !== 'number') {
    return null;
  }

  try {
    return {
      element: activeElement,
      value: activeElement.value,
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
      selectionDirection: activeElement.selectionDirection,
    };
  } catch {
    return {
      element: activeElement,
      value: activeElement.value,
      selectionStart: null,
      selectionEnd: null,
      selectionDirection: null,
    };
  }
}

function restoreFocusedNumberInput(snapshot: FocusedNumberInputSnapshot | null): void {
  if (!snapshot || !snapshot.element.isConnected) {
    return;
  }

  if (document.activeElement !== snapshot.element) {
    snapshot.element.focus({ preventScroll: true });
  }

  if (
    document.activeElement === snapshot.element &&
    snapshot.element.value === snapshot.value &&
    snapshot.selectionStart !== null &&
    snapshot.selectionEnd !== null
  ) {
    try {
      snapshot.element.setSelectionRange(
        snapshot.selectionStart,
        snapshot.selectionEnd,
        snapshot.selectionDirection ?? 'none',
      );
    } catch {
      // Number inputs do not expose text selection in all browsers.
    }
  }
}

function updateResultView(form: HTMLFormElement, resultElement: HTMLElement): void {
  const focusedInput = captureFocusedNumberInput(form);

  try {
    const result = calculateResonanceResult(readFormInput(form));
    const diagnosis = diagnoseResonance(result.resonanceHz);
    const classification = classifyResonance(result.resonanceHz);
    resultElement.dataset.diagnosisLevel = classification.group;
    resultElement.dataset.resonanceBand = classification.key;
    resultElement.innerHTML = resultMarkup(result, diagnosis);
  } catch (error) {
    resultElement.dataset.diagnosisLevel = 'poor';
    resultElement.dataset.resonanceBand = 'error';
    resultElement.innerHTML = errorMarkup(
      error instanceof Error ? error.message : 'Check the input values.',
    );
  } finally {
    restoreFocusedNumberInput(focusedInput);
  }
}

function renderResult(form: HTMLFormElement, resultElement: HTMLElement): void {
  updateResultView(form, resultElement);
}

function toCartridgePickerItem(record: CartridgeRuntimeRecord): RuntimePickerItem {
  return {
    id: record.id,
    kind: 'cartridge',
    displayName: record.display_name,
    type: record.type,
    massG: record.mass_g,
    compliance10HzCu: record.compliance_10hz_cu,
  };
}

function toTonearmPickerItem(record: TonearmRuntimeRecord): RuntimePickerItem {
  return {
    id: record.id,
    kind: 'tonearm',
    displayName: record.display_name,
    effectiveMassG: record.effective_mass_g,
  };
}

function setNumericInput(form: HTMLFormElement, name: QuickMatchFieldName, value: number | undefined): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  element.value = String(value);
  return true;
}

function applyRuntimePickerItem(form: HTMLFormElement, item: RuntimePickerItem): boolean {
  const updates = runtimePickerFieldUpdates(item.kind, item);
  let changed = false;

  changed = setNumericInput(form, 'cartridgeMassG', updates.cartridgeMassG) || changed;
  changed = setNumericInput(form, 'compliance10HzCu', updates.compliance10HzCu) || changed;
  changed = setNumericInput(form, 'tonearmEffectiveMassG', updates.tonearmEffectiveMassG) || changed;

  return changed;
}

function writePickerSummary(item: RuntimePickerItem): void {
  const summary = document.querySelector<HTMLElement>(`[data-runtime-picker-summary="${item.kind}"]`);
  if (!summary) {
    return;
  }

  const details = item.kind === 'cartridge'
    ? [
        typeof item.massG === 'number' ? `${item.massG} g` : undefined,
        typeof item.compliance10HzCu === 'number' ? `${item.compliance10HzCu} µm/mN @10 Hz` : undefined,
      ].filter(Boolean)
    : [
        typeof item.effectiveMassG === 'number' ? `${item.effectiveMassG} g effective mass` : undefined,
      ].filter(Boolean);

  summary.innerHTML = `
    <strong>${renderText(item.kind === 'cartridge' ? 'Selected cartridge:' : 'Selected tonearm:')}</strong>
    <span>${renderText(item.displayName)}</span>
    <small>${renderText(details.length > 0 ? details.join(' · ') : 'No match values copied')}</small>
  `;
}

function bindRuntimePickers(form: HTMLFormElement): void {
  const root = document.querySelector<HTMLElement>('[data-tonearm-runtime-pickers]');
  if (!root) {
    return;
  }

  const status = root.querySelector<HTMLElement>('[data-runtime-picker-status]');
  const cartridgeButton = root.querySelector<HTMLButtonElement>('[data-runtime-picker-open="cartridge"]');
  const tonearmButton = root.querySelector<HTMLButtonElement>('[data-runtime-picker-open="tonearm"]');
  let appliedCartridgeId: string | null = null;
  let appliedTonearmId: string | null = null;

  loadTonearmRuntimeData()
    .then((data) => {
      const cartridgeItems = data.cartridges.map(toCartridgePickerItem);
      const tonearmItems = data.tonearms.map(toTonearmPickerItem);

      if (status) {
        status.textContent = 'Public runtime data is ready.';
      }
      if (cartridgeButton) {
        cartridgeButton.disabled = cartridgeItems.length === 0;
        cartridgeButton.addEventListener('click', () => {
          openRuntimePickerModal({
            kind: 'cartridge',
            title: 'Select cartridge from dataset',
            items: cartridgeItems,
            appliedItemId: appliedCartridgeId,
            onApply: (item: RuntimePickerItem) => {
              appliedCartridgeId = item.id;
              writePickerSummary(item);
              if (applyRuntimePickerItem(form, item)) {
                form.dispatchEvent(new Event('input', { bubbles: true }));
              }
            },
          });
        });
      }
      if (tonearmButton) {
        tonearmButton.disabled = tonearmItems.length === 0;
        tonearmButton.addEventListener('click', () => {
          openRuntimePickerModal({
            kind: 'tonearm',
            title: 'Select tonearm from dataset',
            items: tonearmItems,
            appliedItemId: appliedTonearmId,
            onApply: (item: RuntimePickerItem) => {
              appliedTonearmId = item.id;
              writePickerSummary(item);
              if (applyRuntimePickerItem(form, item)) {
                form.dispatchEvent(new Event('input', { bubbles: true }));
              }
            },
          });
        });
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to load runtime picker data.';
      if (status) {
        status.textContent = `Runtime picker data could not be loaded. ${message}`;
      }
      if (cartridgeButton) {
        cartridgeButton.disabled = true;
      }
      if (tonearmButton) {
        tonearmButton.disabled = true;
      }
    });
}

function bindThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  const root = document.documentElement;
  const stored = localStorage.getItem('engrove-theme');

  if (stored === 'light' || stored === 'dark') {
    root.dataset.theme = stored;
  }

  button?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    localStorage.setItem('engrove-theme', next);
  });
}

export function renderTonearmMatchLabPage(): string {
  const initialResult = calculateResonanceResult(defaultInput);
  const initialDiagnosis = diagnoseResonance(initialResult.resonanceHz);

  return `
    <main class="tm-lab-shell">
      <a class="tm-lab-skip-link" href="#quick-match">Skip to workbench</a>
      <header class="tm-lab-header">
        <a class="tm-lab-wordmark" href="/" aria-label="Engrove Audio home">
          <img src="/images/engrove.webp" alt="Engrove Audio" />
        </a>
        <nav class="tm-lab-nav" aria-label="Tonearm Match Lab">
          <a href="/">Home</a>
          <a href="#quick-match">Quick Match</a>
          <a href="#assumptions">Assumptions</a>
        </nav>
        <button class="tm-lab-theme-toggle" type="button" data-theme-toggle aria-label="Toggle theme">◐</button>
      </header>

      <section class="tm-lab-workbench" id="quick-match" aria-labelledby="tm-lab-title">
        <div class="tm-lab-workbench__main">
          <header class="tm-lab-tool-header">
            <p class="tm-lab-kicker">Tonearm calculator</p>
            <h1 id="tm-lab-title">Tonearm Match Lab</h1>
            <p>Check low-frequency cartridge and tonearm resonance with dataset-assisted setup values.</p>
          </header>

          <section class="tm-lab-setup-panel" aria-labelledby="quick-match-title">
            <div class="tm-lab-panel__intro">
              <p class="tm-lab-kicker">Quick Match workbench</p>
              <h2 id="quick-match-title">Set up the match</h2>
              <p>Use dataset values or enter the published setup numbers manually.</p>
            </div>
            <form class="tm-lab-form" data-tonearm-match-form>
              ${runtimePickerControlsMarkup()}
              <div class="tm-lab-math-fields">
                ${quickMatchFields.map(fieldMarkup).join('')}
              </div>
              ${trackingForceSetupMarkup()}
            </form>
          </section>
        </div>

        <aside class="tm-lab-output" data-tonearm-match-result aria-label="Quick Match result">
          ${resultMarkup(initialResult, initialDiagnosis)}
        </aside>
      </section>

      <section class="tm-lab-panel tm-lab-panel--assumptions" id="assumptions" aria-labelledby="assumptions-title">
        <details class="tm-lab-notes">
          <summary id="assumptions-title">Assumptions and notes</summary>
          <ul>
            <li>The target zone is 8–12 Hz, with 9–11 Hz shown as ideal.</li>
            <li>Tracking force is setup context and is not included in total moving mass.</li>
            <li>Compliance must be a 10 Hz value or a converted estimate.</li>
          </ul>
        </details>
      </section>
    </main>
  `;
}


export function enableTonearmMatchLabInteractions(): void {
  bindThemeToggle();

  const form = document.querySelector<HTMLFormElement>('[data-tonearm-match-form]');
  const resultElement = document.querySelector<HTMLElement>('[data-tonearm-match-result]');

  if (!form || !resultElement) {
    return;
  }

  bindRuntimePickers(form);
  form.addEventListener('input', (event) => {
    const input = event.target;

    if (input instanceof HTMLInputElement && input.name === 'trackingForceG') {
      return;
    }

    updateResultView(form, resultElement);
  });
  updateResultView(form, resultElement);
}
