#!/usr/bin/env node
/*
 * S3E schema drift guard: validates test-records.json against the
 * same closed vocabulary as src/modules/measurement-lab/data/loadTestRecords.ts.
 *
 * Keep the sets below in sync with loadTestRecords.ts.
 * Exit code 1 on any mismatch so this can gate CI.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, '../public/data/audio/v3/runtime/test-records.json');

// Keep in sync with loadTestRecords.ts
const BAND_PURPOSES = new Set([
  'speed', 'freq_response', 'crosstalk', 'thd', 'imd', 'resonance', 'tracking_ability',
  'vta_optimization', 'pink_noise', 'vertical_modulation', 'rumble',
]);
const BAND_TYPES = new Set(['sine', 'sweep', 'dual_tone', 'silence', 'noise', 'pulse']);
const BAND_CHANNELS = new Set(['mono', 'L', 'R', 'both', 'out_of_phase']);
const SIGNAL_TYPES = new Set([
  'single_tone', 'dual_tone', 'sweep', 'amplitude_sweep', 'noise', 'silence', 'pulse', 'tracking_burst',
]);
const ANALYZER_MODULES = new Set([
  'reference_calibration', 'channel_identity', 'azimuth_crosstalk', 'frequency_response',
  'thd', 'imd', 'vta_imd_optimizer', 'wow_flutter', 'anti_skate_tracking_stress',
  'pink_noise_diagnostics', 'vertical_modulation', 'vertical_resonance',
  'lf_resonance', 'rumble_isolation',
]);
const STANDARDS = new Set(['SMPTE', 'CCIF', 'DIN', 'IEC', 'IEC_IMD', 'AES']);
const SWEEP_DIRECTIONS = new Set(['ascending', 'descending']);
const SWEEP_SCALES = new Set(['log', 'linear']);
const LEVEL_REFERENCES = new Set(['0dB_groove', 'cm_per_sec', 'peak_velocity']);
const SOURCE_STATUSES = new Set([
  'publisher_listing', 'publisher_verified', 'user_verified', 'incomplete', 'candidate',
]);

let errors = 0;

function fail(path, value, vocab) {
  console.error(`ERROR: ${path} value "${value}" not accepted by runtime loader vocabulary (${[...vocab].join(', ')})`);
  errors++;
}

function checkEnum(value, vocab, path) {
  if (value !== undefined && value !== null && !vocab.has(value)) {
    fail(path, value, vocab);
  }
}

let data;
try {
  data = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error(`ERROR: could not read ${jsonPath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data.records)) {
  console.error('ERROR: test-records.json missing records array');
  process.exit(1);
}

for (let ri = 0; ri < data.records.length; ri++) {
  const record = data.records[ri];
  const rp = `records[${ri}]`;
  checkEnum(record.source_status, SOURCE_STATUSES, `${rp}.source_status`);

  if (!Array.isArray(record.sides)) continue;
  for (let si = 0; si < record.sides.length; si++) {
    const side = record.sides[si];
    const sp = `${rp}.sides[${si}]`;
    if (!Array.isArray(side.bands)) continue;
    for (let bi = 0; bi < side.bands.length; bi++) {
      const band = side.bands[bi];
      const bp = `${sp}.bands[${bi}]`;
      checkEnum(band.purpose, BAND_PURPOSES, `${bp}.purpose`);
      checkEnum(band.type, BAND_TYPES, `${bp}.type`);
      checkEnum(band.channel, BAND_CHANNELS, `${bp}.channel`);
      checkEnum(band.signal_type, SIGNAL_TYPES, `${bp}.signal_type`);
      checkEnum(band.analyzer_module, ANALYZER_MODULES, `${bp}.analyzer_module`);
      checkEnum(band.standard, STANDARDS, `${bp}.standard`);
      checkEnum(band.sweep_direction, SWEEP_DIRECTIONS, `${bp}.sweep_direction`);
      checkEnum(band.sweep_scale, SWEEP_SCALES, `${bp}.sweep_scale`);
      checkEnum(band.level_reference, LEVEL_REFERENCES, `${bp}.level_reference`);
      if (Array.isArray(band.analyzer_modules)) {
        for (let mi = 0; mi < band.analyzer_modules.length; mi++) {
          checkEnum(band.analyzer_modules[mi], ANALYZER_MODULES, `${bp}.analyzer_modules[${mi}]`);
        }
      }
    }
  }
}

if (errors === 0) {
  console.log(`OK: test-records.json — ${data.records.length} records validated, no schema drift detected.`);
  process.exit(0);
} else {
  console.error(`FAIL: ${errors} schema drift error(s) detected in test-records.json.`);
  process.exit(1);
}
