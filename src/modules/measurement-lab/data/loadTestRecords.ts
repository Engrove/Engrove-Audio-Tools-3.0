/*
 * Loads the test-record dataset shipped under
 * /data/audio/v3/runtime/test-records.json. The dataset describes the
 * bands on supported physical test records; Engrove never ships the
 * audio of those records. Each band carries a closed-vocabulary
 * purpose: speed, freq_response, crosstalk, thd, imd, resonance,
 * tracking_ability, vta_optimization, pink_noise, vertical_modulation,
 * rumble. Bands may also carry analyzer-ready metadata: signal_type,
 * analyzer_module, level_db, level_start_db, level_end_db,
 * level_reference, f1_hz, f2_hz, ratio, standard, sweep_direction,
 * sweep_scale. These power signal-driven analyzer dispatch in
 * Measurement Lab and downstream modules; the new analyzer-ready
 * purposes (vta_optimization, pink_noise, vertical_modulation, rumble)
 * are required to declare signal_type and analyzer_module.
 */

export type TestBandPurpose =
  | 'speed'
  | 'freq_response'
  | 'crosstalk'
  | 'thd'
  | 'imd'
  | 'resonance'
  | 'tracking_ability'
  | 'vta_optimization'
  | 'pink_noise'
  | 'vertical_modulation'
  | 'rumble';

export type TestBandChannel =
  | 'mono'
  | 'L'
  | 'R'
  | 'both'
  | 'out_of_phase';

export type TestBandType =
  | 'sine'
  | 'sweep'
  | 'dual_tone'
  | 'silence'
  | 'noise'
  | 'pulse';

export type TestBandSignalType =
  | 'single_tone'
  | 'dual_tone'
  | 'sweep'
  | 'amplitude_sweep'
  | 'noise'
  | 'silence'
  | 'pulse'
  | 'tracking_burst';

export type TestBandAnalyzerModule =
  | 'reference_calibration'
  | 'channel_identity'
  | 'azimuth_crosstalk'
  | 'frequency_response'
  | 'thd'
  | 'imd'
  | 'vta_imd_optimizer'
  | 'wow_flutter'
  | 'anti_skate_tracking_stress'
  | 'pink_noise_diagnostics'
  | 'vertical_modulation'
  | 'vertical_resonance'
  | 'lf_resonance'
  | 'rumble_isolation';

export type TestBandSweepDirection = 'ascending' | 'descending';
export type TestBandSweepScale = 'log' | 'linear';
export type TestBandStandard = 'SMPTE' | 'CCIF' | 'DIN' | 'IEC' | 'IEC_IMD' | 'AES';
export type TestBandLevelReference = '0dB_groove' | 'cm_per_sec' | 'peak_velocity';

export type TestBand = {
  readonly index: string;
  readonly label: string;
  readonly type: TestBandType;
  readonly channel: TestBandChannel;
  readonly durationSeconds: number;
  readonly purpose: TestBandPurpose;
  readonly frequencyHz?: number;
  readonly fromHz?: number;
  readonly toHz?: number;
  readonly notes?: string;
  readonly signalType?: TestBandSignalType;
  readonly analyzerModule?: TestBandAnalyzerModule;
  readonly analyzerModules?: readonly TestBandAnalyzerModule[];
  readonly levelDb?: number;
  readonly levelStartDb?: number;
  readonly levelEndDb?: number;
  readonly levelReference?: TestBandLevelReference;
  readonly f1Hz?: number;
  readonly f2Hz?: number;
  readonly ratio?: string;
  readonly standard?: TestBandStandard;
  readonly sweepDirection?: TestBandSweepDirection;
  readonly sweepScale?: TestBandSweepScale;
};

export type TestRecordSide = {
  readonly side: string;
  readonly bands: readonly TestBand[];
};

export type TestRecordSourceStatus =
  | 'publisher_listing'
  | 'publisher_verified'
  | 'user_verified'
  | 'incomplete'
  | 'candidate';

export type TestRecord = {
  readonly id: string;
  readonly manufacturer: string;
  readonly title: string;
  readonly edition?: string;
  readonly format?: string;
  readonly source: string;
  readonly preferredForToolbox3?: boolean;
  readonly sourceStatus?: TestRecordSourceStatus;
  readonly sides: readonly TestRecordSide[];
};

export type TestRecordsRuntimeData = {
  readonly version: string;
  readonly records: readonly TestRecord[];
};

type RawTestBand = {
  index?: unknown;
  label?: unknown;
  type?: unknown;
  channel?: unknown;
  purpose?: unknown;
  duration_seconds?: unknown;
  frequency_hz?: unknown;
  from_hz?: unknown;
  to_hz?: unknown;
  notes?: unknown;
  signal_type?: unknown;
  analyzer_module?: unknown;
  analyzer_modules?: unknown;
  level_db?: unknown;
  level_start_db?: unknown;
  level_end_db?: unknown;
  level_reference?: unknown;
  f1_hz?: unknown;
  f2_hz?: unknown;
  ratio?: unknown;
  standard?: unknown;
  sweep_direction?: unknown;
  sweep_scale?: unknown;
};

