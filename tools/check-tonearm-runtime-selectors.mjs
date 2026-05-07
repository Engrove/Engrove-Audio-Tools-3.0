#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'engrove-tonearm-selectors-'));

function copySource(relativePath) {
  const source = join(repoRoot, relativePath);
  const target = join(tempRoot, relativePath);
  if (!existsSync(source)) {
    throw new Error(`Missing source file: ${relativePath}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function patchTempImports(relativePath) {
  const absolutePath = join(tempRoot, relativePath);
  let source = readFileSync(absolutePath, 'utf8');
  source = source
    .replace(/from '\.\/renderSafe';/g, "from './renderSafe.js';")
    .replace(/from '\.\.\/\.\.\/\.\.\/shared\/ui\/runtimePickerModal';/g, "from '../../../shared/ui/runtimePickerModal.js';");
  writeFileSync(absolutePath, source, 'utf8');
}

function localTscCommand() {
  const localTsc = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(localTsc)) {
    return { command: process.execPath, args: [localTsc] };
  }
  return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['--no-install', 'tsc'] };
}

function compileTempSources() {
  writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ type: 'module' }, null, 2), 'utf8');
  writeFileSync(
    join(tempRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        outDir: './dist',
      },
      include: ['src/**/*.ts'],
    }, null, 2),
    'utf8',
  );
  const tsc = localTscCommand();
  execFileSync(tsc.command, [...tsc.args, '--project', 'tsconfig.json'], { cwd: tempRoot, stdio: 'pipe' });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: missing ${JSON.stringify(needle)}`);
  }
}

function assertNotIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: leaked raw value ${JSON.stringify(needle)}`);
  }
}

async function runChecks() {
  copySource('src/shared/ui/renderSafe.ts');
  copySource('src/shared/ui/runtimePickerModal.ts');
  copySource('src/modules/tonearm-match-lab/data/loadTonearmRuntimeData.ts');
  copySource('src/modules/tonearm-match-lab/ui/tonearmSelectorMarkup.ts');

  patchTempImports('src/shared/ui/runtimePickerModal.ts');
  patchTempImports('src/modules/tonearm-match-lab/ui/tonearmSelectorMarkup.ts');

  compileTempSources();

  const dataModule = await import(pathToFileURL(join(tempRoot, 'dist/modules/tonearm-match-lab/data/loadTonearmRuntimeData.js')).href);
  const modalModule = await import(pathToFileURL(join(tempRoot, 'dist/shared/ui/runtimePickerModal.js')).href);

  assertEqual(dataModule.AUDIO_RUNTIME_MANIFEST_PATH, '/data/audio/v3/runtime/audio-index.manifest.json', 'manifest path');
  assertEqual(dataModule.CARTRIDGES_RUNTIME_INDEX_PATH, '/data/audio/v3/runtime/cartridges.index.json', 'cartridges path');
  assertEqual(dataModule.TONEARMS_RUNTIME_INDEX_PATH, '/data/audio/v3/runtime/tonearms.index.json', 'tonearms path');

  const records = [
    { id: 'a', kind: 'cartridge', displayName: 'Audio Technica VM95ML', type: 'MM', massG: 6.1, compliance10HzCu: 18 },
    { id: 'b', kind: 'cartridge', displayName: 'Denon DL-103', type: 'MC', massG: 8.5, compliance10HzCu: 9 },
    { id: 'c', kind: 'tonearm', displayName: 'Example Light Arm', effectiveMassG: 8 },
  ];

  assertEqual(modalModule.filterRuntimePickerItems(records, 'cartridge', { search: 'audio', type: '' })[0]?.id, 'a', 'case-insensitive cartridge search');
  assertEqual(modalModule.filterRuntimePickerItems(records, 'cartridge', { search: '', type: 'mc' })[0]?.id, 'b', 'cartridge type filter');
  assertEqual(modalModule.filterRuntimePickerItems(records, 'cartridge', { search: '', type: '', massMin: 8 }).length, 1, 'cartridge mass filter');
  assertEqual(modalModule.filterRuntimePickerItems(records, 'tonearm', { search: 'LIGHT', type: '', effectiveMassMax: 9 })[0]?.id, 'c', 'tonearm effective mass filter');

  const many = Array.from({ length: 140 }, (_, index) => ({
    id: `item-${index}`,
    kind: 'cartridge',
    displayName: `Item ${index}`,
    massG: 5,
    compliance10HzCu: 15,
  }));
  assertEqual(modalModule.filterRuntimePickerItems(many, 'cartridge', { search: '', type: '' }).length, 100, 'default cap is 100');

  const malicious = [{
    id: '" onclick="alert(1)',
    kind: 'cartridge',
    displayName: '<script>alert("x")</script>',
    massG: 6.5,
    compliance10HzCu: 18,
  }];
  const htmlResult = modalModule.runtimePickerResultListMarkup(malicious, 'cartridge', { search: '', type: '' }, null);
  assertNotIncludes(htmlResult.markup, '<script>', 'malicious display name opening script');
  assertNotIncludes(htmlResult.markup, '</script>', 'malicious display name closing script');
  assertIncludes(htmlResult.markup, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'malicious display name escaped');
  assertIncludes(htmlResult.markup, '&quot; onclick=&quot;alert(1)', 'malicious id escaped for attribute');

  const updates = modalModule.runtimePickerFieldUpdates('cartridge', malicious[0]);
  assertEqual(updates.cartridgeMassG, 6.5, 'cartridge apply mass update');
  assertEqual(updates.compliance10HzCu, 18, 'cartridge apply compliance update');
  assertEqual(Object.prototype.hasOwnProperty.call(updates, 'tonearmEffectiveMassG'), false, 'cartridge apply does not include tonearm update');

  console.log('Tonearm runtime selector checks');
  console.log('- runtime paths: PASS');
  console.log('- modal filtering: PASS');
  console.log('- capped result filtering: PASS');
  console.log('- modal result render safety: PASS');
  console.log('- apply field update mapping: PASS');
  console.log('- result: PASS');
}

try {
  await runChecks();
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
