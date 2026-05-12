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

type RuntimeSelectionKind = 'tonearm' | 'cartridge';
type TrackingForceSource = 'setup' | 'manual' | 'dataset' | 'unavailable';
type FieldSource = 'default' | 'dataset' | 'manual' | 'restored-local' | 'unavailable' | 'setup';
type FieldSourceState = Record<QuickMatchFieldName, FieldSource>;
type WorkflowStepKey = 'tonearm' | 'cartridge' | 'tracking' | 'result' | 'save';
type WorkflowStepStatus = 'planned' | 'active' | 'done';
type WorkbenchLastAction = 'input' | 'reset' | 'saved' | 'exported' | 'loaded';

type WorkbenchState = {
  selectedCartridge: RuntimePickerItem | null;
  selectedTonearm: RuntimePickerItem | null;
  trackingForceSource: TrackingForceSource;
  fieldSources: FieldSourceState;
  lastAction: WorkbenchLastAction;
};

type EvaluatedResult =
  | {
      ok: true;
      result: ResonanceResult;
      diagnosis: ResonanceDiagnosis;
      classification: ResonanceClassification;
    }
  | {
      ok: false;
      message: string;
    };

type RuntimeItemSnapshot = { id: string; name: string } | null;

type TonearmSessionSnapshot = {
  schemaVersion: 2;
  generatedAt: string;
  selectedTonearm: RuntimeItemSnapshot;
  selectedCartridge: RuntimeItemSnapshot;
  inputs: ResonanceInput;
  trackingForceInputText?: string;
  fieldSources: FieldSourceState;
  result: {
    totalMovingMassG: number;
    resonanceHz: number;
    matchScore: number;
    classification: {
      key: ResonanceBandKey;
      group: ResonanceBandGroup;
      label: string;
    };
  };
  trackingForceSource?: TrackingForceSource;
  sourceLabels: {
    tonearm: string;
    cartridge: string;
    trackingForce: string;
  };
};

const tonearmSessionStorageKey = 'engrove-tonearm-match-session';
type RuntimeTrackingForceRange = NonNullable<CartridgeRuntimeRecord['tracking_force_g']>;
const runtimeTrackingForceByCartridgeId = new Map<string, RuntimeTrackingForceRange>();
const workflowStepOrder: readonly WorkflowStepKey[] = ['tonearm', 'cartridge', 'tracking', 'result', 'save'];

function createInitialWorkbenchState(): WorkbenchState {
  return {
    selectedCartridge: null,
    selectedTonearm: null,
    trackingForceSource: 'setup',
    fieldSources: createInitialFieldSources(),
    lastAction: 'input',
  };
}

/*
 * Token/layout drift check cannot resolve these template-literal class suffixes.
 * Keep this static inventory in sync with statusDotMarkup() and badgeMarkup().
 */
const tokenLayoutGeneratedClassNames =
  'ea-badge--direct ea-badge--manufacturer ea-badge--setup ea-dot--planned ea-dot--active ea-dot--done ea-dot--error ea-tasklist-num--done';

const gaugeMinHz = 5;
const gaugeMaxHz = 16;

const defaultInput: ResonanceInput = {
  tonearmEffectiveMassG: 12,
  cartridgeMassG: 6.5,
  fastenerMassG: 1,
  trackingForceG: 1.8,
  compliance10HzCu: 18,
};

const initialFieldSources: FieldSourceState = {
  tonearmEffectiveMassG: 'default',
  cartridgeMassG: 'default',
  fastenerMassG: 'default',
  trackingForceG: 'setup',
  compliance10HzCu: 'default',
};

function createInitialFieldSources(): FieldSourceState {
  return { ...initialFieldSources };
}

function isQuickMatchFieldName(value: string): value is QuickMatchFieldName {
  return value === 'tonearmEffectiveMassG'
    || value === 'cartridgeMassG'
    || value === 'fastenerMassG'
    || value === 'trackingForceG'
    || value === 'compliance10HzCu';
}

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
    sublabel: 'Setup only · not in F₀',
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

function fieldSourceDescriptor(source: FieldSource): { label: string; className: string; report: string } {
  switch (source) {
    case 'dataset':
      return {
        label: 'From dataset',
        className: 'manufacturer',
        report: 'dataset value',
      };
    case 'manual':
      return {
        label: 'Manual',
        className: 'direct',
        report: 'manual override',
      };
    case 'restored-local':
      return {
        label: 'Local',
        className: 'setup',
        report: 'restored from local browser snapshot',
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        className: 'setup',
        report: 'not available in current runtime data',
      };
    case 'setup':
      return {
        label: 'Setup',
        className: 'setup',
        report: 'setup-only value',
      };
    case 'default':
    default:
      return {
        label: 'Direct',
        className: 'direct',
        report: 'manual/default value',
      };
  }
}

function setFieldSourceState(state: WorkbenchState, fieldName: QuickMatchFieldName, source: FieldSource): void {
  state.fieldSources[fieldName] = source;
  const descriptor = fieldSourceDescriptor(source);
  const sourceCell = document.querySelector<HTMLElement>(`[data-field-source="${fieldName}"]`);
  const row = document.querySelector<HTMLElement>(`[data-resonance-field="${fieldName}"]`);
  const statusCell = row?.querySelector<HTMLElement>('.ea-col-status');

  if (sourceCell) {
    sourceCell.innerHTML = badgeMarkup(descriptor.label, descriptor.className);
  }

  if (row) {
    row.dataset.fieldSource = source;
  }

  if (statusCell) {
    const statusClass = source === 'unavailable' ? 'planned' : 'done';
    statusCell.innerHTML = statusDotMarkup(statusClass);
  }
}

