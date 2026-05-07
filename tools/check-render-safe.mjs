#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'engrove-render-safe-'));

function copySource(relativePath) {
  const from = join(repoRoot, relativePath);
  const to = join(tempRoot, relativePath);

  if (!existsSync(from)) {
    throw new Error('Missing source file: ' + relativePath);
  }

  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function writeTempSource(relativePath, content) {
  const to = join(tempRoot, relativePath);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, content, 'utf8');
}

function patchTempUiImports() {
  const relativePath = 'src/modules/tonearm-match-lab/ui/renderTonearmMatchLabPage.ts';
  const absolutePath = join(tempRoot, relativePath);

  let source = readFileSync(absolutePath, 'utf8');
  source = source.replace("from '../engine/resonance';", "from '../engine/resonance.js';");
  source = source.replace("from '../engine/diagnosis';", "from '../engine/diagnosis.js';");
  source = source.replace("from '../../../shared/ui/renderSafe';", "from '../../../shared/ui/renderSafe.js';");

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
  const compilerOptions = {
    target: 'ES2022',
    module: 'ES2022',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: './dist',
  };

  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
    'utf8',
  );

  writeFileSync(
    join(tempRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions, include: ['src/**/*.ts'] }, null, 2),
    'utf8',
  );

  const tsc = localTscCommand();
  execFileSync(tsc.command, [...tsc.args, '--project', 'tsconfig.json'], {
    cwd: tempRoot,
    stdio: 'inherit',
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(label + ': missing ' + JSON.stringify(needle));
  }
}

function assertNotIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(label + ': leaked raw value ' + JSON.stringify(needle));
  }
}

async function runChecks() {
  copySource('src/shared/ui/renderSafe.ts');
  copySource('src/modules/tonearm-match-lab/ui/renderTonearmMatchLabPage.ts');
  patchTempUiImports();

  // The real product compile/build gates verify the real engine dependency tree.
  // This harness uses tiny temp adapters only so the actual UI source can be
  // imported and its exported markup helpers can be tested with hostile strings.
  writeTempSource(
    'src/modules/tonearm-match-lab/engine/resonance.ts',
    [
      'export type ResonanceInput = {',
      '  tonearmEffectiveMassG: number;',
      '  cartridgeMassG: number;',
      '  fastenerMassG: number;',
      '  trackingForceG: number;',
      '  compliance10HzCu: number;',
      '};',
      '',
      'export type ResonanceResult = {',
      '  totalMovingMassG: number;',
      '  resonanceHz: number;',
      '  compliance10HzCu: number;',
      '};',
      '',
      'export function calculateResonanceResult(input: ResonanceInput): ResonanceResult {',
      '  return {',
      '    totalMovingMassG: input.tonearmEffectiveMassG + input.cartridgeMassG + input.fastenerMassG,',
      '    resonanceHz: 9.5,',
      '    compliance10HzCu: input.compliance10HzCu,',
      '  };',
      '}',
      '',
    ].join('\n'),
  );

  writeTempSource(
    'src/modules/tonearm-match-lab/engine/diagnosis.ts',
    [
      "export type ResonanceDiagnosis = {",
      "  level: 'low' | 'ideal' | 'high';",
      '  title: string;',
      '  explanation: string;',
      '  suggestions: string[];',
      '};',
      '',
      'export function diagnoseResonance(_resonanceHz: number): ResonanceDiagnosis {',
      '  return {',
      "    level: 'ideal',",
      "    title: 'Resonance is in the preferred range.',",
      "    explanation: 'The estimated resonance sits inside the common 8-12 Hz target window.',",
      "    suggestions: ['Confirm with measurement after setup.'],",
      '  };',
      '}',
      '',
    ].join('\n'),
  );

  compileTempSources();

  const renderSafeModule = await import(
    pathToFileURL(join(tempRoot, 'dist/shared/ui/renderSafe.js')).href
  );

  const tonearmModule = await import(
    pathToFileURL(join(tempRoot, 'dist/modules/tonearm-match-lab/ui/renderTonearmMatchLabPage.js')).href
  );

  const { escapeAttribute, escapeHtml, renderText } = renderSafeModule;
  const { errorMarkup, resultMarkup } = tonearmModule;

  if (typeof resultMarkup !== 'function') {
    throw new Error('Tonearm resultMarkup export is missing.');
  }

  if (typeof errorMarkup !== 'function') {
    throw new Error('Tonearm errorMarkup export is missing.');
  }

  assertEqual(
    escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    'script-like text escaping',
  );
  assertEqual(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry', 'ampersand escaping');
  assertEqual(
    escapeHtml('"double" and \'single\''),
    '&quot;double&quot; and &#39;single&#39;',
    'quote escaping',
  );
  assertEqual(escapeHtml(null), '', 'null rendering');
  assertEqual(escapeHtml(undefined), '', 'undefined rendering');
  assertEqual(escapeHtml(42), '42', 'number rendering');
  assertEqual(escapeHtml(true), 'true', 'true rendering');
  assertEqual(escapeHtml(false), 'false', 'false rendering');
  assertEqual(
    escapeAttribute('"double" and \'single\''),
    '&quot;double&quot; and &#39;single&#39;',
    'attribute quote escaping',
  );
  assertEqual(renderText('Tom & Jerry'), 'Tom &amp; Jerry', 'renderText escaping');

  const maliciousDiagnosis = {
    level: 'ideal',
    title: '<script>alert("title")</script>',
    explanation: 'Tom & Jerry <b>bold</b>',
    suggestions: ['Use <script>alert("suggestion")</script>', '"double" and \'single\''],
  };

  const result = {
    resonanceHz: 9.5,
    totalMovingMassG: 21.3,
  };

  const renderedResult = resultMarkup(result, maliciousDiagnosis);
  assertNotIncludes(renderedResult, '<script>', 'malicious diagnosis raw opening script');
  assertNotIncludes(renderedResult, '</script>', 'malicious diagnosis raw closing script');
  assertNotIncludes(renderedResult, '<b>bold</b>', 'malicious diagnosis raw inline HTML');
  assertIncludes(
    renderedResult,
    '&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;',
    'malicious title escaped',
  );
  assertIncludes(
    renderedResult,
    '&lt;script&gt;alert(&quot;suggestion&quot;)&lt;/script&gt;',
    'malicious suggestion escaped',
  );
  assertIncludes(
    renderedResult,
    '&quot;double&quot; and &#39;single&#39;',
    'malicious suggestion quote escaping',
  );

  const renderedError = errorMarkup('<script>alert("error")</script>');
  assertNotIncludes(renderedError, '<script>', 'malicious error raw opening script');
  assertNotIncludes(renderedError, '</script>', 'malicious error raw closing script');
  assertIncludes(
    renderedError,
    '&lt;script&gt;alert(&quot;error&quot;)&lt;/script&gt;',
    'malicious error escaped',
  );

  console.log('Render-safe checks');
  console.log('- escapeHtml: PASS');
  console.log('- escapeAttribute: PASS');
  console.log('- renderText: PASS');
  console.log('- tonearm result rendering hostile strings: PASS');
  console.log('- tonearm error rendering hostile strings: PASS');
  console.log('- result: PASS');
}

try {
  await runChecks();
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}