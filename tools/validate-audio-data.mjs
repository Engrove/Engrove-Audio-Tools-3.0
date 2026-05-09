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
  publicManifest: 'public/data/audio/v3/runtime/audio-index.manifest.json',
};

const publicFetchPaths = {
  cartridges: '/data/audio/v3/runtime/cartridges.index.json',
  tonearms: '/data/audio/v3/runtime/tonearms.index.json',
};

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
  publicManifest,
] = await Promise.all([
  readJsonFile(files.sourceCartridges, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.sourceTonearms, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.summary),
  readJsonFile(files.publicCartridges, { requireNoBom: true, requireLf: true }),
  readJsonFile(files.publicTonearms, { requireNoBom: true, requireLf: true }),
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

const outputs = manifestOutputs(publicManifest.data);
assertManifestEntry(outputs, publicFetchPaths.cartridges, publicCartridges, cartridgesAreArray ? publicCartridges.data.length : null);
assertManifestEntry(outputs, publicFetchPaths.tonearms, publicTonearms, tonearmsAreArray ? publicTonearms.data.length : null);

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