function applyFieldSourceStates(state: WorkbenchState): void {
  for (const fieldName of Object.keys(state.fieldSources) as QuickMatchFieldName[]) {
    setFieldSourceState(state, fieldName, state.fieldSources[fieldName]);
  }
}

function markFieldSourceManual(state: WorkbenchState, fieldName: QuickMatchFieldName): void {
  setFieldSourceState(state, fieldName, fieldName === 'trackingForceG' ? 'manual' : 'manual');
}

function normalizedSnapshotFieldSource(value: unknown, fallback: FieldSource): FieldSource {
  return value === 'default'
    || value === 'dataset'
    || value === 'manual'
    || value === 'restored-local'
    || value === 'unavailable'
    || value === 'setup'
    ? value
    : fallback;
}

function normalizedSnapshotFieldSources(value: unknown): FieldSourceState {
  const record = typeof value === 'object' && value !== null ? value as Partial<Record<QuickMatchFieldName, unknown>> : {};
  return {
    tonearmEffectiveMassG: normalizedSnapshotFieldSource(record.tonearmEffectiveMassG, 'restored-local'),
    cartridgeMassG: normalizedSnapshotFieldSource(record.cartridgeMassG, 'restored-local'),
    fastenerMassG: normalizedSnapshotFieldSource(record.fastenerMassG, 'restored-local'),
    trackingForceG: normalizedSnapshotFieldSource(record.trackingForceG, 'restored-local'),
    compliance10HzCu: normalizedSnapshotFieldSource(record.compliance10HzCu, 'restored-local'),
  };
}

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
  const initialSource = initialFieldSources[field.name];
  const descriptor = fieldSourceDescriptor(initialSource);

  return `
    <tr data-resonance-field="${fieldName}" data-field-source="${escapeAttribute(initialSource)}">
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
      <td class="ea-col-meta" data-field-source="${fieldName}">${badgeMarkup(descriptor.label, descriptor.className)}</td>
    </tr>
  `;
}


function trackingForceSourceDescriptor(source: TrackingForceSource): { label: string; className: string; sublabel: string; report: string } {
  switch (source) {
    case 'dataset':
      return {
        label: 'From dataset',
        className: 'manufacturer',
        sublabel: 'Runtime VTF · setup only · not in F₀',
        report: 'runtime cartridge dataset; setup only; not used in resonance math',
      };
    case 'manual':
      return {
        label: 'Manual',
        className: 'direct',
        sublabel: 'Manual setup · not in F₀',
        report: 'manual setup value; not used in resonance math',
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        className: 'setup',
        sublabel: 'No runtime VTF for selected cartridge',
        report: 'runtime VTF unavailable for selected cartridge; current value is manual/setup context only',
      };
    case 'setup':
    default:
      return {
        label: 'Setup',
        className: 'setup',
        sublabel: 'Setup only · not in F₀',
        report: 'manual setup default; not used in resonance math',
      };
  }
}

function trackingForceSetupMarkup(): string {
  const fieldName = escapeAttribute('trackingForceG');
  const meta = fieldMeta('trackingForceG');

  return `
    <tr class="tm-tracking-force-row" data-tracking-force-row data-resonance-field="${fieldName}" data-field-source="setup" data-vtf-source="setup">
      <td class="ea-col-status">${statusDotMarkup(meta.statusClass)}</td>
      <td class="ea-col-label">
        <label for="tm-${fieldName}">${renderText(meta.label)}</label>
        <span class="ea-form-table-sublabel" data-tracking-force-sublabel>${renderText(meta.sublabel)}</span>
      </td>
      <td class="ea-col-value">
        <input
          id="tm-${fieldName}"
          class="ea-input tm-lab-field__input"
          name="${fieldName}"
          type="number"
          min="0"
          step="0.01"
          value="${escapeAttribute(defaultInput.trackingForceG)}"
          inputmode="decimal"
          aria-label="Applied tracking force in grams"
        />
      </td>
      <td class="ea-col-meta" data-field-source="${fieldName}" data-tracking-force-source>${badgeMarkup(meta.sourceLabel, meta.sourceClass)}</td>
    </tr>
  `;
}


