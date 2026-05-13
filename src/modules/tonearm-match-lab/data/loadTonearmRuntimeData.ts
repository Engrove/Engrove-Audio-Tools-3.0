export type RuntimeTrackingForceRange = {
  readonly min?: number;
  readonly max?: number;
  readonly recommended?: number;
};

export const AUDIO_RUNTIME_MANIFEST_PATH = '/data/audio/v3/runtime/audio-index.manifest.json';
export const CARTRIDGES_RUNTIME_INDEX_PATH = '/data/audio/v3/runtime/cartridges.index.json';
export const TONEARMS_RUNTIME_INDEX_PATH = '/data/audio/v3/runtime/tonearms.index.json';

export type CartridgeRuntimeRecord = {
  id: string;
  display_name: string;
  match_ready: boolean;
  type?: string;
  mass_g?: number;
  compliance_10hz_cu?: number;
  tracking_force_g?: RuntimeTrackingForceRange;
};

export type TonearmRuntimeRecord = {
  id: string;
  display_name: string;
  match_ready: boolean;
  effective_mass_g?: number;
  effective_length_mm?: number;
};

export type TonearmRuntimeData = {
  cartridges: CartridgeRuntimeRecord[];
  tonearms: TonearmRuntimeRecord[];
};

type RuntimeObject = Record<string, unknown>;

function isRuntimeObject(value: unknown): value is RuntimeObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: RuntimeObject, fieldName: string, label: string): string {
  const value = record[fieldName];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} has invalid ${fieldName}; expected a non-empty string.`);
  }
  return value;
}

function readRequiredBoolean(record: RuntimeObject, fieldName: string, label: string): boolean {
  const value = record[fieldName];
  if (typeof value !== 'boolean') {
    throw new Error(`${label} has invalid ${fieldName}; expected a boolean.`);
  }
  return value;
}

function readOptionalString(record: RuntimeObject, fieldName: string, label: string): string | undefined {
  const value = record[fieldName];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} has invalid ${fieldName}; expected a string when present.`);
  }
  return value;
}

function readOptionalNumber(record: RuntimeObject, fieldName: string, label: string): number | undefined {
  const value = record[fieldName];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} has invalid ${fieldName}; expected a finite number when present.`);
  }
  return value;
}

function readOptionalTrackingForceRange(record: RuntimeObject, fieldName: string, label: string): RuntimeTrackingForceRange | undefined {
  const value = record[fieldName];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRuntimeObject(value)) {
    throw new Error(`${label} has invalid ${fieldName}; expected an object when present.`);
  }

  const range: RuntimeTrackingForceRange = {
    min: readOptionalNumber(value, 'min', `${label}.${fieldName}`),
    max: readOptionalNumber(value, 'max', `${label}.${fieldName}`),
    recommended: readOptionalNumber(value, 'recommended', `${label}.${fieldName}`),
  };

  if (
    typeof range.min === 'undefined'
    && typeof range.max === 'undefined'
    && typeof range.recommended === 'undefined'
  ) {
    return undefined;
  }

  return range;
}

function parseCartridgeRecord(value: unknown, index: number): CartridgeRuntimeRecord {
  const label = `cartridges.index.json record ${index + 1}`;
  if (!isRuntimeObject(value)) {
    throw new Error(`${label} is invalid; expected an object.`);
  }

  return {
    id: readRequiredString(value, 'id', label),
    display_name: readRequiredString(value, 'display_name', label),
    match_ready: readRequiredBoolean(value, 'match_ready', label),
    type: readOptionalString(value, 'type', label),
    mass_g: readOptionalNumber(value, 'mass_g', label),
    compliance_10hz_cu: readOptionalNumber(value, 'compliance_10hz_cu', label),
    tracking_force_g: readOptionalTrackingForceRange(value, 'tracking_force_g', label),
  };
}

function parseTonearmRecord(value: unknown, index: number): TonearmRuntimeRecord {
  const label = `tonearms.index.json record ${index + 1}`;
  if (!isRuntimeObject(value)) {
    throw new Error(`${label} is invalid; expected an object.`);
  }

  return {
    id: readRequiredString(value, 'id', label),
    display_name: readRequiredString(value, 'display_name', label),
    match_ready: readRequiredBoolean(value, 'match_ready', label),
    effective_mass_g: readOptionalNumber(value, 'effective_mass_g', label),
    effective_length_mm: readOptionalNumber(value, 'effective_length_mm', label),
  };
}

function parseArrayJson(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} is invalid; expected an array.`);
  }
  return value;
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load runtime data from ${path} (${response.status}).`);
  }
  return response.json() as Promise<unknown>;
}

export function filterRuntimeRecords<T extends { display_name: string }>(
  records: readonly T[],
  query: string,
  limit = 10,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');
  const source = normalizedQuery.length === 0
    ? records
    : records.filter((record) =>
        record.display_name.toLocaleLowerCase('en-US').includes(normalizedQuery),
      );

  return source.slice(0, limit);
}

export async function loadTonearmRuntimeData(): Promise<TonearmRuntimeData> {
  const [manifestJson, cartridgesJson, tonearmsJson] = await Promise.all([
    fetchJson(AUDIO_RUNTIME_MANIFEST_PATH),
    fetchJson(CARTRIDGES_RUNTIME_INDEX_PATH),
    fetchJson(TONEARMS_RUNTIME_INDEX_PATH),
  ]);

  if (!isRuntimeObject(manifestJson)) {
    throw new Error('audio-index.manifest.json is invalid; expected an object.');
  }

  const cartridges = parseArrayJson(cartridgesJson, 'cartridges.index.json')
    .map(parseCartridgeRecord)
    .filter((record) => record.match_ready);
  const tonearms = parseArrayJson(tonearmsJson, 'tonearms.index.json')
    .map(parseTonearmRecord)
    .filter((record) => record.match_ready);

  return { cartridges, tonearms };
}

/*
 * Geometry Lab and VTA & SRA Lab only need tonearm records that publish an
 * effective length. They do not need cartridge data and do not need the
 * match_ready gating that Tonearm Match Lab enforces (match_ready depends on
 * effective_mass_g, which neither geometry nor SRA math uses).
 */
export async function loadTonearmsWithEffectiveLength(): Promise<TonearmRuntimeRecord[]> {
  const tonearmsJson = await fetchJson(TONEARMS_RUNTIME_INDEX_PATH);
  return parseArrayJson(tonearmsJson, 'tonearms.index.json')
    .map(parseTonearmRecord)
    .filter((record) => typeof record.effective_length_mm === 'number' && Number.isFinite(record.effective_length_mm));
}
