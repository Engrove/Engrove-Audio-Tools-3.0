import {
  estimateCompliance,
  generatorTypeLabel,
  sourceTypeLabel,
  type ComplianceEstimatorInput,
  type ComplianceEstimatorResult,
  type ComplianceProvenance,
  type ComplianceSourceType,
  type GeneratorType,
} from '../engine/complianceEstimator';
import {
  loadTonearmRuntimeData,
  type CartridgeRuntimeRecord,
} from '../../tonearm-match-lab/data/loadTonearmRuntimeData';
import {
  openRuntimePickerModal,
  type RuntimePickerItem,
} from '../../../shared/ui/runtimePickerModal';
import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';
import { buildVersionLabel } from '../../../shared/app/buildVersion';

type EvaluatedCompliance =
  | {
      ok: true;
      result: ComplianceEstimatorResult;
      input: ComplianceEstimatorInput;
    }
  | {
      ok: false;
      message: string;
    };

type ComplianceInputSource = 'manual' | 'dataset' | 'unavailable';
type ComplianceReferenceSource = 'none' | 'dataset' | 'unavailable';
type ComplianceWorkflowStep = 'input' | 'model' | 'result';
type ComplianceWorkflowStatus = 'planned' | 'active' | 'done';

type ComplianceUiState = {
  selectedCartridge: RuntimePickerItem | null;
  complianceSource: ComplianceInputSource;
  cartridgeSource: ComplianceReferenceSource;
};

const defaultCustomMultiplier = 1.7;
const complianceState: ComplianceUiState = {
  selectedCartridge: null,
  complianceSource: 'manual',
  cartridgeSource: 'none',
};

let cartridgePickerItemsPromise: Promise<RuntimePickerItem[]> | null = null;

function renderTopbar(active: 'tools' | 'match' | 'estimator'): string {
  const nav = [
    { key: 'tools', label: 'Tools', href: '/' },
    { key: 'match', label: 'Match Lab', href: '/tonearm-calculator' },
    { key: 'estimator', label: 'Estimator', href: '/compliance' },
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
        <span class="ea-build-status">${buildVersionLabel()}</span>
        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">☼</button>
        <img class="ea-maintainer-avatar" src="/images/engrove.webp" alt="" aria-hidden="true" />
      </div>
    </header>
  `;
}

function statusDotMarkup(statusClass: string): string {
  return `<span class="ea-dot ea-dot--${escapeAttribute(statusClass)}" aria-hidden="true"></span>`;
}

function badgeMarkup(label: string, className: 'direct' | 'manufacturer' | 'setup'): string {
  return `<span class="ea-badge ea-badge--${className}">${renderText(label)}</span>`;
}

function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function formatInputNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function sourceTypeBadgeLabel(sourceType: ComplianceSourceType): string {
  switch (sourceType) {
    case 'dynamic-10hz':
      return '10 Hz';
    case 'dynamic-100hz':
      return '100 Hz';
    case 'static':
      return 'Static';
  }
}

function provenanceBadgeLabel(provenance: ComplianceProvenance): string {
  switch (provenance) {
    case 'direct':
      return 'Direct';
    case 'converted':
      return 'Converted';
    case 'estimated':
      return 'Estimate';
    case 'custom':
      return 'Custom';
  }
}

function provenanceLabel(provenance: ComplianceProvenance): string {
  switch (provenance) {
    case 'direct':
      return 'Direct';
    case 'converted':
      return 'Converted estimate';
    case 'estimated':
      return 'Estimated';
    case 'custom':
      return 'Custom estimate';
  }
}

function complianceSourceBadge(source: ComplianceInputSource): string {
  switch (source) {
    case 'dataset':
      return badgeMarkup('Dataset', 'manufacturer');
    case 'unavailable':
      return badgeMarkup('Unavailable', 'setup');
    case 'manual':
      return badgeMarkup('Manual', 'direct');
  }
}

function cartridgeSourceBadge(source: ComplianceReferenceSource): string {
  switch (source) {
    case 'dataset':
      return badgeMarkup('Dataset', 'manufacturer');
    case 'unavailable':
      return badgeMarkup('Unavailable', 'setup');
    case 'none':
      return badgeMarkup('Optional', 'setup');
  }
}

function modelBadge(sourceType: ComplianceSourceType, generatorType: GeneratorType): string {
  if (sourceType === 'dynamic-10hz') {
    return badgeMarkup('Not used', 'setup');
  }
  if (sourceType === 'static') {
    return badgeMarkup('×0.5', 'setup');
  }
  if (generatorType === 'unknown-custom') {
    return badgeMarkup('Custom', 'setup');
  }
  return badgeMarkup('Model', 'manufacturer');
}

function confidenceBadge(result: ComplianceEstimatorResult): string {
  if (result.confidence === 'high') {
    return badgeMarkup('Direct', 'direct');
  }

  if (result.confidence === 'medium') {
    return badgeMarkup('Converted', 'manufacturer');
  }

  return badgeMarkup('Estimate', 'setup');
}

function normalizeNumberInputText(value: string): string {
  return value.trim().replace(',', '.');
}

function setInputValidity(element: HTMLInputElement, valid: boolean): void {
  if (valid) {
    element.removeAttribute('aria-invalid');
    return;
  }

  element.setAttribute('aria-invalid', 'true');
}

function readPositiveNumber(form: HTMLFormElement, name: string, label: string): number {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${label}.`);
  }

  const normalized = normalizeNumberInputText(element.value);
  if (normalized === '') {
    setInputValidity(element, false);
    throw new Error(`${label} is required.`);
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    setInputValidity(element, false);
    throw new Error(`${label} must be greater than zero.`);
  }

  setInputValidity(element, true);
  return value;
}