function matchScoreForClassification(classification: ResonanceClassification, resonanceHz: number): number {
  const bandBaseScore: Record<ResonanceBandGroup, number> = {
    ideal: 96,
    good: 86,
    acceptable: 70,
    marginal: 50,
    poor: 25,
  };
  const idealCenterHz = 10;
  const distancePenalty = classification.group === 'ideal' || classification.group === 'good'
    ? Math.min(6, Math.abs(resonanceHz - idealCenterHz) * 2)
    : 0;

  return Math.round(clamp(bandBaseScore[classification.group] - distancePenalty, 0, 100));
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
        <span
          class="tm-lab-gauge__marker"
          data-band="${escapeAttribute(classification.group)}"
          data-outside-scale="${escapeAttribute(outsideScale ? 'true' : 'false')}"
        >
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
      <div class="ea-classification" data-band="${escapeAttribute(classification.group)}" data-key="${escapeAttribute(classification.key)}">
        ${statusDotMarkup(classification.group === 'ideal' || classification.group === 'good' ? 'done' : 'active')}
        <span>${renderText(classification.label)}</span>
      </div>
      ${resonanceGaugeMarkup(result, classification)}
      <div class="tm-lab-result__details">
        <div class="tm-lab-scoreline" title="UI match score derived from the existing resonance classification band. It does not change the resonance calculation.">
          <span
            class="tm-lab-scoreline__mark"
            data-match-score="${escapeAttribute(String(matchScoreForClassification(classification, result.resonanceHz)))}"
            data-band="${escapeAttribute(classification.group)}"
            style="--tm-score-value: ${escapeAttribute(String(matchScoreForClassification(classification, result.resonanceHz)))};"
          >${renderText(String(matchScoreForClassification(classification, result.resonanceHz)))}</span>
          <span>
            <strong>Match score</strong>
            <small>${renderText(`${classification.label} · UI score from resonance band`)}</small>
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
      <td class="ea-col-status" data-runtime-picker-status-dot="tonearm">${statusDotMarkup('planned')}</td>
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
      <td class="ea-col-meta" data-runtime-picker-source="tonearm">—</td>
    </tr>
    <tr class="tm-runtime-picker-row" data-runtime-picker-control="cartridge">
      <td class="ea-col-status" data-runtime-picker-status-dot="cartridge">${statusDotMarkup('planned')}</td>
      <td class="ea-col-label">
        Cartridge
        <span class="ea-form-table-sublabel">Selected reference</span>
      </td>
      <td class="ea-col-value">
        <div class="ea-input-row-with-button">
          <span class="tm-runtime-picker-summary" data-runtime-picker-summary="cartridge">No cartridge selected.</span>
          <button class="ea-button ea-button--ghost tm-runtime-picker-control__button" type="button" data-runtime-picker-open="cartridge" disabled>Pick</button>
        </div>
      </td>
      <td class="ea-col-meta" data-runtime-picker-source="cartridge">—</td>
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


function fieldInputLabel(name: QuickMatchFieldName): string {
  return fieldMeta(name).label;
}

function normalizeNumberInputText(value: string): string {
  return value.trim().replace(',', '.');
}

function setInputValidity(element: HTMLInputElement, valid: boolean): void {
  if (valid) {
    element.removeAttribute('aria-invalid');
  } else {
    element.setAttribute('aria-invalid', 'true');
  }
}

function readNumberInput(form: HTMLFormElement, name: QuickMatchFieldName): { ok: true; value: number } | { ok: false; reason: 'blank' | 'invalid' } {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`);
  }

  const rawValue = normalizeNumberInputText(element.value);
  if (rawValue === '') {
    setInputValidity(element, false);
    return { ok: false, reason: 'blank' };
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    setInputValidity(element, false);
    return { ok: false, reason: 'invalid' };
  }

  setInputValidity(element, true);
  return { ok: true, value };
}

function readRequiredNumber(form: HTMLFormElement, name: QuickMatchFieldName): number {
  const parsed = readNumberInput(form, name);
  const label = fieldInputLabel(name);

  if (!parsed.ok) {
    throw new Error(parsed.reason === 'blank' ? `${label} is required.` : `${label} must be a valid number.`);
  }

  if (parsed.value < 0) {
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLInputElement) {
      setInputValidity(element, false);
    }
    throw new Error(`${label} must be zero or greater.`);
  }

  if (name === 'compliance10HzCu' && parsed.value <= 0) {
    const element = form.elements.namedItem(name);
    if (element instanceof HTMLInputElement) {
      setInputValidity(element, false);
    }
    throw new Error('Compliance must be greater than zero.');
  }

  return parsed.value;
}

function readTrackingForceNumber(form: HTMLFormElement): { ok: true; value: number; blank: boolean } | { ok: false } {
  const parsed = readNumberInput(form, 'trackingForceG');

  if (!parsed.ok) {
    const element = form.elements.namedItem('trackingForceG');
    if (element instanceof HTMLInputElement && element.value.trim() === '') {
      setInputValidity(element, true);
      return { ok: true, value: 0, blank: true };
    }
    return { ok: false };
  }

  if (parsed.value < 0) {
    const element = form.elements.namedItem('trackingForceG');
    if (element instanceof HTMLInputElement) {
      setInputValidity(element, false);
    }
    return { ok: false };
  }

  return { ok: true, value: parsed.value, blank: false };
}

function readFormInput(form: HTMLFormElement): ResonanceInput {
  const trackingForce = readTrackingForceNumber(form);

  if (!trackingForce.ok) {
    throw new Error('Applied VTF must be blank or a valid non-negative number.');
  }

  return {
    tonearmEffectiveMassG: readRequiredNumber(form, 'tonearmEffectiveMassG'),
    cartridgeMassG: readRequiredNumber(form, 'cartridgeMassG'),
    fastenerMassG: readRequiredNumber(form, 'fastenerMassG'),
    trackingForceG: trackingForce.value,
    compliance10HzCu: readRequiredNumber(form, 'compliance10HzCu'),
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

function evaluateCurrentResult(form: HTMLFormElement): EvaluatedResult {
  try {
    const result = calculateResonanceResult(readFormInput(form));
    const diagnosis = diagnoseResonance(result.resonanceHz);
    const classification = classifyResonance(result.resonanceHz);

    return {
      ok: true,
      result,
      diagnosis,
      classification,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Check the input values.',
    };
  }
}

function updateResultView(form: HTMLFormElement, resultElement: HTMLElement): EvaluatedResult {
  const focusedInput = captureFocusedNumberInput(form);
  const evaluated = evaluateCurrentResult(form);

  try {
    if (evaluated.ok) {
      resultElement.dataset.diagnosisLevel = evaluated.classification.group;
      resultElement.dataset.resonanceBand = evaluated.classification.key;
      resultElement.innerHTML = resultMarkup(evaluated.result, evaluated.diagnosis);
    } else {
      resultElement.dataset.diagnosisLevel = 'poor';
      resultElement.dataset.resonanceBand = 'error';
      resultElement.innerHTML = errorMarkup(evaluated.message);
    }
  } finally {
    restoreFocusedNumberInput(focusedInput);
  }

  return evaluated;
}

function renderResult(form: HTMLFormElement, resultElement: HTMLElement): void {
  updateResultView(form, resultElement);
}

function finiteRuntimeNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function trackingForceValueFromRange(range: RuntimeTrackingForceRange | undefined): number | undefined {
  if (!range) {
    return undefined;
  }

  const recommended = finiteRuntimeNumber(range.recommended);
  if (typeof recommended === 'number') {
    return recommended;
  }

  const minimum = finiteRuntimeNumber(range.min);
  const maximum = finiteRuntimeNumber(range.max);
  if (typeof minimum === 'number' && typeof maximum === 'number') {
    return (minimum + maximum) / 2;
  }

  return minimum ?? maximum;
}

function trackingForceRangeSummary(range: RuntimeTrackingForceRange | undefined): string | undefined {
  if (!range) {
    return undefined;
  }

  const value = trackingForceValueFromRange(range);
  if (typeof value !== 'number') {
    return undefined;
  }

  const recommended = finiteRuntimeNumber(range.recommended);
  if (typeof recommended === 'number') {
    return `${formatNumber(recommended, 2)} g VTF`;
  }

  const minimum = finiteRuntimeNumber(range.min);
  const maximum = finiteRuntimeNumber(range.max);
  if (typeof minimum === 'number' && typeof maximum === 'number') {
    return `${formatNumber(minimum, 2)}–${formatNumber(maximum, 2)} g VTF`;
  }

  return `${formatNumber(value, 2)} g VTF`;
}

function setTrackingForceSourceState(source: TrackingForceSource): void {
  const descriptor = trackingForceSourceDescriptor(source);
  const sourceCell = document.querySelector<HTMLElement>('[data-tracking-force-source]');
  const row = document.querySelector<HTMLElement>('[data-tracking-force-row]');
  const sublabel = document.querySelector<HTMLElement>('[data-tracking-force-sublabel]');

  if (sourceCell) {
    sourceCell.innerHTML = badgeMarkup(descriptor.label, descriptor.className);
  }

  if (row) {
    row.dataset.vtfSource = source;
  }

  if (sublabel) {
    sublabel.textContent = descriptor.sublabel;
  }
}

function isTrackingForceSource(value: unknown): value is TrackingForceSource {
  return value === 'setup' || value === 'manual' || value === 'dataset' || value === 'unavailable';
}

function normalizedSnapshotTrackingForceSource(value: unknown): TrackingForceSource {
  return isTrackingForceSource(value) ? value : 'manual';
}

function trackingForceSourceFromFieldSource(source: FieldSource): TrackingForceSource {
  if (source === 'dataset') {
    return 'dataset';
  }

  if (source === 'unavailable') {
    return 'unavailable';
  }

  if (source === 'setup') {
    return 'setup';
  }

  return 'manual';
}

function toCartridgePickerItem(record: CartridgeRuntimeRecord): RuntimePickerItem {
  if (record.tracking_force_g) {
    runtimeTrackingForceByCartridgeId.set(record.id, record.tracking_force_g);
  } else {
    runtimeTrackingForceByCartridgeId.delete(record.id);
  }

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

function applyRuntimePickerItem(form: HTMLFormElement, item: RuntimePickerItem, state: WorkbenchState): boolean {
  const updates = runtimePickerFieldUpdates(item.kind, item);
  let changed = false;

  if (setNumericInput(form, 'cartridgeMassG', updates.cartridgeMassG)) {
    setFieldSourceState(state, 'cartridgeMassG', 'dataset');
    changed = true;
  }
  if (setNumericInput(form, 'compliance10HzCu', updates.compliance10HzCu)) {
    setFieldSourceState(state, 'compliance10HzCu', 'dataset');
    changed = true;
  }
  if (setNumericInput(form, 'tonearmEffectiveMassG', updates.tonearmEffectiveMassG)) {
    setFieldSourceState(state, 'tonearmEffectiveMassG', 'dataset');
    changed = true;
  }

  if (item.kind === 'cartridge') {
    const trackingForce = trackingForceValueFromRange(runtimeTrackingForceByCartridgeId.get(item.id));
    if (typeof trackingForce === 'number') {
      changed = setNumericInput(form, 'trackingForceG', trackingForce) || changed;
      state.trackingForceSource = 'dataset';
      setFieldSourceState(state, 'trackingForceG', 'dataset');
    } else {
      state.trackingForceSource = 'unavailable';
      setFieldSourceState(state, 'trackingForceG', 'unavailable');
    }
    setTrackingForceSourceState(state.trackingForceSource);
  }

  return changed;
}

function runtimeSelectionLabel(kind: RuntimeSelectionKind): string {
  return kind === 'cartridge' ? 'No cartridge selected.' : 'No tonearm selected.';
}

function selectionSummaryDetails(item: RuntimePickerItem): string {
  const details = item.kind === 'cartridge'
    ? [
        typeof item.massG === 'number' ? `${item.massG} g` : undefined,
        typeof item.compliance10HzCu === 'number' ? `${item.compliance10HzCu} µm/mN @10 Hz` : undefined,
        trackingForceRangeSummary(runtimeTrackingForceByCartridgeId.get(item.id)),
      ].filter(Boolean)
    : [
        typeof item.effectiveMassG === 'number' ? `${item.effectiveMassG} g effective mass` : undefined,
      ].filter(Boolean);

  return details.length > 0 ? details.join(' · ') : 'No match values copied';
}

function runtimePickerButton(kind: RuntimeSelectionKind): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-runtime-picker-open="${kind}"]`);
}