type RawTestSide = {
  side?: unknown;
  bands?: unknown;
};

type RawTestRecord = {
  id?: unknown;
  manufacturer?: unknown;
  title?: unknown;
  edition?: unknown;
  format?: unknown;
  source?: unknown;
  preferred_for_toolbox_3?: unknown;
  source_status?: unknown;
  sides?: unknown;
};

type RawTestRecordsData = {
  version?: unknown;
  records?: unknown;
};

const testRecordsRuntimeUrl = '/data/audio/v3/runtime/test-records.json';

let cached: Promise<TestRecordsRuntimeData> | null = null;

function expectString(value: unknown, location: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${location} must be a non-empty string.`);
  }
  return value;
}

function expectFinite(value: unknown, location: string, optional = false): number | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${location} must be a finite number.`);
  }
  return value;
}

function expectMember<T extends string>(value: unknown, set: ReadonlySet<T>, location: string): T {
  if (typeof value !== 'string' || !set.has(value as T)) {
    throw new Error(`${location} must be one of ${[...set].join(', ')}.`);
  }
  return value as T;
}

const bandPurposes: ReadonlySet<TestBandPurpose> = new Set([
  'speed', 'freq_response', 'crosstalk', 'thd', 'imd', 'resonance', 'tracking_ability',
  'vta_optimization', 'pink_noise', 'vertical_modulation', 'rumble',
]);
const sourceStatuses: ReadonlySet<TestRecordSourceStatus> = new Set([
  'publisher_listing', 'publisher_verified', 'user_verified', 'incomplete', 'candidate',
]);
const bandChannels: ReadonlySet<TestBandChannel> = new Set([
  'mono', 'L', 'R', 'both', 'out_of_phase',
]);
const bandTypes: ReadonlySet<TestBandType> = new Set([
  'sine', 'sweep', 'dual_tone', 'silence', 'noise', 'pulse',
]);
const signalTypes: ReadonlySet<TestBandSignalType> = new Set([
  'single_tone', 'dual_tone', 'sweep', 'amplitude_sweep', 'noise', 'silence', 'pulse', 'tracking_burst',
]);
const analyzerModules: ReadonlySet<TestBandAnalyzerModule> = new Set([
  'reference_calibration', 'channel_identity', 'azimuth_crosstalk', 'frequency_response',
  'thd', 'imd', 'vta_imd_optimizer', 'wow_flutter', 'anti_skate_tracking_stress',
  'pink_noise_diagnostics', 'vertical_modulation', 'vertical_resonance',
  'lf_resonance', 'rumble_isolation',
]);
const sweepDirections: ReadonlySet<TestBandSweepDirection> = new Set(['ascending', 'descending']);
const sweepScales: ReadonlySet<TestBandSweepScale> = new Set(['log', 'linear']);
const standards: ReadonlySet<TestBandStandard> = new Set(['SMPTE', 'CCIF', 'DIN', 'IEC', 'IEC_IMD', 'AES']);
const levelReferences: ReadonlySet<TestBandLevelReference> = new Set(['0dB_groove', 'cm_per_sec', 'peak_velocity']);

export const TOOLBOX_3_REQUIRED_PURPOSES: ReadonlySet<TestBandPurpose> = new Set([
  'speed', 'freq_response', 'crosstalk', 'thd', 'imd', 'resonance', 'tracking_ability',
  'vta_optimization', 'pink_noise', 'vertical_modulation', 'rumble',
]);

