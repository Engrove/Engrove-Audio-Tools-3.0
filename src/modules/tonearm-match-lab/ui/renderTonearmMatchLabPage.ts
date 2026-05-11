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
type TableFieldMeta = {
  label: string;
  sublabel: string;
  statusClass: string;
  sourceLabel: string;
  sourceClass: string;
};

const tableFieldMeta: Record<QuickMatchFieldName, TableFieldMeta> = {
  tonearmEffectiveMassG: {
    label: 'Arm mass',
    sublabel: 'M_ARM · grams',
    statusClass: 'done',
    sourceLabel: 'Direct',
    sourceClass: 'direct',
  },
  cartridgeMassG: {
    label: 'Cart mass',
    sublabel: 'M_CART · grams',
    statusClass: 'planned',
    sourceLabel: 'From dataset',
    sourceClass: 'manufacturer',
  },
  fastenerMassG: {
    label: 'Fasteners',
    sublabel: 'Screws · grams',
    statusClass: 'done',
    sourceLabel: 'Direct',
    sourceClass: 'direct',
  },
  trackingForceG: {
    label: 'Applied VTF',
    sublabel: 'User setting · grams',
    statusClass: 'planned',
    sourceLabel: 'Setup',
    sourceClass: 'setup',
  },
  compliance10HzCu: {
    label: 'Compliance',
    sublabel: 'C @ 10 Hz · µm/mN',
    statusClass: 'planned',
    sourceLabel: 'From dataset',
    sourceClass: 'manufacturer',
  },
};

function fieldMeta(fieldName: QuickMatchFieldName): TableFieldMeta {
  return tableFieldMeta[fieldName];
}

function renderTopbar(active: 'tools' | 'match' | 'estimator'): string {
  const nav = [
    { key: 'tools', label: 'Tools', href: '/' },
    { key: 'match', label: 'Match Lab', href: '/tonearm-calculator' },
    { key: 'estimator', label: 'Estimator', href: '#' },
  ];

  return `
    <header class="ea-topbar" aria-label="Primary navigation">
      <a class="ea-brand" href="/" aria-label="Engrove Audio Tools home">
        <span class="ea-brand-accent" aria-hidden="true">//</span>
        <span>Engrove Audio Tools</span>
      </a>
      <span class="ea-topbar-divider" aria-hidden="true"></span>
      <nav class="ea-topnav" aria-label="Tools navigation">
        ${nav.map((item) => `
          <a class="ea-topnav-link" href="${item.href}"${active === item.key ? ' aria-current="page"' : ''}>${item.label}</a>
        `).join('')}
      </nav>
      <div class="ea-topbar-meta">
        <span class="ea-build-status">Build v3.0.0-rc.5</span>
        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">☼</button>
        <img class="ea-maintainer-avatar" src="/images/engrove.webp" alt="" aria-hidden="true" />
      </div>
    </header>
  `;
}

function statusDotMarkup(statusClass: string): string {
  return `<span class="ea-dot ea-dot--${escapeAttribute(statusClass)}" aria-hidden="true"></span>`;
}

function badgeMarkup(label: string, className: string): string {
  return `<span class="ea-badge ea-badge--${escapeAttribute(className)}">${renderText(label)}</span>`;
}

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
  const meta = fieldMeta(field.name);

  return `
    <tr>
      <td class="ea-col-status">${statusDotMarkup(meta.statusClass)}</td>
      <td class="ea-col-label">
        <label for="tm-${fieldName}">${renderText(meta.label)}</label>
        <span class="ea-form-table-sublabel">${renderText(meta.sublabel)}</span>
      </td>
      <td class="ea-col-value">
        <input
          id="tm-${fieldName}"
          class="ea-input tm-lab-field__input"
          name="${fieldName}"
          type="number"
          min="0"
          step="${escapeAttribute(field.step)}"
          value="${escapeAttribute(defaultInput[field.name])}"
          inputmode="decimal"
          aria-label="${escapeAttribute(field.label)}"
        />
      </td>
      <td class="ea-col-meta">${badgeMarkup(meta.sourceLabel, meta.sourceClass)}</td>
    </tr>
  `;
}


