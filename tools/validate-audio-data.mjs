#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const files = {
  sourceCartridges: 'src/data/audio/v3/runtime/cartridges.index.json',
  sourceTonearms: 'src/data/audio/v3/runtime/tonearms.index.json',
  summary: 'src/data/audio/v3/audio-data-v3-summary.json',
  publicCartridges: 'public/data/audio/v3/runtime/cartridges.index.json',
  publicTonearms: 'public/data/audio/v3/runtime/tonearms.index.json',
  publicNullPoints: 'public/data/audio/v3/runtime/null-points.json',
  publicTestRecords: 'public/data/audio/v3/runtime/test-records.json',
  publicManifest: 'public/data/audio/v3/runtime/audio-index.manifest.json',
};

const publicFetchPaths = {
  cartridges: '/data/audio/v3/runtime/cartridges.index.json',
  tonearms: '/data/audio/v3/runtime/tonearms.index.json',
  nullPoints: '/data/audio/v3/runtime/null-points.json',
  testRecords: '/data/audio/v3/runtime/test-records.json',
};

const supportedAlignmentStandards = ['IEC', 'DIN'];
const supportedAlignmentMethods = ['Baerwald', 'LofgrenA', 'LofgrenB', 'Stevenson'];

const supportedTestBandPurposes = new Set([
  'speed',
  'freq_response',
  'crosstalk',
  'thd',
  'imd',
  'resonance',
  'tracking_ability',
]);
const supportedTestBandChannels = new Set([
  'mono',
  'L',
  'R',
  'both',
  'out_of_phase',
]);
const supportedTestBandTypes = new Set([
  'sine',
  'sweep',
  'dual_tone',
  'silence',
  'noise',
  'pulse',
]);
const kebabIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const limits = {
  minCartridgeRecords: 1000,
  minTonearmRecords: 500,
  minMatchReadyCartridges: 500,
  minMatchReadyTonearms: 250,
  minReasonableCartridgeMassG: 0.5,
  maxReasonableCartridgeMassG: 40,
  minReasonableCompliance10HzCu: 1,
  maxReasonableCompliance10HzCu: 80,
  minReasonableEffectiveMassG: 1,
  maxReasonableEffectiveMassG: 80,
};

const forbiddenKeys = new Set([
  'sources',
  'edit_history',
  'created_by',
  'create_stamp',
  'updated_by',
  'update_stamp',
]);

const issues = [];

function add(severity, code, location, message) {
  issues.push({ severity, code, location, message });
}

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

async function readJsonFile(relativePath, options = {}) {
  const buffer = await readFile(repoPath(relativePath));
  const text = buffer.toString('utf8');

  if (options.requireNoBom && hasUtf8Bom(buffer)) {
    add('error', 'json.bom', relativePath, 'JSON file must be UTF-8 without BOM.');
  }

  if (options.requireLf && text.includes('\r\n')) {
    add('error', 'json.crlf', relativePath, 'JSON file must use LF line endings; found CRLF line endings.');
  }

  if (options.requireLf && /\r(?!\n)/u.test(text)) {
    add('error', 'json.cr', relativePath, 'JSON file must use LF line endings; found CR-only line endings.');
  }

  return {
    data: JSON.parse(text.replace(/^\uFEFF/, '')),
    buffer,
    text,
    size_bytes: buffer.length,
    sha256: sha256(buffer),
    relativePath,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function displayName(record) {
  return typeof record?.display_name === 'string' && record.display_name.trim()
    ? record.display_name
    : 'unnamed record';
}

const integratedCartridgeMountingStyles = new Set([
  'integrated_headshell',
  'integrated_shell',
]);

function isIntegratedShellCartridge(record) {
  return integratedCartridgeMountingStyles.has(record?.mounting_style);
}

function findForbiddenKeys(value, location) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${location}[${index}]`));
    return;
  }

  if (!isObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${location}.${key}`;
    if (forbiddenKeys.has(key)) {
      add('error', 'runtime.forbidden_key', childPath, 'Runtime data must not include legacy/source metadata.');
    }
    findForbiddenKeys(child, childPath);
  }
}