function setRuntimePickerButtonMode(kind: RuntimeSelectionKind, mode: 'next' | 'selected' | 'idle'): void {
  const button = runtimePickerButton(kind);
  if (!button) {
    return;
  }

  button.classList.toggle('ea-button--primary', mode === 'next');
  button.classList.toggle('ea-button--secondary', mode === 'selected');
  button.classList.toggle('ea-button--ghost', mode === 'idle');
}

function setRuntimePickerRowState(kind: RuntimeSelectionKind, selected: boolean): void {
  const row = document.querySelector<HTMLElement>(`[data-runtime-picker-control="${kind}"]`);
  const button = runtimePickerButton(kind);
  const dot = document.querySelector<HTMLElement>(`[data-runtime-picker-status-dot="${kind}"]`);
  const source = document.querySelector<HTMLElement>(`[data-runtime-picker-source="${kind}"]`);

  row?.toggleAttribute('data-runtime-selected', selected);

  if (button) {
    button.textContent = selected ? 'Change' : 'Pick';
    button.setAttribute(
      'aria-label',
      selected
        ? `Change selected ${kind}`
        : `Pick ${kind} from dataset`,
    );
  }

  if (dot) {
    dot.innerHTML = statusDotMarkup(selected ? 'done' : 'planned');
  }

  if (source) {
    source.innerHTML = selected ? badgeMarkup('Dataset', 'manufacturer') : '—';
  }
}

