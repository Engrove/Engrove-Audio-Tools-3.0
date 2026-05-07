#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();

const ignoredDirectories = new Set([
  '.git',
  '.vs',
  'dist',
  'node_modules',
]);

const exactTextFiles = new Set([
  '.gitattributes',
  'package.json',
  'vite.config.ts',
  'public/_headers',
  'public/data/audio/v3/runtime/audio-index.manifest.json',
  'public/data/audio/v3/runtime/cartridges.index.json',
  'public/data/audio/v3/runtime/tonearms.index.json',
  'tools/check-repo-integrity.mjs',
  'tools/check-render-safe.mjs',
  'tools/check-tonearm-runtime-selectors.mjs',
  'tools/validate-audio-data.mjs',
]);

const requiredFiles = [
  ...exactTextFiles,
  'src/shared/ui/renderSafe.ts',
  'src/shared/ui/runtimePickerModal.ts',
];

const failures = [];
const checkedFiles = [];
const truncationMarker = 'CONTENT ' + 'TRUNCATED';

function normalize(relativePath) {
  return relativePath.split('\\').join('/');
}

function shouldIgnoreDirectory(relativePath) {
  const parts = normalize(relativePath).split('/');
  return parts.some((part) => ignoredDirectories.has(part));
}

function isRuntimeJson(relativePath) {
  const normalized = normalize(relativePath);
  return (
    normalized.startsWith('public/data/audio/v3/runtime/') &&
    normalized.endsWith('.json')
  );
}

function isSourceText(relativePath) {
  const normalized = normalize(relativePath);
  return (
    normalized.startsWith('src/') &&
    (normalized.endsWith('.ts') ||
      normalized.endsWith('.css') ||
      normalized.endsWith('.html'))
  );
}

function isInReleaseCriticalScope(relativePath) {
  const normalized = normalize(relativePath);
  return (
    exactTextFiles.has(normalized) ||
    isRuntimeJson(normalized) ||
    isSourceText(normalized)
  );
}

async function checkRequiredFilesExist() {
  for (const relativePath of requiredFiles) {
    if (!existsSync(join(repoRoot, relativePath))) {
      failures.push({
        file: relativePath,
        problem: 'required release-critical file is missing',
      });
    }
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const relativePath = normalize(relative(repoRoot, absolutePath));

    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(relativePath)) {
        continue;
      }

      await walk(absolutePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!isInReleaseCriticalScope(relativePath)) {
      continue;
    }

    await checkFile(absolutePath, relativePath);
  }
}

async function checkFile(absolutePath, relativePath) {
  const buffer = await readFile(absolutePath);
  const text = buffer.toString('utf8');

  checkedFiles.push(relativePath);

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    failures.push({
      file: relativePath,
      problem: 'UTF-8 BOM detected',
    });
  }

  if (text.includes('\r\n')) {
    failures.push({
      file: relativePath,
      problem: 'CRLF line endings detected',
    });
  }

  if (text.includes(truncationMarker)) {
    failures.push({
      file: relativePath,
      problem: 'truncation marker detected',
    });
  }
}

await checkRequiredFilesExist();
await walk(repoRoot);

const uniqueCheckedFiles = [...new Set(checkedFiles)].sort();

console.log('Engrove Audio Tools 3.0 release-critical integrity check');
console.log('- scope: Fas 17.2b release-critical/static-delivery files only');
console.log('- checked exact files: .gitattributes, package.json, vite.config.ts, public/_headers, public runtime manifest/index JSON, tools/check-repo-integrity.mjs, tools/check-render-safe.mjs, tools/check-tonearm-runtime-selectors.mjs, tools/validate-audio-data.mjs');
console.log('- checked globs: public/data/audio/v3/runtime/**/*.json, src/**/*.ts, src/**/*.css, src/**/*.html');
console.log('- temporary ignores: .git, .vs, dist, node_modules');
console.log(`- checked files: ${uniqueCheckedFiles.length}`);

if (failures.length === 0) {
  console.log('- result: PASS');
  process.exit(0);
}

console.log(`- result: FAIL (${failures.length} issue(s))`);

for (const failure of failures) {
  console.log(`[ERROR] ${failure.file}: ${failure.problem}`);
}

process.exit(1);