function validateCartridge(record, index) {
  const location = `cartridges.index[${index}]`;

  if (!isObject(record)) {
    add('error', 'cartridge.not_object', location, 'Cartridge index entry must be an object.');
    return;
  }

  if (typeof record.id !== 'string' || !record.id.trim()) {
    add('error', 'cartridge.id_missing', `${location}.id`, 'Cartridge id is required.');
  }

  if (typeof record.display_name !== 'string' || !record.display_name.trim()) {
    add('error', 'cartridge.display_name_missing', `${location}.display_name`, 'Cartridge display_name is required.');
  }

  if (typeof record.match_ready !== 'boolean') {
    add('error', 'cartridge.match_ready_missing', `${location}.match_ready`, 'Cartridge match_ready boolean is required.');
  }

  if (record.match_ready === true) {
    if (!isNumber(record.mass_g)) {
      add('error', 'cartridge.match_ready_without_mass', `${location}.mass_g`, 'Match-ready cartridge must have mass_g.');
    }

    if (!isNumber(record.compliance_10hz_cu)) {
      add('error', 'cartridge.match_ready_without_compliance', `${location}.compliance_10hz_cu`, 'Match-ready cartridge must have compliance_10hz_cu.');
    }
  }

  const highMassWithoutIntegratedModel =
    isNumber(record.mass_g) &&
    record.mass_g > limits.maxReasonableCartridgeMassG &&
    !isIntegratedShellCartridge(record);

  if (
    isNumber(record.mass_g) &&
    (record.mass_g < limits.minReasonableCartridgeMassG || highMassWithoutIntegratedModel)
  ) {
    add('warning', 'cartridge.mass_range', `${location}.mass_g`, `${displayName(record)} mass_g = ${record.mass_g}`);
  }

  if (
    isNumber(record.compliance_10hz_cu) &&
    (record.compliance_10hz_cu < limits.minReasonableCompliance10HzCu ||
      record.compliance_10hz_cu > limits.maxReasonableCompliance10HzCu)
  ) {
    add('warning', 'cartridge.compliance_range', `${location}.compliance_10hz_cu`, `${displayName(record)} compliance_10hz_cu = ${record.compliance_10hz_cu}`);
  }
}

function validateTonearm(record, index) {
  const location = `tonearms.index[${index}]`;

  if (!isObject(record)) {
    add('error', 'tonearm.not_object', location, 'Tonearm index entry must be an object.');
    return;
  }

  if (typeof record.id !== 'string' || !record.id.trim()) {
    add('error', 'tonearm.id_missing', `${location}.id`, 'Tonearm id is required.');
  }

  if (typeof record.display_name !== 'string' || !record.display_name.trim()) {
    add('error', 'tonearm.display_name_missing', `${location}.display_name`, 'Tonearm display_name is required.');
  }

  if (typeof record.match_ready !== 'boolean') {
    add('error', 'tonearm.match_ready_missing', `${location}.match_ready`, 'Tonearm match_ready boolean is required.');
  }

  if (record.match_ready === true && !isNumber(record.effective_mass_g)) {
    add('error', 'tonearm.match_ready_without_effective_mass', `${location}.effective_mass_g`, 'Match-ready tonearm must have effective_mass_g.');
  }

  if (
    isNumber(record.effective_mass_g) &&
    (record.effective_mass_g < limits.minReasonableEffectiveMassG ||
      record.effective_mass_g > limits.maxReasonableEffectiveMassG)
  ) {
    add('warning', 'tonearm.effective_mass_range', `${location}.effective_mass_g`, `${displayName(record)} effective_mass_g = ${record.effective_mass_g}`);
  }
}

