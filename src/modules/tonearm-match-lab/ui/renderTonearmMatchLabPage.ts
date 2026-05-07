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
import { openRuntimePickerModal, runtimePickerFieldUpdates, type RuntimePickerItem } from '../../../shared/ui/runtimePickerModal';
import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';

type QuickMatchFieldName = keyof ResonanceInput;

type QuickMatchField = {
  name: QuickMatchFieldName;
  label: string;
  helper: string;
  step: string;
};

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
    label: 'Fasteners/screws mass, g',
    helper: 'Mounting screws, nuts and small hardware.',
    step: '0.1',
  },
  {
    name: 'trackingForceG',
    label: 'Tracking force, g',
    helper: 'Use your intended VTF setting.',
    step: '0.1',
  },
  {
    name: 'compliance10HzCu',
    label: 'Compliance @10 Hz, cu',
    helper: 'Must be a 10 Hz value or a converted estimate.',
    step: '0.1',
  },
];

function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
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

export function resultMarkup(result: ResonanceResult, diagnosis: ResonanceDiagnosis): string {
  const label = diagnosis.level[0].toUpperCase() + diagnosis.level.slice(1);
  const suggestionItems = diagnosis.suggestions
    .map((suggestion) => `<li>${renderText(suggestion)}</li>`)
    .join('');

  return `
    <section class="tm-lab-result tm-lab-result--${escapeAttribute(diagnosis.level)}" aria-live="polite">
      <div class="tm-lab-result__summary">
        <p class="tm-lab-result__label">Quick Match result</p>
        <p class="tm-lab-result__frequency">${renderText(formatNumber(result.resonanceHz))} Hz</p>
        <span class="tm-lab-result__badge">${renderText(label)}</span>
      </div>
      <div class="tm-lab-result__details">
        <p class="tm-lab-result__label">Target zone: 8–12 Hz</p>
        <dl>
        </dl>
        <h3>${renderText(diagnosis.title)}</h3>
        <p>${renderText(diagnosis.explanation)}</p>
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

function renderResult(form: HTMLFormElement, resultElement: HTMLElement): void {
  try {
    const result = calculateResonanceResult(readFormInput(form));
    const diagnosis = diagnoseResonance(result.resonanceHz);
    resultElement.dataset.diagnosisLevel = diagnosis.level;
    resultElement.innerHTML = resultMarkup(result, diagnosis);
  } catch (error) {
    resultElement.dataset.diagnosisLevel = 'poor';
    resultElement.innerHTML = errorMarkup(
      error instanceof Error ? error.message : 'Check the input values.',
    );
  }
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
        typeof item.compliance10HzCu === 'number' ? `${item.compliance10HzCu} cu @10 Hz` : undefined,
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
            onApply: (item) => {
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
            onApply: (item) => {
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
      <header class="tm-lab-header">
        <a class="tm-lab-wordmark" href="/" aria-label="Engrove Audio home">
          <img src="/engrove-audio-wordmark.svg" alt="Engrove Audio" />
        </a>
        <nav class="tm-lab-nav" aria-label="Tonearm Match Lab">
          <a href="/">Home</a>
          <a href="#quick-match">Quick Match</a>
          <a href="#assumptions">Assumptions</a>
        </nav>
        <button class="tm-lab-theme-toggle" type="button" data-theme-toggle aria-label="Toggle theme">◐</button>
      </header>

      <section class="tm-lab-hero" aria-labelledby="tm-lab-title">
        <p class="tm-lab-kicker">Tonearm calculator</p>
        <h1 id="tm-lab-title">Tonearm Match Lab</h1>
        <p class="tm-lab-lede">
          Check whether a cartridge and tonearm combination lands in the safe resonance window.
        </p>
      </section>

      <section class="tm-lab-panel" id="quick-match" aria-labelledby="quick-match-title">
        <div class="tm-lab-panel__intro">
          <p class="tm-lab-kicker">Manual Quick Match</p>
          <h2 id="quick-match-title">Does my cartridge match my tonearm?</h2>
          <p>Enter the basic published values and get an immediate resonance diagnosis.</p>
        </div>

        <form class="tm-lab-form" data-tonearm-match-form>
          ${runtimePickerControlsMarkup()}
          ${quickMatchFields.map(fieldMarkup).join('')}
        </form>

        <div class="tm-lab-output" data-tonearm-match-result>
          ${resultMarkup(initialResult, initialDiagnosis)}
        </div>
      </section>

      <section class="tm-lab-panel tm-lab-panel--assumptions" id="assumptions" aria-labelledby="assumptions-title">
        <p class="tm-lab-kicker">Assumptions and confidence</p>
        <h2 id="assumptions-title">What this first version assumes</h2>
        <ul>
          <li>This first version uses manual input and a simplified resonance model.</li>
          <li>Dataset pickers can copy match-ready public runtime values into the manual inputs.</li>
          <li>Compliance must be a 10 Hz value or an estimate converted to 10 Hz.</li>
        </ul>
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
  form.addEventListener('input', () => renderResult(form, resultElement));
  renderResult(form, resultElement);
}
