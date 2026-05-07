import {
  AUDIO_DATA_CONTRACT_LIMITS,
  findForbiddenRuntimeKeys,
  isBoolean,
  isFiniteNumber,
  isNonEmptyString,
  isObjectRecord,
} from '../contracts/audioDataContract';
import type { AudioDataSummary } from '../types/audioData';
import type { CartridgeRuntimeIndexRecord } from '../types/cartridge';
import type { TonearmRuntimeIndexRecord } from '../types/tonearm';

export type AudioDataValidationSeverity = 'error' | 'warning';

export type AudioDataValidationIssue = {
  readonly severity: AudioDataValidationSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type AudioDataValidationReport = {
  readonly ok: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly AudioDataValidationIssue[];
};

type MutableValidationIssue = AudioDataValidationIssue;

function issue(
  severity: AudioDataValidationSeverity,
  code: string,
  path: string,
  message: string,
): MutableValidationIssue {
  return { severity, code, path, message };
}

function report(issues: readonly AudioDataValidationIssue[]): AudioDataValidationReport {
  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  };
}

function stringAt(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return isNonEmptyString(value) ? value : undefined;
}

function numberAt(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return isFiniteNumber(value) ? value : undefined;
}

function booleanAt(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return isBoolean(value) ? value : undefined;
}

function nestedRecordAt(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isObjectRecord(value) ? value : undefined;
}

export function validateCartridgeIndexRecord(
  value: unknown,
  index: number,
): readonly AudioDataValidationIssue[] {
  const path = `cartridges.index[${index}]`;
  const issues: AudioDataValidationIssue[] = [];

  if (!isObjectRecord(value)) {
    return [issue('error', 'cartridge.not_object', path, 'Cartridge index entry must be an object.')];
  }

  const forbidden = findForbiddenRuntimeKeys(value, path);
  for (const keyPath of forbidden) {
    issues.push(issue('error', 'runtime.forbidden_key', keyPath, 'Runtime index must not contain legacy/source metadata.'));
  }

  if (!stringAt(value, 'id')) {
    issues.push(issue('error', 'cartridge.id_missing', `${path}.id`, 'Cartridge id is required.'));
  }

  if (!stringAt(value, 'display_name')) {
    issues.push(issue('error', 'cartridge.display_name_missing', `${path}.display_name`, 'Cartridge display_name is required.'));
  }

  const matchReady = booleanAt(value, 'match_ready');
  if (matchReady === undefined) {
    issues.push(issue('error', 'cartridge.match_ready_missing', `${path}.match_ready`, 'match_ready boolean is required.'));
  }

  const mass = numberAt(value, 'mass_g');
  const compliance = numberAt(value, 'compliance_10hz_cu');

  if (matchReady === true) {
    if (mass === undefined) {
      issues.push(issue('error', 'cartridge.match_ready_without_mass', `${path}.mass_g`, 'Match-ready cartridge must have mass_g.'));
    }

    if (compliance === undefined) {
      issues.push(
        issue(
          'error',
          'cartridge.match_ready_without_compliance',
          `${path}.compliance_10hz_cu`,
          'Match-ready cartridge must have compliance_10hz_cu.',
        ),
      );
    }
  }

  if (
    mass !== undefined &&
    (mass < AUDIO_DATA_CONTRACT_LIMITS.minReasonableCartridgeMassG ||
      mass > AUDIO_DATA_CONTRACT_LIMITS.maxReasonableCartridgeMassG)
  ) {
    issues.push(issue('warning', 'cartridge.mass_range', `${path}.mass_g`, `Suspicious cartridge mass: ${mass} g.`));
  }

  if (
    compliance !== undefined &&
    (compliance < AUDIO_DATA_CONTRACT_LIMITS.minReasonableCompliance10HzCu ||
      compliance > AUDIO_DATA_CONTRACT_LIMITS.maxReasonableCompliance10HzCu)
  ) {
    issues.push(
      issue('warning', 'cartridge.compliance_range', `${path}.compliance_10hz_cu`, `Suspicious 10Hz compliance: ${compliance} cu.`),
    );
  }

  const trackingForce = nestedRecordAt(value, 'tracking_force_g');
  if (trackingForce) {
    for (const key of ['min', 'max', 'recommended']) {
      const fieldValue = trackingForce[key];
      if (fieldValue !== undefined && !isFiniteNumber(fieldValue)) {
        issues.push(issue('error', 'cartridge.tracking_force_non_numeric', `${path}.tracking_force_g.${key}`, 'Tracking force values must be numeric when present.'));
      }
    }
  }

  return issues;
}