function setRuntimePickerSource(kind: RuntimeSelectionKind, label: string, className: string): void {
  const source = document.querySelector<HTMLElement>(`[data-runtime-picker-source="${kind}"]`);
  if (source) {
    source.innerHTML = badgeMarkup(label, className);
  }
}

function syncRuntimePickerButtonStates(state: WorkbenchState): void {
  const nextKind: RuntimeSelectionKind | null = !state.selectedTonearm
    ? 'tonearm'
    : !state.selectedCartridge
      ? 'cartridge'
      : null;

  for (const kind of ['tonearm', 'cartridge'] as const) {
    const isSelected = kind === 'tonearm' ? Boolean(state.selectedTonearm) : Boolean(state.selectedCartridge);
    setRuntimePickerButtonMode(kind, isSelected ? 'selected' : nextKind === kind ? 'next' : 'idle');
  }
}

function clearPickerSummary(kind: RuntimeSelectionKind): void {
  const summary = document.querySelector<HTMLElement>(`[data-runtime-picker-summary="${kind}"]`);
  if (!summary) {
    return;
  }

  summary.textContent = runtimeSelectionLabel(kind);
}

function writePickerSummary(item: RuntimePickerItem): void {
  const summary = document.querySelector<HTMLElement>(`[data-runtime-picker-summary="${item.kind}"]`);
  if (!summary) {
    return;
  }

  summary.innerHTML = `
    <strong>${renderText(item.kind === 'cartridge' ? 'Selected cartridge' : 'Selected tonearm')}</strong>
    <span title="${escapeAttribute(item.displayName)}">${renderText(item.displayName)}</span>
    <small>${renderText(selectionSummaryDetails(item))}</small>
  `;

  setRuntimePickerRowState(item.kind, true);
}

function resetRuntimePickerState(state: WorkbenchState): void {
  state.selectedCartridge = null;
  state.selectedTonearm = null;

  clearPickerSummary('cartridge');
  clearPickerSummary('tonearm');
  setRuntimePickerRowState('cartridge', false);
  setRuntimePickerRowState('tonearm', false);
}

function bindRuntimePickers(form: HTMLFormElement, resultElement: HTMLElement, state: WorkbenchState): void {
  const root = document.querySelector<HTMLElement>('[data-tonearm-runtime-pickers]');
  if (!root) {
    return;
  }

  const status = root.querySelector<HTMLElement>('[data-runtime-picker-status]');
  const cartridgeButton = root.querySelector<HTMLButtonElement>('[data-runtime-picker-open="cartridge"]');
  const tonearmButton = root.querySelector<HTMLButtonElement>('[data-runtime-picker-open="tonearm"]');

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
            appliedItemId: state.selectedCartridge?.id ?? null,
            onApply: (item: RuntimePickerItem) => {
              state.selectedCartridge = item;
              state.lastAction = 'input';
              writePickerSummary(item);
              if (applyRuntimePickerItem(form, item, state)) {
                const evaluated = updateResultView(form, resultElement);
                syncWorkbenchState(form, state, evaluated);
              } else {
                syncWorkbenchState(form, state);
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
            appliedItemId: state.selectedTonearm?.id ?? null,
            onApply: (item: RuntimePickerItem) => {
              state.selectedTonearm = item;
              state.lastAction = 'input';
              writePickerSummary(item);
              if (applyRuntimePickerItem(form, item, state)) {
                const evaluated = updateResultView(form, resultElement);
                syncWorkbenchState(form, state, evaluated);
              } else {
                syncWorkbenchState(form, state);
              }
            },
          });
        });
      }

      syncWorkbenchState(form, state);
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


function selectedSnapshot(item: RuntimePickerItem | null): RuntimeItemSnapshot {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    name: item.displayName,
  };
}

function inputValueText(form: HTMLFormElement, name: QuickMatchFieldName): string {
  const element = form.elements.namedItem(name);
  return element instanceof HTMLInputElement ? element.value.trim() : '';
}

function createSessionSnapshot(form: HTMLFormElement, state: WorkbenchState): TonearmSessionSnapshot {
  const input = readFormInput(form);
  const result = calculateResonanceResult(input);
  const classification = classifyResonance(result.resonanceHz);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    selectedTonearm: selectedSnapshot(state.selectedTonearm),
    selectedCartridge: selectedSnapshot(state.selectedCartridge),
    inputs: {
      tonearmEffectiveMassG: input.tonearmEffectiveMassG,
      cartridgeMassG: input.cartridgeMassG,
      fastenerMassG: input.fastenerMassG,
      compliance10HzCu: input.compliance10HzCu,
      trackingForceG: input.trackingForceG,
    },
    trackingForceInputText: inputValueText(form, 'trackingForceG'),
    fieldSources: { ...state.fieldSources },
    trackingForceSource: state.trackingForceSource,
    result: {
      totalMovingMassG: result.totalMovingMassG,
      resonanceHz: result.resonanceHz,
      matchScore: matchScoreForClassification(classification, result.resonanceHz),
      classification: {
        key: classification.key,
        group: classification.group,
        label: classification.label,
      },
    },
    sourceLabels: {
      tonearm: state.selectedTonearm ? 'selected from dataset' : 'not selected',
      cartridge: state.selectedCartridge ? 'selected from dataset' : 'not selected',
      trackingForce: trackingForceSourceDescriptor(state.trackingForceSource).report,
    },
  };
}

