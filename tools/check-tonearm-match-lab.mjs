import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const tempDir = mkdtempSync(join(tmpdir(), 'engrove-tonearm-match-lab-'));

const localTsc = process.platform === 'win32'
  ? resolve('node_modules/.bin/tsc.cmd')
  : resolve('node_modules/.bin/tsc');

const tsc = existsSync(localTsc) ? localTsc : 'tsc';

const testFiles = [
  'src/modules/tonearm-match-lab/tests/resonanceEngineCheck.ts',
  'src/modules/tonearm-match-lab/tests/responseSweepCheck.ts',
];

try {
  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
    'utf8',
  );

  const compile = spawnSync(
    tsc,
    [
      '--ignoreConfig',
      '--target',
      'ES2022',
      '--module',
      'ES2022',
      '--moduleResolution',
      'Bundler',
      '--strict',
      '--skipLibCheck',
      '--rootDir',
      'src',
      '--outDir',
      tempDir,
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

  await import(
    pathToFileURL(
      join(tempDir, 'modules/tonearm-match-lab/tests/resonanceEngineCheck.js'),
    ).href
  );

  await import(
    pathToFileURL(
      join(tempDir, 'modules/tonearm-match-lab/tests/responseSweepCheck.js'),
    ).href
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