function validateNullPoints(data) {
  if (!isObject(data)) {
    add('error', 'null_points.invalid', files.publicNullPoints, 'Null-points dataset must be an object.');
    return 0;
  }

  if (typeof data.version !== 'string' || data.version.trim() === '') {
    add('error', 'null_points.version_missing', `${files.publicNullPoints}:version`, 'Null-points dataset must declare a version string.');
  }

  if (!isObject(data.table)) {
    add('error', 'null_points.table_missing', `${files.publicNullPoints}:table`, 'Null-points dataset must include a table object.');
    return 0;
  }

  if (!isObject(data.radii)) {
    add('error', 'null_points.radii_missing', `${files.publicNullPoints}:radii`, 'Null-points dataset must include a radii object.');
  }

  let recordCount = 0;
  for (const standard of supportedAlignmentStandards) {
    const methods = data.table[standard];
    if (!isObject(methods)) {
      add('error', 'null_points.standard_missing', `${files.publicNullPoints}:table.${standard}`, `Missing methods for alignment standard ${standard}.`);
      continue;
    }
    for (const method of supportedAlignmentMethods) {
      const entry = methods[method];
      const location = `${files.publicNullPoints}:table.${standard}.${method}`;
      if (!isObject(entry)) {
        add('error', 'null_points.method_missing', location, `Missing null-point entry for ${standard}/${method}.`);
        continue;
      }
      if (!isNumber(entry.n1_mm) || entry.n1_mm <= 0) {
        add('error', 'null_points.n1_invalid', `${location}.n1_mm`, 'n1_mm must be a positive finite number.');
      }
      if (!isNumber(entry.n2_mm) || entry.n2_mm <= 0) {
        add('error', 'null_points.n2_invalid', `${location}.n2_mm`, 'n2_mm must be a positive finite number.');
      }
      if (isNumber(entry.n1_mm) && isNumber(entry.n2_mm) && entry.n1_mm >= entry.n2_mm) {
        add('error', 'null_points.order_invalid', location, 'n1_mm (inner) must be strictly less than n2_mm (outer).');
      }
      if (typeof entry.source !== 'string' || entry.source.trim() === '') {
        add('error', 'null_points.source_missing', `${location}.source`, 'Each null-point entry must declare a non-empty source string.');
      }
      recordCount += 1;
    }
  }

  if (isObject(data.radii)) {
    for (const standard of supportedAlignmentStandards) {
      const radii = data.radii[standard];
      const location = `${files.publicNullPoints}:radii.${standard}`;
      if (!isObject(radii)) {
        add('error', 'null_points.radii_standard_missing', location, `Missing radii entry for ${standard}.`);
        continue;
      }
      if (!isNumber(radii.inner_mm) || radii.inner_mm <= 0) {
        add('error', 'null_points.radii_inner_invalid', `${location}.inner_mm`, 'inner_mm must be a positive finite number.');
      }
      if (!isNumber(radii.outer_mm) || radii.outer_mm <= 0) {
        add('error', 'null_points.radii_outer_invalid', `${location}.outer_mm`, 'outer_mm must be a positive finite number.');
      }
      if (isNumber(radii.inner_mm) && isNumber(radii.outer_mm) && radii.inner_mm >= radii.outer_mm) {
        add('error', 'null_points.radii_order_invalid', location, 'inner_mm must be strictly less than outer_mm.');
      }
    }
  }

  return recordCount;
}

function validateTestRecordBand(record, side, band, location) {
  if (!isObject(band)) {
    add('error', 'test_records.band_invalid', location, 'Test-record band must be an object.');
    return;
  }
  if (typeof band.index !== 'string' || band.index.trim() === '') {
    add('error', 'test_records.band_index_invalid', `${location}.index`, 'Each band must declare a non-empty string index.');
  }
  if (typeof band.label !== 'string' || band.label.trim() === '') {
    add('error', 'test_records.band_label_invalid', `${location}.label`, 'Each band must declare a non-empty label.');
  }
  if (!supportedTestBandTypes.has(band.type)) {
    add('error', 'test_records.band_type_invalid', `${location}.type`, `Band type "${band.type}" is not in the closed vocabulary.`);
  }
  if (!supportedTestBandChannels.has(band.channel)) {
    add('error', 'test_records.band_channel_invalid', `${location}.channel`, `Band channel "${band.channel}" is not in the closed vocabulary.`);
  }
  if (!supportedTestBandPurposes.has(band.purpose)) {
    add('error', 'test_records.band_purpose_invalid', `${location}.purpose`, `Band purpose "${band.purpose}" is not in the closed vocabulary.`);
  }
  if (!isNumber(band.duration_seconds) || band.duration_seconds <= 0) {
    add('error', 'test_records.band_duration_invalid', `${location}.duration_seconds`, 'Band duration_seconds must be a positive finite number.');
  }
  if (band.type === 'sine') {
    if (!isNumber(band.frequency_hz) || band.frequency_hz <= 0) {
      add('error', 'test_records.band_frequency_invalid', `${location}.frequency_hz`, 'Sine band must declare a positive frequency_hz.');
    }
  } else if (band.type === 'sweep') {
    if (!isNumber(band.from_hz) || band.from_hz <= 0) {
      add('error', 'test_records.band_sweep_from_invalid', `${location}.from_hz`, 'Sweep band must declare a positive from_hz.');
    }
    if (!isNumber(band.to_hz) || band.to_hz <= 0) {
      add('error', 'test_records.band_sweep_to_invalid', `${location}.to_hz`, 'Sweep band must declare a positive to_hz.');
    }
    if (isNumber(band.from_hz) && isNumber(band.to_hz) && band.from_hz === band.to_hz) {
      add('error', 'test_records.band_sweep_range', location, 'Sweep band from_hz and to_hz must differ.');
    }
  }
  if ('notes' in band && typeof band.notes !== 'string') {
    add('error', 'test_records.band_notes_invalid', `${location}.notes`, 'Band notes must be a string when present.');
  }
}

