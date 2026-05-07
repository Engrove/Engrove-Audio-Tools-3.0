import {
  calculateResonanceResult,
  type ResonanceInput,
  type ResonanceResult,
} from '../engine/resonance';
import { diagnoseResonance, type ResonanceDiagnosis } from '../engine/diagnosis';

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
    helper: 'Pickup body mass without screws.',
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
  return `
    <label class="tm-lab-field" for="tm-${field.name}">
      <span class="tm-lab-field__label">${field.label}</span>
      <input
        id="tm-${field.name}"
        class="tm-lab-field__input"
        name="${field.name}"
        type="number"
        min="0"
        step="${field.step}"
        value="${defaultInput[field.name]}"
        inputmode="decimal"
        required
      />
      <span class="tm-lab-field__helper">${field.helper}</span>
    </label>
  `;
}

function resultMarkup(result: ResonanceResult, diagnosis: ResonanceDiagnosis): string {
  const label = diagnosis.level[0].toUpperCase() + diagnosis.level.slice(1);

  return `
    <div class="tm-lab-result__header">
      <p class="tm-lab-kicker">Quick Match result</p>
      <span class="tm-lab-pill tm-lab-pill--${diagnosis.level}">${label}</span>
    </div>
    <p class="tm-lab-result__hz">
      <strong>${formatNumber(result.resonanceHz)}</strong>
      <span>Hz</span>
    </p>
    <p class="tm-lab-result__target">Target zone: 8–12 Hz</p>
    <dl class="tm-lab-result__facts">
      <div>
        <dt>Total moving mass</dt>
        <dd>${formatNumber(result.totalMovingMassG)} g</dd>
      </div>
      <div>
        <dt>Diagnosis</dt>
        <dd>${diagnosis.title}</dd>
      </div>
    </dl>
    <p class="tm-lab-result__explanation">${diagnosis.explanation}</p>
    <ul class="tm-lab-suggestions">
      ${diagnosis.suggestions.map((suggestion) => `<li>${suggestion}</li>`).join('')}
    </ul>
  `;
}

function errorMarkup(message: string): string {
  return `
    <div class="tm-lab-result__header">
      <p class="tm-lab-kicker">Quick Match result</p>
      <span class="tm-lab-pill tm-lab-pill--poor">Input needed</span>
    </div>
    <p class="tm-lab-result__error">${message}</p>
    <p class="tm-lab-result__target">Use finite, non-negative masses and compliance greater than zero.</p>
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
    <div class="ea-site-shell tm-lab">
      <header class="ea-topbar tm-lab-topbar" aria-label="Primary navigation">
        <a class="ea-wordmark" href="/" aria-label="Engrove Audio home">
          <span class="ea-wordmark__mark" aria-hidden="true">EA</span>
          <span class="ea-wordmark__text">Engrove Audio</span>
        </a>
        <nav class="ea-nav" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="#quick-match">Quick Match</a>
          <a href="#assumptions">Assumptions</a>
        </nav>
        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">
          <span aria-hidden="true">◐</span>
        </button>
      </header>

      <main class="tm-lab-main">
        <section class="tm-lab-hero" aria-labelledby="tonearm-match-title">
          <p class="ea-kicker">Tonearm calculator</p>
          <h1 id="tonearm-match-title">Tonearm Match Lab</h1>
          <p class="tm-lab-hero__lead">
            Check whether a cartridge and tonearm combination lands in the safe resonance window.
          </p>
        </section>

        <section class="tm-lab-workbench" aria-label="Tonearm Match Lab workbench">
          <form class="tm-lab-card tm-lab-form" id="quick-match" data-tonearm-match-form>
            <div class="tm-lab-card__header">
              <p class="tm-lab-kicker">Manual Quick Match</p>
              <h2>Passar min pickup med min tonarm?</h2>
              <p>Enter the basic published values and get an immediate resonance diagnosis.</p>
            </div>
            <div class="tm-lab-form__fields">
              ${quickMatchFields.map(fieldMarkup).join('')}
            </div>
          </form>

          <aside
            class="tm-lab-card tm-lab-result"
            data-tonearm-match-result
            data-diagnosis-level="${initialDiagnosis.level}"
            aria-live="polite"
          >
            ${resultMarkup(initialResult, initialDiagnosis)}
          </aside>
        </section>

        <section class="tm-lab-card tm-lab-assumptions" id="assumptions" aria-labelledby="assumptions-title">
          <div>
            <p class="tm-lab-kicker">Assumptions and confidence</p>
            <h2 id="assumptions-title">What this first version assumes</h2>
          </div>
          <ul class="tm-lab-assumption-list">
            <li>This first version uses manual input and a simplified resonance model.</li>
            <li>Database-backed cartridge and tonearm selectors come in Fas 17.2.</li>
            <li>Compliance must be a 10 Hz value or an estimate converted to 10 Hz.</li>
          </ul>
        </section>
      </main>
    </div>
  `;
}

export function enableTonearmMatchLabInteractions(): void {
  bindThemeToggle();

  const form = document.querySelector<HTMLFormElement>('[data-tonearm-match-form]');
  const resultElement = document.querySelector<HTMLElement>('[data-tonearm-match-result]');

  if (!form || !resultElement) {
    return;
  }

  form.addEventListener('input', () => renderResult(form, resultElement));
  renderResult(form, resultElement);
}