function reportLine(label: string, value: string | number | null | undefined, unit = ''): string {
  const printableValue = value === null || typeof value === 'undefined' || value === '' ? '—' : String(value);
  return `- ${label}: ${printableValue}${unit}`;
}

function createSessionReport(snapshot: TonearmSessionSnapshot): string {
  return [
    'Engrove Audio Tools — Tonearm Match Lab',
    '========================================',
    '',
    reportLine('Generated', snapshot.generatedAt),
    reportLine('Selected tonearm', snapshot.selectedTonearm?.name),
    reportLine('Selected cartridge', snapshot.selectedCartridge?.name),
    '',
    'Inputs',
    '------',
    reportLine('Tonearm effective mass', formatNumber(snapshot.inputs.tonearmEffectiveMassG), ' g'),
    reportLine('Tonearm effective mass source', fieldSourceDescriptor(snapshot.fieldSources.tonearmEffectiveMassG).report),
    reportLine('Cartridge mass', formatNumber(snapshot.inputs.cartridgeMassG), ' g'),
    reportLine('Cartridge mass source', fieldSourceDescriptor(snapshot.fieldSources.cartridgeMassG).report),
    reportLine('Fasteners / mounting mass', formatNumber(snapshot.inputs.fastenerMassG), ' g'),
    reportLine('Fasteners source', fieldSourceDescriptor(snapshot.fieldSources.fastenerMassG).report),
    reportLine('Compliance @ 10 Hz', formatNumber(snapshot.inputs.compliance10HzCu), ' µm/mN'),
    reportLine('Compliance source', fieldSourceDescriptor(snapshot.fieldSources.compliance10HzCu).report),
    reportLine('Tracking force', snapshot.trackingForceInputText === '' ? null : formatNumber(snapshot.inputs.trackingForceG), snapshot.trackingForceInputText === '' ? '' : ' g'),
    reportLine('Tracking force source', fieldSourceDescriptor(snapshot.fieldSources.trackingForceG).report),
    '',
    'Result',
    '------',
    reportLine('Total moving mass', formatNumber(snapshot.result.totalMovingMassG), ' g'),
    reportLine('Resonance frequency', formatNumber(snapshot.result.resonanceHz), ' Hz'),
    reportLine('Classification', snapshot.result.classification.label),
    reportLine('Match score', snapshot.result.matchScore, ' / 100'),
    '',
    'Sources',
    '-------',
    reportLine('Tonearm selection', snapshot.sourceLabels.tonearm),
    reportLine('Cartridge selection', snapshot.sourceLabels.cartridge),
    reportLine('Tracking force note', snapshot.sourceLabels.trackingForce),
    '',
    'Notes',
    '-----',
    '- Match score is a UI score derived from the existing resonance classification band.',
    '- Tracking force is recorded as setup context only and is not used in the resonance calculation.',
    '- Formula: F₀ = 159.15 / √(M · C).',
    '',
  ].join('\n');
}

function setActionbarStatus(text: string, statusClass: string): void {
  const status = document.querySelector<HTMLElement>('[data-tonearm-action-status]');
  if (!status) {
    return;
  }

  status.innerHTML = `${statusDotMarkup(statusClass)}<span>${renderText(text)}</span>`;
}

function workflowActiveStep(form: HTMLFormElement, state: WorkbenchState, evaluated: EvaluatedResult): WorkflowStepKey {
  if (!state.selectedTonearm) {
    return 'tonearm';
  }

  if (!state.selectedCartridge) {
    return 'cartridge';
  }

  const trackingForce = readTrackingForceNumber(form);
  if (!trackingForce.ok || trackingForce.blank) {
    return 'tracking';
  }

  if (!evaluated.ok) {
    return 'result';
  }

  return 'save';
}

function setWorkflowStepState(step: WorkflowStepKey, status: WorkflowStepStatus): void {
  const item = document.querySelector<HTMLElement>(`[data-workflow-step="${step}"]`);
  const marker = item?.querySelector<HTMLElement>('.ea-tasklist-num');
  if (!item || !marker) {
    return;
  }

  item.dataset.stepState = status;
  if (status === 'active') {
    item.setAttribute('aria-current', 'step');
  } else {
    item.removeAttribute('aria-current');
  }

  marker.classList.toggle('ea-tasklist-num--active', status === 'active');
  marker.classList.toggle('ea-tasklist-num--done', status === 'done');
}

function syncWorkflowState(form: HTMLFormElement, state: WorkbenchState, evaluated: EvaluatedResult): void {
  const activeStep = workflowActiveStep(form, state, evaluated);
  const activeIndex = workflowStepOrder.indexOf(activeStep);

  for (const [index, step] of workflowStepOrder.entries()) {
    const status: WorkflowStepStatus =
      index < activeIndex ? 'done' : step === activeStep ? 'active' : 'planned';
    setWorkflowStepState(step, status);
  }
}

