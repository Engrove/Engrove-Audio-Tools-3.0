#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const files = {
  cartridges: 'src/data/audio/v3/runtime/cartridges.index.json',
  tonearms: 'src/data/audio/v3/runtime/tonearms.index.json',
  summary: 'src/data/audio/v3/audio-data-v3-summary.json',
  manifest: 'src/data/audio/v3/runtime/audio-index.manifest.json',
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

async function readJson(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
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

  if (
    isNumber(record.mass_g) &&
    (record.mass_g < limits.minReasonableCartridgeMassG ||
      record.mass_g > limits.maxReasonableCartridgeMassG)
  ) {
    add('warning', 'cartridge.mass_range', `${location}.mass_g`, `Suspicious cartridge mass: ${record.mass_g} g.`);
  }

  if (
    isNumber(record.compliance_10hz_cu) &&
    (record.compliance_10hz_cu < limits.minReasonableCompliance10HzCu ||
      record.compliance_10hz_cu > limits.maxReasonableCompliance10HzCu)
  ) {
    add('warning', 'cartridge.compliance_range', `${location}.compliance_10hz_cu`, `Suspicious compliance: ${record.compliance_10hz_cu} cu.`);
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
    add('warning', 'tonearm.effective_mass_range', `${location}.effective_mass_g`, `Suspicious tonearm effective mass: ${record.effective_mass_g} g.`);
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

const [cartridges, tonearms, summary, manifest] = await Promise.all([
  readJson(files.cartridges),
  readJson(files.tonearms),
  readJson(files.summary),
  readJson(files.manifest),
]);

if (!Array.isArray(cartridges)) {
  add('error', 'cartridges.not_array', files.cartridges, 'Cartridge runtime index must be an array.');
}

if (!Array.isArray(tonearms)) {
  add('error', 'tonearms.not_array', files.tonearms, 'Tonearm runtime index must be an array.');
}

if (Array.isArray(cartridges)) {
  if (cartridges.length < limits.minCartridgeRecords) {
    add('error', 'cartridges.too_few_records', files.cartridges, `Expected at least ${limits.minCartridgeRecords} cartridges; got ${cartridges.length}.`);
  }

  const matchReady = cartridges.filter((item) => item?.match_ready === true).length;
  if (matchReady < limits.minMatchReadyCartridges) {
    add('error', 'cartridges.too_few_match_ready', files.cartridges, `Expected at least ${limits.minMatchReadyCartridges} match-ready cartridges; got ${matchReady}.`);
  }

  cartridges.forEach(validateCartridge);
  findForbiddenKeys(cartridges, 'cartridges.index');
}

if (Array.isArray(tonearms)) {
  if (tonearms.length < limits.minTonearmRecords) {
    add('error', 'tonearms.too_few_records', files.tonearms, `Expected at least ${limits.minTonearmRecords} tonearms; got ${tonearms.length}.`);
  }

  const matchReady = tonearms.filter((item) => item?.match_ready === true).length;
  if (matchReady < limits.minMatchReadyTonearms) {
    add('error', 'tonearms.too_few_match_ready', files.tonearms, `Expected at least ${limits.minMatchReadyTonearms} match-ready tonearms; got ${matchReady}.`);
  }

  tonearms.forEach(validateTonearm);
  findForbiddenKeys(tonearms, 'tonearms.index');
}

assertSummary(summary, cartridges, tonearms);

if (!manifest || typeof manifest !== 'object') {
  add('error', 'manifest.invalid', files.manifest, 'Manifest must be an object.');
}

const errorCount = issues.filter((item) => item.severity === 'error').length;
const warningCount = issues.filter((item) => item.severity === 'warning').length;

console.log('Engrove Audio Tools 3.0 audio data validation');
console.log(`- cartridges: ${Array.isArray(cartridges) ? cartridges.length : 'invalid'}`);
console.log(`- tonearms: ${Array.isArray(tonearms) ? tonearms.length : 'invalid'}`);
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