function validateTestRecords(data) {
  if (!isObject(data)) {
    add('error', 'test_records.invalid', files.publicTestRecords, 'Test-records dataset must be an object.');
    return 0;
  }
  if (typeof data.version !== 'string' || data.version.trim() === '') {
    add('error', 'test_records.version_missing', `${files.publicTestRecords}:version`, 'Test-records dataset must declare a version string.');
  }
  if (!Array.isArray(data.records)) {
    add('error', 'test_records.records_missing', `${files.publicTestRecords}:records`, 'Test-records dataset must declare a records array.');
    return 0;
  }
  let bandCount = 0;
  const seenIds = new Set();
  for (let recordIndex = 0; recordIndex < data.records.length; recordIndex += 1) {
    const record = data.records[recordIndex];
    const recordLocation = `${files.publicTestRecords}:records[${recordIndex}]`;
    if (!isObject(record)) {
      add('error', 'test_records.record_invalid', recordLocation, 'Test-record entry must be an object.');
      continue;
    }
    if (typeof record.id !== 'string' || !kebabIdPattern.test(record.id)) {
      add('error', 'test_records.record_id_invalid', `${recordLocation}.id`, 'Test-record id must be kebab-case ASCII.');
    } else if (seenIds.has(record.id)) {
      add('error', 'test_records.record_id_duplicate', `${recordLocation}.id`, `Duplicate test-record id "${record.id}".`);
    } else {
      seenIds.add(record.id);
    }
    if (typeof record.manufacturer !== 'string' || record.manufacturer.trim() === '') {
      add('error', 'test_records.record_manufacturer_invalid', `${recordLocation}.manufacturer`, 'Test-record must declare a non-empty manufacturer.');
    }
    if (typeof record.title !== 'string' || record.title.trim() === '') {
      add('error', 'test_records.record_title_invalid', `${recordLocation}.title`, 'Test-record must declare a non-empty title.');
    }
    if (typeof record.source !== 'string' || record.source.trim() === '') {
      add('error', 'test_records.record_source_invalid', `${recordLocation}.source`, 'Test-record must declare a non-empty source citation.');
    }
    if (!Array.isArray(record.sides) || record.sides.length === 0) {
      add('error', 'test_records.record_sides_missing', `${recordLocation}.sides`, 'Test-record must declare at least one side.');
      continue;
    }
    for (let sideIndex = 0; sideIndex < record.sides.length; sideIndex += 1) {
      const side = record.sides[sideIndex];
      const sideLocation = `${recordLocation}.sides[${sideIndex}]`;
      if (!isObject(side)) {
        add('error', 'test_records.side_invalid', sideLocation, 'Test-record side must be an object.');
        continue;
      }
      if (typeof side.side !== 'string' || side.side.trim() === '') {
        add('error', 'test_records.side_label_invalid', `${sideLocation}.side`, 'Side label must be a non-empty string.');
      }
      if (!Array.isArray(side.bands) || side.bands.length === 0) {
        add('error', 'test_records.side_bands_missing', `${sideLocation}.bands`, 'Side must declare at least one band.');
        continue;
      }
      for (let bandIndex = 0; bandIndex < side.bands.length; bandIndex += 1) {
        const band = side.bands[bandIndex];
        validateTestRecordBand(record, side, band, `${sideLocation}.bands[${bandIndex}]`);
        bandCount += 1;
      }
    }
  }
  return bandCount;
}

