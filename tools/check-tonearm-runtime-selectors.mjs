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
    .replace(/from '..\/data\/loadTonearmRuntimeData';/g, "from '../data/loadTonearmRuntimeData.js';")
    .replace(/from '..\/..\/..\/shared\/ui\/renderSafe';/g, "from '../../../shared/ui/renderSafe.js';");
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
  copySource('src/modules/tonearm-match-lab/data/loadTonearmRuntimeData.ts');
  copySource('src/modules/tonearm-match-lab/ui/tonearmSelectorMarkup.ts');
  patchTempImports('src/modules/tonearm-match-lab/ui/tonearmSelectorMarkup.ts');
  compileTempSources();

  const dataModule = await import(pathToFileURL(join(tempRoot, 'dist/modules/tonearm-match-lab/data/loadTonearmRuntimeData.js')).href);
  const markupModule = await import(pathToFileURL(join(tempRoot, 'dist/modules/tonearm-match-lab/ui/tonearmSelectorMarkup.js')).href);

  assertEqual(dataModule.AUDIO_RUNTIME_MANIFEST_PATH, '/data/audio/v3/runtime/audio-index.manifest.json', 'manifest path');
  assertEqual(dataModule.CARTRIDGES_RUNTIME_INDEX_PATH, '/data/audio/v3/runtime/cartridges.index.json', 'cartridges path');
  assertEqual(dataModule.TONEARMS_RUNTIME_INDEX_PATH, '/data/audio/v3/runtime/tonearms.index.json', 'tonearms path');

  const records = [
    { id: 'a', display_name: 'Audio Technica VM95ML', match_ready: true },
    { id: 'b', display_name: 'Denon DL-103', match_ready: true },
    { id: 'c', display_name: 'Ortofon 2M Blue', match_ready: true },
  ];
  assertEqual(dataModule.filterRuntimeRecords(records, 'audio')[0]?.id, 'a', 'case-insensitive filter lower-case');
  assertEqual(dataModule.filterRuntimeRecords(records, 'DENON')[0]?.id, 'b', 'case-insensitive filter upper-case');
  assertEqual(dataModule.filterRuntimeRecords(records, '', 2).length, 2, 'filter limit');

  const malicious = [{
    id: '" onclick="alert(1)',
    display_name: '<script>alert("x")</script>',
    match_ready: true,
    mass_g: 6.5,
    compliance_10hz_cu: 18,
  }];
  const html = markupModule.selectorListMarkup(malicious, 'cartridge');
  assertNotIncludes(html, '<script>', 'malicious display name opening script');
  assertNotIncludes(html, '</script>', 'malicious display name closing script');
  assertIncludes(html, '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'malicious display name escaped');
  assertIncludes(html, '&quot; onclick=&quot;alert(1)', 'malicious id escaped for attribute');

  console.log('Tonearm runtime selector checks');
  console.log('- runtime paths: PASS');
  console.log('- case-insensitive filtering: PASS');
  console.log('- capped result filtering: PASS');
  console.log('- selector result render safety: PASS');
  console.log('- result: PASS');
}

try {
  await runChecks();
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