function actionbarStatusText(state: WorkbenchState, evaluated: EvaluatedResult): { text: string; status: string } {
  if (state.lastAction === 'saved') {
    return { text: 'Saved locally', status: 'done' };
  }

  if (state.lastAction === 'exported') {
    return { text: 'Exported report', status: 'done' };
  }

  if (state.lastAction === 'loaded') {
    return { text: 'Restored local snapshot', status: 'done' };
  }

  if (state.lastAction === 'reset') {
    return { text: 'Reset to manual defaults', status: 'active' };
  }

  if (!evaluated.ok) {
    return { text: 'Input needs attention', status: 'error' };
  }

  if (state.selectedTonearm && !state.selectedCartridge) {
    return { text: 'Awaiting cartridge', status: 'active' };
  }

  if (!state.selectedTonearm && state.selectedCartridge) {
    return { text: 'Awaiting tonearm', status: 'active' };
  }

  if (state.selectedTonearm && state.selectedCartridge) {
    return { text: `${evaluated.classification.label} result ready`, status: evaluated.classification.group === 'ideal' || evaluated.classification.group === 'good' ? 'done' : 'active' };
  }

  return { text: 'Manual setup ready', status: 'active' };
}

function syncWorkbenchState(form: HTMLFormElement, state: WorkbenchState, evaluated = evaluateCurrentResult(form)): void {
  syncWorkflowState(form, state, evaluated);
  syncRuntimePickerButtonStates(state);
  const actionStatus = actionbarStatusText(state, evaluated);
  setActionbarStatus(actionStatus.text, actionStatus.status);
}

function exportCurrentSession(form: HTMLFormElement, state: WorkbenchState): boolean {
  try {
    const snapshot = createSessionSnapshot(form, state);
    const report = createSessionReport(snapshot);
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'engrove-tonearm-match-report.txt';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.lastAction = 'exported';
    syncWorkbenchState(form, state);
    return true;
  } catch {
    state.lastAction = 'input';
    setActionbarStatus('Export unavailable', 'error');
    return false;
  }
}

function saveCurrentSession(form: HTMLFormElement, state: WorkbenchState): boolean {
  try {
    const snapshot = createSessionSnapshot(form, state);
    localStorage.setItem(tonearmSessionStorageKey, JSON.stringify(snapshot));
    state.lastAction = 'saved';
    syncWorkbenchState(form, state);
    return true;
  } catch {
    state.lastAction = 'input';
    setActionbarStatus('Local save unavailable', 'error');
    return false;
  }
}

function isSnapshotInput(value: unknown): value is ResonanceInput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return quickMatchFields.every((field) => typeof record[field.name] === 'number' && Number.isFinite(record[field.name]))
    && typeof record.trackingForceG === 'number'
    && Number.isFinite(record.trackingForceG);
}

function snapshotToRuntimePickerItem(snapshot: RuntimeItemSnapshot, kind: RuntimeSelectionKind): RuntimePickerItem | null {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    kind,
    displayName: snapshot.name,
  };
}

function writeRestoredPickerSummary(kind: RuntimeSelectionKind, snapshot: RuntimeItemSnapshot): void {
  if (!snapshot) {
    clearPickerSummary(kind);
    setRuntimePickerRowState(kind, false);
    return;
  }

  const summary = document.querySelector<HTMLElement>(`[data-runtime-picker-summary="${kind}"]`);
  if (!summary) {
    return;
  }

  summary.innerHTML = `
    <strong>${renderText(kind === 'cartridge' ? 'Restored cartridge' : 'Restored tonearm')}</strong>
    <span title="${escapeAttribute(snapshot.name)}">${renderText(snapshot.name)}</span>
    <small>Local browser snapshot</small>
  `;
  setRuntimePickerRowState(kind, true);
  setRuntimePickerSource(kind, 'Local', 'setup');
}