function assertSummary(summary, cartridges, tonearms) {
  if (summary?.inspected_structure?.cartridges_shape !== 'row_array') {
    add('warning', 'summary.cartridges_shape', 'summary.inspected_structure.cartridges_shape', 'Expected cartridges source shape row_array.');
  }

  if (summary?.inspected_structure?.tonearms_shape !== 'row_array') {
    add('warning', 'summary.tonearms_shape', 'summary.inspected_structure.tonearms_shape', 'Expected tonearms source shape row_array.');
  }

  if (summary?.cartridges?.output_records !== cartridges.length) {
    add('error', 'summary.cartridge_count_mismatch', 'summary.cartridges.output_records', `Summary says ${summary?.cartridges?.output_records}; index has ${cartridges.length}.`);
  }

  if (summary?.tonearms?.output_records !== tonearms.length) {
    add('error', 'summary.tonearm_count_mismatch', 'summary.tonearms.output_records', `Summary says ${summary?.tonearms?.output_records}; index has ${tonearms.length}.`);
  }
}

function assertArray(value, relativePath, code) {
  if (!Array.isArray(value)) {
    add('error', code, relativePath, 'Runtime index must be an array.');
    return false;
  }

  return true;
}

function assertJsonEqual(source, delivered, location) {
  if (JSON.stringify(source) !== JSON.stringify(delivered)) {
    add('error', 'runtime.public_mismatch', location, 'Public runtime delivery JSON does not match canonical source runtime data.');
  }
}

function assertRuntimeMirrorParity(sourcePath, source, publicPath, delivered) {
  if (source.buffer.equals(delivered.buffer)) {
    return;
  }

  add(
    'error',
    'runtime.mirror_byte_mismatch',
    `${sourcePath} <-> ${publicPath}`,
    `Runtime source/public mirror byte mismatch. ${sourcePath}: size=${source.size_bytes}, sha256=${source.sha256}; ${publicPath}: size=${delivered.size_bytes}, sha256=${delivered.sha256}.`,
  );
}

function manifestOutputs(manifest) {
  if (!isObject(manifest)) {
    add('error', 'manifest.invalid', files.publicManifest, 'Public manifest must be an object.');
    return [];
  }

  if (!Array.isArray(manifest.outputs)) {
    add('error', 'manifest.outputs_missing', files.publicManifest, 'Public manifest must contain an outputs array.');
    return [];
  }

  return manifest.outputs;
}

function findManifestEntry(outputs, publicPath) {
  return outputs.find((entry) => entry?.path === publicPath);
}

function assertManifestEntry(outputs, publicPath, actual, recordCount) {
  const entry = findManifestEntry(outputs, publicPath);

  if (!entry) {
    add('error', 'manifest.entry_missing', files.publicManifest, `Manifest missing entry for ${publicPath}.`);
    return;
  }

  if (entry.path.includes('src/data/')) {
    add('error', 'manifest.src_path', `${files.publicManifest}:${publicPath}`, 'Public manifest must not reference src/data paths.');
  }

  if (entry.records !== recordCount) {
    add('error', 'manifest.records_mismatch', `${files.publicManifest}:${publicPath}.records`, `Manifest says ${entry.records}; actual record count is ${recordCount}.`);
  }

  if (entry.size_bytes !== actual.size_bytes) {
    add('error', 'manifest.size_mismatch', `${files.publicManifest}:${publicPath}.size_bytes`, `Manifest says ${entry.size_bytes}; actual byte size is ${actual.size_bytes}.`);
  }

  if (entry.sha256 !== actual.sha256) {
    add('error', 'manifest.sha256_mismatch', `${files.publicManifest}:${publicPath}.sha256`, `Manifest says ${entry.sha256}; actual SHA-256 is ${actual.sha256}.`);
  }
}

const [
  sourceCartridges,
  sourceTonearms,
  summary,
  publicCartridges,
  publicTonearms,
  publicNullPoints,
  publicTestRecords,
  publicManifest,
] = await Promise.all([
  readJsonFile(files.sourceCartridges, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.sourceTonearms, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.summary),
  readJsonFile(files.publicCartridges, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.publicTonearms, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.publicNullPoints, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.publicTestRecords, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.publicManifest, { requireNoBom: true, requireLf: true }),
]);

assertRuntimeMirrorParity(files.sourceCartridges, sourceCartridges, files.publicCartridges, publicCartridges);
assertRuntimeMirrorParity(files.sourceTonearms, sourceTonearms, files.publicTonearms, publicTonearms);