function transformBand(raw: RawTestBand, location: string): TestBand {
  const duration = expectFinite(raw.duration_seconds, `${location}.duration_seconds`);
  let parsedAnalyzerModules: readonly TestBandAnalyzerModule[] | undefined;
  if (raw.analyzer_modules !== undefined) {
    if (!Array.isArray(raw.analyzer_modules)) {
      throw new Error(`${location}.analyzer_modules must be an array.`);
    }
    parsedAnalyzerModules = raw.analyzer_modules.map((m, i) =>
      expectMember(m, analyzerModules, `${location}.analyzer_modules[${i}]`));
  }
  return {
    index: expectString(raw.index, `${location}.index`) as string,
    label: expectString(raw.label, `${location}.label`) as string,
    type: expectMember(raw.type, bandTypes, `${location}.type`),
    channel: expectMember(raw.channel, bandChannels, `${location}.channel`),
    purpose: expectMember(raw.purpose, bandPurposes, `${location}.purpose`),
    durationSeconds: duration as number,
    frequencyHz: expectFinite(raw.frequency_hz, `${location}.frequency_hz`, true),
    fromHz: expectFinite(raw.from_hz, `${location}.from_hz`, true),
    toHz: expectFinite(raw.to_hz, `${location}.to_hz`, true),
    notes: expectString(raw.notes, `${location}.notes`, true),
    signalType: raw.signal_type === undefined ? undefined : expectMember(raw.signal_type, signalTypes, `${location}.signal_type`),
    analyzerModule: raw.analyzer_module === undefined ? undefined : expectMember(raw.analyzer_module, analyzerModules, `${location}.analyzer_module`),
    analyzerModules: parsedAnalyzerModules,
    levelDb: expectFinite(raw.level_db, `${location}.level_db`, true),
    levelStartDb: expectFinite(raw.level_start_db, `${location}.level_start_db`, true),
    levelEndDb: expectFinite(raw.level_end_db, `${location}.level_end_db`, true),
    levelReference: raw.level_reference === undefined ? undefined : expectMember(raw.level_reference, levelReferences, `${location}.level_reference`),
    f1Hz: expectFinite(raw.f1_hz, `${location}.f1_hz`, true),
    f2Hz: expectFinite(raw.f2_hz, `${location}.f2_hz`, true),
    ratio: expectString(raw.ratio, `${location}.ratio`, true),
    standard: raw.standard === undefined ? undefined : expectMember(raw.standard, standards, `${location}.standard`),
    sweepDirection: raw.sweep_direction === undefined ? undefined : expectMember(raw.sweep_direction, sweepDirections, `${location}.sweep_direction`),
    sweepScale: raw.sweep_scale === undefined ? undefined : expectMember(raw.sweep_scale, sweepScales, `${location}.sweep_scale`),
  };
}

function transformSide(raw: RawTestSide, location: string): TestRecordSide {
  if (!Array.isArray(raw.bands)) {
    throw new Error(`${location}.bands must be an array.`);
  }
  return {
    side: expectString(raw.side, `${location}.side`) as string,
    bands: raw.bands.map((band, index) => transformBand(band as RawTestBand, `${location}.bands[${index}]`)),
  };
}

function transformRecord(raw: RawTestRecord, location: string): TestRecord {
  if (!Array.isArray(raw.sides)) {
    throw new Error(`${location}.sides must be an array.`);
  }
  let preferredForToolbox3: boolean | undefined;
  if (raw.preferred_for_toolbox_3 !== undefined) {
    if (typeof raw.preferred_for_toolbox_3 !== 'boolean') {
      throw new Error(`${location}.preferred_for_toolbox_3 must be a boolean when present.`);
    }
    preferredForToolbox3 = raw.preferred_for_toolbox_3;
  }
  const sourceStatus = raw.source_status === undefined
    ? undefined
    : expectMember(raw.source_status, sourceStatuses, `${location}.source_status`);
  return {
    id: expectString(raw.id, `${location}.id`) as string,
    manufacturer: expectString(raw.manufacturer, `${location}.manufacturer`) as string,
    title: expectString(raw.title, `${location}.title`) as string,
    edition: expectString(raw.edition, `${location}.edition`, true),
    format: expectString(raw.format, `${location}.format`, true),
    source: expectString(raw.source, `${location}.source`) as string,
    preferredForToolbox3,
    sourceStatus,
    sides: raw.sides.map((side, index) => transformSide(side as RawTestSide, `${location}.sides[${index}]`)),
  };
}

export function getPreferredRecord(
  records: readonly TestRecord[],
): TestRecord | null {
  return records.find((r) => r.preferredForToolbox3 === true) ?? null;
}

export function recordCoverageScore(
  record: TestRecord,
  required: ReadonlySet<TestBandPurpose>,
): { covered: number; total: number; missing: readonly TestBandPurpose[] } {
  const present = new Set<TestBandPurpose>();
  for (const side of record.sides) {
    for (const band of side.bands) {
      if (required.has(band.purpose)) present.add(band.purpose);
    }
  }
  const missing: TestBandPurpose[] = [];
  required.forEach((p) => { if (!present.has(p)) missing.push(p); });
  return { covered: present.size, total: required.size, missing };
}

function transform(raw: RawTestRecordsData): TestRecordsRuntimeData {
  if (!Array.isArray(raw.records)) {
    throw new Error('test-records.json must declare a records array.');
  }
  return {
    version: expectString(raw.version, 'test-records.json:version') as string,
    records: raw.records.map((record, index) => transformRecord(record as RawTestRecord, `test-records.json:records[${index}]`)),
  };
}

export function loadTestRecordsRuntimeData(): Promise<TestRecordsRuntimeData> {
  if (!cached) {
    cached = fetch(testRecordsRuntimeUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load test-records dataset: ${response.status}`);
        }
        return response.json() as Promise<RawTestRecordsData>;
      })
      .then(transform)
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
