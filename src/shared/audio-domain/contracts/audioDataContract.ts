import type { AudioDataContractVersion } from '../types/audioData';

export const AUDIO_DATA_CONTRACT_VERSION: AudioDataContractVersion = '17.0.0';

export const AUDIO_DATA_RUNTIME_FILES = {
  cartridges: 'src/data/audio/v3/cartridges.v3.json',
  tonearms: 'src/data/audio/v3/tonearms.v3.json',
  cartridgeIndex: 'src/data/audio/v3/runtime/cartridges.index.json',
  tonearmIndex: 'src/data/audio/v3/runtime/tonearms.index.json',
  summary: 'src/data/audio/v3/audio-data-v3-summary.json',
  manifest: 'src/data/audio/v3/runtime/audio-index.manifest.json',
} as const;

export const AUDIO_DATA_CONTRACT_LIMITS = {
  minCartridgeRecords: 1_000,
  minTonearmRecords: 500,
  minMatchReadyCartridges: 500,
  minMatchReadyTonearms: 250,
  maxShortTextLength: 240,
  maxLongTextLength: 6_000,
  minReasonableCartridgeMassG: 0.5,
  maxReasonableCartridgeMassG: 40,
  minReasonableCompliance10HzCu: 1,
  maxReasonableCompliance10HzCu: 80,
  minReasonableEffectiveMassG: 1,
  maxReasonableEffectiveMassG: 80,
} as const;

export const AUDIO_DATA_FORBIDDEN_RUNTIME_KEYS = [
  'sources',
  'edit_history',
  'created_by',
  'create_stamp',
  'updated_by',
  'update_stamp',
] as const;

export type AudioDataForbiddenRuntimeKey = (typeof AUDIO_DATA_FORBIDDEN_RUNTIME_KEYS)[number];

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findForbiddenRuntimeKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenRuntimeKeys(item, `${prefix}[${index}]`));
  }

  if (!isObjectRecord(value)) {
    return [];
  }

  const found: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;

    if ((AUDIO_DATA_FORBIDDEN_RUNTIME_KEYS as readonly string[]).includes(key)) {
      found.push(childPath);
    }

    found.push(...findForbiddenRuntimeKeys(child, childPath));
  }

  return found;
}