const cartridgesAreArray = assertArray(publicCartridges.data, files.publicCartridges, 'cartridges.not_array');
const tonearmsAreArray = assertArray(publicTonearms.data, files.publicTonearms, 'tonearms.not_array');

if (cartridgesAreArray && assertArray(sourceCartridges.data, files.sourceCartridges, 'source_cartridges.not_array')) {
  assertJsonEqual(sourceCartridges.data, publicCartridges.data, files.publicCartridges);

  if (publicCartridges.data.length < limits.minCartridgeRecords) {
    add('error', 'cartridges.too_few_records', files.publicCartridges, `Expected at least ${limits.minCartridgeRecords} cartridges; got ${publicCartridges.data.length}.`);
  }

  const matchReady = publicCartridges.data.filter((item) => item?.match_ready === true).length;
  if (matchReady < limits.minMatchReadyCartridges) {
    add('error', 'cartridges.too_few_match_ready', files.publicCartridges, `Expected at least ${limits.minMatchReadyCartridges} match-ready cartridges; got ${matchReady}.`);
  }

  publicCartridges.data.forEach(validateCartridge);
  findForbiddenKeys(publicCartridges.data, 'cartridges.index');
}

if (tonearmsAreArray && assertArray(sourceTonearms.data, files.sourceTonearms, 'source_tonearms.not_array')) {
  assertJsonEqual(sourceTonearms.data, publicTonearms.data, files.publicTonearms);

  if (publicTonearms.data.length < limits.minTonearmRecords) {
    add('error', 'tonearms.too_few_records', files.publicTonearms, `Expected at least ${limits.minTonearmRecords} tonearms; got ${publicTonearms.data.length}.`);
  }

  const matchReady = publicTonearms.data.filter((item) => item?.match_ready === true).length;
  if (matchReady < limits.minMatchReadyTonearms) {
    add('error', 'tonearms.too_few_match_ready', files.publicTonearms, `Expected at least ${limits.minMatchReadyTonearms} match-ready tonearms; got ${matchReady}.`);
  }

  publicTonearms.data.forEach(validateTonearm);
  findForbiddenKeys(publicTonearms.data, 'tonearms.index');
}

if (cartridgesAreArray && tonearmsAreArray) {
  assertSummary(summary.data, publicCartridges.data, publicTonearms.data);
}

const nullPointsRecordCount = validateNullPoints(publicNullPoints.data);
const testRecordsBandCount = validateTestRecords(publicTestRecords.data);

const outputs = manifestOutputs(publicManifest.data);
assertManifestEntry(outputs, publicFetchPaths.cartridges, publicCartridges, cartridgesAreArray ? publicCartridges.data.length : null);
assertManifestEntry(outputs, publicFetchPaths.tonearms, publicTonearms, tonearmsAreArray ? publicTonearms.data.length : null);
assertManifestEntry(outputs, publicFetchPaths.nullPoints, publicNullPoints, nullPointsRecordCount);
assertManifestEntry(outputs, publicFetchPaths.testRecords, publicTestRecords, testRecordsBandCount);

for (const output of outputs) {
  if (typeof output?.path === 'string' && output.path.includes('src/data/')) {
    add('error', 'manifest.src_path', `${files.publicManifest}:${output.path}`, 'Public manifest must not reference src/data paths.');
  }
}

const errorCount = issues.filter((item) => item.severity === 'error').length;
const warningCount = issues.filter((item) => item.severity === 'warning').length;

console.log('Engrove Audio Tools 3.0 audio data validation');
console.log(`- cartridges: ${cartridgesAreArray ? publicCartridges.data.length : 'invalid'}`);
console.log(`- tonearms: ${tonearmsAreArray ? publicTonearms.data.length : 'invalid'}`);
console.log(`- null-points: ${nullPointsRecordCount} entries`);
console.log(`- test-records: ${testRecordsBandCount} bands`);
console.log(`- public manifest: ${files.publicManifest}`);
console.log(`- errors: ${errorCount}`);
console.log(`- warnings: ${warningCount}`);

const maxPrinted = 30;
for (const item of issues.slice(0, maxPrinted)) {
  console.log(`[${item.severity.toUpperCase()}] ${item.code} ${item.location}: ${item.message}`);
}

if (issues.length > maxPrinted) {
  console.log(`... ${issues.length - maxPrinted} more issue(s) omitted from console output.`);
}

if (errorCount > 0) {
  process.exit(1);
}
