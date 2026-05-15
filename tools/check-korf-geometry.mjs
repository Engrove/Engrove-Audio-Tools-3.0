#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve('.');
const tempDir = mkdtempSync(join(tmpdir(), 'engrove-korf-geometry-'));

const localTsc = process.platform === 'win32'
  ? resolve('node_modules/.bin/tsc.cmd')
  : resolve('node_modules/.bin/tsc');

const tsc = existsSync(localTsc) ? localTsc : 'tsc';

const testFiles = [
  'src/modules/tonearm-geometry-lab/tests/geometryCheck.ts',
  'src/modules/tonearm-geometry-lab/tests/behaviorContextCheck.ts',
];

function runCopyGuard() {
  console.log('behaviorCopy acceptance gates');
  let pass = 0;
  let fail = 0;

  function assertContains(label, haystack, needle) {
    if (haystack.includes(needle)) {
      console.log(`  PASS ${label}`);
      pass++;
    } else {
      console.error(`  FAIL ${label}: missing "${needle}"`);
      fail++;
    }
  }

  function assertNotContains(label, haystack, needle) {
    if (!haystack.includes(needle)) {
      console.log(`  PASS ${label}`);
      pass++;
    } else {
      console.error(`  FAIL ${label}: must not contain "${needle}"`);
      fail++;
    }
  }

  const tabSrc = readFileSync(join(repoRoot, 'src/modules/tonearm-geometry-lab/ui/behaviorContextTab.ts'), 'utf8');
  const pageSrc = readFileSync(join(repoRoot, 'src/modules/tonearm-geometry-lab/ui/renderTonearmGeometryLabPage.ts'), 'utf8');
  const scoringSrc = readFileSync(join(repoRoot, 'src/modules/tonearm-geometry-lab/engine/behaviorScoring.ts'), 'utf8');

  assertContains('UI contains model-layer notice', tabSrc, 'does not predict measured THD');
  assertContains('UI contains tracking error disclaimer', tabSrc, 'Not a measured distortion curve');
  assertContains('UI contains not audible-quality prediction', tabSrc, 'Not an audible-quality prediction');
  assertContains('scoring blockedClaims references predicted THD', scoringSrc, 'predicted THD');
  assertContains('scoring blockedClaims references sounds better', scoringSrc, 'sounds better');

  assertNotContains('UI does not claim predicted THD', tabSrc + pageSrc, 'predicted THD');
  assertNotContains('UI does not claim sounds better', tabSrc + pageSrc, 'sounds better');
  assertNotContains('UI does not claim predicted audible distortion', tabSrc + pageSrc, 'predicted audible distortion');
  assertNotContains('UI does not state Korf proves', pageSrc + tabSrc, 'Korf proves');
  assertNotContains('UI does not state Baerwald is wrong', tabSrc, 'Baerwald is wrong');
  assertNotContains('UI does not state underhang is better', tabSrc, 'underhang is better');

  if (fail > 0) {
    console.error(`behaviorCopy: ${pass} passed, ${fail} failed`);
    process.exitCode = 1;
  } else {
    console.log(`behaviorCopy: ${pass} passed`);
  }
}

try {
  runCopyGuard();

  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
    'utf8',
  );

  const compile = spawnSync(
    tsc,
    [
      '--ignoreConfig',
      '--target', 'ES2022',
      '--module', 'ES2022',
      '--moduleResolution', 'Bundler',
      '--strict',
      '--skipLibCheck',
      '--rootDir', 'src',
      '--outDir', tempDir,
      ...testFiles,
    ],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
  }

  for (const testFile of testFiles) {
    const outFile = testFile
      .replace(/^src\//, '')
      .replace(/\.ts$/, '.js');
    await import(pathToFileURL(join(tempDir, outFile)).href);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
