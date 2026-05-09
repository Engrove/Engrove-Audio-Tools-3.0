#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.css', '.html']);
const RULE_GROUPS = [
  {
    id: 'A',
    name: 'No hero or landing-page selectors in shipped source',
    terms: [
      'ea-hero',
      'tm-lab-hero',
      'hero-title',
      '__backdrop',
      '__lead',
      '--backdrop',
      '--lede',
      'landing',
      'landing-page',
    ],
  },
  {
    id: 'B',
    name: 'No marketing/platform/launch copy in shipped source',
    terms: [
      'Precision Tools for the Analog Enthusiast',
      'A clean public toolkit',
      'Explore the Tools',
      'View Platform',
      'Built as modules from day one',
      'Launch chain',
      'GitHub to Cloudflare is live',
      'Public productization track',
      'Platform',
      'Launch',
    ],
  },
  {
    id: 'C',
    name: 'No planned or placeholder public tool cards',
    terms: [
      'Planned module',
      'Foundation module',
      'Coming soon',
      'Learn more',
      'Available foundation',
    ],
  },
  {
    id: 'D',
    name: 'No forbidden Swedish/internal public UI markers',
    terms: [
      'Passar',
      'pickup med',
      'min tonarm',
      'Fas 17',
      'kommer',
      'Perfect',
      'engrove-audio-wordmark',
    ],
  },
];

const APPLY_RULE_GROUP = {
  id: 'E',
  name: 'No old apply scripts in repo source tree',
};

/**
 * Explicit allowlist for source-string false positives.
 * Keep this empty unless a shipped-source use is genuinely public-safe.
 * Each entry must include a reason explaining why the exact file/line/match is allowed.
 */
const ALLOWLIST = [
  // {
  //   ruleId: 'B',
  //   file: 'src/example.ts',
  //   line: 1,
  //   match: 'Platform',
  //   reason: 'Non-public technical identifier, not rendered copy.',
  // },
];

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isDirectory();
}

function shouldSkipDirectory(relPath) {
  if (relPath === '') {
    return false;
  }

  return (
    relPath === '.git' ||
    relPath === 'node_modules' ||
    relPath === 'dist' ||
    relPath === 'docs' ||
    relPath === 'tools' ||
    relPath === 'src/data' ||
    relPath === 'public/data' ||
    relPath.startsWith('.git/') ||
    relPath.startsWith('node_modules/') ||
    relPath.startsWith('dist/') ||
    relPath.startsWith('docs/') ||
    relPath.startsWith('tools/') ||
    relPath.startsWith('src/data/') ||
    relPath.startsWith('public/data/')
  );
}

function walkFiles(dirPath, files = []) {
  if (!isDirectory(dirPath)) {
    return files;
  }

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = normalizePath(fullPath);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relPath)) {
        walkFiles(fullPath, files);
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isShippedSourceFile(filePath) {
  const relPath = normalizePath(filePath);
  const extension = path.extname(filePath);

  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  if (relPath === 'index.html' || relPath === 'public/index.html') {
    return true;
  }

  return relPath.startsWith('src/') && !relPath.startsWith('src/data/');
}

function findLineNumber(text, searchText) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(searchText)) {
      return index + 1;
    }
  }

  return 1;
}

function isAllowed(violation) {
  return ALLOWLIST.some((entry) => {
    if (!entry.reason) {
      return false;
    }

    return (
      entry.ruleId === violation.ruleId &&
      entry.file === violation.file &&
      entry.match === violation.match &&
      (typeof entry.line !== 'number' || entry.line === violation.line)
    );
  });
}

function collectSourceViolations(sourceFiles) {
  const violations = [];

  for (const filePath of sourceFiles) {
    const file = normalizePath(filePath);
    const text = fs.readFileSync(filePath, 'utf8');

    for (const group of RULE_GROUPS) {
      for (const term of group.terms) {
        if (!text.includes(term)) {
          continue;
        }

        const violation = {
          ruleId: group.id,
          ruleGroup: `${group.id}. ${group.name}`,
          file,
          line: findLineNumber(text, term),
          match: term,
        };

        if (!isAllowed(violation)) {
          violations.push(violation);
        }
      }
    }
  }

  return violations;
}

function gitTracksFile(relPath) {
  if (!isDirectory(path.join(repoRoot, '.git'))) {
    return false;
  }

  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relPath], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function collectApplyScriptViolations() {
  const toolsDir = path.join(repoRoot, 'tools');

  if (!isDirectory(toolsDir)) {
    return [];
  }

  const entries = fs
    .readdirSync(toolsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^apply-.*\.mjs$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const violations = [];

  for (const entry of entries) {
    const relPath = `tools/${entry.name}`;
    const isActiveS2ApplyScript = entry.name === 'apply-ui-doctrine-gates-s2.mjs';

    if (isActiveS2ApplyScript && !gitTracksFile(relPath)) {
      continue;
    }

    violations.push({
      ruleId: APPLY_RULE_GROUP.id,
      ruleGroup: `${APPLY_RULE_GROUP.id}. ${APPLY_RULE_GROUP.name}`,
      file: relPath,
      line: 1,
      match: isActiveS2ApplyScript
        ? 'active S2 apply script is tracked'
        : 'tools/apply-*.mjs',
    });
  }

  return violations;
}

function main() {
  const allFiles = walkFiles(repoRoot).sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
  const sourceFiles = allFiles.filter(isShippedSourceFile);
  const violations = [
    ...collectSourceViolations(sourceFiles),
    ...collectApplyScriptViolations(),
  ];

  if (violations.length > 0) {
    console.error('FAIL check-ui-doctrine');
    for (const violation of violations) {
      console.error(
        `${violation.ruleGroup} | ${violation.file}:${violation.line} | ${violation.match}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log('PASS check-ui-doctrine');
  console.log(`Files scanned: ${sourceFiles.length}`);
  console.log(`Rule groups checked: ${RULE_GROUPS.length + 1}`);
}

main();