export function validateTonearmIndexRecord(value: unknown, index: number): readonly AudioDataValidationIssue[] {
  const path = `tonearms.index[${index}]`;
  const issues: AudioDataValidationIssue[] = [];

  if (!isObjectRecord(value)) {
    return [issue('error', 'tonearm.not_object', path, 'Tonearm index entry must be an object.')];
  }

  const forbidden = findForbiddenRuntimeKeys(value, path);
  for (const keyPath of forbidden) {
    issues.push(issue('error', 'runtime.forbidden_key', keyPath, 'Runtime index must not contain legacy/source metadata.'));
  }

  if (!stringAt(value, 'id')) {
    issues.push(issue('error', 'tonearm.id_missing', `${path}.id`, 'Tonearm id is required.'));
  }

  if (!stringAt(value, 'display_name')) {
    issues.push(issue('error', 'tonearm.display_name_missing', `${path}.display_name`, 'Tonearm display_name is required.'));
  }

  const matchReady = booleanAt(value, 'match_ready');
  if (matchReady === undefined) {
    issues.push(issue('error', 'tonearm.match_ready_missing', `${path}.match_ready`, 'match_ready boolean is required.'));
  }

  const effectiveMass = numberAt(value, 'effective_mass_g');

  if (matchReady === true && effectiveMass === undefined) {
    issues.push(
      issue('error', 'tonearm.match_ready_without_effective_mass', `${path}.effective_mass_g`, 'Match-ready tonearm must have effective_mass_g.'),
    );
  }

  if (
    effectiveMass !== undefined &&
    (effectiveMass < AUDIO_DATA_CONTRACT_LIMITS.minReasonableEffectiveMassG ||
      effectiveMass > AUDIO_DATA_CONTRACT_LIMITS.maxReasonableEffectiveMassG)
  ) {
    issues.push(issue('warning', 'tonearm.effective_mass_range', `${path}.effective_mass_g`, `Suspicious tonearm effective mass: ${effectiveMass} g.`));
  }

  return issues;
}

export function validateCartridgeIndex(values: readonly unknown[]): AudioDataValidationReport {
  const issues: AudioDataValidationIssue[] = [];

  if (values.length < AUDIO_DATA_CONTRACT_LIMITS.minCartridgeRecords) {
    issues.push(
      issue(
        'error',
        'cartridges.too_few_records',
        'cartridges.index',
        `Expected at least ${AUDIO_DATA_CONTRACT_LIMITS.minCartridgeRecords} cartridge records; got ${values.length}.`,
      ),
    );
  }

  values.forEach((value, index) => {
    issues.push(...validateCartridgeIndexRecord(value, index));
  });

  const matchReady = values.filter((value) => isObjectRecord(value) && value.match_ready === true).length;
  if (matchReady < AUDIO_DATA_CONTRACT_LIMITS.minMatchReadyCartridges) {
    issues.push(
      issue(
        'error',
        'cartridges.too_few_match_ready',
        'cartridges.index',
        `Expected at least ${AUDIO_DATA_CONTRACT_LIMITS.minMatchReadyCartridges} match-ready cartridges; got ${matchReady}.`,
      ),
    );
  }

  return report(issues);
}

export function validateTonearmIndex(values: readonly unknown[]): AudioDataValidationReport {
  const issues: AudioDataValidationIssue[] = [];

  if (values.length < AUDIO_DATA_CONTRACT_LIMITS.minTonearmRecords) {
    issues.push(
      issue(
        'error',
        'tonearms.too_few_records',
        'tonearms.index',
        `Expected at least ${AUDIO_DATA_CONTRACT_LIMITS.minTonearmRecords} tonearm records; got ${values.length}.`,
      ),
    );
  }

  values.forEach((value, index) => {
    issues.push(...validateTonearmIndexRecord(value, index));
  });

  const matchReady = values.filter((value) => isObjectRecord(value) && value.match_ready === true).length;
  if (matchReady < AUDIO_DATA_CONTRACT_LIMITS.minMatchReadyTonearms) {
    issues.push(
      issue(
        'error',
        'tonearms.too_few_match_ready',
        'tonearms.index',
        `Expected at least ${AUDIO_DATA_CONTRACT_LIMITS.minMatchReadyTonearms} match-ready tonearms; got ${matchReady}.`,
      ),
    );
  }

  return report(issues);
}

export function validateAudioDataSummary(summary: AudioDataSummary): AudioDataValidationReport {
  const issues: AudioDataValidationIssue[] = [];

  if (summary.inspected_structure?.cartridges_shape !== 'row_array') {
    issues.push(issue('warning', 'summary.cartridge_shape', 'summary.inspected_structure.cartridges_shape', 'Expected cartridges source shape row_array.'));
  }

  if (summary.inspected_structure?.tonearms_shape !== 'row_array') {
    issues.push(issue('warning', 'summary.tonearm_shape', 'summary.inspected_structure.tonearms_shape', 'Expected tonearms source shape row_array.'));
  }

  if (summary.cartridges.output_records < AUDIO_DATA_CONTRACT_LIMITS.minCartridgeRecords) {
    issues.push(issue('error', 'summary.cartridge_count', 'summary.cartridges.output_records', 'Cartridge output record count is below contract threshold.'));
  }

  if (summary.tonearms.output_records < AUDIO_DATA_CONTRACT_LIMITS.minTonearmRecords) {
    issues.push(issue('error', 'summary.tonearm_count', 'summary.tonearms.output_records', 'Tonearm output record count is below contract threshold.'));
  }

  return report(issues);
}

export type {
  CartridgeRuntimeIndexRecord,
  TonearmRuntimeIndexRecord,
};
