#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const ignoredDirectoryNames = new Set([
  '.git',
  '.vs',
  'dist',
  'node_modules',
]);

const requiredExactFiles = new Set([
  '.gitattributes',
  'package.json',
  'vite.config.ts',
  'public/_headers',
  'public/data/audio/v3/runtime/cartridges.index.json',
  'public/data/audio/v3/runtime/tonearms.index.json',
  'public/data/audio/v3/runtime/audio-index.manifest.json',
  'tools/check-repo-integrity.mjs',
  'tools/check-render-safe.mjs', 'src/shared/ui/renderSafe.ts', 'tools/validate-audio-data.mjs',
]);

const srcReleaseExtensions = new Set([
  '.ts',
  '.css',
  '.html',
]);

const failures = [];
const checkedFiles = [];

function toRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function extname(relativePath) {
  return path.posix.extname(relativePath).toLowerCase();
}

function basename(relativePath) {
  return path.posix.basename(relativePath);
}

function isExplicitlyIgnoredForThisPhase(relativePath) {
  const base = basename(relativePath);
  const extension = extname(relativePath);

  if (relativePath === 'wrangler.toml') {
    return true;
  }

  if (relativePath === 'BOOTSTRAP_MANIFEST.json') {
    return true;
  }

  if (extension === '.md') {
    return true;
  }

  if (/^FAS17_.*\.md$/i.test(base)) {
    return true;
  }

  if (/^tools\/[^/]+\.ps1$/i.test(relativePath)) {
    return true;
  }

  if (relativePath.startsWith('src/data/legacy/')) {
    return true;
  }

  if (relativePath.startsWith('src/data/audio/v3/') && extension === '.json') {
    return true;
  }

  return false;
}

function isReleaseCriticalFile(relativePath) {
  if (isExplicitlyIgnoredForThisPhase(relativePath)) {
    return false;
  }

  if (requiredExactFiles.has(relativePath)) {
    return true;
  }

  if (
    relativePath.startsWith('public/data/audio/v3/runtime/') &&
    extname(relativePath) === '.json'
  ) {
    return true;
  }

  if (
    relativePath.startsWith('src/') &&
    srcReleaseExtensions.has(extname(relativePath))
  ) {
    return true;
  }

  return false;
}

async function fileExists(relativePath) {
  try {
    const stats = await stat(path.join(repoRoot, relativePath));
    return stats.isFile();
  } catch {
    return false;
  }
}

async function checkRequiredFilesExist() {
  for (const relativePath of requiredExactFiles) {
    if (!(await fileExists(relativePath))) {
      failures.push({
        file: relativePath,
        problem: 'Required release-critical file is missing',
      });
    }
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const relativePath = toRepoPath(absolutePath);

    if (!isReleaseCriticalFile(relativePath)) {
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
}

await checkRequiredFilesExist();
await walk(repoRoot);

const uniqueCheckedFiles = [...new Set(checkedFiles)].sort();

console.log('Engrove Audio Tools 3.0 release-critical integrity check');
console.log('- scope: Fas 17.1.2 release-critical/static-delivery files only');
console.log('- checked exact files: .gitattributes, package.json, vite.config.ts, public/_headers, public runtime manifest/index JSON, tools/check-repo-integrity.mjs, tools/check-render-safe.mjs, tools/validate-audio-data.mjs, src/shared/ui/renderSafe.ts');
console.log('- checked globs: public/data/audio/v3/runtime/**/*.json, src/**/*.ts, src/**/*.css, src/**/*.html');
console.log('- temporary ignores: .git, .vs, dist, node_modules, src/data/legacy/**, src/data/audio/v3/**/*.json, tools/*.ps1, *.md, wrangler.toml, BOOTSTRAP_MANIFEST.json, FAS17_*.md');
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