function trackingForceSetupMarkup(): string {
  const fieldName = escapeAttribute('trackingForceG');
  const meta = fieldMeta('trackingForceG');

  return `
    <tr>
      <td class="ea-col-status">${statusDotMarkup(meta.statusClass)}</td>
      <td class="ea-col-label">
        <label for="tm-${fieldName}">${renderText(meta.label)}</label>
        <span class="ea-form-table-sublabel">${renderText(meta.sublabel)}</span>
      </td>
      <td class="ea-col-value">
        <input
          id="tm-${fieldName}"
          class="ea-input tm-lab-field__input"
          name="${fieldName}"
          type="number"
          min="0"
          step="0.1"
          value="${escapeAttribute(defaultInput.trackingForceG)}"
          inputmode="decimal"
          aria-label="Tracking force, grams"
        />
      </td>
      <td class="ea-col-meta">${badgeMarkup(meta.sourceLabel, meta.sourceClass)}</td>
    </tr>
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
      <div class="ea-result-headline">
        <span class="ea-result-headline-value">${renderText(formatNumber(result.resonanceHz))}</span>
        <span class="ea-result-headline-unit">Hz</span>
      </div>
      <div class="ea-classification" data-class="${escapeAttribute(classification.label)}">
        ${statusDotMarkup(classification.group === 'ideal' || classification.group === 'good' ? 'done' : 'active')}
        <span>${renderText(classification.label)}</span>
      </div>
      ${resonanceGaugeMarkup(result, classification)}
      <div class="tm-lab-result__details">
        <div class="tm-lab-scoreline">
          <span class="tm-lab-scoreline__mark">—</span>
          <span>
            <strong>Match score</strong>
            <small>${renderText(classification.title)}</small>
          </span>
        </div>
        <p class="tm-lab-result__diagnosis-note">${renderText(diagnosis.title)} ${renderText(diagnosis.explanation)}</p>
        <dl>
          <div>
            <dt>Total moving mass</dt>
            <dd>${renderText(formatNumber(result.totalMovingMassG))} g</dd>
          </div>
          <div>
            <dt>Tracking force</dt>
            <dd>Setup only</dd>
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
    <tr class="tm-runtime-picker-row" data-runtime-picker-control="tonearm">
      <td class="ea-col-status">${statusDotMarkup('done')}</td>
      <td class="ea-col-label">
        Tonearm
        <span class="ea-form-table-sublabel">Selected reference</span>
      </td>
      <td class="ea-col-value">
        <div class="ea-input-row-with-button">
          <span class="tm-runtime-picker-summary" data-runtime-picker-summary="tonearm">No tonearm selected.</span>
          <button class="ea-button ea-button--ghost tm-runtime-picker-control__button" type="button" data-runtime-picker-open="tonearm" disabled>Pick</button>
        </div>
      </td>
      <td class="ea-col-meta">${badgeMarkup('Manufacturer', 'direct')}</td>
    </tr>
    <tr class="tm-runtime-picker-row" data-runtime-picker-control="cartridge">
      <td class="ea-col-status">${statusDotMarkup('active')}</td>
      <td class="ea-col-label">
        Cartridge
        <span class="ea-form-table-sublabel">Selected reference</span>
      </td>
      <td class="ea-col-value">
        <div class="ea-input-row-with-button">
          <span class="tm-runtime-picker-summary" data-runtime-picker-summary="cartridge">No cartridge selected.</span>
          <button class="ea-button ea-button--primary tm-runtime-picker-control__button" type="button" data-runtime-picker-open="cartridge" disabled>Pick</button>
        </div>
      </td>
      <td class="ea-col-meta">—</td>
    </tr>
    <tr class="tm-runtime-status-row">
      <td class="ea-col-status">${statusDotMarkup('active')}</td>
      <td class="ea-col-label">
        Dataset
        <span class="ea-form-table-sublabel">Runtime loader</span>
      </td>
      <td class="ea-col-value" colspan="2">
        <span class="tm-runtime-picker-status" data-runtime-picker-status>Loading public runtime data…</span>
      </td>
    </tr>
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
    <main class="tm-lab-shell ea-tool-shell">
      <a class="tm-lab-skip-link" href="#quick-match">Skip to workbench</a>
      ${renderTopbar('match')}

      <section class="ea-contextbar" aria-label="Route context">
        <div class="ea-contextbar__path">
          <span class="ea-contextbar__crumbs">
            <span>Tools</span>
            <span aria-hidden="true">/</span>
            <span class="ea-contextbar__current">Tonearm Match Lab</span>
          </span>
          <span class="ea-contextbar__divider" aria-hidden="true"></span>
          <span class="ea-contextbar__description">Estimate low-frequency cantilever-arm resonance. F₀ = 159.15 / √(M·C).</span>
        </div>
        <span class="ea-contextbar__meta">Session A4-7F19&nbsp;&nbsp; Dataset v3.0.0-rc.5</span>
      </section>

      <section class="ea-workbench ea-workbench-three tm-lab-workbench" id="quick-match" aria-labelledby="tm-lab-title">
        <aside class="ea-panel ea-workflow-rail" aria-label="Workflow">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">01</span>
            <span>Workflow</span>
          </div>
          <ol class="ea-tasklist">
            <li>
              <span class="ea-tasklist-num ea-tasklist-num--done">1</span>
              <span>
                <span class="ea-tasklist-title">Pick tonearm</span>
                <span class="ea-tasklist-sub">Effective mass + headshell</span>
              </span>
            </li>
            <li aria-current="step">
              <span class="ea-tasklist-num ea-tasklist-num--active">2</span>
              <span>
                <span class="ea-tasklist-title">Pick cartridge</span>
                <span class="ea-tasklist-sub">Mass + compliance @ 10 Hz</span>
              </span>
            </li>
            <li>
              <span class="ea-tasklist-num">3</span>
              <span>
                <span class="ea-tasklist-title">Set tracking force</span>
                <span class="ea-tasklist-sub">Setup, not in F₀</span>
              </span>
            </li>
            <li>
              <span class="ea-tasklist-num">4</span>
              <span>
                <span class="ea-tasklist-title">Read result</span>
                <span class="ea-tasklist-sub">Classification + score</span>
              </span>
            </li>
            <li>
              <span class="ea-tasklist-num">5</span>
              <span>
                <span class="ea-tasklist-title">Save session</span>
                <span class="ea-tasklist-sub">Snapshot for export</span>
              </span>
            </li>
          </ol>
        </aside>

        <div class="ea-workbench-main">
          <section class="ea-panel tm-lab-setup-panel" aria-labelledby="tm-lab-title">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id">02</span>
              <span>Resonance Inputs</span>
              <span class="ea-panel-header-spacer"></span>
              <span class="tm-lab-formula" aria-hidden="true">F₀ = 159.15 / √(M·C)</span>
            </div>
            <div class="ea-panel-body--flush">
              <form class="tm-lab-form" data-tonearm-match-form>
                <table class="ea-form-table tm-resonance-table" role="table" data-tonearm-runtime-pickers>
                  <tbody>
                    ${runtimePickerControlsMarkup()}
                    ${quickMatchFields.map(fieldMarkup).join('')}
                  </tbody>
                </table>

                <section class="ea-panel tm-lab-setup-context" aria-labelledby="tm-lab-setup-context-title">
                  <div class="ea-panel-header">
                    <span class="ea-panel-header-id">03</span>
                    <span id="tm-lab-setup-context-title">Setup Context</span>
                    <span class="ea-panel-header-spacer"></span>
                    <span class="ea-panel-header-action">Not in F₀</span>
                  </div>
                  <div class="ea-panel-body--flush">
                    <table class="ea-form-table" role="table">
                      <tbody>
                        ${trackingForceSetupMarkup()}
                      </tbody>
                    </table>
                  </div>
                </section>
              </form>
            </div>
          </section>

          <section class="ea-panel tm-lab-panel--assumptions" id="assumptions" aria-labelledby="assumptions-title">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id">05</span>
              <span id="assumptions-title">Assumptions</span>
            </div>
            <div class="ea-panel-body">
              <ul class="tm-lab-notes">
                <li>The target zone is 8–12 Hz, with 9–11 Hz shown as ideal.</li>
                <li>Tracking force is setup context and is not included in total moving mass.</li>
                <li>Compliance must be a 10 Hz value or a converted estimate.</li>
              </ul>
            </div>
          </section>
        </div>

        <aside class="ea-panel ea-workbench-result tm-lab-output" data-tonearm-match-result aria-label="Quick Match result">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">04</span>
            <span>Resonance Result</span>
            <span class="ea-panel-header-spacer"></span>
            <span class="ea-panel-header-action">Live</span>
          </div>
          ${resultMarkup(initialResult, initialDiagnosis)}
        </aside>
      </section>

      <section class="ea-actionbar" aria-label="Workspace actions">
        <div class="ea-actionbar__group">
          <span class="ea-actionbar__status">
            ${statusDotMarkup('active')}
            <span>Awaiting input</span>
          </span>
        </div>
        <div class="ea-actionbar__group">
          <span class="ea-contextbar__meta">F₀ = 159.15 / √(M·C)</span>
          <button class="ea-button ea-button--secondary" type="button" data-reset-tonearm-defaults>Reset</button>
          <button class="ea-button ea-button--ghost" type="button" disabled>Export</button>
          <button class="ea-button ea-button--primary" type="button" disabled>Save session</button>
        </div>
      </section>
    </main>
  `;
}


function resetFormToDefaults(form: HTMLFormElement, resultElement: HTMLElement): void {
  for (const field of quickMatchFields) {
    setNumericInput(form, field.name, defaultInput[field.name]);
  }
  setNumericInput(form, 'trackingForceG', defaultInput.trackingForceG);
  updateResultView(form, resultElement);
}

export function enableTonearmMatchLabInteractions(): void {
  bindThemeToggle();

  const form = document.querySelector<HTMLFormElement>('[data-tonearm-match-form]');
  const resultElement = document.querySelector<HTMLElement>('[data-tonearm-match-result]');

  if (!form || !resultElement) {
    return;
  }

  bindRuntimePickers(form);

  document.querySelector<HTMLButtonElement>('[data-reset-tonearm-defaults]')?.addEventListener('click', () => {
    resetFormToDefaults(form, resultElement);
  });

  form.addEventListener('input', (event) => {
    const input = event.target;

    if (input instanceof HTMLInputElement && input.name === 'trackingForceG') {
      return;
    }

    updateResultView(form, resultElement);
  });
  updateResultView(form, resultElement);
}