function restoreCurrentSession(form: HTMLFormElement, resultElement: HTMLElement, state: WorkbenchState): boolean {
  try {
    const rawSnapshot = localStorage.getItem(tonearmSessionStorageKey);
    if (!rawSnapshot) {
      setActionbarStatus('No local snapshot found', 'active');
      return false;
    }

    const snapshot = JSON.parse(rawSnapshot) as Partial<TonearmSessionSnapshot>;
    if (!isSnapshotInput(snapshot.inputs)) {
      throw new Error('Local snapshot input values are invalid.');
    }

    for (const field of quickMatchFields) {
      setNumericInput(form, field.name, snapshot.inputs[field.name]);
    }
    if (typeof snapshot.trackingForceInputText === 'string' && snapshot.trackingForceInputText.trim() === '') {
      const trackingForceInput = form.elements.namedItem('trackingForceG');
      if (trackingForceInput instanceof HTMLInputElement) {
        trackingForceInput.value = '';
      }
    } else {
      setNumericInput(form, 'trackingForceG', snapshot.inputs.trackingForceG);
    }
    state.fieldSources = normalizedSnapshotFieldSources(snapshot.fieldSources);
    applyFieldSourceStates(state);
    state.trackingForceSource = isTrackingForceSource(snapshot.trackingForceSource)
      ? snapshot.trackingForceSource
      : trackingForceSourceFromFieldSource(state.fieldSources.trackingForceG);
    setTrackingForceSourceState(state.trackingForceSource);

    state.selectedTonearm = snapshotToRuntimePickerItem(snapshot.selectedTonearm ?? null, 'tonearm');
    state.selectedCartridge = snapshotToRuntimePickerItem(snapshot.selectedCartridge ?? null, 'cartridge');
    writeRestoredPickerSummary('tonearm', snapshot.selectedTonearm ?? null);
    writeRestoredPickerSummary('cartridge', snapshot.selectedCartridge ?? null);

    state.lastAction = 'loaded';
    const evaluated = updateResultView(form, resultElement);
    syncWorkbenchState(form, state, evaluated);
    return true;
  } catch {
    state.lastAction = 'input';
    setActionbarStatus('Local snapshot could not be loaded', 'error');
    return false;
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
      </section>

      <section class="ea-workbench ea-workbench-three tm-lab-workbench" id="quick-match" aria-labelledby="tm-lab-title">
        <aside class="ea-panel ea-workflow-rail" aria-label="Workflow">
          <div class="ea-panel-header">
            <span class="ea-panel-header-id">01</span>
            <span>Workflow</span>
          </div>
          <ol class="ea-tasklist" data-tonearm-workflow>
            <li data-workflow-step="tonearm" data-step-state="active" aria-current="step">
              <span class="ea-tasklist-num ea-tasklist-num--active">1</span>
              <span>
                <span class="ea-tasklist-title">Pick tonearm</span>
                <span class="ea-tasklist-sub">Effective mass reference</span>
              </span>
            </li>
            <li data-workflow-step="cartridge" data-step-state="planned">
              <span class="ea-tasklist-num">2</span>
              <span>
                <span class="ea-tasklist-title">Pick cartridge</span>
                <span class="ea-tasklist-sub">Mass + compliance @ 10 Hz</span>
              </span>
            </li>
            <li data-workflow-step="tracking" data-step-state="planned">
              <span class="ea-tasklist-num">3</span>
              <span>
                <span class="ea-tasklist-title">Set tracking force</span>
                <span class="ea-tasklist-sub">Setup only · not in F₀</span>
              </span>
            </li>
            <li data-workflow-step="result" data-step-state="planned">
              <span class="ea-tasklist-num">4</span>
              <span>
                <span class="ea-tasklist-title">Read result</span>
                <span class="ea-tasklist-sub">Classification + score</span>
              </span>
            </li>
            <li data-workflow-step="save" data-step-state="planned">
              <span class="ea-tasklist-num">5</span>
              <span>
                <span class="ea-tasklist-title">Save/export optional</span>
                <span class="ea-tasklist-sub">Local report / snapshot</span>
              </span>
            </li>
          </ol>
        </aside>

        <div class="ea-workbench-main">
          <form class="tm-lab-form" data-tonearm-match-form>
            <section class="ea-panel tm-lab-setup-panel" aria-labelledby="tm-lab-title">
              <div class="ea-panel-header">
                <span class="ea-panel-header-id">02</span>
                <span>Resonance Inputs</span>
                <span class="ea-panel-header-spacer"></span>
                <span class="tm-lab-formula" aria-hidden="true">F₀ = 159.15 / √(M·C)</span>
              </div>
              <div class="ea-panel-body--flush">
                <table class="ea-form-table tm-resonance-table" role="table" data-tonearm-runtime-pickers>
                  <tbody>
                    ${runtimePickerControlsMarkup()}
                    ${quickMatchFields.map(fieldMarkup).join('')}
                    ${trackingForceSetupMarkup()}
                  </tbody>
                </table>
              </div>
            </section>
          </form>

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
          <span class="ea-actionbar__status" data-tonearm-action-status>
            ${statusDotMarkup('active')}
            <span>Manual setup ready</span>
          </span>
        </div>
        <div class="ea-actionbar__group">
          <span class="ea-contextbar__meta">F₀ = 159.15 / √(M·C)</span>
          <button class="ea-button ea-button--secondary" type="button" data-reset-tonearm-defaults>Reset</button>
          <button class="ea-button ea-button--ghost" type="button" data-export-tonearm-session title="Download a human-readable local report">Export report</button>
          <button class="ea-button ea-button--primary" type="button" data-save-tonearm-session title="Save a local snapshot in this browser">Save local</button>
          <button class="ea-button ea-button--secondary" type="button" data-load-tonearm-session title="Restore the latest local browser snapshot">Load local</button>
        </div>
      </section>
    </main>
  `;
}


function resetFormToDefaults(form: HTMLFormElement, resultElement: HTMLElement, state: WorkbenchState): void {
  for (const field of quickMatchFields) {
    setNumericInput(form, field.name, defaultInput[field.name]);
  }
  setNumericInput(form, 'trackingForceG', defaultInput.trackingForceG);
  state.fieldSources = createInitialFieldSources();
  applyFieldSourceStates(state);
  state.trackingForceSource = 'setup';
  setTrackingForceSourceState(state.trackingForceSource);
  resetRuntimePickerState(state);
  state.lastAction = 'reset';
  const evaluated = updateResultView(form, resultElement);
  syncWorkbenchState(form, state, evaluated);
}

export function enableTonearmMatchLabInteractions(): void {
  bindThemeToggle();

  const form = document.querySelector<HTMLFormElement>('[data-tonearm-match-form]');
  const resultElement = document.querySelector<HTMLElement>('[data-tonearm-match-result]');
  const state = createInitialWorkbenchState();

  if (!form || !resultElement) {
    return;
  }

  bindRuntimePickers(form, resultElement, state);

  document.querySelector<HTMLButtonElement>('[data-reset-tonearm-defaults]')?.addEventListener('click', () => {
    resetFormToDefaults(form, resultElement, state);
  });

  document.querySelector<HTMLButtonElement>('[data-export-tonearm-session]')?.addEventListener('click', () => {
    exportCurrentSession(form, state);
  });

  document.querySelector<HTMLButtonElement>('[data-save-tonearm-session]')?.addEventListener('click', () => {
    saveCurrentSession(form, state);
  });

  document.querySelector<HTMLButtonElement>('[data-load-tonearm-session]')?.addEventListener('click', () => {
    restoreCurrentSession(form, resultElement, state);
  });

  form.addEventListener('input', (event) => {
    const input = event.target;
    state.lastAction = 'input';

    if (input instanceof HTMLInputElement && isQuickMatchFieldName(input.name)) {
      const fieldName = input.name;
      markFieldSourceManual(state, fieldName);

      if (fieldName === 'trackingForceG') {
        state.trackingForceSource = 'manual';
        setTrackingForceSourceState(state.trackingForceSource);
      }
    }

    const evaluated = updateResultView(form, resultElement);
    syncWorkbenchState(form, state, evaluated);
  });

  const evaluated = updateResultView(form, resultElement);
  syncWorkbenchState(form, state, evaluated);
}
