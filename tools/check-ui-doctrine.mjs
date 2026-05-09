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

const LEAD_LEDE_RULE_GROUP = {
  id: 'F',
  name: 'No lead/lede semantic class-name segments in shipped source',
};

const LEAD_LEDE_SEGMENT_PATTERN = /(^|[-_])(lead|lede)s?($|[-_])/i;

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


function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length));
}

function addClassToken(tokens, className, file, line) {
  if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(className)) {
    return;
  }

  tokens.push({ className, file, line });
}

function collectClassNamesFromAttributeValue(attrValue) {
  return attrValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(value));
}

function collectEmittedClassTokens(text, file) {
  const tokens = [];
  const patterns = [
    /\bclass\s*=\s*["'`]([^"'`]+)["'`]/g,
    /\bclassName\s*=\s*["'`]([^"'`]+)["'`]/g,
    /\b(?:const|let|var)\s+[A-Za-z0-9_]*Class(?:Name|Names)?\s*=\s*["'`]([^"'`]+)["'`]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      for (const className of collectClassNamesFromAttributeValue(match[1])) {
        addClassToken(tokens, className, file, lineForIndex(text, match.index));
      }
    }
  }

  return tokens;
}

function extractTypeScriptCssFragments(text) {
  const fragments = [];
  const cssAssignmentPattern =
    /\b(?:const|let|var)\s+[A-Za-z0-9_]*(?:Css|CSS|Styles|Style)[A-Za-z0-9_]*\s*=\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
  let assignmentMatch;

  while ((assignmentMatch = cssAssignmentPattern.exec(text)) !== null) {
    const literal = assignmentMatch[1];
    const quote = literal[0];
    const body = literal.slice(1, -1);
    const decoded = quote === '`' ? body : body.replace(/\\n/g, '\n');

    if (decoded.includes('{') && /\.[A-Za-z_-][A-Za-z0-9_-]*\s*[{,:#.\s]/.test(decoded)) {
      fragments.push({
        text: decoded,
        startIndex: assignmentMatch.index + assignmentMatch[0].indexOf(literal) + 1,
      });
    }
  }

  return fragments;
}

function collectCssClassTokens(text, file, baseIndex = 0) {
  const tokens = [];
  const cleanText = stripCssComments(text);
  const pattern = /\.([A-Za-z_-][A-Za-z0-9_-]*)/g;
  let match;

  while ((match = pattern.exec(cleanText)) !== null) {
    addClassToken(tokens, match[1], file, lineForIndex(text, match.index + baseIndex));
  }

  return tokens;
}

function collectClassLikeTokens(filePath) {
  const file = normalizePath(filePath);
  const extension = path.extname(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const tokens = [...collectEmittedClassTokens(text, file)];

  if (extension === '.css') {
    tokens.push(...collectCssClassTokens(text, file));
  }

  if (extension === '.ts') {
    for (const fragment of extractTypeScriptCssFragments(text)) {
      tokens.push(...collectCssClassTokens(fragment.text, file, fragment.startIndex));
    }
  }

  return tokens;
}

function collectLeadLedeClassViolations(sourceFiles) {
  const violations = [];

  for (const filePath of sourceFiles) {
    for (const token of collectClassLikeTokens(filePath)) {
      if (!LEAD_LEDE_SEGMENT_PATTERN.test(token.className)) {
        continue;
      }

      const violation = {
        ruleId: LEAD_LEDE_RULE_GROUP.id,
        ruleGroup: LEAD_LEDE_RULE_GROUP.id + '. ' + LEAD_LEDE_RULE_GROUP.name,
        file: token.file,
        line: token.line,
        match: token.className,
      };

      if (!isAllowed(violation)) {
        violations.push(violation);
      }
    }
  }

  return violations;
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
    ...collectLeadLedeClassViolations(sourceFiles),
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
  console.log(`Rule groups checked: ${RULE_GROUPS.length + 2}`);
}

main();