function readOptionalPositiveNumber(form: HTMLFormElement, name: string, label: string): number | undefined {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${label}.`);
  }

  if (element.disabled) {
    setInputValidity(element, true);
    return undefined;
  }

  const normalized = normalizeNumberInputText(element.value);
  if (normalized === '') {
    setInputValidity(element, false);
    throw new Error(`${label} is required for custom conversion.`);
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    setInputValidity(element, false);
    throw new Error(`${label} must be greater than zero.`);
  }

  setInputValidity(element, true);
  return value;
}

function readSelectValue<T extends string>(form: HTMLFormElement, name: string, fallback: T): T {
  const element = form.elements.namedItem(name);

  if (!(element instanceof HTMLSelectElement)) {
    return fallback;
  }

  return element.value as T;
}

function readFormInput(form: HTMLFormElement): ComplianceEstimatorInput {
  const sourceType = readSelectValue<ComplianceSourceType>(form, 'sourceType', 'dynamic-100hz');
  const generatorType = readSelectValue<GeneratorType>(form, 'generatorType', 'mm-mi');

  return {
    complianceValue: readPositiveNumber(form, 'complianceValue', 'Published compliance'),
    sourceType,
    generatorType,
    customMultiplier: readOptionalPositiveNumber(form, 'customMultiplier', 'Custom multiplier'),
  };
}

function evaluateCompliance(form: HTMLFormElement): EvaluatedCompliance {
  try {
    const input = readFormInput(form);
    return {
      ok: true,
      input,
      result: estimateCompliance(input),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Check the input values.',
    };
  }
}

function resultBand(result: ComplianceEstimatorResult): 'ideal' | 'good' | 'acceptable' {
  return result.confidence === 'high'
    ? 'ideal'
    : result.confidence === 'medium'
      ? 'good'
      : 'acceptable';
}

function inputSourceCopy(state: ComplianceUiState): string {
  if (state.complianceSource === 'dataset') {
    return 'Cartridge dataset 10 Hz runtime value';
  }
  if (state.complianceSource === 'unavailable') {
    return 'No runtime compliance value for selected cartridge';
  }
  return 'Manual entry';
}

function detailRow(label: string, value: string, badge: string): string {
  return `
    <div class="ce-detail-row">
      <span class="ce-detail-label">${renderText(label)}</span>
      <span class="ce-detail-value">${renderText(value)}</span>
      <span class="ce-detail-badge">${badge}</span>
    </div>
  `;
}

function resultMarkup(
  evaluated: Extract<EvaluatedCompliance, { ok: true }>,
  state: ComplianceUiState,
): string {
  const { input, result } = evaluated;
  const band = resultBand(result);
  const modelValue = input.sourceType === 'dynamic-10hz'
    ? 'Not applied to direct 10 Hz input'
    : input.sourceType === 'static'
      ? 'Static-to-dynamic reference'
      : generatorTypeLabel(input.generatorType);

  return `
    <div class="tm-lab-result" data-compliance-result-state="ready">
      <div class="ea-result-headline">
        <span class="ea-result-headline-value">${formatNumber(result.estimatedCompliance10Hz, 1)}</span>
        <span class="ea-result-headline-unit">µm/mN @ 10 Hz</span>
      </div>
      <div class="ea-classification" data-band="${band}">
        ${statusDotMarkup(result.confidence === 'high' ? 'done' : 'active')}
        <span>${renderText(provenanceLabel(result.provenance))}</span>
      </div>
      <div class="tm-lab-scoreline ce-scoreline">
        <span class="tm-lab-scoreline__mark" data-band="${band}" style="--tm-score-value: ${result.confidence === 'high' ? 100 : result.confidence === 'medium' ? 72 : 54}">
          ×${formatNumber(result.multiplier, 2)}
        </span>
        <span>
          <strong>Multiplier used</strong>
          <small>${renderText(result.title)}</small>
        </span>
      </div>
      <div class="ea-panel-body">
        <p class="ea-muted">
          ${renderText(result.note)}
        </p>
        <div class="ce-detail-list" aria-label="Compliance conversion details">
          ${detailRow('Input', `${formatNumber(input.complianceValue, 1)} µm/mN`, complianceSourceBadge(state.complianceSource))}
          ${detailRow('Input source', inputSourceCopy(state), complianceSourceBadge(state.complianceSource))}
          ${detailRow('Measurement basis', sourceTypeLabel(input.sourceType), badgeMarkup(sourceTypeBadgeLabel(input.sourceType), 'direct'))}
          ${detailRow('Generator model', modelValue, modelBadge(input.sourceType, input.generatorType))}
          ${detailRow('Confidence', result.confidence === 'high' ? 'High / direct' : result.confidence === 'medium' ? 'Model estimate' : 'Wide estimate', confidenceBadge(result))}
          ${detailRow('Provenance', provenanceLabel(result.provenance), badgeMarkup(provenanceBadgeLabel(result.provenance), result.confidence === 'high' ? 'direct' : result.confidence === 'medium' ? 'manufacturer' : 'setup'))}
        </div>
      </div>
    </div>
  `;
}

function awaitingMarkup(message = 'Enter a published compliance value or select a cartridge to compute an estimate.'): string {
  return `
    <div class="tm-lab-result" data-compliance-result-state="awaiting">
      <div class="ea-result-headline">
        <span class="ea-result-headline-value">—</span>
        <span class="ea-result-headline-unit">µm/mN @ 10 Hz</span>
      </div>
      <div class="ea-classification" data-band="poor">
        ${statusDotMarkup('planned')}
        <span>Input needed</span>
      </div>
      <div class="ea-panel-body">
        <p class="ea-muted">${renderText(message)}</p>
        <p class="ea-muted">Blank, zero or invalid inputs do not produce a converted result.</p>
      </div>
    </div>
  `;
}

function workflowStepMarkup(
  index: number,
  title: string,
  subtitle: string,
  status: ComplianceWorkflowStatus,
): string {
  const stateAttribute = status === 'active' ? ' data-step-state="active" aria-current="step"' : ` data-step-state="${status}"`;
  const numClass = status === 'done'
    ? 'ea-tasklist-num ea-tasklist-num--done'
    : status === 'active'
      ? 'ea-tasklist-num ea-tasklist-num--active'
      : 'ea-tasklist-num';

  return `
    <li${stateAttribute}>
      <span class="${numClass}">${index}</span>
      <span>
        <span class="ea-tasklist-title">${renderText(title)}</span>
        <span class="ea-tasklist-sub">${renderText(subtitle)}</span>
      </span>
    </li>
  `;
}

function workflowMarkup(
  evaluated: EvaluatedCompliance,
  form: HTMLFormElement | null,
  state: ComplianceUiState,
): string {
  const hasValue = evaluated.ok || !/required/i.test(evaluated.message ?? '');
  const sourceType = form ? readSelectValue<ComplianceSourceType>(form, 'sourceType', 'dynamic-100hz') : 'dynamic-100hz';
  const generatorType = form ? readSelectValue<GeneratorType>(form, 'generatorType', 'mm-mi') : 'mm-mi';
  const hasReference = state.selectedCartridge !== null;
  const needsCustom = sourceType === 'dynamic-100hz' && generatorType === 'unknown-custom';

  const inputStatus: ComplianceWorkflowStatus = evaluated.ok || hasValue || hasReference ? 'done' : 'active';
  const modelStatus: ComplianceWorkflowStatus = evaluated.ok
    ? 'done'
    : inputStatus === 'done'
      ? 'active'
      : 'planned';
  const resultStatus: ComplianceWorkflowStatus = evaluated.ok ? 'active' : 'planned';

  const inputSubtitle = hasReference
    ? 'cartridge reference selected'
    : inputStatus === 'done'
      ? 'source value entered'
      : 'enter value or choose cartridge';
  const modelSubtitle = needsCustom
    ? 'custom multiplier required'
    : `${sourceTypeLabel(sourceType)} · ${sourceType === 'dynamic-100hz' ? generatorTypeLabel(generatorType) : 'no generator multiplier'}`;
  const resultSubtitle = evaluated.ok ? 'estimate ready' : 'awaiting valid input';

  return `
    <ol class="ea-tasklist">
      ${workflowStepMarkup(1, 'Enter source value', inputSubtitle, inputStatus)}
      ${workflowStepMarkup(2, 'Choose source/model', modelSubtitle, modelStatus)}
      ${workflowStepMarkup(3, 'Read estimate', resultSubtitle, resultStatus)}
    </ol>
  `;
}

function updateCustomMultiplierState(form: HTMLFormElement): void {
  const sourceType = readSelectValue<ComplianceSourceType>(form, 'sourceType', 'dynamic-100hz');
  const generatorType = readSelectValue<GeneratorType>(form, 'generatorType', 'mm-mi');
  const customInput = form.elements.namedItem('customMultiplier');
  const customRow = form.querySelector<HTMLTableRowElement>('[data-custom-multiplier-row]');

  if (!(customInput instanceof HTMLInputElement)) {
    return;
  }

  const needsCustom = sourceType === 'dynamic-100hz' && generatorType === 'unknown-custom';
  customInput.disabled = !needsCustom;
  if (customRow) {
    customRow.hidden = !needsCustom;
  }

  if (!needsCustom) {
    setInputValidity(customInput, true);
  }
}

function updateModelBadges(form: HTMLFormElement): void {
  const sourceType = readSelectValue<ComplianceSourceType>(form, 'sourceType', 'dynamic-100hz');
  const generatorType = readSelectValue<GeneratorType>(form, 'generatorType', 'mm-mi');
  const sourceBadge = form.querySelector<HTMLElement>('[data-source-type-badge]');
  const modelBadgeElement = form.querySelector<HTMLElement>('[data-generator-model-badge]');

  if (sourceBadge) {
    sourceBadge.innerHTML = badgeMarkup(sourceTypeBadgeLabel(sourceType), 'direct');
  }
  if (modelBadgeElement) {
    modelBadgeElement.innerHTML = modelBadge(sourceType, generatorType);
  }
}

function updateCartridgeReferenceMarkup(form: HTMLFormElement, state: ComplianceUiState): void {
  const summaryElement = form.querySelector<HTMLElement>('[data-compliance-cartridge-summary]');
  const sourceElement = form.querySelector<HTMLElement>('[data-compliance-cartridge-source]');
  const pickButton = form.querySelector<HTMLButtonElement>('[data-compliance-pick-cartridge]');
  const statusElement = form.querySelector<HTMLElement>('[data-compliance-cartridge-status]');
  const complianceSourceElement = form.querySelector<HTMLElement>('[data-compliance-source-badge]');

  if (summaryElement) {
    if (state.selectedCartridge) {
      const compliance = typeof state.selectedCartridge.compliance10HzCu === 'number'
        ? `${formatNumber(state.selectedCartridge.compliance10HzCu, 1)} µm/mN @ 10 Hz`
        : 'No runtime compliance value available';
      summaryElement.innerHTML = `
        <strong>${renderText(state.selectedCartridge.displayName)}</strong>
        <span>${renderText(compliance)}</span>
      `;
    } else {
      summaryElement.textContent = 'No cartridge selected.';
    }
  }

  if (sourceElement) {
    sourceElement.innerHTML = cartridgeSourceBadge(state.cartridgeSource);
  }

  if (complianceSourceElement) {
    complianceSourceElement.innerHTML = complianceSourceBadge(state.complianceSource);
  }

  if (pickButton) {
    pickButton.textContent = state.selectedCartridge ? 'Change' : 'Pick';
    pickButton.setAttribute('aria-label', state.selectedCartridge ? 'Change cartridge reference' : 'Select cartridge from dataset');
  }

  if (statusElement) {
    statusElement.className = state.selectedCartridge ? 'ea-dot ea-dot--done' : 'ea-dot ea-dot--planned';
  }
}

function updateComplianceView(
  form: HTMLFormElement,
  resultElement: HTMLElement,
  statusElement: HTMLElement,
  workflowElement: HTMLElement,
  state: ComplianceUiState,
): void {
  updateCustomMultiplierState(form);
  updateModelBadges(form);
  updateCartridgeReferenceMarkup(form, state);

  const evaluated = evaluateCompliance(form);
  workflowElement.innerHTML = workflowMarkup(evaluated, form, state);

  if (evaluated.ok) {
    resultElement.innerHTML = resultMarkup(evaluated, state);
    statusElement.innerHTML = `${statusDotMarkup(evaluated.result.confidence === 'high' ? 'done' : 'active')} ${renderText(provenanceLabel(evaluated.result.provenance))} ready`;
    return;
  }

  resultElement.innerHTML = awaitingMarkup(evaluated.message);
  const unavailable = state.cartridgeSource === 'unavailable' && state.complianceSource === 'unavailable';
  statusElement.innerHTML = `${statusDotMarkup('active')} ${unavailable ? 'Runtime compliance unavailable' : 'Input needed'}`;
}

function resetComplianceForm(
  form: HTMLFormElement,
  resultElement: HTMLElement,
  statusElement: HTMLElement,
  workflowElement: HTMLElement,
  state: ComplianceUiState,
): void {
  const complianceInput = form.elements.namedItem('complianceValue');
  const sourceType = form.elements.namedItem('sourceType');
  const generatorType = form.elements.namedItem('generatorType');
  const customMultiplier = form.elements.namedItem('customMultiplier');

  state.selectedCartridge = null;
  state.complianceSource = 'manual';
  state.cartridgeSource = 'none';

  if (complianceInput instanceof HTMLInputElement) {
    complianceInput.value = '';
    setInputValidity(complianceInput, true);
  }

  if (sourceType instanceof HTMLSelectElement) {
    sourceType.value = 'dynamic-100hz';
  }

  if (generatorType instanceof HTMLSelectElement) {
    generatorType.value = 'mm-mi';
  }

  if (customMultiplier instanceof HTMLInputElement) {
    customMultiplier.value = String(defaultCustomMultiplier);
    setInputValidity(customMultiplier, true);
  }

  updateComplianceView(form, resultElement, statusElement, workflowElement, state);
}

function storedTheme(): 'light' | 'dark' | null {
  const stored = localStorage.getItem('engrove-theme');
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) {
    document.documentElement.dataset.theme = theme;
  }
}

function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('engrove-theme', next);
}

function cartridgeRuntimeRecordToPickerItem(record: CartridgeRuntimeRecord): RuntimePickerItem {
  return {
    id: record.id,
    kind: 'cartridge',
    displayName: record.display_name,
    type: record.type,
    massG: record.mass_g,
    compliance10HzCu: record.compliance_10hz_cu,
  };
}

async function loadCartridgePickerItems(): Promise<RuntimePickerItem[]> {
  if (!cartridgePickerItemsPromise) {
    cartridgePickerItemsPromise = loadTonearmRuntimeData()
      .then((runtimeData) => runtimeData.cartridges.map(cartridgeRuntimeRecordToPickerItem));
  }

  return cartridgePickerItemsPromise;
}

function applyCartridgeSelection(
  item: RuntimePickerItem,
  form: HTMLFormElement,
  resultElement: HTMLElement,
  statusElement: HTMLElement,
  workflowElement: HTMLElement,
  state: ComplianceUiState,
): void {
  const complianceInput = form.elements.namedItem('complianceValue');
  const sourceType = form.elements.namedItem('sourceType');

  state.selectedCartridge = item;
  state.cartridgeSource = typeof item.compliance10HzCu === 'number' && Number.isFinite(item.compliance10HzCu) && item.compliance10HzCu > 0
    ? 'dataset'
    : 'unavailable';

  if (state.cartridgeSource === 'dataset' && complianceInput instanceof HTMLInputElement) {
    complianceInput.value = formatInputNumber(item.compliance10HzCu as number);
    setInputValidity(complianceInput, true);
    state.complianceSource = 'dataset';

    if (sourceType instanceof HTMLSelectElement) {
      sourceType.value = 'dynamic-10hz';
    }
  } else {
    const currentValue = complianceInput instanceof HTMLInputElement ? complianceInput.value.trim() : '';
    state.complianceSource = currentValue.length > 0 ? 'manual' : 'unavailable';
  }

  updateComplianceView(form, resultElement, statusElement, workflowElement, state);
}

function renderWorkflowShell(): string {
  return workflowMarkup({ ok: false, message: 'Published compliance is required.' }, null, complianceState);
}

export function renderComplianceEstimatorPage(): string {
  return `
    <main class="tm-lab-shell ea-tool-shell">
      <a class="tm-lab-skip-link" href="#compliance-estimator">Skip to estimator</a>
      ${renderTopbar('estimator')}

      <section class="ea-contextbar" aria-label="Route context">
        <div class="ea-contextbar__path">
          <span class="ea-contextbar__crumbs">
            <span>Tools</span>
            <span aria-hidden="true">/</span>
            <span class="ea-contextbar__current">Compliance Estimator</span>
          </span>
          <span class="ea-contextbar__divider" aria-hidden="true"></span>
          <span class="ea-contextbar__description">Convert published compliance values to an estimated 10 Hz dynamic compliance.</span>
        </div>
      </section>

      <section class="ea-workbench ea-workbench-three tm-lab-workbench" id="compliance-estimator" aria-labelledby="compliance-estimator-title">
        <aside class="ea-panel ea-workflow-rail" aria-label="Workflow">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">01</span>
            <span>Workflow</span>
          </div>
          <div data-compliance-workflow>
            ${renderWorkflowShell()}
          </div>
        </aside>

        <form class="ea-workbench-main tm-lab-form" data-compliance-estimator-form aria-labelledby="compliance-estimator-title">
          <section class="ea-panel">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id">02</span>
              <span id="compliance-estimator-title">Compliance inputs</span>
              <span class="ea-panel-header-spacer"></span>
              <span class="tm-lab-formula">C₁₀ estimate</span>
            </div>
            <div class="ea-panel-body ea-panel-body--flush">
              <table class="ea-form-table tm-resonance-table ce-estimator-table" aria-label="Compliance estimator inputs">
                <tbody>
                  <tr>
                    <td class="ea-col-status"><span class="ea-dot ea-dot--planned" data-compliance-cartridge-status aria-hidden="true"></span></td>
                    <td class="ea-col-label">
                      Cartridge
                      <span class="ea-form-table-sublabel">optional dataset reference</span>
                    </td>
                    <td class="ea-col-value">
                      <div class="ce-picker-row">
                        <span class="ce-picker-summary" data-compliance-cartridge-summary>No cartridge selected.</span>
                        <button class="ea-button ea-button--secondary ce-picker-button" type="button" data-compliance-pick-cartridge aria-label="Select cartridge from dataset">Pick</button>
                      </div>
                    </td>
                    <td class="ea-col-meta" data-compliance-cartridge-source>${cartridgeSourceBadge('none')}</td>
                  </tr>
                  <tr>
                    <td class="ea-col-status">${statusDotMarkup('active')}</td>
                    <td class="ea-col-label">
                      Published compliance
                      <span class="ea-form-table-sublabel">µm/mN · CU</span>
                    </td>
                    <td class="ea-col-value">
                      <input class="ea-input tm-lab-field__input" name="complianceValue" inputmode="decimal" autocomplete="off" placeholder="10 or 10,0" aria-label="Published compliance value" />
                    </td>
                    <td class="ea-col-meta" data-compliance-source-badge>${complianceSourceBadge('manual')}</td>
                  </tr>
                  <tr>
                    <td class="ea-col-status">${statusDotMarkup('planned')}</td>
                    <td class="ea-col-label">
                      Source type
                      <span class="ea-form-table-sublabel">measurement basis</span>
                    </td>
                    <td class="ea-col-value">
                      <select class="ea-input" name="sourceType" aria-label="Source measurement type">
                        <option value="dynamic-100hz" selected>Dynamic compliance @ 100 Hz</option>
                        <option value="dynamic-10hz">Dynamic compliance @ 10 Hz</option>
                        <option value="static">Static compliance</option>
                      </select>
                    </td>
                    <td class="ea-col-meta" data-source-type-badge>${badgeMarkup('100 Hz', 'direct')}</td>
                  </tr>
                  <tr>
                    <td class="ea-col-status">${statusDotMarkup('planned')}</td>
                    <td class="ea-col-label">
                      Generator type
                      <span class="ea-form-table-sublabel">100 Hz reference model</span>
                    </td>
                    <td class="ea-col-value">
                      <select class="ea-input" name="generatorType" aria-label="Generator type">
                        <option value="mm-mi" selected>MM / MI · standard ×1.5</option>
                        <option value="mc-low-output">MC low output · standard ×2.0</option>
                        <option value="mc-high-output">MC high output · standard ×1.7</option>
                        <option value="unknown-custom">Unknown / custom override</option>
                      </select>
                    </td>
                    <td class="ea-col-meta" data-generator-model-badge>${badgeMarkup('Model', 'manufacturer')}</td>
                  </tr>
                  <tr data-custom-multiplier-row hidden>
                    <td class="ea-col-status">${statusDotMarkup('planned')}</td>
                    <td class="ea-col-label">
                      Custom multiplier
                      <span class="ea-form-table-sublabel">custom override only</span>
                    </td>
                    <td class="ea-col-value">
                      <input class="ea-input tm-lab-field__input" name="customMultiplier" inputmode="decimal" autocomplete="off" value="${defaultCustomMultiplier}" aria-label="Custom compliance multiplier" disabled />
                    </td>
                    <td class="ea-col-meta">${badgeMarkup('Custom', 'setup')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="ea-panel">
            <div class="ea-panel-header">
              <span class="ea-panel-header-id">03</span>
              <span>Estimator notes</span>
            </div>
            <div class="ea-panel-body">
              <p class="ea-muted">Converted compliance is a screening estimate, not a manufacturer-certified 10 Hz measurement.</p>
              <p class="ea-muted">Dataset cartridge values are treated as direct 10 Hz runtime compliance when available.</p>
              <p class="ea-muted">Static compliance uses ×0.5 as a broad static-to-dynamic assumption for S27A.</p>
            </div>
          </section>
        </form>

        <aside class="ea-panel ea-workbench-result" data-compliance-result aria-live="polite">
          ${awaitingMarkup()}
        </aside>
      </section>

      <footer class="ea-actionbar" aria-label="Compliance estimator actions">
        <div class="ea-actionbar__group">
          <span class="ea-actionbar__status" data-compliance-action-status>
            ${statusDotMarkup('active')} Input needed
          </span>
        </div>
        <div class="ea-actionbar__group">
          <button class="ea-button ea-button--secondary" type="button" data-compliance-reset>Reset</button>
        </div>
      </footer>
    </main>
  `;
}

export function enableComplianceEstimatorInteractions(): void {
  applyStoredTheme();

  const form = document.querySelector<HTMLFormElement>('[data-compliance-estimator-form]');
  const resultElement = document.querySelector<HTMLElement>('[data-compliance-result]');
  const statusElement = document.querySelector<HTMLElement>('[data-compliance-action-status]');
  const workflowElement = document.querySelector<HTMLElement>('[data-compliance-workflow]');

  complianceState.selectedCartridge = null;
  complianceState.complianceSource = 'manual';
  complianceState.cartridgeSource = 'none';

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });

  if (!form || !resultElement || !statusElement || !workflowElement) {
    return;
  }

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'complianceValue') {
      complianceState.complianceSource = target.value.trim().length === 0 ? 'manual' : 'manual';
    }
    updateComplianceView(form, resultElement, statusElement, workflowElement, complianceState);
  });

  form.addEventListener('change', () => updateComplianceView(form, resultElement, statusElement, workflowElement, complianceState));

  document.querySelector<HTMLButtonElement>('[data-compliance-pick-cartridge]')?.addEventListener('click', () => {
    const pickButton = document.querySelector<HTMLButtonElement>('[data-compliance-pick-cartridge]');
    if (pickButton) {
      pickButton.disabled = true;
      pickButton.textContent = 'Loading';
    }

    loadCartridgePickerItems()
      .then((items) => {
        openRuntimePickerModal({
          kind: 'cartridge',
          title: 'Select cartridge compliance reference',
          items,
          appliedItemId: complianceState.selectedCartridge?.id ?? null,
          onApply: (item) => {
            applyCartridgeSelection(item, form, resultElement, statusElement, workflowElement, complianceState);
          },
        });
      })
      .catch((error: unknown) => {
        complianceState.cartridgeSource = 'unavailable';
        complianceState.complianceSource = 'unavailable';
        statusElement.innerHTML = `${statusDotMarkup('error')} ${renderText(error instanceof Error ? error.message : 'Unable to load cartridge runtime data')}`;
        updateComplianceView(form, resultElement, statusElement, workflowElement, complianceState);
      })
      .finally(() => {
        if (pickButton) {
          pickButton.disabled = false;
          pickButton.textContent = complianceState.selectedCartridge ? 'Change' : 'Pick';
        }
      });
  });

  document.querySelector<HTMLButtonElement>('[data-compliance-reset]')?.addEventListener('click', () => {
    resetComplianceForm(form, resultElement, statusElement, workflowElement, complianceState);
  });

  updateComplianceView(form, resultElement, statusElement, workflowElement, complianceState);
}
